'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
function setup(t, lang = 'th') {
    const dom = new JSDOM('<html lang="' + lang + '"><body><div id="p5files"></div></body></html>', { url: 'https://hospital.example/', runScripts: 'outside-only' });
    const w = dom.window, requests = [], messages = [];
    w.userinfo = { _id: 'user//tester' };
    w.filetree = { f: { 'user//tester': { t: 1, f: {} } } };
    w.filetreelocation = ['user//tester'];
    w.domainUrl = '/';
    w.meshserver = { send: message => messages.push(message) };
    w.updateFiles = () => {};
    w.confirm = () => true;
    w.XMLHttpRequest = class {
        constructor() { this.upload = {}; this.headers = {}; requests.push(this); }
        open(method, url) { this.method = method; this.url = url; }
        setRequestHeader(key, value) { this.headers[key] = value; }
        send(data) { this.data = data; }
    };
    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-files.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    t.after(() => w.close());
    return { w, requests, messages, reply(index, status, data) { const xhr = requests[index]; xhr.status = status; xhr.responseText = JSON.stringify(data); xhr.onload(); } };
}
test('upload progress does not claim success until acknowledgement; acknowledged files appear immediately', t => {
    const f = setup(t), file = new f.w.File(['data'], 'คู่มือ.txt');
    f.w.ScpFiles.enqueue([file]);
    f.requests[0].upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
    assert.ok(f.w.document.body.textContent.includes('กำลังบันทึกบนเซิร์ฟเวอร์'));
    assert.equal(f.w.filetree.f['user//tester'].f['คู่มือ.txt'], undefined);
    f.reply(0, 200, { ok: true, file: { name: file.name, size: file.size, modified: 123 }, path: 'user//tester' });
    assert.equal(f.w.filetree.f['user//tester'].f['คู่มือ.txt'].s, 4);
    assert.equal(f.w.document.querySelector('.scp-upload-row').dataset.state, 'success');
    assert.ok(f.messages.some(message => message.action === 'files'));
});
test('failed uploads report an error, retain retry and do not add nonexistent files', t => {
    const f = setup(t, 'en');
    f.w.ScpFiles.enqueue([new f.w.File(['x'], 'large.txt')]);
    f.reply(0, 413, { ok: false, error: 'quota_exceeded' });
    assert.ok(f.w.document.body.textContent.includes('Not enough storage'));
    assert.equal(f.w.filetree.f['user//tester'].f['large.txt'], undefined);
    const retry = [...f.w.document.querySelectorAll('button')].find(button => button.textContent === 'Retry');
    assert.equal(retry.hidden, false);
    retry.click();
    assert.equal(f.requests.length, 2);
});
test('queue preserves its destination and continues after an invalid response, including zero-byte files', t => {
    const f = setup(t);
    f.w.ScpFiles.enqueue([new f.w.File(['x'], 'first.txt'), new f.w.File([], 'empty.txt')]);
    f.w.filetreelocation = ['user//tester', 'different'];
    f.reply(0, 200, null);
    assert.equal(f.requests.length, 2);
    assert.ok(f.requests[1].url.endsWith('link=user%2F%2Ftester'));
    f.reply(1, 200, { ok: true, file: { name: 'empty.txt', size: 0, modified: 123 }, path: 'user//tester' });
    assert.equal(f.w.filetree.f['user//tester'].f['empty.txt'].s, 0);
    assert.deepEqual([...f.w.filetreelocation], ['user//tester', 'different']);
});
