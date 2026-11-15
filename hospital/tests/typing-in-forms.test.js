'use strict';
// On the device list (where the dashboard is drawn) MeshCentral sends every key to its device
// search box. The exception for typing was made only for native <dialog> windows, so SCP's own
// windows (e.g. the asset & budget form, a div overlay) could not be typed into at all.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const TEMPLATES = ['views/default.handlebars', 'views/translations/default_th.handlebars'];

function load(file) {
    const src = fs.readFileSync(file, 'utf8');
    const start = src.indexOf('function scpTypingTarget');
    assert.ok(start > 0, file + ': scpTypingTarget is missing');
    const end = src.indexOf('function ondockeypress');
    const dom = new JSDOM('<body><div class="scp-asset-dialog-overlay"><input id="a" type="text"><input id="n" type="number"><textarea id="t"></textarea><select id="s"></select><input id="c" type="checkbox"><button id="b">x</button><div id="e" contenteditable="true"></div></div><input id="SearchInput"><div id="plain"></div></body>', { runScripts: 'outside-only' });
    dom.window.eval(src.slice(start, end));
    return dom;
}

for (const file of TEMPLATES) {
    test(file + ': a focused text field keeps its own typing', t => {
        const dom = load(file);
        t.after(() => dom.window.close());
        const w = dom.window, d = w.document, is = id => w.scpTypingTarget(d.getElementById(id));
        assert.equal(is('a'), true);
        assert.equal(is('n'), true, 'number fields (year, price) too');
        assert.equal(is('t'), true);
        assert.equal(is('s'), true);
        assert.equal(is('c'), false, 'a checkbox is not typed into');
        assert.equal(is('b'), false);
        assert.equal(is('plain'), false);
        assert.equal(is('SearchInput'), false, 'MeshCentral\'s own search box keeps its own handling');
        assert.equal(w.scpTypingTarget(null), false);
    });

    test(file + ': all three key handlers let it through before any page shortcut', () => {
        const src = fs.readFileSync(file, 'utf8');
        for (const name of ['ondockeypress', 'ondockeydown', 'ondockeyup']) {
            const body = src.slice(src.indexOf('function ' + name + '(e)'), src.indexOf('function ' + name + '(e)') + 400);
            assert.match(body, /scpTypingTarget\(e\.target\)\)+\s*\{\s*setSessionActivity\(\);\s*return;\s*\}/, name);
        }
    });
}

test('the minified Thai page has the same exception', () => {
    const src = fs.readFileSync('views/translations/default-min_th.handlebars', 'utf8');
    assert.ok(src.includes('function scpTypingTarget'), 'definition');
    assert.equal((src.match(/scpTypingTarget\(e\.target\)/g) || []).length, 3, 'used by all three handlers');
});
