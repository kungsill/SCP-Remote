'use strict';
// Copies of the SCP-Remote program installed before 12 Nov 2026 cannot update themselves, and
// their own code pins every picture request to WEBP at quality 100 - the encoding that left
// remote text soft. The program shows the remote page from this server, so the server turns
// that one pinned request into lossless PNG for them. Nothing has to be reinstalled.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'public/scripts/scp-app-compat.js'), 'utf8');

function page(extra) {
    const sent = [];
    const w = Object.assign({
        CreateAgentRemoteDesktop: function () {
            return { SendCompressionLevel: function (type, level, scaling, frametimer) { sent.push([type, level, scaling, frametimer]); } };
        }
    }, extra || {});
    w.window = w;
    vm.createContext(w);
    vm.runInContext(source, w);
    return { w, sent };
}
// what the old program does after the page has loaded: pin every request to WEBP 100
function oldProgramPins(w) {
    const original = w.CreateAgentRemoteDesktop;
    w.CreateAgentRemoteDesktop = function () {
        const m = original.apply(this, arguments);
        const orig = m.SendCompressionLevel;
        m.SendCompressionLevel = function () { return orig.call(m, 4, 100, 1024, 50); };
        return m;
    };
}

test('an old installed program gets lossless PNG where it asked for its pinned WEBP', () => {
    const { w, sent } = page({ scpClipboard: {}, scpSessionAPI: {} });
    oldProgramPins(w);
    const m = w.CreateAgentRemoteDesktop();
    m.SendCompressionLevel(4, 70, 1024, 100); // whatever is asked, the old program sends its pin
    assert.deepEqual(sent, [[2, 100, 1024, 50]]);
});

test('a program new enough to have a working quality chooser is left alone', () => {
    const { w, sent } = page({ scpClipboard: {}, scpSessionAPI: {} });
    w.scpAppQualityChooser = true; // set by the new main.js after the page loads
    const m = w.CreateAgentRemoteDesktop();
    m.SendCompressionLevel(4, 100, 1024, 50); // the technician chose "Sharp" (WEBP)
    m.SendCompressionLevel(2, 100, 1024, 50);
    m.SendCompressionLevel(4, 45, 1024, 200);
    assert.deepEqual(sent, [[4, 100, 1024, 50], [2, 100, 1024, 50], [4, 45, 1024, 200]]);
});

test('an ordinary browser on the sharing page is left alone', () => {
    const { w, sent } = page();
    const m = w.CreateAgentRemoteDesktop();
    m.SendCompressionLevel(4, 100, 1024, 50);
    assert.deepEqual(sent, [[4, 100, 1024, 50]]);
});

test('only the pinned request is changed, not lower qualities or smaller pictures', () => {
    const { w, sent } = page({ scpClipboard: {} });
    const m = w.CreateAgentRemoteDesktop();
    m.SendCompressionLevel(4, 70, 1024, 100);
    m.SendCompressionLevel(4, 100, 512, 50);
    m.SendCompressionLevel(1, 100, 1024, 50);
    assert.deepEqual(sent, [[4, 70, 1024, 100], [4, 100, 512, 50], [1, 100, 1024, 50]]);
});

test('the sharing page loads it after the desktop module it wraps, and the new program announces itself', () => {
    const sharing = fs.readFileSync(path.join(root, 'views/sharing.handlebars'), 'utf8');
    const a = sharing.indexOf('scripts/agent-desktop-0.0.2'), b = sharing.indexOf('scripts/scp-app-compat.js');
    assert.ok(a > 0 && b > a, 'scp-app-compat.js comes after agent-desktop');
    const main = fs.readFileSync(path.join(root, 'hospital/desktop-app/main.js'), 'utf8');
    assert.match(main, /window\.scpAppQualityChooser=true;/);
});
