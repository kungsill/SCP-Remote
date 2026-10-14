'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// Dropping a file on the remote screen used to show a green marker and then do nothing
// for anything that was not a script or a text file, which reads as "sent". These pin
// down that such a file now actually goes somewhere, and that every step says so.
function setup(t, options = {}) {
    const dom = new JSDOM(
        '<html lang="th"><body><input id="DeskClip"><div id="deskarea0"></div>' +
        '<div id="p13filetable"></div><input id="p13Connect" type="button">' +
        '<input id="p13UploadButton" disabled><input id="p13DownloadButton" disabled><div id="host"></div></body></html>',
        { url: 'https://hospital.example', runScripts: 'outside-only' });
    const w = dom.window;
    const uploads = [];

    w.currentNode = { _id: 'node//a', name: 'pc-one' };
    w.desktop = options.desktopConnected === false ? { State: 0 } : { State: 3, contype: 1 };
    w.features2 = 0;
    w.meshserver = { send: () => {} };
    w.confirm = () => true;
    w.p13filetree = options.connected ? { dir: [] } : null;
    // A folder is open unless a test says otherwise; [''] is the drive list.
    w.p13filetreelocation = options.location || ['C:', 'Temp'];
    w.p13doUploadFiles = files => uploads.push(files);
    w.setDialogMode = () => {};
    w.gotoDevice = (id, panel) => { w.wentTo = { id, panel }; };

    const timers = [];
    let nextTimer = 1;
    w.setInterval = (fn, ms) => { const id = nextTimer++; timers.push({ id, fn }); return id; };
    w.clearInterval = id => { const i = timers.findIndex(x => x.id === id); if (i >= 0) { timers.splice(i, 1); } };
    w.setTimeout = (fn) => { return nextTimer++; }; // toasts expire on their own; never in a test

    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-transfer.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    t.after(() => w.close());

    const tick = (times = 1) => { for (let i = 0; i < times; i++) { timers.slice().forEach(timer => timer.fn()); } };
    const drop = files => {
        const event = new w.Event('drop', { bubbles: true, cancelable: true });
        event.dataTransfer = { files: files };
        w.document.getElementById('deskarea0').dispatchEvent(event);
        return event;
    };
    const toast = () => { const box = w.document.getElementById('scpTransferToast'); return box ? box.textContent : ''; };
    return { w, uploads, tick, drop, toast };
}

const file = (name, size = 1024) => ({ name, size });

test('a file dropped on the remote screen is actually sent, after the far end allows it', (t) => {
    const s = setup(t);
    s.drop([file('รายงาน.pdf', 50000)]);

    assert.deepEqual(s.w.wentTo, { id: 'node//a', panel: 13 }, 'it should open the file page for that computer');
    assert.ok(s.toast().indexOf('รับไฟล์') >= 0, 'it should say the file was taken');
    assert.equal(s.uploads.length, 0, 'nothing is sent before the folder listing arrives');

    s.tick();
    assert.ok(s.toast().indexOf('ขออนุญาต') >= 0, 'it should say it is asking for permission');

    s.w.p13filetree = { dir: [] };   // the person at that computer allowed it
    s.tick();
    assert.equal(s.uploads.length, 1);
    assert.equal(s.uploads[0][0].name, 'รายงาน.pdf');
});

test('scripts and text files are left to the page that already handles them', (t) => {
    const s = setup(t);
    const event = s.drop([file('setup.bat'), file('note.txt')]);
    assert.equal(event.defaultPrevented, false, 'the page must still receive these');
    assert.equal(s.w.wentTo, undefined);
    assert.equal(s.uploads.length, 0);
});

test('in a mixed drop the ordinary files are sent and the script is left alone', (t) => {
    const s = setup(t, { connected: true });
    s.drop([file('fix.ps1'), file('ภาพ.jpg'), file('data.zip')]);
    s.tick();
    assert.equal(s.uploads.length, 1);
    // Array.from, because the list was built inside the page and carries its prototype.
    assert.deepEqual(Array.from(s.uploads[0]).map(f => f.name), ['ภาพ.jpg', 'data.zip']);
});

test('dropping before the screen is connected says so rather than doing nothing', (t) => {
    const s = setup(t, { desktopConnected: false });
    s.drop([file('งาน.xlsx')]);
    assert.equal(s.uploads.length, 0);
    assert.ok(s.toast().indexOf('เชื่อมต่อ') >= 0);
    assert.equal(s.w.document.getElementById('scpTransferToast').dataset.error, 'true');
});

test('empty files are ignored, and a drop of only empty files does nothing', (t) => {
    const s = setup(t);
    const event = s.drop([file('empty.dat', 0)]);
    assert.equal(event.defaultPrevented, false);
    assert.equal(s.uploads.length, 0);
});

test('a computer that never answers ends with a message, not silence', (t) => {
    const s = setup(t);
    s.drop([file('ใหญ่.iso', 900000)]);
    s.tick(300); // well past the ninety seconds it waits
    assert.equal(s.uploads.length, 0);
    assert.ok(s.toast().indexOf('ยังไม่ตอบ') >= 0);
    assert.equal(s.w.document.getElementById('scpTransferToast').dataset.error, 'true');
});

test('moving to another computer while waiting stops the transfer', (t) => {
    const s = setup(t);
    s.drop([file('a.pdf')]);
    s.w.currentNode = { _id: 'node//b', name: 'pc-two' };
    s.tick();
    assert.equal(s.uploads.length, 0);
    assert.ok(s.toast().indexOf('เปลี่ยนไปเครื่องอื่น') >= 0);
});

test('the upload shows a percentage, the bytes, and which file of how many', (t) => {
    const s = setup(t, { connected: true });
    const host = s.w.document.getElementById('host');
    host.innerHTML = '<div id="p13dfileName">a.pdf</div><progress id="d2progressBar" max="2097152" value="524288"></progress>';
    s.w.uploadFile = { xfiles: [file('a.pdf'), file('b.pdf'), file('c.pdf')], xfilePtr: 1 };

    s.w.ScpTransfer.watchUploadProgress();
    s.tick();

    const line = s.w.document.getElementById('scpUploadPercent').textContent;
    assert.ok(line.indexOf('25%') >= 0, 'the percentage: ' + line);
    assert.ok(line.indexOf('512 KB') >= 0 && line.indexOf('2.0 MB') >= 0, 'the bytes both ways: ' + line);
    assert.ok(line.indexOf('2') >= 0 && line.indexOf('3') >= 0, 'which file of how many: ' + line);
});

test('the percentage stops following an upload once its window has closed', (t) => {
    const s = setup(t, { connected: true });
    const host = s.w.document.getElementById('host');
    host.innerHTML = '<div id="p13dfileName">a.pdf</div><progress id="d2progressBar" max="100" value="10"></progress>';
    s.w.ScpTransfer.watchUploadProgress();
    s.tick();
    assert.ok(s.w.document.getElementById('scpUploadPercent'));

    host.textContent = '';           // the dialog closed
    assert.doesNotThrow(() => s.tick());
    s.w.ScpTransfer.watchUploadProgress();   // and it can start again for the next upload
    host.innerHTML = '<div id="p13dfileName">b.pdf</div><progress id="d2progressBar" max="100" value="50"></progress>';
    s.tick();
    assert.ok(s.w.document.getElementById('scpUploadPercent').textContent.indexOf('50%') >= 0);
});

test('a computer opened at its drive list waits for a folder instead of failing into nothing', (t) => {
    const s = setup(t, { connected: true });
    s.w.p13filetreelocation = [''];          // the drive list, which is not a destination
    s.drop([file('คู่มือ.pdf')]);
    s.tick();
    assert.equal(s.uploads.length, 0, 'a drive list must not be used as a destination');
    assert.ok(s.toast().indexOf('เปิดโฟลเดอร์ปลายทาง') >= 0);

    s.w.p13filetreelocation = ['C:', 'Users', 'nana', 'Desktop'];   // a folder is opened
    s.tick();
    assert.equal(s.uploads.length, 1, 'and the files go the moment there is somewhere to put them');
});

test('a computer already sitting in a folder sends straight away', (t) => {
    const s = setup(t, { connected: true });
    s.w.p13filetreelocation = ['D:', 'งาน'];
    s.drop([file('a.zip')]);
    s.tick();
    assert.equal(s.uploads.length, 1);
    assert.equal(s.toast(), '', 'no message is needed when it just works');
});

test('waiting for a folder gives up rather than waiting for ever', (t) => {
    const s = setup(t, { connected: true });
    s.w.p13filetreelocation = [''];
    s.drop([file('b.zip')]);
    s.tick(700);
    assert.equal(s.uploads.length, 0);
    assert.ok(s.toast().indexOf('ยังไม่ได้เปิดโฟลเดอร์') >= 0);
});
