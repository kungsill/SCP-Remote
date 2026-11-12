'use strict';
/* SCP-Remote starts here. This file decides which copy of the program to run and keeps it up to
 * date; the program itself is main.js.
 *
 * The hospital server publishes the program's files with a manifest (public/app-update/, made
 * by `npm run publish-update`). On start, and every few hours, this asks the server which
 * version should be running. A newer one is downloaded into the user's data folder, every file
 * is checked against the SHA-256 in the manifest, and it is used from the next start. The
 * installed files are never changed, so an update that fails to start is set aside and the
 * installed program runs instead.
 *
 * Updates are fetched only from the server named in the installed server.json, and only when
 * its certificate is the one pinned there: the same trust the program already places in that
 * server for every remote session.
 *
 * This file and update-core.js are never part of an update. Changing them, or Electron itself,
 * needs a new installer; the manifest's minBoot says when that is the case.
 */
const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), https = require('https'), crypto = require('crypto');
const core = require('./update-core');
const config = require('./server.json');

const BOOT_API = 1;
const installed = { dir: __dirname, version: require('./package.json').version };
const root = path.join(app.getPath('userData'), 'app-update');
const origin = new URL(config.url).origin, pin = String(config.certificateSha256 || '').replace(/:/g, '').toUpperCase();
const thai = !/^en/i.test(app.getLocale() || '');
const t = (th, en) => thai ? th : en;

let chosen = core.pick(installed, root, BOOT_API);
global.scpApp = { version: chosen.version, installedVersion: installed.version, updated: chosen.update != null };

function log(line) { try { fs.mkdirSync(root, { recursive: true }); fs.appendFileSync(path.join(root, 'update.log'), new Date().toISOString() + ' ' + line + '\n'); } catch (e) { /* logging is best effort */ } }
function failedVersion() { try { return JSON.parse(fs.readFileSync(path.join(root, 'failed', 'manifest.json'), 'utf8')).version; } catch (e) { return null; } }

try {
    require(path.join(chosen.dir, 'main.js'));
} catch (error) {
    if (chosen.update == null) throw error;
    // The update would not start: set it aside and run what was installed.
    log('update ' + chosen.update + ' failed to start: ' + (error && error.message));
    core.quarantine(root);
    chosen = { dir: installed.dir, version: installed.version, update: null };
    global.scpApp = { version: installed.version, installedVersion: installed.version, updated: false };
    require(path.join(installed.dir, 'main.js'));
}

// GET from the hospital server, refusing any certificate but the pinned one.
function fetchPinned(pathname, limit) {
    return new Promise((resolve, reject) => {
        const req = https.request(origin + pathname, { method: 'GET', agent: false, rejectUnauthorized: false, headers: { 'Cache-Control': 'no-cache' } }, res => {
            if (res.statusCode !== 200) { res.resume(); reject(Error('HTTP_' + res.statusCode)); return; }
            const chunks = []; let size = 0;
            res.on('data', c => { size += c.length; if (size > limit) { req.destroy(Error('RESPONSE_TOO_LARGE')); return; } chunks.push(c); });
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('socket', socket => socket.once('secureConnect', () => {
            const cert = socket.getPeerCertificate();
            let ok = false;
            try { ok = !!cert.raw && new crypto.X509Certificate(cert.raw).fingerprint256.replace(/:/g, '') === pin; } catch (e) { ok = false; }
            if (!ok) { req.destroy(Error('SERVER_CERTIFICATE_CHANGED')); return; }
            req.end();
        }));
        req.setTimeout(60000, () => req.destroy(Error('SERVER_TIMEOUT')));
        req.on('error', reject);
    });
}

let checking = false, offered = null;
async function check() {
    if (checking) return;
    checking = true;
    try {
        const manifest = core.validManifest(JSON.parse((await fetchPinned('/app-update/manifest.json', 1024 * 1024)).toString('utf8')));
        const current = core.readUpdate(root);
        const update = current && core.verifyDir(current.dir, current.manifest) ? current.manifest.version : null;
        const { action } = core.decide({ installed: installed.version, update, manifest, bootApi: BOOT_API });
        if (action === 'none') return;
        if (action === 'reinstall') { log('version ' + manifest.version + ' needs a new installer'); return; }
        if (action === 'remove') { core.remove(root); log('update withdrawn by the server; back to installed ' + installed.version); offer(installed.version); return; }
        if (manifest.version === failedVersion()) return; // it did not start last time; wait for a different version
        const sizes = new Map(manifest.files.map(f => [f.path, f.size]));
        await core.install(root, manifest, rel => fetchPinned('/app-update/files/' + rel, sizes.get(rel) + 1024));
        log('downloaded ' + manifest.version);
        offer(manifest.version);
    } catch (error) {
        log('check failed: ' + (error && error.message));
    } finally { checking = false; }
}

// A new version is used from the next start. Offer to restart now, but never while a remote
// screen is open: that would cut the session off.
function offer(version) {
    if (offered === version || version === chosen.version) return;
    offered = version;
    const wait = setInterval(async () => {
        const windows = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed());
        if (windows.length !== 1) return; // a remote window is open, or nothing is showing
        clearInterval(wait);
        const answer = await dialog.showMessageBox(windows[0], {
            type: 'info', title: 'SCP-Remote', noLink: true, defaultId: 0, cancelId: 1,
            message: t('มี SCP-Remote รุ่นใหม่ ' + version, 'SCP-Remote ' + version + ' is ready'),
            detail: t('ดาวน์โหลดและตรวจสอบแล้ว จะใช้เมื่อเปิดโปรแกรมครั้งถัดไป ต้องการเริ่มโปรแกรมใหม่เดี๋ยวนี้หรือไม่', 'It has been downloaded and checked, and will be used the next time the program starts. Restart now?'),
            buttons: [t('เริ่มใหม่เดี๋ยวนี้', 'Restart now'), t('ภายหลัง', 'Later')]
        }).catch(() => ({ response: 1 }));
        if (answer.response === 0) { app.relaunch(); app.exit(0); }
    }, 2000);
}

app.whenReady().then(() => {
    setTimeout(check, 4000);
    setInterval(check, 4 * 60 * 60 * 1000);
});
