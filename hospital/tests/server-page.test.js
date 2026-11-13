'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '../..');
const template = fs.readFileSync(path.join(root, 'views/default.handlebars'), 'utf8');
const panel = template.slice(template.indexOf('<div id=p6 '), template.indexOf('<div id=p10 '));
const sample = { totalmem: 32 * 1073741824, freemem: 8 * 1073741824, cpuavg: [0, 0, 0], values: { ServerState: { AgentSessions: 80, ConnectedUsers: 1, DeviceGroups: 29, RelaySessions: 0 }, AgentErrorCounters: { InvalidPKCSsignature: 1, BadSignature: 1 } } };
function setup(t) {
    const dom = new JSDOM('<html lang="th"><body>' + panel + '</body></html>', { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window; let originals = 0;
    w.meshserver = { State: 2 }; w.updateGeneralServerStats = () => originals++;
    w.eval(fs.readFileSync(path.join(root, 'public/scripts/scp-server.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    return { w, doc: w.document, originals: () => originals };
}
test('server feed updates cards while preserving original actions and technical display', t => {
    const { w, doc, originals } = setup(t);
    const backup = doc.querySelector('#p2ServerActionsBackup a');
    let clicked = 0; backup.addEventListener('click', e => { e.preventDefault(); clicked++; });
    w.updateGeneralServerStats(sample);
    assert.equal(originals(), 1);
    assert.deepEqual([...doc.querySelectorAll('.scp-srv-grid .scp-srv-number')].map(n => n.textContent), ['80', '1', '29', '0']);
    assert.match(doc.querySelector('.scp-srv-resources').textContent, /75%/);
    assert.match(doc.querySelector('.scp-srv-attention').textContent, /ตัวนับสะสม/);
    assert.match(doc.querySelector('.scp-srv-resources').textContent, /ไม่ใช่เปอร์เซ็นต์/);
    assert.equal(doc.querySelector('#p2ServerActionsBackup a'), backup); backup.click(); assert.equal(clicked, 1);
    assert.ok(doc.querySelector('details #serverStats'));
    assert.equal(doc.getElementById('p2ServerActionsGoogleBackup').style.display, 'none');
    w.updateGeneralServerStats(sample);
    assert.equal(doc.querySelectorAll('#scpServerOverview').length, 1);
    assert.match(template, /scripts\/scp-server\.js\?v=/);
});
test('waiting, disconnected, and stale reports are distinguishable', t => {
    const { w, doc } = setup(t);
    const badge = () => doc.getElementById('scpServerFresh').textContent;
    assert.match(badge(), /รอข้อมูล/);
    assert.equal(doc.querySelector('.scp-srv-number').textContent, '—');
    w.updateGeneralServerStats(sample); assert.match(badge(), /รับข้อมูลได้/);
    w.meshserver.State = 0; w.ScpServer.freshness(); assert.match(badge(), /ขาดการเชื่อมต่อ/);
    w.meshserver.State = 2; const now = w.Date.now(); w.Date.now = () => now + 31000;
    w.ScpServer.freshness(); assert.match(badge(), /ยังไม่อัปเดต/);
    w.updateGeneralServerStats(sample); assert.match(badge(), /รับข้อมูลได้/);
});
test('missing and invalid resource readings are not presented as healthy zeroes', t => {
    const { w, doc } = setup(t);
    w.updateGeneralServerStats({ totalmem: 0, freemem: 9, values: {} });
    assert.equal(doc.querySelectorAll('meter').length, 0);
    assert.deepEqual([...doc.querySelectorAll('.scp-srv-resources .scp-srv-number')].map(n => n.textContent), ['—', '—']);
    w.updateGeneralServerStats({ totalmem: 100, availablemem: 5, freemem: 40, values: {} });
    assert.equal(doc.querySelector('meter').value, 95);
    assert.match(doc.querySelector('.scp-srv-note').textContent, /ใช้สูง/);
});
test('unrecognized error names are rendered as text', t => {
    const { w, doc } = setup(t);
    w.updateGeneralServerStats({ values: { AgentErrorCounters: { '<img src=x onerror=alert(1)>': 1 } } });
    assert.equal(doc.querySelectorAll('.scp-srv-attention img').length, 0);
    assert.match(doc.querySelector('.scp-srv-attention').textContent, /<img/);
});
