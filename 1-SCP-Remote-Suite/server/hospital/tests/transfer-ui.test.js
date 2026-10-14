'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
function setup(t) {
    const dom = new JSDOM('<html lang="th"><body><input id="DeskClip"><div id="p13filetable"></div><input id="p13UploadButton" disabled><input id="p13DownloadButton" disabled><div id="host"></div></body></html>', { url: 'https://hospital.example', runScripts: 'outside-only' });
    const w = dom.window, messages = [];
    w.currentNode = { _id: 'node//a', name: '<script>test</script>' }; w.desktop = { State: 3, contype: 1 }; w.features2 = 0;
    w.meshserver = { send: msg => messages.push(msg) }; w.confirm = () => true;
    w.setDialogMode = (mode, title, buttons, callback, html, tag) => { w.xxdialogMode = mode; w.xxdialogTag = tag; w.document.getElementById('host').innerHTML = html; };
    w.dialogclose = () => { w.xxdialogMode = 0; w.xxdialogTag = null; w.document.getElementById('host').textContent = ''; };
    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-transfer.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded')); w.ScpTransfer.show();
    t.after(() => w.close());
    const click = id => w.document.getElementById(id).click();
    const reply = (msg, extra) => w.ScpTransfer.handle(Object.assign({}, msg, extra));
    return { w, messages, click, reply, status: () => w.document.getElementById('scpTransferStatus').textContent };
}
test('text send waits for acknowledgement and verifies remote content before reporting success', t => {
    const s = setup(t), field = s.w.document.getElementById('scpTransferText'); field.value = 'สวัสดี\nโรงพยาบาล';
    s.click('scpTransferSend'); assert.equal(s.messages[0].type, 'setclip'); assert.equal(s.messages[0].data, field.value);
    assert.ok(!s.status().includes('ตรวจสอบแล้ว'));
    s.reply(s.messages[0], { success: true }); assert.equal(s.messages[1].type, 'getclip');
    s.reply(s.messages[1], { data: 'สวัสดี\r\nโรงพยาบาล' }); assert.ok(s.status().includes('ตรวจสอบแล้ว'));
    assert.equal(s.w.document.querySelectorAll('#scpTransferTarget script').length, 0);
});
test('receive supports empty clipboard, ignores another node, and keeps clipboard writes explicit', t => {
    const s = setup(t); s.click('scpTransferGet');
    s.reply(s.messages[0], { nodeid: 'node//other', data: 'wrong machine' });
    assert.equal(s.w.document.getElementById('scpTransferText').value, '');
    s.reply(s.messages[0], { data: '' }); assert.ok(s.status().includes('ไม่มีข้อความ'));
});
test('session changes and failed acknowledgements never report a successful transfer', t => {
    const s = setup(t); s.click('scpTransferGet'); s.w.currentNode = { _id: 'node//b' };
    s.reply(s.messages[0], { data: 'private content' }); assert.ok(s.status().includes('เปลี่ยนเครื่อง'));
    assert.equal(s.w.document.getElementById('scpTransferText').value, '');
});
test('file shortcut preserves native consent and upload/download availability', t => {
    const s = setup(t); let opened = null; s.w.go = page => { opened = page; };
    s.w.connectFiles = () => assert.fail('Opening the panel must not connect automatically');
    s.click('scpTransferFiles'); assert.equal(opened, 13);
    assert.equal(s.w.document.getElementById('p13UploadButton').disabled, true);
    assert.ok(s.w.document.getElementById('p13DownloadButton').value.includes('เครื่องเรา'));
});
test('administrator clipboard direction restrictions disable the corresponding buttons', t => {
    const s = setup(t); s.w.dialogclose(); s.w.features2 = 0x1800; s.w.ScpTransfer.show();
    assert.equal(s.w.document.getElementById('scpTransferGet').disabled, true);
    assert.equal(s.w.document.getElementById('scpTransferSend').disabled, true);
});
