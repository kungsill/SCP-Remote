'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const archive = require('../../public/scripts/scp-price-archive');
const data = require('../../public/data/reference-prices/catalog.json');
const sourceRows = id => data.items.filter(r => r.sourceId === id);

test('archived editions keep every numbered item and an intact source PDF', () => {
    assert.equal(data.sources.length, 18);
    assert.equal(data.items.length, 973);
    assert.deepEqual(data.missingOriginalYears, [2551, 2552]);
    for (const source of data.sources) {
        const rows = sourceRows(source.id);
        assert.equal(rows.length, source.expectedItems, source.id);
        assert.equal(rows.length, source.itemCount);
        const pdf = fs.readFileSync(path.join(__dirname, '../../public', source.localPath));
        assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
        assert.equal(crypto.createHash('sha256').update(pdf).digest('hex'), source.sha256);
        if (source.scope === 'full') assert.deepEqual(rows.map(r => r.item), Array.from({ length: rows.length }, (_, i) => i + 1));
        assert.ok(rows.every(r => Number.isFinite(r.price) && r.price > 0 && r.page > 0 && r.name && typeof r.specs === 'string'));
        assert.ok(rows.filter(r => ['desktop', 'aio', 'notebook'].includes(r.category)).every(r => r.specs));
    }
});

test('FY 2570 combines the May 2569 first eleven with December 2568 remaining items, excluding the draft', () => {
    const rows = archive.effectiveItems(data, 2570);
    assert.equal(rows.length, 70);
    assert.equal(rows.filter(r => r.sourceId === 'mdes-10933').length, 11);
    assert.equal(rows.filter(r => r.sourceId === 'mdes-10282').length, 59);
    assert.equal(rows.find(r => r.item === 4).price, 23000);
    assert.equal(rows.find(r => r.item === 7).price, 22000);
    assert.equal(rows.find(r => r.item === 8).price, 26000);
    assert.equal(rows.find(r => r.item === 9).price, 21000);
    assert.ok(rows.every(r => !r.sourceId.startsWith('draft')));
    assert.equal(sourceRows('draft-2570').find(r => r.item === 7).price, 25000);
    assert.equal(rows.find(r => r.item === 70).specs, '');
    assert.ok(data.sources.find(s => s.id === 'mdes-10282').notes.includes('ลักษณะการใช้งาน'));
});

test('fiscal cutoffs do not apply a December edition to the previous September and preserve supplements', () => {
    assert.equal(archive.effectiveItems(data, 2568)[0].sourceId, 'mdes-6650');
    const rows = archive.effectiveItems(data, 2558);
    assert.equal(rows.length, 68);
    assert.equal(rows.filter(r => r.sourceId === 'mdes-1594').length, 4);
    assert.equal(archive.effectiveItems(data, 2556).length, 62);
    assert.equal(archive.effectiveItems(data, 2551).length, 0);
    assert.equal(archive.effectiveItems(data, 2552).length, 0);
    assert.equal(archive.effectiveItems(data, 2554).length, 49);
    assert.ok(archive.effectiveItems(data, 2554).every(r => r.sourceId === 'ict-2553'));
    assert.equal(sourceRows('ict-2554').length, 22);
    assert.equal(sourceRows('ict-2554')[0].item, '1.1');
    assert.equal(archive.effectiveItems(data, 2571).length, 0);
});

test('AIO selection and multi-word specification search work across editions', () => {
    const rows = archive.filterItems(archive.effectiveItems(data, 2570), 'aio', '');
    assert.equal(rows.length, 2);
    assert.equal(archive.filterItems(rows, 'aio', '16 GB').length, 1);
    assert.equal(archive.filterItems(rows, 'aio', 'สำนักงาน').length, 1);
    assert.equal(archive.filterItems(data.items, 'aio', '').length, 16);
    assert.equal(sourceRows('draft-2570').find(r => r.item === 66).category, 'software');
});

test('estimates reject invalid amounts and exports quote multiline specs and formula-like text', () => {
    assert.equal(archive.total([{ quantity: 2, unitPrice: 1200 }, { quantity: 1, unitPrice: 1500 }]), 3900);
    assert.equal(archive.total([{ quantity: 1, unitPrice: 0.005 }, { quantity: 1, unitPrice: 0.005 }]), 0.02, 'displayed line amounts and the central total use the same rounding');
    assert.throws(() => archive.total([{ quantity: -1, unitPrice: 10 }]));
    assert.throws(() => archive.total([{ quantity: 1, unitPrice: NaN }]));
    const output = archive.csv([{ ...data.items[0], name: '=1+1', specs: 'A "quoted"\nB' }], data);
    assert.ok(output.includes('"\'=1+1"'));
    assert.ok(output.includes('"A ""quoted""\nB"'));
    assert.ok(output.startsWith('\ufeff'));
});

test('the browser uses the domain path, renders names as text and recovers from a failed catalogue load', async () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.test/sub/', runScripts: 'outside-only' });
    const w = dom.window;
    const script = w.document.createElement('script'); script.src = 'https://example.test/sub/scripts/scp-price-archive.js';
    Object.defineProperty(w.document, 'currentScript', { value: script });
    const sample = { ...data, items: [{ ...data.items[0], name: '<img src=x onerror=alert(1)>' }] };
    let attempts = 0, requestUrl;
    w.fetch = async url => { requestUrl = String(url); if (++attempts === 1) return { ok: false, status: 503 }; return { ok: true, json: async () => sample }; };
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-price-archive.js'), 'utf8'));
    await w.ScpPriceArchive.open();
    assert.ok(w.document.querySelector('[role=status]').textContent.includes('503'));
    await w.ScpPriceArchive.open();
    assert.equal(requestUrl, 'https://example.test/sub/data/reference-prices/catalog.json');
    assert.equal(w.document.querySelectorAll('#scpPriceArchive select')[0].options.length, 20);
    assert.ok(w.document.querySelector('.scp-pa-card h3').textContent.includes('<img'));
    assert.equal(w.document.querySelector('.scp-pa-card img'), null);
    dom.window.close();
});

test('opening and editing an estimate preserves all 201 saved lines and their total', async () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.test/', runScripts: 'outside-only' });
    const w = dom.window;
    w.localStorage.setItem('scpPriceEstimateV1', JSON.stringify({ subject: '201 repair lines', memo: 'QA', lines: Array.from({ length: 201 }, (_, i) => ({ name: 'Part ' + i, quantity: 1, unitPrice: 100 })) }));
    w.fetch = async () => ({ ok: true, json: async () => data });
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-price-archive.js'), 'utf8'));
    await w.ScpPriceArchive.open();
    assert.equal(w.document.querySelectorAll('.scp-pa-estimate-row').length, 201);
    assert.ok(w.document.querySelector('.scp-pa-total').textContent.includes('20,100'));
    const quantity = w.document.querySelector('.scp-pa-estimate-row').querySelectorAll('input')[1];
    quantity.value = '2'; quantity.dispatchEvent(new w.Event('change'));
    const saved = JSON.parse(w.localStorage.getItem('scpPriceEstimateV1'));
    assert.equal(saved.lines.length, 201);
    assert.equal(saved.lines[200].name, 'Part 200');
    assert.equal(saved.lines[0].quantity, 2);
    assert.ok(w.document.querySelector('.scp-pa-total').textContent.includes('20,200'));
    dom.window.close();
});
