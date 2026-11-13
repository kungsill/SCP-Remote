'use strict';
// Publishing the Android app: the APK and android.json go to public/app-update/android/, and the
// app only installs a file whose size and SHA-256 match what android.json says.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { publish, readVersion } = require('../android-app/publish-apk');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scp-apk-'));

test('publish writes the APK under its version name and a manifest whose hash matches it', () => {
    const dir = temp(), out = path.join(dir, 'android');
    const apk = path.join(dir, 'app-release.apk');
    fs.writeFileSync(apk, Buffer.from('PK fake apk bytes'));
    const m = publish(out, apk, { versionCode: 5, versionName: '1.0.4' });
    assert.equal(m.apk, 'scp-remote-1.0.4.apk');
    assert.match(m.apk, /^scp-remote-\d+\.\d+\.\d+\.apk$/);
    const published = fs.readFileSync(path.join(out, m.apk));
    assert.equal(m.sha256, crypto.createHash('sha256').update(published).digest('hex'));
    assert.equal(m.size, published.length);
    assert.equal(m.versionCode, 5);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'android.json'), 'utf8')), m);
});

test('older APKs are kept (the administrator keeps old builds)', () => {
    const dir = temp(), out = path.join(dir, 'android');
    const apk = path.join(dir, 'a.apk');
    fs.writeFileSync(apk, 'one'); publish(out, apk, { versionCode: 1, versionName: '1.0.0' });
    fs.writeFileSync(apk, 'two'); publish(out, apk, { versionCode: 2, versionName: '1.0.1' });
    assert.ok(fs.existsSync(path.join(out, 'scp-remote-1.0.0.apk')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'android.json'), 'utf8')).versionCode, 2);
});

test('refuses a version that is not a plain number and dotted name', () => {
    const dir = temp(), apk = path.join(dir, 'a.apk');
    fs.writeFileSync(apk, 'x');
    assert.throws(() => publish(path.join(dir, 'o'), apk, { versionCode: 0, versionName: '1.0.0' }), /VERSION/);
    assert.throws(() => publish(path.join(dir, 'o'), apk, { versionCode: 3, versionName: '../1' }), /VERSION/);
});

test('reads versionCode and versionName from app/build.gradle.kts', () => {
    assert.deepEqual(readVersion('defaultConfig {\n  versionCode = 7\n  versionName = "1.2.3"\n}'), { versionCode: 7, versionName: '1.2.3' });
    const real = readVersion(fs.readFileSync(path.join(__dirname, '../android-app/app/build.gradle.kts'), 'utf8'));
    assert.ok(real.versionCode >= 1);
});
