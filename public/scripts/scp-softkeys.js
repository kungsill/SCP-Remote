/* On-screen keyboard for the remote screen on phones, iPads and tablets.
 *
 * A touch screen with no keyboard had no way to type on the remote computer except the one-line
 * "type" box. The ⌨ button focuses a hidden text box, which opens the device's own keyboard.
 * Every change in that box goes to the computer: Backspace for what was removed, Unicode for what
 * was added (so Thai works whatever the computer's keyboard layout, and a keyboard composing or
 * correcting a word is followed letter by letter). The box keeps what was typed, so keyboards
 * that check Thai spelling order (Samsung's lets an above/below vowel or tone mark through only
 * after a consonant) see the consonant. A marker character sits in front of the text so a
 * Backspace on an empty box still fires and still reaches the computer.
 */
(function (root) {
    'use strict';
    if (root.ScpSoftKeys) return;
    var SENTINEL = ' ';
    var KEEP = 200; // characters the box keeps for the keyboard to look back at

    /** What changed at the end: how many characters to remove, then what to add. */
    function diff(prev, next) {
        var i = 0;
        while (i < prev.length && i < next.length && prev.charCodeAt(i) === next.charCodeAt(i)) i++;
        // Never split a surrogate pair (an emoji is one character to delete).
        if (i > 0 && i < prev.length && /[\uDC00-\uDFFF]/.test(prev[i]) && /[\uD800-\uDBFF]/.test(prev[i - 1])) i--;
        return { back: Array.from(prev.slice(i)).length, text: next.slice(i) };
    }

    function desk() {
        var d = root.desktop;
        return d && d.State === 3 && d.viewonly !== true && d.m && typeof d.m.SendStringUnicode === 'function' ? d : null;
    }
    function key(kc, extended) {
        var d = desk();
        if (!d) return;
        d.m.SendKeyMsgKC(1, kc, !!extended);
        d.m.SendKeyMsgKC(2, kc, !!extended);
    }
    function sendText(s) {
        var d = desk();
        if (!d) return;
        var run = '';
        Array.from(s).forEach(function (c) {
            if (c === '\n' || c === '\r') { if (run) { d.m.SendStringUnicode(run); run = ''; } key(13); }
            else if (c === '\t') { if (run) { d.m.SendStringUnicode(run); run = ''; } key(9); }
            else run += c;
        });
        if (run) d.m.SendStringUnicode(run);
    }
    function touchDevice() {
        // Touch points or a coarse pointer (phones, iPads, tablets); "ontouchstart" is not used
        // because some desktop browsers have it without a touch screen.
        if (root.navigator && root.navigator.maxTouchPoints > 0) return true;
        try { return !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
    }
    var th = function () { return (root.document.documentElement.lang || '').indexOf('th') === 0; };

    var button, input, bar, last = SENTINEL, composing = false, open = false;

    function reset() { input.value = SENTINEL; last = SENTINEL; try { input.setSelectionRange(1, 1); } catch (e) {} }

    function onInput() {
        var v = input.value;
        var markerGone = v.indexOf(SENTINEL) !== 0;
        var before = last.slice(SENTINEL.length);
        var after = markerGone ? v : v.slice(SENTINEL.length);
        var d = diff(before, after);
        var back = d.back + (markerGone ? 1 : 0);
        if (desk()) {
            for (var i = 0; i < back; i++) key(8);
            if (d.text) sendText(d.text);
        }
        last = markerGone ? SENTINEL + after : v;
        if (!composing) {
            if (markerGone) { input.value = last; try { input.setSelectionRange(last.length, last.length); } catch (e) {} }
            else if (v.length > KEEP * 2) { last = SENTINEL + v.slice(-KEEP); input.value = last; }
        }
    }

    function placeBar() {
        if (!bar || bar.hidden) return;
        var vv = root.visualViewport;
        var keyboardHeight = vv ? Math.max(0, root.innerHeight - vv.height - vv.offsetTop) : 0;
        bar.style.bottom = keyboardHeight + 'px';
    }

    function show() {
        open = true;
        bar.hidden = false;
        if (input.value.indexOf(SENTINEL) !== 0) reset();
        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
        button.setAttribute('aria-pressed', 'true');
        placeBar();
    }
    function hide() {
        open = false;
        bar.hidden = true;
        input.blur();
        button.setAttribute('aria-pressed', 'false');
    }

    var KEYS = [
        ['esc', 'Esc', 27], ['tab', 'Tab', 9], ['left', '←', 37, true], ['up', '↑', 38, true], ['down', '↓', 40, true],
        ['right', '→', 39, true], ['back', '⌫', 8], ['enter', '↵', 13], ['hide', null],
    ];

    function build() {
        var d = root.document;
        var style = d.createElement('style');
        style.textContent =
            '#scp-softkeys-btn{position:fixed;right:16px;bottom:84px;z-index:10050;display:flex;align-items:center;gap:6px;padding:10px 16px;border:0;border-radius:999px;' +
            'background:linear-gradient(90deg,#b02a72,#e2559c);color:#ffffff;font:600 14px Sarabun,"IBM Plex Sans Thai",sans-serif;box-shadow:0 8px 22px rgba(176,42,114,.35);cursor:pointer}' +
            '#scp-softkeys-btn[hidden],#scp-softkeys-bar[hidden]{display:none!important}' +
            '#scp-softkeys-input{position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;resize:none;z-index:-1}' +
            '#scp-softkeys-bar{position:fixed;left:0;right:0;bottom:0;z-index:10060;display:flex;gap:4px;padding:6px;background:#ffffff;border-top:1px solid #f0e6ec;box-shadow:0 -4px 16px rgba(42,21,32,.08)}' +
            '#scp-softkeys-bar button{flex:1;min-width:0;height:40px;border:1px solid #f0e6ec;border-radius:10px;background:#f8f3f6;color:#2a1520;font:600 14px Sarabun,sans-serif;cursor:pointer}' +
            '#scp-softkeys-bar button[data-key=hide]{flex:1.4;background:#fce9f2;color:#b02a72;border-color:#f3c4db}';
        d.head.appendChild(style);

        button = d.createElement('button');
        button.type = 'button';
        button.id = 'scp-softkeys-btn';
        button.hidden = true;
        button.setAttribute('aria-pressed', 'false');
        button.textContent = '⌨ ' + (th() ? 'แป้นพิมพ์' : 'Keyboard');
        button.title = th() ? 'เปิดแป้นพิมพ์ของเครื่องนี้ เพื่อพิมพ์บนเครื่องรีโมต' : 'Open this device\'s keyboard to type on the remote computer';
        button.addEventListener('click', function () { if (open && root.document.activeElement === input) hide(); else show(); });

        input = d.createElement('textarea');
        input.id = 'scp-softkeys-input';
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('aria-label', th() ? 'พิมพ์ไปที่เครื่องรีโมต' : 'Type to the remote computer');
        input.value = SENTINEL;
        input.addEventListener('input', onInput);
        input.addEventListener('compositionstart', function () { composing = true; });
        input.addEventListener('compositionend', function () { composing = false; onInput(); });

        bar = d.createElement('div');
        bar.id = 'scp-softkeys-bar';
        bar.hidden = true;
        KEYS.forEach(function (k) {
            var b = d.createElement('button');
            b.type = 'button';
            b.setAttribute('data-key', k[0]);
            b.textContent = k[1] || (th() ? 'ซ่อน' : 'Hide');
            var press = function () {
                if (k[0] === 'hide') { hide(); return; }
                key(k[2], k[3]);
                // The cursor moved on the computer (or the line was sent): the old text is not before it any more.
                if (k[0] !== 'back') reset();
                else if (last.length > SENTINEL.length) { last = last.slice(0, -1); input.value = last; }
            };
            // Keep the box focused, so the keyboard stays open while these are pressed. A touch is
            // handled on touchstart, and cancelling it stops the browser's own click following.
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('touchstart', function (e) { e.preventDefault(); press(); }, { passive: false });
            b.addEventListener('click', press);
            bar.appendChild(b);
        });

        d.body.appendChild(input);
        d.body.appendChild(bar);
        d.body.appendChild(button);

        if (root.visualViewport) {
            root.visualViewport.addEventListener('resize', placeBar);
            root.visualViewport.addEventListener('scroll', placeBar);
        }
        // Tapping the picture moves the computer's cursor: keep the keyboard open and start afresh.
        var parent = d.getElementById('DeskParent');
        if (parent) parent.addEventListener('touchend', function () {
            if (!open) return;
            reset();
            try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
        }, { capture: true });
    }

    function refresh() {
        if (!button) return;
        var want = touchDevice() && !!desk();
        if (button.hidden === want) button.hidden = !want;
        if (!want && open) hide();
    }

    function start() {
        if (!root.document.body) { root.setTimeout(start, 200); return; }
        build();
        refresh();
        root.setInterval(refresh, 500);
    }

    root.ScpSoftKeys = { diff: diff, refresh: refresh, SENTINEL: SENTINEL };
    start();
})(window);
