'use strict';
// The SCP-Remote program updating itself from the hospital server.
//
// What is updated is the program's own small set of files (its pages and scripts), kept in the
// user's data folder beside the installed copy; the installed copy is never overwritten, so a
// bad update is undone by ignoring that folder. The server's manifest says which version every
// program should be running, and lists each file with its SHA-256. These tests pin down the
// decisions that keep that safe: what counts as newer, what a manifest may contain, and that a
// folder is only run when every file in it is exactly what the manifest says.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const core = require('../desktop-app/update-core');
const appDir = path.join(__dirname, '../desktop-app');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function tmp(t) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-upd-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; }
function manifest(extra) { return Object.assign({ version: '0.5.1', minBoot: 1, files: [{ path: 'main.js', sha256: sha('a'), size: 1 }, { path: 'clipboard/local-host.js', sha256: sha('bb'), size: 2 }] }, extra || {}); }

test('versions are compared as numbers, not text', () => {
    assert.equal(core.compareVersions('0.10.0', '0.9.9') > 0, true);
    assert.equal(core.compareVersions('1.0.0', '1.0.0'), 0);
    assert.equal(core.compareVersions('0.4.3', '0.5.0') < 0, true);
    assert.equal(core.compareVersions('1.2', '1.2.0'), 0);
    assert.throws(() => core.compareVersions('1.x', '1.0.0'));
    assert.throws(() => core.compareVersions('', '1.0.0'));
});

test('a manifest must be complete and may only name files inside the program folder', () => {
    assert.equal(core.validManifest(manifest()).version, '0.5.1');
    const bad = [
        { version: 'latest' },
        { files: [] },
        { files: [{ path: '../evil.js', sha256: sha('a'), size: 1 }] },
        { files: [{ path: '/abs.js', sha256: sha('a'), size: 1 }] },
        { files: [{ path: 'C:/abs.js', sha256: sha('a'), size: 1 }] },
        { files: [{ path: 'a\\b.js', sha256: sha('a'), size: 1 }] },
        { files: [{ path: 'main.js', sha256: 'abc', size: 1 }] },
        { files: [{ path: 'main.js', sha256: sha('a'), size: -1 }] },
        { files: [{ path: 'main.js', sha256: sha('a'), size: 1 }, { path: 'main.js', sha256: sha('a'), size: 1 }] },
        { files: [{ path: 'renderer.js', sha256: sha('a'), size: 1 }] }, // no main.js to start
        { files: [{ path: 'main.js', sha256: sha('a'), size: 600 * 1024 * 1024 }] },
        { minBoot: 'x' }
    ];
    for (const b of bad) assert.throws(() => core.validManifest(manifest(b)), /MANIFEST/, JSON.stringify(b).slice(0, 80));
    assert.throws(() => core.validManifest(null), /MANIFEST/);
});

test('the server decides the version: newer is fetched, the same is left, older than installed is dropped', () => {
    const d = (installed, update, version, boot) => core.decide({ installed, update, manifest: manifest({ version, minBoot: boot || 1 }), bootApi: 1 }).action;
    assert.equal(d('0.5.0', null, '0.5.1'), 'download');
    assert.equal(d('0.5.0', '0.5.1', '0.5.1'), 'none');
    assert.equal(d('0.5.0', '0.5.1', '0.5.2'), 'download');
    assert.equal(d('0.5.0', null, '0.5.0'), 'none');
    // the server went back to what is installed (a bad update withdrawn): stop using the update
    assert.equal(d('0.5.0', '0.5.1', '0.5.0'), 'remove');
    assert.equal(d('0.5.0', '0.5.2', '0.5.1'), 'download', 'back one step, but still newer than installed');
    assert.equal(d('0.5.0', null, '0.4.0'), 'none');
    // an update that needs a newer installed program cannot be applied by files alone
    assert.equal(d('0.5.0', null, '0.6.0', 2), 'reinstall');
});

test('a folder is only run when every file is exactly what the manifest lists', (t) => {
    const dir = tmp(t);
    fs.mkdirSync(path.join(dir, 'clipboard'));
    fs.writeFileSync(path.join(dir, 'main.js'), 'a');
    fs.writeFileSync(path.join(dir, 'clipboard/local-host.js'), 'bb');
    assert.equal(core.verifyDir(dir, manifest()), true);
    fs.writeFileSync(path.join(dir, 'main.js'), 'b'); // same size, different content
    assert.equal(core.verifyDir(dir, manifest()), false);
    fs.writeFileSync(path.join(dir, 'main.js'), 'a');
    fs.rmSync(path.join(dir, 'clipboard/local-host.js'));
    assert.equal(core.verifyDir(dir, manifest()), false, 'a missing file');
    assert.equal(core.verifyDir(path.join(dir, 'nope'), manifest()), false);
});

test('choosing what to start: the update only when it is newer, complete and supported', (t) => {
    const root = tmp(t), cur = path.join(root, 'current');
    const installed = { dir: 'INSTALLED', version: '0.5.0' };
    assert.deepEqual(core.pick(installed, root, 1), { dir: 'INSTALLED', version: '0.5.0', update: null });
    fs.mkdirSync(path.join(cur, 'clipboard'), { recursive: true });
    fs.writeFileSync(path.join(cur, 'main.js'), 'a');
    fs.writeFileSync(path.join(cur, 'clipboard/local-host.js'), 'bb');
    fs.writeFileSync(path.join(cur, 'manifest.json'), JSON.stringify(manifest()));
    assert.deepEqual(core.pick(installed, root, 1), { dir: cur, version: '0.5.1', update: '0.5.1' });
    // a reinstall newer than the update wins
    assert.equal(core.pick({ dir: 'INSTALLED', version: '0.6.0' }, root, 1).dir, 'INSTALLED');
    // tampered or half-written
    fs.writeFileSync(path.join(cur, 'main.js'), 'x');
    assert.equal(core.pick(installed, root, 1).dir, 'INSTALLED');
    fs.writeFileSync(path.join(cur, 'main.js'), 'a');
    fs.writeFileSync(path.join(cur, 'manifest.json'), '{broken');
    assert.equal(core.pick(installed, root, 1).dir, 'INSTALLED');
    fs.writeFileSync(path.join(cur, 'manifest.json'), JSON.stringify(manifest({ minBoot: 2 })));
    assert.equal(core.pick(installed, root, 1).dir, 'INSTALLED', 'needs a newer installed program');
});

test('installing an update writes only verified files and swaps the folder in one step', async (t) => {
    const root = tmp(t);
    const content = { 'main.js': Buffer.from('a'), 'clipboard/local-host.js': Buffer.from('bb') };
    const asked = [];
    const fetchFile = async rel => { asked.push(rel); return content[rel]; };
    await core.install(root, manifest(), fetchFile);
    assert.deepEqual(asked, ['main.js', 'clipboard/local-host.js']);
    assert.equal(core.verifyDir(path.join(root, 'current'), manifest()), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'current/manifest.json'), 'utf8')).version, '0.5.1');

    // a download that does not match its hash leaves the working update untouched
    const next = manifest({ version: '0.5.2', files: [{ path: 'main.js', sha256: sha('NEW'), size: 3 }] });
    await assert.rejects(core.install(root, next, async () => Buffer.from('BAD')), /HASH_MISMATCH/);
    assert.equal(core.verifyDir(path.join(root, 'current'), manifest()), true);
    assert.deepEqual(fs.readdirSync(root).filter(n => n !== 'current'), [], 'nothing half-finished is left behind');

    core.remove(root);
    assert.equal(fs.existsSync(path.join(root, 'current')), false);
});

test('the program starts through the updater, which is never itself replaced', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    assert.equal(pkg.main, 'boot.js');
    const boot = fs.readFileSync(path.join(appDir, 'boot.js'), 'utf8');
    assert.match(boot, /require\('\.\/update-core'\)/, 'the installed checker, not one from the update');
    assert.match(boot, /require\('\.\/server\.json'\)/, 'the installed server address and certificate');
    assert.match(boot, /fingerprint256/, 'updates are fetched only from the server whose certificate is pinned');
    assert.match(boot, /core\.quarantine\(/, 'an update that fails to start is set aside');
    const publish = fs.readFileSync(path.join(appDir, 'publish-update.js'), 'utf8');
    assert.match(publish, /'boot\.js', 'update-core\.js'/, 'left out of what is published');
});

test('what is published is exactly what a program will accept', (t) => {
    const out = tmp(t);
    const { publish } = require('../desktop-app/publish-update');
    const m = publish(out);
    assert.equal(m.version, JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).version);
    core.validManifest(m);
    assert.equal(core.verifyDir(path.join(out, 'files'), m), true);
    const names = m.files.map(f => f.path);
    for (const need of ['main.js', 'renderer.js', 'index.html', 'style.css', 'session-health.js', 'server.json', 'package.json', 'preload.js', 'remote-preload.js', 'clipboard/local-host.js', 'clipboard/ClipboardHost.exe']) {
        assert.ok(names.includes(need), need + ' is published');
    }
    for (const no of ['boot.js', 'update-core.js', 'publish-update.js', 'build-installer.js', 'installer.json', 'package.js', 'package-lock.json']) assert.ok(!names.includes(no), no + ' is not published');
    assert.ok(!names.some(n => /^(node_modules|release|dist)\//.test(n)));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')), m);
});

test('the status bar says which version is running', () => {
    const main = fs.readFileSync(path.join(appDir, 'main.js'), 'utf8');
    assert.match(main, /handle\('scp:version',/);
    assert.match(main, /global\.scpApp/, 'the version boot.js chose, which may be newer than the installed one');
    assert.match(fs.readFileSync(path.join(appDir, 'preload.js'), 'utf8'), /version:\(\)=>ipcRenderer\.invoke\('scp:version'\)/);
    assert.match(fs.readFileSync(path.join(appDir, 'index.html'), 'utf8'), /id="statusVersion"/);
    const r = fs.readFileSync(path.join(appDir, 'renderer.js'), 'utf8');
    assert.match(r, /\$\('statusVersion'\)/);
    assert.match(r, /r\.result\.version/);
});
