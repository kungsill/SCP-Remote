'use strict';
// The assessment tab spreads out to give its wide table room. It used to cover the whole
// window, the left menu and header included, which left no way to go anywhere else without
// first finding "back to normal". It now fills the space beside the menu and under the header.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../../public/styles/scp-dashboard.css'), 'utf8');

test('the expanded assessment starts beside the left menu and under the header', () => {
    const rule = /#scpDashboard\.scp-dash-expanded \{[^}]*\}/.exec(css)[0];
    assert.match(rule, /inset: var\(--scp-exp-top, 0px\) 0 0 var\(--scp-exp-left, 0px\) !important/);
    assert.doesNotMatch(rule, /inset: 0 !important/);
    assert.doesNotMatch(rule, /width: 100% !important|height: 100dvh !important/, 'its size comes from the four edges');
});

test('where the menu and header end is measured, not assumed', () => {
    const fn = src.slice(src.indexOf('function fitAssessmentView()'), src.indexOf('function assessmentForPrint('));
    assert.match(fn, /edge\('page_leftbar', 'right'\)/);
    assert.match(fn, /edge\('masthead', 'bottom'\)/);
    assert.match(fn, /getBoundingClientRect\(\)/);
    assert.match(fn, /panel\.style\.setProperty\('--scp-exp-left', left \+ 'px'\)/);
    assert.match(fn, /panel\.style\.setProperty\('--scp-exp-top', top \+ 'px'\)/);
    // a menu or header that is hidden (phones, the remote screen) reserves nothing
    assert.match(fn, /n\.offsetParent === null\) return 0;/);
});

test('it is measured again when the window changes size', () => {
    assert.match(src, /window\.addEventListener\('resize', fitAssessmentView\)/);
});
