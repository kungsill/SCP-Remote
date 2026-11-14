'use strict';
/* The decisions behind the program updating itself, kept free of Electron so they can be tested.
 *
 * An update is the program's own files (pages and scripts), listed in a manifest with the
 * SHA-256 of each. It is kept in <userData>/app-update/current, beside the installed copy,
 * which is never overwritten. boot.js runs that folder instead of the installed files only
 * when it is newer than what is installed and every file matches the manifest.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const MAX_FILES = 300, MAX_TOTAL = 200 * 1024 * 1024;

function parts(v) {
    if (typeof v !== 'string' || !/^\d+(\.\d+){1,3}$/.test(v)) throw Error('BAD_VERSION');
    return v.split('.').map(Number);
}
function compareVersions(a, b) {
    const x = parts(a), y = parts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
    return 0;
}

// Forward slashes only, no drive, no "..": every path stays inside the folder it is joined to.
function safeRel(p) { return typeof p === 'string' && p.length <= 200 && /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(p) && !p.split('/').some(s => s === '..' || s === '.'); }

function validManifest(m) {
    const fail = why => { throw Error('MANIFEST_' + why); };
    if (!m || typeof m !== 'object' || Array.isArray(m)) fail('MISSING');
    try { parts(m.version); } catch (e) { fail('VERSION'); }
    if (!Number.isInteger(m.minBoot) || m.minBoot < 1 || m.minBoot > 1000) fail('MINBOOT');
    if (!Array.isArray(m.files) || !m.files.length || m.files.length > MAX_FILES) fail('FILES');
    const seen = new Set(); let total = 0;
    for (const f of m.files) {
        if (!f || !safeRel(f.path) || seen.has(f.path.toLowerCase())) fail('PATH');
        if (typeof f.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(f.sha256)) fail('HASH');
        if (!Number.isInteger(f.size) || f.size < 0) fail('SIZE');
        seen.add(f.path.toLowerCase()); total += f.size;
    }
    if (total > MAX_TOTAL) fail('TOO_LARGE');
    if (!seen.has('main.js')) fail('NO_MAIN');
    return m;
}

// installed: the installed version. update: the version in the update folder, or null.
// The server's manifest names the version every program should be running.
function decide({ installed, update, manifest, bootApi }) {
    const want = manifest.version, running = update || installed;
    if (compareVersions(want, installed) <= 0) return { action: update ? 'remove' : 'none' };
    if (manifest.minBoot > bootApi) return { action: 'reinstall' };
    if (compareVersions(want, running) === 0) return { action: 'none' };
    return { action: 'download' };
}

function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function verifyDir(dir, manifest) {
    try {
        for (const f of manifest.files) {
            const file = path.join(dir, ...f.path.split('/'));
            const stat = fs.statSync(file);
            if (!stat.isFile() || stat.size !== f.size || hashFile(file) !== f.sha256) return false;
        }
        return true;
    } catch (e) { return false; }
}

function readUpdate(root) {
    const cur = path.join(root, 'current');
    try { return { dir: cur, manifest: validManifest(JSON.parse(fs.readFileSync(path.join(cur, 'manifest.json'), 'utf8'))) }; } catch (e) { return null; }
}

// Which folder to start: the update when it is newer, supported and intact; otherwise the installed files.
function pick(installed, root, bootApi) {
    const fallback = { dir: installed.dir, version: installed.version, update: null };
    const u = readUpdate(root);
    if (!u) return fallback;
    try {
        if (compareVersions(u.manifest.version, installed.version) <= 0) return fallback;
        if (u.manifest.minBoot > bootApi) return fallback;
    } catch (e) { return fallback; }
    if (!verifyDir(u.dir, u.manifest)) return fallback;
    return { dir: u.dir, version: u.manifest.version, update: u.manifest.version };
}

function rm(target) { try { fs.rmSync(target, { recursive: true, force: true }); } catch (e) { /* in use: tried again next time */ } }

// Download into a staging folder, check every file, then swap it in with one rename.
async function install(root, manifest, fetchFile) {
    validManifest(manifest);
    fs.mkdirSync(root, { recursive: true });
    const staging = path.join(root, 'staging-' + crypto.randomBytes(6).toString('hex'));
    try {
        for (const f of manifest.files) {
            const data = await fetchFile(f.path);
            if (!Buffer.isBuffer(data) || data.length !== f.size || crypto.createHash('sha256').update(data).digest('hex') !== f.sha256) throw Error('HASH_MISMATCH ' + f.path);
            const file = path.join(staging, ...f.path.split('/'));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, data);
        }
        fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest));
        if (!verifyDir(staging, manifest)) throw Error('HASH_MISMATCH after write');
        const cur = path.join(root, 'current'), old = path.join(root, 'old-' + crypto.randomBytes(6).toString('hex'));
        const had = fs.existsSync(cur);
        if (had) fs.renameSync(cur, old);
        try { fs.renameSync(staging, cur); } catch (e) { if (had) fs.renameSync(old, cur); throw e; }
        if (had) rm(old);
    } catch (e) { rm(staging); throw e; }
}

function remove(root) { rm(path.join(root, 'current')); }

// An update that would not start is moved aside so the next start uses the installed files.
function quarantine(root) {
    const cur = path.join(root, 'current');
    try { rm(path.join(root, 'failed')); fs.renameSync(cur, path.join(root, 'failed')); } catch (e) { rm(cur); }
}

module.exports = { compareVersions, validManifest, decide, verifyDir, hashFile, pick, readUpdate, install, remove, quarantine, safeRel };
