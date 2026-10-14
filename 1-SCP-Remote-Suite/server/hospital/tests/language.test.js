'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { select, languages } = require('../language');
test('hospital language policy handles regional locales and unsupported choices', () => {
    assert.deepEqual(languages, ['th', 'en']);
    assert.equal(select(['en-US']), 'en');
    assert.equal(select(['th-TH']), 'th');
    assert.equal(select(['fr-FR', 'en-GB']), 'en');
    assert.equal(select(['de']), 'th');
    assert.equal(select([]), 'th');
    assert.equal(select(['EN']), 'en');
});
test('language links preserve query parameters and do not cover the desktop viewport', () => {
    const fs = require('fs');
    const path = require('path');
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<html lang="th"><body class="login"><div id="topbar"></div></body></html>', {
        url: 'https://hospital.example/unit/login?key=test-key&viewmode=10#section', runScripts: 'outside-only'
    });
    dom.window.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-language.js'), 'utf8'));
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    const links = [...dom.window.document.querySelectorAll('#topbar nav a')];
    assert.equal(links.length, 2);
    const english = new URL(links[1].href);
    assert.equal(english.searchParams.get('lang'), 'en');
    assert.equal(english.searchParams.get('key'), 'test-key');
    assert.equal(english.searchParams.get('viewmode'), '10');
    assert.equal(english.hash, '#section');
    assert.equal(links[0].getAttribute('aria-current'), 'true');
    dom.window.close();
});
test('the mobile login page keeps the language links inside the login column', () => {
    const fs = require('fs');
    const path = require('path');
    const { JSDOM } = require('jsdom');
    // The mobile login page has no top bar and positions its panel absolutely, so
    // the links belong at the top of the login column rather than in the body.
    const dom = new JSDOM('<html lang="en"><body><div id="page_content"><div id="column_l"><div id="loginpanel"></div></div></div></body></html>', {
        url: 'https://hospital.example/?key=test-key', runScripts: 'outside-only'
    });
    dom.window.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-language.js'), 'utf8'));
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    const nav = dom.window.document.querySelector('nav.scp-language');
    assert.ok(nav, 'language links are added to the mobile login page');
    assert.equal(nav.parentElement.id, 'column_l');
    assert.equal(nav.parentElement.firstElementChild, nav);
    const links = [...nav.querySelectorAll('a')];
    assert.deepEqual(links.map(link => link.lang), ['th', 'en']);
    assert.equal(new URL(links[0].href).searchParams.get('key'), 'test-key');
    assert.equal(links[1].getAttribute('aria-current'), 'true');
    dom.window.close();
});
