'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { createHandler } = require('../uploads');
const common = require('../../common');
async function fixture(t, quota = null) {
    const base = path.resolve(__dirname, '../../.local/tests');
    await fs.mkdir(base, { recursive: true });
    const root = await fs.mkdtemp(path.join(base, 'uploads-'));
    const home = path.join(root, 'domain', 'user-tester');
    await fs.mkdir(home, { recursive: true });
    let events = 0;
    const app = express();
    app.use((req, res, next) => { req.session = req.headers['x-test-user'] ? { userid: req.headers['x-test-user'] } : null; next(); });
    app.post('/upload', createHandler({
        filesPath: root,
        getDomain: () => ({ id: '' }),
        getUser: id => id ? { _id: 'user//tester', domain: '', siteadmin: id === 'denied' ? 0 : 8 } : null,
        resolvePath: (user, domain, link) => {
            const parts = link.split('/');
            if (parts.slice(0, 3).join('/') !== user._id || parts.slice(3).some(part => !common.IsFilenameValid(part))) return null;
            return { fullpath: path.join(home, ...parts.slice(3)), quota };
        },
        validFilename: common.IsFilenameValid,
        changed: () => { events++; }
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        assert.equal(path.dirname(root), base);
        assert.ok(path.basename(root).startsWith('uploads-'));
        await fs.rm(root, { recursive: true, force: true });
    });
    return {
        root, home, events: () => events,
        async upload(name, content, options = {}) {
            const data = new FormData();
            data.append('overwrite', options.overwrite ? '1' : '0');
            data.append('files', new Blob([content]), name);
            const response = await fetch('http://127.0.0.1:' + server.address().port + '/upload?link=' + encodeURIComponent(options.link || 'user//tester'), {
                method: 'POST', headers: options.noAuth ? {} : { 'x-test-user': options.denied ? 'denied' : 'tester' }, body: data
            });
            return { status: response.status, data: await response.json() };
        }
    };
}
test('upload acknowledgement follows storage, including Unicode filenames and zero-byte files', async t => {
    const f = await fixture(t);
    const result = await f.upload('คู่มือ รพ.txt', 'ทดสอบ');
    assert.equal(result.status, 200);
    assert.equal(result.data.ok, true);
    assert.equal(await fs.readFile(path.join(f.home, 'คู่มือ รพ.txt'), 'utf8'), 'ทดสอบ');
    assert.equal(result.data.file.size, Buffer.byteLength('ทดสอบ'));
    assert.equal(f.events(), 1);
    assert.equal((await f.upload('empty.txt', '')).status, 200);
    assert.equal((await fs.stat(path.join(f.home, 'empty.txt'))).size, 0);
});
test('duplicate names require explicit replacement and failures preserve the original', async t => {
    const f = await fixture(t);
    await f.upload('file.txt', 'original');
    assert.equal((await f.upload('file.txt', 'replacement')).status, 409);
    assert.equal(await fs.readFile(path.join(f.home, 'file.txt'), 'utf8'), 'original');
    assert.equal((await f.upload('file.txt', 'replacement', { overwrite: true })).status, 200);
    assert.equal(await fs.readFile(path.join(f.home, 'file.txt'), 'utf8'), 'replacement');
});
test('quota includes nested folders, accepts an exact limit, and subtracts replaced bytes', async t => {
    const f = await fixture(t, 10);
    await fs.mkdir(path.join(f.home, 'nested'));
    assert.equal((await f.upload('a.txt', '123456', { link: 'user//tester/nested' })).status, 200);
    assert.equal((await f.upload('b.txt', '12345')).status, 413);
    assert.equal((await f.upload('b.txt', '1234')).status, 200);
    assert.equal((await f.upload('b.txt', '1234', { overwrite: true })).status, 200);
    assert.equal((await f.upload('b.txt', '12345', { overwrite: true })).status, 413);
    assert.equal(await fs.readFile(path.join(f.home, 'b.txt'), 'utf8'), '1234');
});
test('concurrent uploads share one quota budget', async t => {
    const f = await fixture(t, 10);
    const results = await Promise.all([f.upload('first.txt', '123456'), f.upload('second.txt', '123456')]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 413]);
    assert.equal((await fs.readdir(f.home)).length, 1);
});
test('authentication, permissions, invalid names and invalid destinations are rejected', async t => {
    const f = await fixture(t);
    assert.equal((await f.upload('x.txt', 'x', { noAuth: true })).status, 401);
    assert.equal((await f.upload('x.txt', 'x', { denied: true })).status, 403);
    assert.equal((await f.upload('x.txt', 'x', { link: 'user//other' })).status, 403);
    const missing = await f.upload('x.txt', 'x', { link: 'user//tester/deleted-folder' });
    assert.equal(missing.status, 400);
    assert.equal(missing.data.error, 'invalid_path');
    assert.equal((await f.upload('x.txt', 'x', { link: 'user//tester/../outside' })).status, 403);
    assert.equal((await f.upload('bad:name.txt', 'x')).status, 400);
    assert.equal((await f.upload('__proto__', 'x')).status, 400);
    assert.deepEqual(await fs.readdir(f.home), []);
    assert.equal(f.events(), 0);
});
