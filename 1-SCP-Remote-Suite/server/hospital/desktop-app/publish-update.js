'use strict';
/* Publishes the program's current files to the hospital server so installed copies update
 * themselves (see boot.js). Run from hospital/desktop-app:
 *
 *     npm run publish-update
 *
 * It writes public/app-update/manifest.json and public/app-update/files/. The web server
 * already serves public/, so nothing has to be restarted. Raise "version" in package.json
 * first: programs only take a version newer than the one they have. To withdraw a bad update,
 * set the version back to the one that is installed and publish again.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const BOOT_API = 1; // raise only when an update needs a newer boot.js / update-core.js / Electron
const appDir = __dirname;
// Never published: the updater itself, build tooling, and anything that is not the program.
const SKIP_FILES = new Set(['boot.js', 'update-core.js', 'publish-update.js', 'build-installer.js', 'installer.json', 'package.js', 'package-lock.json']);
const SKIP_DIRS = new Set(['node_modules', 'release', 'dist', 'tests', '.git']);
const KEEP = /\.(js|json|html|css|ico|ttf|txt|exe)$/i;
const SKIP_IN_TREE = /(ClipboardHostTests\.cs|test-agent-host\.js|build\.js)$/;

function list(dir, prefix) {
    const out = [];
    for (const name of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, name), rel = prefix ? prefix + '/' + name : name;
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { if (!SKIP_DIRS.has(name) && !name.startsWith('_')) out.push(...list(full, rel)); continue; }
        if (!prefix && SKIP_FILES.has(name)) continue;
        if (!KEEP.test(name) || SKIP_IN_TREE.test(name)) continue;
        out.push(rel);
    }
    return out;
}

function publish(outDir) {
    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    // The program runs the same session script as the website; take the current one.
    const web = path.resolve(appDir, '../../public/scripts/scp-session.js');
    if (fs.existsSync(web)) fs.copyFileSync(web, path.join(appDir, 'session-health.js'));
    const filesDir = path.join(outDir, 'files');
    fs.rmSync(filesDir, { recursive: true, force: true });
    const files = [];
    for (const rel of list(appDir, '')) {
        let data = fs.readFileSync(path.join(appDir, ...rel.split('/')));
        // A published package.json carries only what the program reads, as the installer's does.
        if (rel === 'package.json') data = Buffer.from(JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, main: pkg.main }, null, 2));
        const target = path.join(filesDir, ...rel.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, data);
        files.push({ path: rel, sha256: crypto.createHash('sha256').update(data).digest('hex'), size: data.length });
    }
    const manifest = { version: pkg.version, minBoot: BOOT_API, published: new Date().toISOString(), files };
    require('./update-core').validManifest(manifest);
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
    return manifest;
}

module.exports = { publish };

if (require.main === module) {
    const out = path.resolve(appDir, '../../public/app-update');
    const m = publish(out);
    console.log('Published SCP-Remote ' + m.version + ': ' + m.files.length + ' files, ' + Math.round(m.files.reduce((n, f) => n + f.size, 0) / 1024) + ' KB -> ' + out);
}
