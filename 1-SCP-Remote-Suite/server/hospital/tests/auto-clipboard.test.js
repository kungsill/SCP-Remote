'use strict';
// Copy on one computer, paste on the other, without pressing a send/receive button: the
// clipboard follows a remote-control session by itself. That reads what the person at the
// remote computer copied, so it is tied to a session that controls the computer and whose
// picture has arrived (they were asked and said yes). Looking at a screen without asking
// (the live tiles, a view-only session) must never touch that computer's clipboard.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '../../views/default.handlebars'), 'utf8');

function clipboardAllowed() {
    const m = /function scpClipboardAllowed\(d\) \{[\s\S]*?\n        \}/.exec(page);
    assert.ok(m, 'scpClipboardAllowed should still be in default.handlebars');
    return m[0];
}
function run(d, env) {
    const ctx = Object.assign({ currentNode: { _id: 'node//a' }, features2: 0, GetNodeRights: () => 0xFFFFFFFF }, env || {});
    vm.createContext(ctx);
    vm.runInContext(clipboardAllowed(), ctx);
    return vm.runInContext('scpClipboardAllowed(d)', Object.assign(ctx, { d }));
}
const live = () => ({ State: 3, contype: 1, m: { scpStats: { tiles: 5, bytes: 9000 } } });

test('automatic clipboard is on unless the technician turned it off', () => {
    const m = /var desktopsettings = \{([^}]*)\}/.exec(page);
    assert.ok(m);
    assert.match(m[1], /autoclipboard:\s*true/);
});

test('a browser with older saved settings is switched on once, and a later choice is kept', () => {
    const m = /[^\n]*scpAutoClipboard1[^\n]*/.exec(page);
    assert.ok(m, 'the one-time switch should be keyed scpAutoClipboard1');
    assert.match(m[0], /getItem\('scpAutoClipboard1'\)\s*==\s*null/, 'only when it has not run before');
    assert.match(m[0], /desktopsettings\.autoclipboard\s*=\s*true/);
    assert.match(m[0], /setItem\('scpAutoClipboard1'/);
});

test('the clipboard follows a session that controls the computer and has its picture', () => {
    assert.equal(run(live()), true);
});

test('never before the picture arrives: the person there has not allowed anything yet', () => {
    const d = live(); d.m.scpStats.tiles = 0;
    assert.equal(run(d), false);
    const connecting = live(); connecting.State = 2;
    assert.equal(run(connecting), false);
});

test('never on a view-only look at a screen', () => {
    const d = live(); d.viewonly = true;
    assert.equal(run(d), false);
});

test('never for an account that may only watch, or where remote input is switched off', () => {
    assert.equal(run(live(), { GetNodeRights: () => 8 | 256 }), false, 'remote view only');
    assert.equal(run(live(), { GetNodeRights: () => 1 }), false, 'no remote control right');
    assert.equal(run(live(), { GetNodeRights: () => 8 }), true, 'remote control right');
    assert.equal(run(live(), { features2: 0x2000 }), false, 'input disabled for the site');
    assert.equal(run(null), false);
    assert.equal(run(live(), { currentNode: null }), false);
});

test('the every-second clipboard exchange asks that question first', () => {
    const at = page.indexOf('// Auto-clipboard');
    assert.ok(at > 0);
    const block = page.slice(at, at + 700);
    assert.match(block, /if \(autoClipEnabled && scpClipboardAllowed\(desktop\) && \(navigator\.clipboard != null\)\)/);
});
