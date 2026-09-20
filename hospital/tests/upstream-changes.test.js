'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// hospital/UPSTREAM-CHANGES.md lists every MeshCentral file this hospital has edited,
// so that a future upgrade is a checklist rather than an excavation. A list like that
// is worthless once it drifts, so this walks the source and fails when the two
// disagree. If this test fails, the fix is to update the document, not the list here.
const root = path.join(__dirname, '../..');
const MARKER = /(\/\/|\/\*|<!--)\s*SCP-Remote/;

// Files that belong to us. Editing these needs no entry: they carry no upstream code.
const ours = [
    /^hospital[\\/]/, /^scp-[^\\/]+\.js$/, /^public[\\/]scripts[\\/]scp-/, /^public[\\/]styles[\\/]scp-/,
    /^agents[\\/]modules_meshcore[\\/]scp-/, /^agents[\\/]modules_meshcore[\\/]win-scp-/,
    /^scripts[\\/]/, /^views[\\/]translations[\\/]/
];

// Upstream files known to carry edits, as recorded in the document. The view templates
// that only gained the one-line theme include are grouped there rather than listed
// individually; they are matched by the pattern below.
const recorded = new Set([
    'meshuser.js', 'webserver.js', 'meshagent.js', 'meshdesktopmultiplex.js', 'meshcentral.js',
    'meshrelay.js',
    path.join('agents', 'meshcore.js'),
    path.join('public', 'scripts', 'agent-redir-ws-0.1.1.js'),
    path.join('views', 'default.handlebars'),
    path.join('views', 'default3.handlebars'),
    path.join('views', 'default-mobile.handlebars'),
    path.join('views', 'login-mobile.handlebars')
]);
const themeIncludeOnly = /^views[\\/][^\\/]+\.handlebars$/;

function walk(dir, found) {
    for (const name of fs.readdirSync(dir)) {
        if (['node_modules', '.local', '.git', '.vscode'].includes(name)) { continue; }
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) { walk(full, found); continue; }
        if (!/\.(js|handlebars)$/.test(name)) { continue; }
        const relative = path.relative(root, full);
        if (ours.some(pattern => pattern.test(relative))) { continue; }
        const text = fs.readFileSync(full, 'utf8');
        if (text.split('\n').some(line => MARKER.test(line))) { found.push(relative); }
    }
    return found;
}

test('every edited MeshCentral file is written down for the next upgrade', () => {
    const edited = walk(root, []);
    const undocumented = edited.filter(file => !recorded.has(file) && !themeIncludeOnly.test(file));
    assert.deepEqual(undocumented, [],
        'these MeshCentral files carry SCP-Remote edits but are not in hospital/UPSTREAM-CHANGES.md: ' + undocumented.join(', '));
});

test('the files the document names still carry their markers', () => {
    const missing = [...recorded].filter(file => {
        const full = path.join(root, file);
        if (!fs.existsSync(full)) { return true; }
        return !fs.readFileSync(full, 'utf8').split('\n').some(line => MARKER.test(line));
    });
    assert.deepEqual(missing, [],
        'the document says these are edited, but no SCP-Remote marker is left in them: ' + missing.join(', '));
});

test('the document exists and explains how to rebuild the list', () => {
    const doc = fs.readFileSync(path.join(root, 'hospital', 'UPSTREAM-CHANGES.md'), 'utf8');
    assert.ok(doc.indexOf('SCP-Remote:') > 0, 'it must state the marker convention');
    assert.ok(doc.indexOf('grep') > 0, 'it must show how to regenerate the list from the source');
    assert.ok(doc.indexOf('viewonly.test.js') > 0, 'it must point at the test that guards the risky change');
});
