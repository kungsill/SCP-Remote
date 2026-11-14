'use strict';
// A computer's General page regrouped into cards after MeshCentral draws it. The HTML fed in is
// what gotoDevice() writes into #p10html: addDeviceAttribute() rows, then the action buttons.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const view = fs.readFileSync(path.join(root, 'views/default.handlebars'), 'utf8');
const row = (k, v) => '<tr><td class=style7>' + k + '</td><td class=style9>' + v + '</td></tr>';
const html = '<table style=width:100%>' +
    row('กลุ่ม', '<a href=#>กายภาพ</a>') + row('ชื่อโฮสต์', '192.168.4.53') + row('ระบบปฏิบัติการ', 'Windows 11') +
    row('ความปลอดภัย Windows', 'AV - <span style=color:green>ตกลง</span>') +
    row('Antivirus', 'FortiClient - <span style=color:red>ปิดใช้งาน</span><br>Windows Defender - <span style=color:green>ตกลง</span>') +
    row('รอรีสตาร์ต', 'File Rename') +
    row('ผู้ใช้ที่ใช้งานอยู่', 'DESKTOP-IH1VRH4\\admin') + row('เวลาที่ไม่ใช้งาน', '00:00:03') + row('แท็ก', '<i>ไม่มี</i>') +
    '</table><br />' +
    '<input type=button value=การดำเนินการ onclick=deviceActionFunction() /><input type=button value=บันทึก onclick=showNotes() />';

function page(t, node) {
    const dom = new JSDOM('<html lang="th"><body><div id=p10html></div></body></html>', { runScripts: 'outside-only' });
    const w = dom.window, calls = [];
    t.after(() => w.close());
    w.currentNode = node || { _id: 'node//k2', conn: 1, ip: '192.168.4.53', users: ['DESKTOP-IH1VRH4\\admin'] };
    w.ScpDashboard = { openRemote: n => calls.push(['remote', n._id]) };
    w.gotoDevice = (id, v) => calls.push(['goto', id, v]);
    w.setTimeout = () => 0;
    w.eval(fs.readFileSync(path.join(root, 'public/scripts/scp-device.js'), 'utf8'));
    w.document.getElementById('p10html').innerHTML = html;      // how the page fills it (QH)
    w.ScpDevice.tidy(w.document.getElementById('p10html'));
    return { w, doc: w.document, calls };
}
const labels = card => [...card.querySelectorAll('td:first-child')].map(td => td.textContent);

test('rows are grouped into the computer, its security, and who is using it', (t) => {
    const { doc } = page(t);
    assert.deepEqual(labels(doc.querySelector('.scp-dev-info')), ['กลุ่ม', 'ชื่อโฮสต์', 'ระบบปฏิบัติการ']);
    assert.deepEqual(labels(doc.querySelector('.scp-dev-security')), ['ความปลอดภัย Windows', 'Antivirus', 'รอรีสตาร์ต']);
    assert.deepEqual(labels(doc.querySelector('.scp-dev-usage')), ['ผู้ใช้ที่ใช้งานอยู่', 'เวลาที่ไม่ใช้งาน', 'แท็ก']);
});

test('a security row reporting something switched off stands out, and is counted on top', (t) => {
    const { doc } = page(t);
    const rows = [...doc.querySelectorAll('.scp-dev-security tr')];
    assert.ok(rows[1].classList.contains('scp-dev-warn'), 'FortiClient switched off');
    assert.ok(!rows[0].classList.contains('scp-dev-warn'));
    assert.match(doc.querySelector('.scp-dev-top').textContent, /ต้องตรวจ 1 รายการ/);
});

test('the top line says it is on, its IP and user, with Remote and Files', (t) => {
    const { doc, calls } = page(t);
    const top = doc.querySelector('.scp-dev-top');
    assert.match(top.textContent, /เปิดอยู่/);
    assert.match(top.textContent, /IP 192\.168\.4\.53/);
    assert.match(top.textContent, /ผู้ใช้ admin/);
    [...top.querySelectorAll('button')].find(b => b.textContent === 'รีโมต').click();
    [...top.querySelectorAll('button')].find(b => b.textContent === 'ไฟล์').click();
    assert.deepEqual(calls, [['remote', 'node//k2'], ['goto', 'node//k2', 13]]);
});

test('a computer that is off says so and offers no Remote', (t) => {
    const { doc } = page(t, { _id: 'node//x', conn: 0 });
    const top = doc.querySelector('.scp-dev-top');
    assert.match(top.textContent, /ปิดอยู่/);
    assert.equal(top.querySelector('button'), null);
});

test('the page\'s own buttons are kept, with their own actions, in a card of their own', (t) => {
    const { doc } = page(t);
    const btns = [...doc.querySelectorAll('.scp-dev-actions input[type=button]')];
    assert.deepEqual(btns.map(b => b.getAttribute('onclick')), ['deviceActionFunction()', 'showNotes()']);
});

test('when the page draws the panel again, it is regrouped again, once', (t) => {
    const { w, doc } = page(t);
    const box = doc.getElementById('p10html');
    box.innerHTML = html;
    w.ScpDevice.tidy(box);
    w.ScpDevice.tidy(box);
    assert.equal(box.querySelectorAll('.scp-dev-top').length, 1);
    assert.equal(box.querySelectorAll('.scp-dev-card').length, 4);
});

test('the page loads it', () => {
    assert.match(view, /scripts\/scp-device\.js\?v=/);
    assert.match(view, /styles\/scp-device\.css\?v=/);
});
