'use strict';
// The SCPclear-style health check and its fixes (public/scripts/scp-health.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '../..');
function load() {
    const window = {}, document = { documentElement: { lang: 'th' } };
    const btoa = s => Buffer.from(s, 'binary').toString('base64');
    new Function('window', 'document', 'btoa', 'location', fs.readFileSync(path.join(root, 'public/scripts/scp-health.js'), 'utf8'))(window, document, btoa, { href: 'https://x/' });
    return window.ScpHealth;
}
const H = load();

test('the check only reads: no command in it changes the computer', () => {
    const script = H.healthScript();
    assert.doesNotMatch(script, /\b(Remove-Item|Set-ItemProperty|New-ItemProperty|Stop-Service|Start-Service|Restart-Service|Set-Service|Remove-ItemProperty|Clear-RecycleBin|Format-|Invoke-CimMethod -MethodName (?!GetOwner))/);
    // one statement per line: the agent feeds PowerShell line by line
    for (const line of script.split('\r\n')) assert.ok(!/^\s*[{}]\s*$/.test(line), 'no line is a lone brace: ' + line);
    assert.match(script, /SCP_HEALTH:/);
});

test('fixes stay inside fixed lists: services and start-up locations cannot be named from outside', () => {
    assert.throws(() => H.FIX.svc_start('WinDefend'), /NOT_ALLOWED/);
    assert.throws(() => H.FIX.startup({ scope: 'HKLM:\SOFTWARE\Evil', name: 'x', on: false }), /NOT_ALLOWED/);
    assert.match(H.FIX.svc_start('Spooler'), /Start-Service -Name 'Spooler'/);
    // names coming from the computer (printers, start-up entries) travel as base64, never as code
    const s = H.FIX.printer_test("x'; Remove-Item C:\ -Recurse; '");
    assert.doesNotMatch(s, /Remove-Item/);
});

test('none of the fixes cuts the connection or cannot be undone', () => {
    for (const k of Object.keys(H.FIX)) {
        const arg = k === 'startup' ? { scope: 'HKCU', name: 'a', on: false } : k === 'svc_start' ? 'Spooler' : k === 'fonts' ? { base: 'https://x/', list: [] } : 'p';
        const s = H.FIX[k](arg);
        assert.doesNotMatch(s, /netsh|winsock|Clear-RecycleBin|SoftwareDistribution|Restart-Computer|Stop-Computer|Remove-AppxPackage/i, k);
        assert.match(s, /SCP_FIX:/, k);
    }
});

test('fonts are installed only after their SHA-256 matches the manifest', () => {
    const m = JSON.parse(fs.readFileSync(path.join(root, 'public/fonts/thai/manifest.json'), 'utf8'));
    assert.ok(m.fonts.length >= 5);
    for (const f of m.fonts) {
        const buf = fs.readFileSync(path.join(root, 'public/fonts/thai', f.file));
        assert.equal(crypto.createHash('sha256').update(buf).digest('hex').toUpperCase(), f.sha256, f.file);
        assert.match(f.name, / \(TrueType\)$/);
    }
    const s = H.FIX.fonts({ base: 'https://x/fonts/thai/', list: m.fonts });
    assert.match(s, /Get-FileHash \$t -Algorithm SHA256\)\.Hash -eq \$x\.h\)\) \{ Copy-Item/);
    for (const lic of ['sarabun', 'kanit', 'prompt', 'ibmplexsansthai', 'notosansthai']) assert.ok(fs.existsSync(path.join(root, 'public/fonts/thai/licenses', lic + '-OFL.txt')), lic + ' licence');
});

test('a font already in Windows\\Fonts under another name (installed by hand) counts as there, by its SHA-256', () => {
    const m = JSON.parse(fs.readFileSync(path.join(root, 'public/fonts/thai/manifest.json'), 'utf8'));
    H.setManifest(m);
    const script = H.healthScript();
    assert.match(script, /\$miss = @\(\$want \| Where-Object \{ \(\$fnames -notcontains \$_\.n\) -and -not \$fhash\[\$_\.h\] \}/);
    assert.ok(script.includes("h = '" + m.fonts[0].sha256 + "'; s = " + m.fonts[0].size + ' }'), 'hash and size travel with each name');
    const fix = H.FIX.fonts({ base: 'https://x/fonts/thai/', list: m.fonts });
    assert.match(fix, /foreach \(\$x in \$list\) \{ if \(\$fhash\[\$x\.h\] -or /, 'the installer leaves the same file alone too');
    for (const line of script.split('\r\n')) assert.ok(!/^\s*[{}]\s*$/.test(line));
});

test('findings read the answer sensibly', () => {
    const base = { upDays: 1, lastUpdateDays: 3, ramPct: 40, ramGb: 8, cpu: 5, freeGb: 50, diskGb: 200, diskType: 'SSD', diskHealth: 'Healthy', smart: 0, adapters: ['Ethernet'], ip: '192.168.2.10', gw: '192.168.2.1', gwOk: false, dnsOk: true, netOk: true, spooler: 'Running', jobs: 0, printers: [], startup: [], tempMb: 10, fontsMissing: [], thSarabun: true };
    const levels = d => H.findings(Object.assign({}, base, d)).filter(f => f.level === 'bad').map(f => f.title);
    assert.deepEqual(levels({}), [], 'a router that ignores ping is not a fault');
    assert.ok(levels({ jobs: 4, oldestJobMin: 30 }).some(t => /งานพิมพ์/.test(t)), 'stuck print jobs');
    assert.ok(levels({ upDays: 20 }).length === 1, 'on for weeks');
    assert.ok(levels({ ip: '169.254.3.4' }).length === 1, 'no DHCP');
    const stuck = H.findings(Object.assign({}, base, { jobs: 4, oldestJobMin: 30 })).find(f => /งานพิมพ์/.test(f.title));
    assert.equal(stuck.fixes[0].action, 'printer_fix');
});

test('the server keeps the results and who pressed which fix', () => {
    const ops = fs.readFileSync(path.join(root, 'hospital/operations.js'), 'utf8');
    for (const op of ['healthSave', 'healthList', 'healthLog']) assert.ok(ops.includes("cmd.op === '" + op + "'"), op);
    assert.match(ops, /kind: 'health'/);
});

test('how Windows was installed: noted, never counted as a problem (any Windows counts)', () => {
    const base = { upDays: 1, lastUpdateDays: 3, ramPct: 40, ramGb: 8, cpu: 5, freeGb: 50, diskGb: 200, diskType: 'SSD', adapters: ['e'], ip: '10.0.0.2', gw: '10.0.0.1', gwOk: true, dnsOk: true, netOk: true, spooler: 'Running', jobs: 0, printers: [], startup: [], tempMb: 10, fontsMissing: [], thSarabun: true };
    const normal = { bypass: [], moSetup: false, unattendBypass: false, brand: '', noDefender: false, noUpdate: false, updateDisabled: false, noEdge: false };
    const win = ins => H.findings(Object.assign({}, base, { install: Object.assign({}, normal, ins) })).filter(f => f.cat === 'การติดตั้ง Windows');
    assert.deepEqual(win({}).map(f => f.level), ['ok']);
    assert.equal(win({ brand: 'tiny11' }).find(f => f.level === 'info').title, 'Windows ฉบับดัดแปลง');
    assert.equal(win({ noDefender: true, noUpdate: true, updateDisabled: true, bypass: ['BypassCPUCheck'] }).every(f => f.level === 'info'), true, 'nothing red or amber');
    const bypass = win({ bypass: ['BypassCPUCheck'], moSetup: true });
    assert.equal(bypass.find(f => f.title === 'ลงแบบข้ามเกณฑ์ Windows 11').level, 'info');
    assert.match(bypass.find(f => f.title === 'ลงแบบข้ามเกณฑ์ Windows 11').detail, /BypassCPUCheck, AllowUpgradesWithUnsupportedTPMOrCPU/);
    assert.equal(win({ noEdge: true }).find(f => f.level === 'info').title, 'ไม่มี Microsoft Edge', 'Edge alone is only a hint');
    // the brand test must not catch HP EliteDesk / EliteBook or Toshiba Satellite
    const pattern = new RegExp(H.healthScript().match(/\$ident -match '([^']+)'/)[1], 'i');
    for (const ok of ['HP EliteDesk 800 G3', 'HP EliteBook 840', 'Toshiba Satellite', 'Dell OptiPlex 7010']) assert.equal(pattern.test(ok), false, ok);
    for (const bad of ['Windows 10 Lite', 'tiny11', 'Extreme TeamOS', 'Ghost Spectre']) assert.equal(pattern.test(bad), true, bad);
});

test('switching off without shutting down is only noted; a blue screen is a fault', () => {
    const base = { upDays: 1, lastUpdateDays: 3, ramPct: 40, ramGb: 8, cpu: 5, freeGb: 50, diskGb: 200, diskType: 'SSD', adapters: ['e'], ip: '10.0.0.2', gw: '10.0.0.1', gwOk: true, dnsOk: true, netOk: true, spooler: 'Running', jobs: 0, printers: [], startup: [], tempMb: 10, fontsMissing: [], thSarabun: true };
    const sys = d => H.findings(Object.assign({}, base, d)).filter(f => f.cat === 'ระบบ');
    assert.equal(sys({ crashes14d: 12 }).find(f => /Shut down/.test(f.title)).level, 'info');
    assert.equal(sys({ crashes14d: 12, bsod14d: 2 }).find(f => /จอฟ้า/.test(f.title)).level, 'bad');
    const script = H.healthScript();
    assert.match(script, /ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41;/, 'not 41 and 6008 together');
    // Thai names survive any console code page: non-ASCII goes out as \u escapes
    assert.ok(script.includes("[regex]::Replace(($o | ConvertTo-Json -Compress -Depth 4), '[^\\x00-\\x7F]'"), 'non-ASCII is escaped');
});

test('the fix log never sends a field called "action" (it would replace the scpops channel name)', () => {
    const src = fs.readFileSync(path.join(root, 'public/scripts/scp-health.js'), 'utf8');
    const call = src.match(/request\('healthLog', \{[^}]*\}/)[0];
    assert.doesNotMatch(call, /\baction:/);
    assert.match(call, /fix: action/);
    // the same trap for every request the health module makes
    for (const m of src.matchAll(/ScpOperations\.request\('(\w+)', \{([^}]*)\}/g)) assert.doesNotMatch(m[2], /\baction\s*:/, m[1]);
});

test('disk health: one percentage per disk, bad sectors cost the most, a failing disk is capped at 10%', () => {
    // read from real disks (the server PC, 2026-10-13)
    const samsung = { n: 'Samsung SSD 870 QVO 2TB', type: 'SSD', bus: 'SATA', gb: 1863, health: 'Healthy', smart: true, wear: 0, temp: -1, poh: 6891, rdErr: -1, realloc: 0, pending: -1, uncorr: -1, reported: 0, crc: 0, life: 99, lifeId: 177, below: 0, fail: false };
    const oldHdd = { n: 'WDC WD10EZEX-08M2NA0', type: 'HDD', bus: 'SATA', gb: 932, health: 'Healthy', smart: true, wear: 0, temp: 50, poh: 50075, rdErr: 0, realloc: 0, pending: 0, uncorr: 0, reported: -1, crc: 0, life: -1, lifeId: 0, below: 0, fail: false };
    const nvme = { n: 'Lexar SSD NM620 512GB', type: 'SSD', bus: 'NVMe', gb: 477, health: 'Healthy', smart: false, wear: 0, temp: 44, poh: -1, rdErr: -1, realloc: -1, pending: -1, uncorr: -1, reported: -1, crc: -1, life: -1, lifeId: 0, below: 0, fail: false };
    assert.deepEqual([H.diskVerdict(samsung).pct, H.diskVerdict(samsung).level], [99, 'ok']);
    assert.deepEqual([H.diskVerdict(nvme).pct, H.diskVerdict(nvme).level], [100, 'ok']);
    const old = H.diskVerdict(oldHdd);
    assert.equal(old.pct, 80, '50,000 hours on: 20 off for age');
    assert.equal(old.badSectors, 0);
    assert.equal(old.years, 5.7);
    // the same disk with sectors waiting to be moved and some unreadable
    const sick = H.diskVerdict(Object.assign({}, oldHdd, { realloc: 120, pending: 8, uncorr: 3 }));
    assert.equal(sick.badSectors, 131);
    assert.equal(sick.level, 'bad');
    assert.ok(sick.pct < 40, String(sick.pct));
    assert.match(sick.reasons[0], /bad sector 131/);
    // a few moved sectors on a young disk: still usable, but flagged
    const few = H.diskVerdict(Object.assign({}, samsung, { realloc: 2 }));
    assert.equal(few.level, 'warn');
    assert.equal(H.diskVerdict(Object.assign({}, samsung, { fail: true })).pct, 10);
    assert.equal(H.diskVerdict(Object.assign({}, samsung, { below: 1 })).level, 'bad', 'an attribute at its threshold');
    assert.equal(H.diskVerdict(Object.assign({}, samsung, { life: 35 })).level, 'bad', 'SSD worn out');
    // seen on a real disk behind a RAID port: SMART 187 at 5,026 is not 'fine'
    const reads = H.diskVerdict(Object.assign({}, oldHdd, { poh: 12000, reported: 5026 }));
    assert.deepEqual([reads.pct, reads.level], [70, 'warn']);
    assert.match(reads.reasons.join(' '), /อ่านข้อมูลพลาด 5026 ครั้ง/);
    assert.match(old.reasons.join(' '), /อายุมาก/, 'an old disk says why it lost points');
    // shown per disk in the findings, worst first in the hospital list
    const f = H.findings({ upDays: 1, lastUpdateDays: 3, ramPct: 40, ramGb: 8, cpu: 5, freeGb: 50, diskGb: 200, adapters: ['e'], ip: '10.0.0.2', gw: '10.0.0.1', gwOk: true, dnsOk: true, netOk: true, spooler: 'Running', jobs: 0, printers: [], startup: [], tempMb: 10, fontsMissing: [], thSarabun: true, disks: [samsung, Object.assign({}, oldHdd, { pending: 8 })] });
    const disk = f.filter(x => /สุขภาพดิสก์/.test(x.title));
    assert.equal(disk.length, 2);
    assert.match(disk[1].title, /^สุขภาพดิสก์ \d+% — ลูกที่ 2\/2 WDC/);
    const count = f.find(x => /^ดิสก์ในเครื่องนี้/.test(x.title));
    assert.equal(count.title, 'ดิสก์ในเครื่องนี้ 2 ลูก (SSD 1 · HDD 1)');
    assert.match(count.detail, /^1\. Samsung SSD 870 QVO 2TB 1863GB SSD · 2\. WDC/);
    assert.match(disk[1].detail, /รอย้าย 8/);
});

test('the disk probe reads every disk, one statement per line', () => {
    const script = H.healthScript();
    assert.match(script, /MSStorageDriver_FailurePredictData/);
    assert.match(script, /Get-StorageReliabilityCounter/);
    assert.match(script, /disks = \$disks/);
    for (const line of script.split('\r\n')) assert.ok(!/^\s*[{}]\s*$/.test(line));
});
