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
