'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');

// A small fleet snapshot in the shape ScpDashboard.snapshot() returns.
function fleet() {
    return {
        at: 1700000000000, total: 4, online: 2,
        groups: [
            { name: 'OPD', total: 2, online: 1, offline: 1, attention: 1 },
            { name: 'ward', total: 2, online: 1, offline: 1, attention: 1 }
        ],
        nodes: [
            { id: 'a', name: 'A', room: 'OPD', online: true, busy: false, away: null,
                risks: [{ level: 'high', text: 'disk full' }, { level: 'warn', text: 'old signature' }], high: 1, warn: 1 },
            { id: 'b', name: 'B', room: 'OPD', online: false, busy: false, away: 5, risks: [], high: 0, warn: 0 },
            { id: 'c', name: 'C', room: 'ward', online: false, busy: false, away: -1,
                risks: [{ level: 'warn', text: 'never seen' }], high: 0, warn: 1 },
            { id: 'd', name: 'D', room: 'ward', online: true, busy: false, away: null, risks: [], high: 0, warn: 0 }
        ]
    };
}

function load(t, opts) {
    opts = opts || {};
    const dom = new JSDOM('<html lang="th"><body></body></html>', { url: 'https://hospital.example/', runScripts: 'outside-only' });
    const w = dom.window;
    t.after(() => w.close());
    w.setTimeout = () => 1;
    w.print = () => { w.__printed = (w.__printed || 0) + 1; };
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    if (opts.dashboard !== false) { w.ScpDashboard = { snapshot: () => fleet() }; }
    if (opts.watched !== undefined) {
        w.ScpOperations = { request: () => Promise.resolve(opts.watched) };
    }
    w.eval(fs.readFileSync(path.join(root, 'public/scripts/scp-report.js'), 'utf8'));
    return w;
}

test('device fact sheets show installed Windows 11 as ready and render RAM upgrade notes from the server', (t) => {
    const w = load(t);
    const base = { nodeid: 'ready', name: 'Ready PC', room: 'OPD', os: 'Windows 11 Pro', ramGb: 8,
        healthScore: 90, healthStatus: 'good', cpu: 'Intel Core i3-10100', win11Status: 'already_win11',
        win11Blockers: [], upgradeActions: [], survival: {}, replacementYear: 2030 };
    w.ScpCachedFleetAssessment = { devices: [base] };
    w.ScpReport.open('device', 'ready');
    assert.match(w.document.querySelector('.scp-device-sheet').textContent, /พร้อมใช้งาน \(Eligible\)/);
    w.ScpCachedFleetAssessment = { devices: [{ ...base, nodeid: 'ram', name: 'RAM PC', ramGb: 4,
        win11Status: 'upgradable', win11Blockers: ['RAM น้อย'], upgradeActions: [{ note: 'เพิ่ม RAM เป็น 8 GB', cost: 1200 }] }] };
    w.ScpReport.open('device', 'ram');
    const text = w.document.querySelector('.scp-device-sheet').textContent;
    assert.match(text, /สามารถอัปเกรดได้/);
    assert.match(text, /เพิ่ม RAM เป็น 8 GB/);
    assert.doesNotMatch(text, /\[object Object\]/);
});

test('direct assessment printing includes every supplied computer and its available details without opening a dialog', (t) => {
    const w = load(t);
    const device = {
        nodeid: 'ram', name: 'RAM PC', room: 'OPD', os: 'Windows 11 Pro', cpu: 'Intel Core i3-10100',
        ramGb: 4, win11Status: 'upgradable', healthScore: 68, healthStatus: 'fair', recommendation: 'upgrade',
        upgradeCost: 1200, replaceByYear: 2028, cTotalGb: 240, cFreeGb: 100, cFreePercent: 42,
        assetNumber: 'ASSET-001', acquiredYearBE: 2563, yearSource: 'cpu', costBasis: 17000,
        bookValue: 1, depreciation: 16999, depreciationPercent: 100, usefulLifeYears: 5,
        win11Blockers: ['RAM น้อย'], upgradeActions: [{ note: 'เพิ่ม RAM เป็น 8 GB', cost: 1200 }],
        driveModels: ['TEST-SSD'], reportDetails: { ip: '192.168.2.123', host: 'TEST-PC', windowsLicense: 'ตรวจเอกสารสิทธิ์', officeLicense: 'ยังไม่ได้ตรวจ', risks: ['พื้นที่ดิสก์เหลือน้อย'] }
    };
    w.ScpReport.printAssessment([device, { ...device, nodeid: 'last', name: 'Last PC' }], { scope: 'อัปเกรดได้' });
    assert.equal(w.__printed, 1);
    assert.equal(w.document.querySelector('#scpReport'), null);
    const report = w.document.querySelector('.scp-assessment-report');
    assert.equal(report.querySelectorAll('.scp-device-sheet').length, 2);
    assert.equal(report.firstElementChild.className, 'scp-device-sheet', 'printing starts directly with the first device');
    assert.equal(report.querySelector('.scp-report-stats'), null, 'there is no separate summary cover');
    assert.match(report.textContent, /RAM PC/);
    assert.match(report.textContent, /Last PC/);
    for (const value of ['ASSET-001', '192.168.2.123', 'TEST-PC', 'TEST-SSD', '240 GB / 100 GB', 'ตรวจเอกสารสิทธิ์', 'ค่าเสื่อมสะสม', 'พื้นที่ดิสก์เหลือน้อย', 'เพิ่ม RAM เป็น 8 GB', '2571']) assert.ok(report.textContent.includes(value), value);
    assert.doesNotMatch(report.textContent, /\[object Object\]|undefined|NaN/);
    w.dispatchEvent(new w.Event('afterprint'));
    assert.equal(w.document.querySelector('.scp-print-root'), null);
});

test('summarize counts the fleet and keeps the same online/offline totals as the snapshot', (t) => {
    const w = load(t);
    const d = w.ScpReport.summarize(fleet(), null);
    assert.equal(d.total, 4);
    assert.equal(d.online, 2);
    assert.equal(d.offline, 2);
    assert.equal(d.attentionCount, 2, 'two computers carry a risk');
    assert.equal(d.highCount, 1, 'one of them has a high-severity risk');
});

test('summarize lists the machines needing attention, worst first', (t) => {
    const w = load(t);
    const d = w.ScpReport.summarize(fleet(), null);
    assert.deepEqual(d.attention.map(n => n.id), ['a', 'c'], 'the high-severity machine comes before the warn-only one');
    assert.ok(d.attention.every(n => n.risks.length), 'only machines with risks are in the list');
});

test('summarize orders the offline list with never-connected first, then longest away', (t) => {
    const w = load(t);
    const d = w.ScpReport.summarize(fleet(), null);
    assert.deepEqual(d.away.map(n => n.id), ['c', 'b'], 'never-connected (c) before the 5-day-away one (b)');
    assert.ok(d.away.every(n => !n.online));
});

test('summarize includes a watched section only when the watch list was given', (t) => {
    const w = load(t);
    assert.equal(w.ScpReport.summarize(fleet(), null).watched, null, 'no list -> section omitted');
    const some = w.ScpReport.summarize(fleet(), ['c', 'd']);
    assert.deepEqual(some.watched.map(n => n.id), ['c', 'd'], 'offline watched machine sorts before the online one');
    const none = w.ScpReport.summarize(fleet(), []);
    assert.ok(Array.isArray(none.watched) && none.watched.length === 0, 'an empty list is a present-but-empty section');
});

test('summarize does not throw on an empty or missing snapshot', (t) => {
    const w = load(t);
    const d = w.ScpReport.summarize(null, null);
    assert.equal(d.total, 0);
    assert.equal(d.offline, 0);
    assert.equal(d.attention.length, 0);
    assert.equal(d.away.length, 0);
});

test('open draws the report from the dashboard snapshot', (t) => {
    const w = load(t);
    w.ScpReport.open();
    const dialog = w.document.getElementById('scpReport');
    assert.ok(dialog && dialog.open, 'the report dialog is shown');
    const stats = [...dialog.querySelectorAll('.scp-report-stat strong')].map(e => e.textContent);
    assert.deepEqual(stats, ['4', '2', '2', '2'], 'total, online, offline, attention');
    assert.ok(dialog.textContent.indexOf('disk full') >= 0, 'a risk reason is shown');
    assert.ok(dialog.textContent.indexOf('A') >= 0, 'the risky machine is named');
});

test('open fills the watched section when the watch operation answers', async (t) => {
    const w = load(t, { watched: ['a'] });
    w.ScpReport.open();
    await new Promise(res => process.nextTick(res));
    await new Promise(res => process.nextTick(res));
    const dialog = w.document.getElementById('scpReport');
    assert.ok(dialog.textContent.indexOf('เครื่องที่เฝ้าระวัง') >= 0, 'the watched heading appears once the list arrives');
});

test('open still renders when there is no watch operation at all', (t) => {
    const w = load(t); // no ScpOperations
    w.ScpReport.open();
    const dialog = w.document.getElementById('scpReport');
    assert.ok(dialog && dialog.open, 'the report opened without the watch list');
    assert.ok(dialog.textContent.indexOf('ต้องดูแล') >= 0);
});

test('printing copies the report into a print-only root, then cleans it up afterwards', (t) => {
    const w = load(t);
    w.ScpReport.open();
    const printBtn = w.document.querySelector('#scpReport .scp-report-print-btn');
    printBtn.onclick();
    assert.equal(w.__printed, 1, 'the browser print was invoked');
    assert.ok(w.document.querySelector('.scp-print-root'), 'a print-only copy was added');
    assert.ok(w.document.documentElement.classList.contains('scp-printing'), 'the page is marked for printing');
    w.dispatchEvent(new w.Event('afterprint'));
    assert.ok(!w.document.querySelector('.scp-print-root'), 'the print copy is removed afterwards');
    assert.ok(!w.document.documentElement.classList.contains('scp-printing'), 'the print mark is cleared');
});
