'use strict';
/* Publishes the signed Android app so installed copies offer the update. Run from the repository
 * root after building the release (see README.md):
 *
 *     node hospital/android-app/publish-apk.js
 *
 * It copies app/build/outputs/apk/release/app-release.apk to
 * public/app-update/android/scp-remote-<versionName>.apk and writes android.json beside it. The
 * web server already serves public/, so nothing has to be restarted. Raise versionCode and
 * versionName in app/build.gradle.kts first: the app only takes a higher versionCode. Older APKs
 * are left in place.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function readVersion(gradleText) {
    const code = /versionCode\s*=\s*(\d+)/.exec(gradleText), name = /versionName\s*=\s*"([^"]+)"/.exec(gradleText);
    if (!code || !name) throw Error('VERSION_NOT_FOUND');
    return { versionCode: Number(code[1]), versionName: name[1] };
}

function publish(outDir, apkPath, version) {
    const { versionCode, versionName } = version;
    if (!Number.isInteger(versionCode) || versionCode < 1 || !/^\d+(\.\d+){1,3}$/.test(String(versionName))) throw Error('BAD_VERSION');
    const data = fs.readFileSync(apkPath);
    const apk = 'scp-remote-' + versionName + '.apk';
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, apk), data);
    const manifest = { versionCode, versionName, apk, sha256: crypto.createHash('sha256').update(data).digest('hex'), size: data.length };
    // Written last, so an app never sees a manifest for an APK that is not there yet.
    const tmp = path.join(outDir, 'android.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify(manifest, null, 1));
    fs.renameSync(tmp, path.join(outDir, 'android.json'));
    return manifest;
}

module.exports = { publish, readVersion };

if (require.main === module) {
    const here = __dirname;
    const version = readVersion(fs.readFileSync(path.join(here, 'app', 'build.gradle.kts'), 'utf8'));
    const apk = path.join(here, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    if (!fs.existsSync(apk)) { console.error('No release APK. Build it first: gw.ps1 :app:assembleRelease'); process.exit(1); }
    const out = path.resolve(here, '..', '..', 'public', 'app-update', 'android');
    const m = publish(out, apk, version);
    console.log('Published ' + m.apk + ' (' + m.versionName + ', code ' + m.versionCode + ', ' + m.size + ' bytes) to ' + out);
}
