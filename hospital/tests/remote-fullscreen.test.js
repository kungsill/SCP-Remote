'use strict';
// The remote screen uses the whole window. The site's left menu and header are hidden while a
// screen is showing, and the grid columns and rows that held them must go with them, or the
// picture sits beside an empty strip. The tools panel on the left starts folded away so the
// picture gets that width too, with a small button to bring it back.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const css = fs.readFileSync(path.join(root, 'public/styles/scp-remote.css'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/scripts/scp-remote-ui.js'), 'utf8');

test('the hidden left menu and header give their space back to the picture', () => {
    const m = /body\.scp-app-view #container\{[^}]*\}/g;
    const rules = css.match(m).join(' ');
    assert.match(rules, /grid-template-columns:0 minmax\(0,1fr\)!important/, 'no empty column where the menu was');
    assert.match(rules, /grid-template-rows:0 0 minmax\(0,1fr\) 0!important/, 'no empty rows where the header, tabs and footer were');
});

test('the tools panel folds away and the picture takes its width', () => {
    assert.match(css, /body\.scp-inline-tools\.scp-side-collapsed #deskarea0\{padding-left:0/);
    assert.match(css, /body\.scp-inline-tools\.scp-side-collapsed #deskarea0>#deskarea1\{display:none!important\}/);
});

test('it starts folded, and the choice is remembered', () => {
    assert.match(ui, /function sideWanted\(\)\{try\{return root\.localStorage\.getItem\('scpRemoteSide'\)==='open';\}catch\(e\)\{return false;\}\}/, 'folded unless this technician opened it');
    assert.match(ui, /root\.localStorage\.setItem\('scpRemoteSide',open\?'open':'closed'\)/);
});

test('it is only folded while the screen is connected', () => {
    // Connect, the reason a session failed and Retry all live in that panel. Folding it while
    // nothing is connected would leave a black page with no way to start.
    assert.match(ui, /const connected=!!\(root\.desktop&&root\.desktop\.State===3\);\s*const fold=!sideOpen&&connected;/);
    assert.match(ui, /document\.body\.classList\.toggle\('scp-side-collapsed',fold\)/);
});

test('one button opens and closes it, and says which it will do', () => {
    assert.match(ui, /sideBtn\.id='scp-side-toggle'/);
    assert.match(ui, /aria-expanded/);
    assert.match(css, /#scp-side-toggle\{/);
});

test('the control bar sits in the top strip, not over the remote screen', () => {
    // Floating over the picture it covered the remote program's own toolbar. On a window wide
    // enough it is moved up into the strip that already holds the back arrow and the name.
    const m = /@media\(min-width:1280px\)\{[^@]*#vncFloatingToolbar[^@]*\}\}/.exec(css);
    assert.ok(m, 'the rule is limited to wide windows, where there is room beside the name');
    assert.match(m[0], /body\.scp-app-view #vncFloatingToolbar\{position:fixed;top:7px/);
    assert.match(m[0], /body\.scp-app-view #vncFloatingToolbar\.unpinned\{top:7px;opacity:1\}/, 'it does not slide away up there');
    assert.match(m[0], /body\.scp-app-view #vncFloatingToolbarTrigger\{display:none\}/);
});

test('the control bar has no Full Screen button', () => {
    // Removed at the administrator's request on 12 Nov 2026: the remote screen already fills
    // the window.
    const page = fs.readFileSync(path.join(root, 'views/default.handlebars'), 'utf8');
    const a = page.indexOf('<div id="vncFloatingToolbar">'), b = page.indexOf('<div id="p11bigok"', a);
    assert.ok(a > 0 && b > a);
    const bar = page.slice(a, b);
    assert.doesNotMatch(bar, /Full Screen|deskToggleFull/);
    for (const still of ['deskSendCADDirect()', 'toggleAspectRatio(1)', 'showDeskClip()', 'vncRebootDevice()', 'connectDesktop(event, 0)']) {
        assert.ok(bar.includes(still), still + ' is still on the bar');
    }
});

test('folding the panel never talks to the remote computer', () => {
    const part = ui.slice(ui.indexOf('function sideWanted()'), ui.indexOf('function ensure()'));
    assert.ok(part.length > 300);
    assert.doesNotMatch(part, /\.send\(|SendMouseMsg|SendKey|connectDesktop/);
});

test('the back arrow returns to the page that opened the screen, and ends the session', () => {
    const back = ui.slice(ui.indexOf('back.onclick=function(){'), ui.indexOf("back.setAttribute('aria-label'"));
    assert.match(back, /if\(root\.ScpDashboard&&root\.ScpDashboard\.returnFromRemote\)\{/, 'whichever way the screen was opened');
    // nobody is watching once the list is showing, so the session must not stay open
    assert.match(back, /root\.connectDesktop\(null,0\)/);
    assert.match(back, /root\.ScpDashboard\.returnFromRemote\(\);return;/);
});

test('Disconnect on the control bar also returns to that page', () => {
    const page = fs.readFileSync(path.join(root, 'views/default.handlebars'), 'utf8');
    assert.ok(page.includes('class="vnc-tb-btn disconnect" onclick="connectDesktop(event, 0); if (window.ScpDashboard && window.ScpDashboard.returnFromRemote) { window.ScpDashboard.returnFromRemote(); }"'));
});
