'use strict';
// The full web site's colours.
//
// The hospital asked for pink throughout, and the fork's own stylesheets - not MeshCentral's -
// are where the site's colour actually lives. Getting that wrong is invisible to every other
// test here: the pages still render, the server still starts, and nobody finds out until someone
// opens the site and sees the old turquoise looking back.
//
// Two things are worth holding still. The brand has to be one value, shared with /m, because a
// site whose phone page and desktop page are different pinks looks like two products. And the
// status colours have to stay put: green means a machine is reachable, amber that it is idle,
// red that something is wrong, and the dashboard's one remaining teal means a session is
// running right now. A status colour that follows the brand around stops being a status colour.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PINK = '#b02a72';          // the logo, the consent box, and /m's --brand
const PINK_BRIGHT = '#d1428c';   // focus rings and hovers
const PINK_DARK_MODE = '#f472b6';
const BUSY = '#0f766e';          // the dashboard's "in a session right now"

const styles = p => path.join(__dirname, '../../public/styles/', p);
const SHEETS = ['scp-ui.css', 'scp-dashboard.css', 'scp-monitor.css',
    'scp-operations.css', 'scp-remote.css', 'scp-transfer.css'];
const read = f => fs.readFileSync(styles(f), 'utf8');

// Hue is what tells turquoise from pink; saturation is what tells a colour from a grey.
function hsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (d === 0) { return { h: 0, s: 0, l: l }; }
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) { h += 360; }
    return { h: h, s: s, l: l };
}
// Only 6- and 8-digit values, and only where a colour can legally sit, so '#page_leftbar' and
// the other id selectors this file is full of are not mistaken for colours.
function colours(css) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...stripped.matchAll(/[:,(\s]\s*(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)\b/g)].map(m => m[1].toLowerCase());
}

test('the site theme is the hospital pink, in both schemes', () => {
    const css = read('scp-ui.css');
    const light = css.slice(0, css.indexOf('.scp-ui.night'));
    const dark = css.slice(css.indexOf('.scp-ui.night'));
    assert.ok(new RegExp('--scp-accent:\\s*' + PINK, 'i').test(light), 'the light accent should be ' + PINK);
    assert.ok(new RegExp('--scp-accent:\\s*' + PINK_DARK_MODE, 'i').test(dark), 'the dark accent should be ' + PINK_DARK_MODE);
});

test('the site and the phone page lead with the same pink', () => {
    // Otherwise /m and the desktop site are two products wearing similar colours.
    const site = read('scp-ui.css');
    const phone = fs.readFileSync(styles('scp-mobile.css'), 'utf8');
    const of = (css, name) => (new RegExp(name + ':\\s*(#[0-9a-f]{6})', 'i').exec(css) || [])[1];
    assert.equal(of(site, '--scp-accent'), of(phone, '--brand'), 'one brand colour, not two');
});

test('no turquoise survives anywhere in the fork\'s own stylesheets', () => {
    // This is the regression guard. Any teal added or restored later fails here by hue, so it
    // catches a colour nobody thought to name as well as the ones that were replaced.
    const strays = [];
    for (const sheet of SHEETS) {
        for (const c of colours(read(sheet))) {
            if (c.slice(0, 7) === BUSY) { continue; }
            const { h, s } = hsl(c);
            if (s >= 0.10 && h >= 165 && h <= 205) { strays.push(sheet + ' ' + c); }
        }
    }
    assert.deepEqual(strays, [], 'turquoise is back in: ' + strays.join(', '));
});

test('the status colours are left alone', () => {
    // Green, amber and red carry meaning, and the dashboard's teal says a session is live.
    const dash = read('scp-dashboard.css');
    assert.ok(dash.includes(BUSY), 'a running session must stay distinguishable from the brand');
    const hues = colours(dash).map(hsl).filter(c => c.s >= 0.25);
    const has = (lo, hi) => hues.some(c => c.h >= lo && c.h <= hi);
    assert.ok(has(90, 164), 'green, for a machine that is fine, must still be there');
    assert.ok(has(25, 60), 'amber, for idle, must still be there');
    assert.ok(has(0, 20) || has(345, 360), 'red, for a problem, must still be there');
});

test('the file-type badges keep their own palette', () => {
    // They identify a kind of file rather than branding anything, so turning them all pink
    // would take away the one thing they are for.
    const css = read('scp-ui.css');
    const badges = [...css.matchAll(/\.scp-file-\w+ \{ background-color: (#[0-9a-f]{6})/gi)].map(m => m[1].toLowerCase());
    assert.ok(badges.length >= 6, 'expected the badge palette, found ' + badges.length);
    assert.equal(new Set(badges).size, badges.length, 'two file types sharing a colour tell you nothing');
});

test('focus is always visible, and it is pink', () => {
    // Keyboard users and anyone on a tablet keyboard rely on this being obvious.
    const css = read('scp-ui.css');
    assert.ok(css.includes(':focus-visible'), 'the site must show focus');
    assert.ok(css.toLowerCase().includes(PINK_BRIGHT), 'and the ring should be ' + PINK_BRIGHT);
});

// ---- The Desktop App ----
// The app is the third surface, and the one the hospital actually works in. Only its colours
// were changed; if anything here starts failing because the app was rebuilt from different
// sources, check that before changing the expectations.
const APP = path.join(__dirname, '../desktop-app/style.css');
const APP_ONLINE = ['#05876f', '#078974', '#16836e'];  // the three greens that mean "reachable"

test('the app leads with the same pink as the site and the phone page', () => {
    // Three surfaces, one product. A different pink in each would look like an accident.
    const app = fs.readFileSync(APP, 'utf8').toLowerCase();
    assert.ok(app.includes(PINK), 'the app should use ' + PINK + ' as its primary');
    const site = (/--scp-accent:\s*(#[0-9a-f]{6})/i.exec(read('scp-ui.css')) || [])[1];
    assert.equal(site.toLowerCase(), PINK, 'and the site should agree');
});

test('no turquoise survives in the app either', () => {
    const app = fs.readFileSync(APP, 'utf8');
    const strays = colours(app).filter(c => {
        if (APP_ONLINE.includes(c.slice(0, 7))) { return false; }
        const { h, s } = hsl(c);
        return s >= 0.10 && h >= 165 && h <= 225;
    });
    assert.deepEqual(strays, [], 'turquoise is back in the app: ' + strays.join(', '));
});

test('the app still says "online" in green', () => {
    // These sit in the turquoise band by hue, so the sweep had to be told to leave them. If
    // that instruction were ever lost they would turn pink and the one thing a technician
    // scans the list for - which machines can be reached - would stop standing out.
    const app = fs.readFileSync(APP, 'utf8').toLowerCase();
    for (const green of APP_ONLINE) {
        assert.ok(app.includes(green), green + ' is an online colour and must stay green');
    }
});

test('the app window opens on the same warm background as its page', () => {
    // Electron paints backgroundColor before the page loads. Left cool, every launch would
    // flash blue-grey and then settle to pink.
    const main = fs.readFileSync(path.join(__dirname, '../desktop-app/main.js'), 'utf8');
    const shell = (/backgroundColor:\s*'(#[0-9a-f]{6})'/i.exec(main) || [])[1];
    assert.ok(shell, 'the window should still set a background colour');
    assert.ok(fs.readFileSync(APP, 'utf8').toLowerCase().includes(shell.toLowerCase()),
        shell + ' is not a colour the page itself uses, so the launch would flash');
});

test('every stylesheet still parses', () => {
    // A colour sweep that unbalances a brace blanks a page rather than mis-colouring it.
    for (const sheet of SHEETS.concat('scp-mobile.css')) {
        const css = read(sheet);
        assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, sheet + ' has an unbalanced brace');
        for (const c of colours(css)) {
            assert.ok(/^#([0-9a-f]{6}|[0-9a-f]{8})$/.test(c), sheet + ' has a malformed colour: ' + c);
        }
    }
});

test('no full-width digits hide in a colour', () => {
    // This has happened here before: '#180f１６' looks right and silently does nothing.
    for (const sheet of SHEETS.concat('scp-mobile.css')) {
        const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
        const bad = [...css.matchAll(/#[0-9a-fA-F]*[^\x00-\x7F][0-9a-fA-F]*/g)].map(m => m[0]);
        assert.deepEqual(bad, [], sheet + ' has a colour with a non-ASCII digit: ' + bad.join(', '));
    }
});
