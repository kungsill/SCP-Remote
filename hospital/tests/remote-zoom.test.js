'use strict';
// Pinch-to-zoom on the remote screen (phones). It only changes how large this phone draws the
// picture: nothing is sent to the remote computer, whose screen and resolution stay as they
// are for whoever is sitting at it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const ui = fs.readFileSync(path.join(root, 'public/scripts/scp-remote-ui.js'), 'utf8');
const zoomPart = ui.slice(ui.indexOf('let zoom=1'), ui.indexOf('root.ScpRemoteUI='));

test('zooming never talks to the remote computer', () => {
    assert.ok(zoomPart.length > 500, 'the zoom code is where it is expected');
    assert.doesNotMatch(zoomPart, /\.send\(|SendMouseMsg|SendKey|SendTouch|setResolution|ScreenWidth\s*=/);
});

test('zoom is clamped between the whole screen and four times', () => {
    assert.match(zoomPart, /zoom=Math\.max\(1,Math\.min\(4,z\)\)/);
});

test('two-finger touches are kept from the browser so the page itself does not zoom', () => {
    assert.match(zoomPart, /addEventListener\('touchmove',[\s\S]*?\{passive:false,capture:true\}\)/);
    assert.match(zoomPart, /e\.touches\.length!==2/);
});

test('the page re-fitting the picture keeps the zoom', () => {
    assert.match(zoomPart, /root\.deskAdjust=function\(\)\{[\s\S]*?if\(zoom>1&&root\.deskAspectRatio!==1\)zoomTo\(zoom\)/);
});

test('a phone starts on a lighter picture, sized by the device itself; a computer is unchanged', () => {
    const { defaultQuality } = require('../../public/scripts/scp-session');
    assert.equal(defaultQuality({ coarse: false, shortSide: 1080 }), '0', 'a computer: Sharpest');
    assert.equal(defaultQuality({ coarse: true, shortSide: 393 }), '2', 'a phone: Balanced');
    assert.equal(defaultQuality({ coarse: true, shortSide: 820 }), '2', 'a small tablet too');
    assert.equal(defaultQuality({ coarse: true, shortSide: 1024 }), '0', 'a large tablet is treated as a computer');
    assert.equal(defaultQuality({ coarse: false, shortSide: 1080, saveData: true }), '3', 'data saver on: Low bandwidth');
    assert.equal(defaultQuality({ coarse: true, shortSide: 393, effectiveType: '3g' }), '3');
    assert.equal(defaultQuality({}), '0');
    const src = fs.readFileSync(path.join(root, 'public/scripts/scp-session.js'), 'utf8');
    assert.match(src, /return defaultQuality\(device\(\)\);\}/, 'only where nobody has chosen; a choice made is still remembered');
});

test('one press makes the picture readable, enlarged by what this screen needs', () => {
    assert.match(ui, /function readableZoom\(\)\{[^}]*return Math\.max\(1,Math\.min\(4,desk\.width\/r\.width\)\);\}/);
    assert.match(ui, /readBtn\.textContent=th\?'ขยายให้อ่านได้'/);
    assert.match(ui, /const want=connected&&zoom===1&&readableZoom\(\)>1\.15;/, 'only offered when the picture is noticeably shrunk');
    const part = ui.slice(ui.indexOf('readBtn.onclick='), ui.indexOf('bar.append(back'));
    assert.doesNotMatch(part, /\.send\(|SendMouseMsg|SendKey|setResolution/, 'the remote computer\'s own screen is left as it is');
});
