'use strict';
// The 2FA code entry on the sign-in page.
//
// This is the last thing between someone with a stolen password and every computer in the
// hospital, and it is also the screen that locks the hospital out of its own server if it
// stops working. So these tests do not check that the markup looks right; they drive the boxes
// the way a person would and then read MeshCentral's own input and its own Login button, using
// MeshCentral's own checkToken lifted out of the page. If the enhancement ever stops feeding
// the real field, the button stays disabled here and the test fails.
//
// Two things in particular are easy to get wrong and are pinned down below: a backup code is
// eight digits, not six, so the boxes cannot be the only way in; and the original input has to
// stay in the form under its own name, because that is what the server reads.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const page = fs.readFileSync('views/login.handlebars', 'utf8');

// Take the real panel out of the real page, so this cannot drift from what is served.
function panelMarkup(id) {
    const start = page.indexOf('<div id=' + id);
    assert.ok(start > 0, id + ' is no longer in login.handlebars');
    const end = page.indexOf('<div id=', page.indexOf('</form>', start));
    return page.slice(start, end)
        .replace(/\{\{\{autocomplete\}\}\}/g, 'autocomplete')
        .replace(/\{\{\{\w+\}\}\}/g, '');
}

// MeshCentral's own validator, lifted from the page rather than restated here.
function realCheckToken(name) {
    const start = page.indexOf('function ' + name + '()');
    assert.ok(start > 0, name + ' is no longer in login.handlebars');
    return page.slice(start, page.indexOf('\n        }', start) + 10);
}

// The page loads scp-ui.js with defer, so in a browser it runs once the document is parsed.
// Waiting for that here is what makes the script's own DOMContentLoaded path the one under
// test, rather than a race that happens to pass.
async function ready(dom) {
    if (dom.window.document.readyState === 'loading') {
        await new Promise(resolve => dom.window.addEventListener('DOMContentLoaded', resolve));
    }
}

async function signin(t, id = 'tokenpanel', checker = 'checkToken') {
    const dom = new JSDOM(
        '<html lang="th"><body><div id=loginpanel></div>' + panelMarkup(id) + '</body></html>',
        { runScripts: 'dangerously' });          // so the page's own inline onkeyup= runs
    t.after(() => dom.window.close());
    const w = dom.window, d = w.document;
    await ready(dom);
    w.eval('function Q(id){return document.getElementById(id);}' +
        'function QE(id,e){var n=Q(id); if(n){n.disabled=!e;}}');
    w.eval(realCheckToken(checker));
    w.eval(fs.readFileSync('public/scripts/scp-ui.js', 'utf8'));
    return { w, d, boxes: [...d.querySelectorAll('.scp-otp-box')] };
}

// Typing is one character landing in a box, which is what a phone keyboard produces.
function type(w, box, char) {
    box.value = char;
    box.dispatchEvent(new w.Event('input', { bubbles: true }));
}

test('the code is six boxes, and MeshCentral still owns the field behind them', async t => {
    const { d, boxes } = await signin(t);
    assert.equal(boxes.length, 6);
    const real = d.getElementById('tokenInput');
    assert.ok(real, 'MeshCentral\'s own input must still exist');
    assert.equal(real.getAttribute('name'), 'token', 'the server reads this name');
    assert.ok(real.classList.contains('scp-otp-source'), 'it is only out of sight');
    assert.equal(real.closest('form').tagName, 'FORM', 'and still inside the form that posts');
});

test('typing six digits fills the real field and enables MeshCentral\'s own Login button', async t => {
    const { w, d, boxes } = await signin(t);
    const button = d.getElementById('tokenOkButton');
    assert.equal(button.disabled, true, 'nothing typed yet');
    '418902'.split('').forEach((c, i) => type(w, boxes[i], c));
    assert.equal(d.getElementById('tokenInput').value, '418902');
    assert.equal(button.disabled, false, 'six digits is a valid code, so Login must be live');
});

test('a digit moves to the next box, and backspace on an empty one moves back', async t => {
    // Without this a mistyped digit cannot be reached again without the mouse, which on a
    // phone means starting the code over.
    const { w, d, boxes } = await signin(t);
    type(w, boxes[0], '4');
    assert.equal(d.activeElement, boxes[1], 'the cursor should have moved on');
    boxes[1].focus();
    boxes[1].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    assert.equal(d.activeElement, boxes[0], 'an empty box sends backspace to the one before');
});

test('pasting the whole code fills every box at once', async t => {
    // Copying the code out of an authenticator app is normal, and six separate boxes are
    // exactly where paste usually stops working.
    const { w, d, boxes } = await signin(t);
    const paste = new w.Event('paste', { bubbles: true, cancelable: true });
    paste.clipboardData = { getData: () => '418902' };
    boxes[0].dispatchEvent(paste);
    assert.equal(d.getElementById('tokenInput').value, '418902');
    assert.equal(d.getElementById('tokenOkButton').disabled, false);
});

test('an eight digit backup code is not rejected by a six box field', async t => {
    // Backup codes are eight digits (getRandomEightDigitInteger in meshuser.js). Someone
    // reaching for one has usually lost their phone, so this is the worst possible moment
    // for the page to have no room for it.
    const { w, d, boxes } = await signin(t);
    const paste = new w.Event('paste', { bubbles: true, cancelable: true });
    paste.clipboardData = { getData: () => '31415926' };
    boxes[0].dispatchEvent(paste);
    const real = d.getElementById('tokenInput');
    assert.equal(real.value, '31415926');
    assert.equal(real.classList.contains('scp-otp-source'), false, 'the plain field has to come back');
    assert.equal(d.getElementById('tokenOkButton').disabled, false, 'and eight digits is valid');
});

test('there is a way back to the plain field without pasting anything', async t => {
    const { d } = await signin(t);
    const link = d.querySelector('.scp-otp-alt');
    assert.ok(link, 'someone typing a backup code by hand needs this');
    assert.equal(link.type, 'button', 'a submit here would post an empty code');
    link.click();
    assert.equal(d.getElementById('tokenInput').classList.contains('scp-otp-source'), false);
    assert.equal(d.querySelector('.scp-otp').hidden, true, 'and the boxes step aside');
});

test('only digits reach the field', async t => {
    const { w, d, boxes } = await signin(t);
    type(w, boxes[0], 'x');
    assert.equal(boxes[0].value, '');
    assert.equal(d.getElementById('tokenInput').value, '');
});

test('the account recovery panel gets the same treatment', async t => {
    // resettokenpanel is a second, quieter copy of the same form. It was missed once already
    // when the sign-in page was restyled.
    const { d, boxes } = await signin(t, 'resettokenpanel', 'resetCheckToken');
    assert.equal(boxes.length, 6);
    assert.ok(d.getElementById('resetTokenInput').classList.contains('scp-otp-source'));
});

test('a failure leaves MeshCentral\'s own field usable', async t => {
    // If this enhancement throws, signing in still has to work. Nothing is worth locking the
    // hospital out of its own server over.
    const dom = new JSDOM('<html lang="th"><body><div id=loginpanel></div>' + panelMarkup('tokenpanel') + '</body></html>',
        { runScripts: 'dangerously' });
    t.after(() => dom.window.close());
    const w = dom.window, d = w.document;
    await ready(dom);
    // Fail partway, once some boxes exist, because a clean failure before anything is built
    // would not prove much. This is the case that leaves debris on the page.
    const real = d.createElement.bind(d);
    let made = 0;
    d.createElement = tag => { if (++made > 4) { throw Error('out of elements'); } return real(tag); };
    w.eval(fs.readFileSync('public/scripts/scp-ui.js', 'utf8'));
    d.createElement = real;
    const input = d.getElementById('tokenInput');
    assert.ok(input, 'the original field must survive');
    assert.equal(input.classList.contains('scp-otp-source'), false, 'and must be visible');
    assert.equal(d.querySelectorAll('.scp-otp, .scp-otp-alt').length, 0, 'with no half-built boxes left behind');
});

test('the boxes are styled, and in the hospital pink', async t => {
    const css = fs.readFileSync('public/styles/scp-ui.css', 'utf8');
    assert.ok(css.includes('.scp-otp-box'), 'the boxes need styling or they are six tiny fields');
    assert.ok(/\.scp-otp-source \{ display: none/.test(css), 'and the original has to be hidden');
    assert.ok(/\.scp-otp-box \{[^}]*width: 46px/.test(css), 'otherwise they stretch full width');
    assert.ok(/\.scp-otp-box:focus \{[^}]*var\(--scp-accent\)/.test(css), 'focus follows the brand');
});

test('the general input rule cannot reach the code boxes', async t => {
    // This one is written from a real failure. Every input in this form is given width:100%
    // with !important, and five :not([type=..]) clauses put that rule at a specificity two
    // class names cannot beat - so the boxes each took the full width and six of them ran off
    // the side of the page. Declaring the width again, even with !important, did nothing.
    //
    // Checking the declaration exists is what missed it, so this compares the two selectors
    // the way a browser does and insists the boxes are excluded outright.
    const css = fs.readFileSync('public/styles/scp-ui.css', 'utf8');
    const general = /\.scp-signin form input(:not\([^)]*\))+/.exec(css);
    assert.ok(general, 'the shared input rule is no longer recognisable; re-check this by hand');
    assert.ok(general[0].includes(':not(.scp-otp-box)'),
        'the code boxes must be excluded from the shared input rule, not merely outrank it');

    // And the exclusion has to sit on the rule that sets the width, not some other one.
    const rule = css.slice(css.indexOf(general[0]));
    const body = rule.slice(rule.indexOf('{'), rule.indexOf('}'));
    assert.ok(body.includes('width: 100%'), 'this is the rule that was overriding the boxes');
});

function specificity(selector) {
    // Enough of the real algorithm for this comparison: ids, then classes, attributes and
    // pseudo-classes, then elements. :not() and :is() contribute their argument's weight.
    let s = selector;
    const ids = (s.match(/#[\w-]+/g) || []).length;
    const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!not|is|:)[\w-]+/g) || []).length;
    const elements = (s.match(/(^|[\s>+~])[a-z]+/g) || []).length;
    return [ids, classes, elements];
}

test('the box rule would still lose on specificity, which is why exclusion is the fix', async t => {
    // Guards the reasoning above rather than the code: if someone removes the :not() and
    // tries to win on weight instead, this says why that will not work.
    const general = specificity('.scp-signin form input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])');
    const boxes = specificity('.scp-signin .scp-otp-box');
    assert.ok(general[1] > boxes[1], 'the shared rule carries more weight, and !important does not break the tie');
});
