"""Extract government price-list PDFs into the searchable local archive.

PDFs are cached under .local/reference-prices/sources. The source manifest records
the original URL, edition and publication date. This never invents missing prices.
"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PUA = {0xF701: 'ิ', 0xF702: 'ี', 0xF706: '่', 0xF70A: '่', 0xF70B: '้',
       0xF70C: '๊', 0xF70E: '์', 0xF710: 'ั', 0xF712: '็', 6: '์', 23: '้'}


def normalize(text):
    text = text.translate(PUA).replace('\xa0', ' ')
    # One legacy PDF maps Thai tone glyphs to ASCII punctuation.
    text = re.sub(r"(?<=[\u0e00-\u0e7f])\*(?=[\u0e00-\u0e7f\s])", '่', text)
    text = re.sub(r"(?<=[\u0e00-\u0e7f])'(?=[\u0e00-\u0e7f\s])", '้', text)
    text = text.replace('ส า', 'สำ').replace('จ า', 'จำ').replace('ประจ า', 'ประจำ')
    return text


def category(name):
    if re.search(r'เครื่องพิมพ์|Printer|Plotter', name, re.I): return 'printer'
    if re.search(r'All\s*[- ]?\s*In\s*[- ]?\s*One', name, re.I): return 'aio'
    if re.search(r'โน้ตบุ|Notebook', name, re.I): return 'notebook'
    if re.search(r'แม่ข่าย|Server|Blade|Enclosure', name, re.I): return 'server'
    if re.search(r'แท็บเล็ต|Tablet', name, re.I): return 'tablet'
    if 'เครื่องคอมพิวเตอร์' in name: return 'desktop'
    if re.search(r'โปรแกรม|ซอฟต์แวร์|License|Anti.?virus', name, re.I): return 'software'
    if re.search(r'สำรองไฟ|UPS|kVA|VA\b', name, re.I): return 'ups'
    if re.search(r'จอภาพ|จอแสดง|Monitor', name, re.I): return 'monitor'
    if re.search(r'สแกน|Scanner', name, re.I): return 'scanner'
    if re.search(r'จัดเก็บ|Storage|SAN\b|NAS\b|Tape|Hard.?Disk', name, re.I): return 'storage'
    if re.search(r'เครือข่าย|Switch|Router|Access Point|Firewall|Log File|Security|Network', name, re.I): return 'network'
    return 'peripheral'


def extract(source, pdf):
    doc = pymupdf.open(pdf)
    lines = []
    page_offsets = []
    length = 0
    for page_no, page in enumerate(doc, 1):
        page_offsets.append((length, page_no))
        for line in normalize(page.get_text()).splitlines():
            line = line.strip()
            if not line or re.fullmatch(r'\d{1,3}', line): continue
            if re.match(r'^(?:เกณฑ์ราคากลาง|ประกาศ ณ|ณ วันที่|มีผลบังคับใช้|คู่มือเกณฑ์)', line): continue
            lines.append(line)
            length += len(line) + 1
    text = '\n'.join(lines)
    # All priced headings must begin with a list number, except the tablet supplement.
    prefix = r'(?m)^(?:(\d{1,3})\.[ \t]*)'
    if source.get('unnumbered'): prefix = r'(?m)^(?:(\d{1,3})\.[ \t]*)?'
    pattern = prefix + r'([^\n]{2,180}(?:\n[^\n]{1,160}){0,3}?)\s*ราคา\s*([\d,]+(?:\.\d+)?)\s*บาท([^\n]*)'
    matches = []
    for match in re.finditer(pattern, text):
        name = ' '.join(match[2].split())
        if any(s in name for s in ['คุณลักษณะ', 'มีหน่วย', 'หมายเหตุ', 'เกณฑ์ราคากลาง']): continue
        if '\n-' in match[2] or '\n•' in match[2]: continue
        matches.append(match)
    rows = []
    for i, match in enumerate(matches):
        item = int(match[1]) if match[1] else None
        name = ' '.join(match[2].split())
        price = float(match[3].replace(',', ''))
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        specs = text[match.end():end].strip()
        if 'หมายเหตุ' in specs: specs = specs.split('หมายเหตุ')[0].strip()
        page = max((p for offset, p in page_offsets if offset <= match.start()), default=1)
        rows.append({'id': source['id'] + '-' + str(i + 1), 'sourceId': source['id'],
                     'item': item, 'name': name, 'category': category(name), 'price': price,
                     'unit': match[4].strip() or 'บาท/รายการ', 'page': page, 'specs': specs})
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', default='hospital/reference-price-sources.json')
    args = parser.parse_args()
    sources = json.loads((ROOT / args.manifest).read_text(encoding='utf-8'))
    out = ROOT / 'public/data/reference-prices'
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for source in sources:
        pdf = ROOT / '.local/reference-prices/sources' / (source['id'] + '.pdf')
        if not pdf.exists(): raise ValueError('Missing cached PDF: ' + str(pdf))
        extracted = extract(source, pdf)
        source['itemCount'] = len(extracted)
        source['sha256'] = hashlib.sha256(pdf.read_bytes()).hexdigest()
        source['localPath'] = 'data/reference-prices/' + pdf.name
        shutil.copyfile(pdf, out / pdf.name)
        rows.extend(extracted)
        print(source['id'], len(extracted), 'items', 'numbers', [r['item'] for r in extracted])
    result = {'schemaVersion': 1, 'checkedAt': '2026-10-12', 'fiscalYearStart': 2551,
              'fiscalYearEnd': 2570, 'sources': sources, 'items': rows,
              'missingOriginalYears': [2551, 2552]}
    (out / 'catalog.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Total:', len(rows), 'items')


if __name__ == '__main__': main()
