'use strict';
// The on-screen keyboard for the remote screen on phones and tablets (public/scripts/scp-softkeys.js).
// Someone with only a touch screen had no way to type on the remote computer except the one-line
// "type" box. The keyboard button opens the device's own keyboard; what is typed goes to the
// computer as Unicode, so Thai works whatever the computer's layout, and the box keeps what was
// typed so keyboards that check Thai spelling order (Samsung) let above/below vowels through.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { JSDOM } = require('jsdom');

function page(t, opts = {}) {
    const dom = new JSDOM('<html lang="th"><body><div id="DeskParent"><canvas id="Desk"></canvas></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const w = dom.window;
    Object.defineProperty(w.navigator, 'maxTouchPoints', { value: opts.touch === false ? 0 : 5 });
    w.setInterval = () => 1; // visibility is checked with refresh() instead of the timer
    const sent = [];
    w.desktop = opts.desktop === null ? null : Object.assign({
        State: 3, viewonly: false,
        m: {
            SendStringUnicode: s => sent.push(['text', s]),
            SendKeyMsgKC: (action, kc, ext) => sent.push(['key', action, kc, !!ext]),
        },
    }, opts.desktop || {});
    w.eval(fs.readFileSync('public/scripts/scp-softkeys.js', 'utf8'));
    w.ScpSoftKeys.refresh();
    const d = w.document;
    const input = d.getElementById('scp-softkeys-input');
    // The browser updates the box and then fires "input"; this does the same.
    const type = value => { input.value = value; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const S = w.ScpSoftKeys.SENTINEL;
    return { w, d, sent, input, type, S, button: d.getElementById('scp-softkeys-btn'), bar: d.getElementById('scp-softkeys-bar') };
}
const tap = (kc, ext = false) => [['key', 1, kc, ext], ['key', 2, kc, ext]];

test('diff: only what changed at the end goes out', () => {
    const dom = new JSDOM('', { runScripts: 'outside-only' });
    dom.window.eval(fs.readFileSync('public/scripts/scp-softkeys.js', 'utf8'));
    const { diff } = dom.window.ScpSoftKeys;
    assert.deepEqual({ ...diff('ท', 'ทำ') }, { back: 0, text: 'ำ' });
    assert.deepEqual({ ...diff('กา', 'ก') }, { back: 1, text: '' });
    assert.deepEqual({ ...diff('abc', 'abd') }, { back: 1, text: 'd' });
    assert.deepEqual({ ...diff('a😀', 'a😃') }, { back: 1, text: '😃' }, 'an emoji is one backspace, not two');
    dom.window.close();
});

test('the button shows only on a touch device with a connected, controllable screen', t => {
    assert.equal(page(t).button.hidden, false);
    assert.equal(page(t, { touch: false }).button.hidden, true, 'a computer with a keyboard does not need it');
    assert.equal(page(t, { desktop: { State: 0 } }).button.hidden, true, 'nothing connected');
    assert.equal(page(t, { desktop: { viewonly: true } }).button.hidden, true, 'view only');
    assert.equal(page(t, { desktop: null }).button.hidden, true);
});

test('pressing it opens the keyboard (focuses the box) and shows the key bar', t => {
    const p = page(t);
    p.button.click();
    assert.equal(p.d.activeElement, p.input);
    assert.equal(p.bar.hidden, false);
    assert.equal(p.input.value, p.S, 'starts with only the marker');
});

test('Thai with above and below vowels and tone marks goes out whole', t => {
    const p = page(t);
    p.button.click();
    let v = p.S;
    for (const c of 'งั้นทำงาน') { v += c; p.type(v); }
    assert.equal(p.sent.map(s => s[1]).join(''), 'งั้นทำงาน');
    assert.ok(p.sent.every(s => s[0] === 'text'));
    assert.ok(p.input.value.endsWith('งั้นทำงาน'), 'the box keeps it, so the keyboard can see the consonant before a mark');
});

test('a keyboard rewriting the last letter (composition) sends only the difference', t => {
    const p = page(t);
    p.button.click();
    p.input.dispatchEvent(new p.w.Event('compositionstart'));
    p.type(p.S + 'ท');
    p.type(p.S + 'ทำ');
    p.input.dispatchEvent(new p.w.Event('compositionend'));
    assert.deepEqual(p.sent, [['text', 'ท'], ['text', 'ำ']]);
});

test('backspace removes on the computer too, also when the box is already empty', t => {
    const p = page(t);
    p.button.click();
    p.type(p.S + 'กา');
    p.sent.length = 0;
    p.type(p.S + 'ก');
    assert.deepEqual(p.sent, tap(8));
    p.sent.length = 0;
    p.type(p.S);
    p.type(''); // the marker itself deleted: the box was empty, the computer still gets a backspace
    assert.deepEqual(p.sent, [...tap(8), ...tap(8)]);
    assert.equal(p.input.value, p.S, 'the marker is put back for the next backspace');
});

test('Enter is the Enter key, not a newline character', t => {
    const p = page(t);
    p.button.click();
    p.type(p.S + 'ok\n');
    assert.deepEqual(p.sent, [['text', 'ok'], ...tap(13)]);
});

test('the key bar sends Esc, Tab and arrows, and an arrow forgets the text before the cursor', t => {
    const p = page(t);
    p.button.click();
    p.type(p.S + 'ก');
    p.sent.length = 0;
    p.bar.querySelector('[data-key="esc"]').click();
    p.bar.querySelector('[data-key="tab"]').click();
    p.bar.querySelector('[data-key="left"]').click();
    assert.deepEqual(p.sent, [...tap(27), ...tap(9), ...tap(37, true)]);
    assert.equal(p.input.value, p.S, 'the computer cursor moved, so the old text is no longer before it');
});

test('the hidden box sits at the top, so focusing it does not scroll the page down', t => {
    const p = page(t);
    const css = p.d.querySelector('style').textContent;
    assert.match(css, /#scp-softkeys-input\{position:fixed;left:0;top:0;/);
});

test('while typing the page is marked, so the picture is fitted above the keyboard', t => {
    const p = page(t);
    p.button.click();
    assert.ok(p.d.body.classList.contains('scp-softkeys-open'));
    p.bar.querySelector('[data-key="hide"]').click();
    assert.ok(!p.d.body.classList.contains('scp-softkeys-open'));
});

test('hide closes the keyboard and the bar', t => {
    const p = page(t);
    p.button.click();
    p.bar.querySelector('[data-key="hide"]').click();
    assert.notEqual(p.d.activeElement, p.input);
    assert.equal(p.bar.hidden, true);
});

test('nothing is sent once the screen is disconnected', t => {
    const p = page(t);
    p.button.click();
    p.w.desktop.State = 0;
    p.type(p.S + 'ก');
    assert.deepEqual(p.sent, []);
});

test('the remote page loads it', () => {
    const page = fs.readFileSync('views/default.handlebars', 'utf8');
    assert.match(page, /scripts\/scp-softkeys\.js\?v=[\w-]+/);
});
