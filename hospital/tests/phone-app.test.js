'use strict';
// The phone app ("Add to home screen" / install): the hospital's name, logo and colour, opening
// on the Remote page, instead of MeshCentral's icon and a white full-screen page.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/scp-app.json'), 'utf8'));
const size = f => { const b = fs.readFileSync(path.join(root, 'public', f)); assert.equal(b.toString('latin1', 1, 4), 'PNG', f + ' is a PNG'); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };

test('the app is named for the hospital, in its colours, and opens on the Remote page', () => {
    assert.equal(manifest.short_name, 'SCP-Remote');
    assert.match(manifest.name, /โรงพยาบาลสีชมพู/);
    assert.equal(manifest.display, 'standalone', 'with the phone\'s own status bar, not full screen');
    assert.equal(manifest.theme_color, '#b02a72');
    assert.equal(manifest.start_url, '/?m=0&scppage=remote');
});

test('every icon exists at the size it claims, with maskable ones for Android', () => {
    for (const icon of manifest.icons) assert.equal(size(icon.src), icon.sizes, icon.src);
    assert.ok(manifest.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512'));
    assert.ok(manifest.icons.some(i => i.purpose === 'any' && i.sizes === '192x192'));
    assert.equal(size('images/app/apple-touch-icon.png'), '180x180');
});

test('every page that offers installing points at it, not at MeshCentral\'s', () => {
    for (const v of ['default', 'default-mobile', 'default3', 'login-mobile', 'login', 'login2', 'sharing-mobile']) {
        const page = fs.readFileSync(path.join(root, 'views', v + '.handlebars'), 'utf8');
        assert.match(page, /<link rel="manifest" href="\{\{\{domainurl\}\}\}scp-app\.json">/, v);
        assert.match(page, /images\/app\/apple-touch-icon\.png/, v);
        assert.doesNotMatch(page, /favicon-303x303|favicon\.ico/, v);
    }
});
