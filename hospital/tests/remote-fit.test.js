'use strict';
// How large the remote picture is drawn on the technician's screen. A remote screen stretched
// to fill the window, or drawn through Windows display scaling (125%, 150%), puts each remote
// pixel across a fraction of a real one and the text goes soft. The picture is therefore shown
// at a whole number of real pixels per remote pixel whenever it fits, and only shrunk when the
// remote screen is larger than the window.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const fit = require('../../public/scripts/scp-remote-fit');
const source = fs.readFileSync(path.join(root, 'public/scripts/scp-remote-fit.js'), 'utf8');

test('a remote screen smaller than the window is not stretched', () => {
    const r = fit.fitSize(1366, 768, 1900, 1000, 1);
    assert.deepEqual(r, { width: 1366, height: 768, scale: 1 });
});

test('Windows display scaling is undone, so one remote pixel is one real pixel', () => {
    // 150%: the window is 1280 CSS px wide but 1920 real pixels
    const r = fit.fitSize(1366, 768, 1280, 700, 1.5);
    assert.equal(r.scale, 1);
    assert.equal(r.width * 1.5, 1366);
    assert.equal(r.height * 1.5, 768);
    const q = fit.fitSize(1920, 1080, 1700, 900, 1.25);
    assert.equal(q.scale, 1);
    assert.equal(q.width * 1.25, 1920);
});

test('a small remote screen on a large monitor grows only by whole pixels', () => {
    const r = fit.fitSize(1024, 768, 3840, 2000, 1);
    assert.deepEqual(r, { width: 2048, height: 1536, scale: 2 });
    const s = fit.fitSize(800, 600, 3840, 2000, 1);
    assert.equal(s.scale, 3);
});

test('a remote screen larger than the window is shrunk to fit, keeping its shape', () => {
    const r = fit.fitSize(1920, 1080, 960, 800, 1);
    assert.deepEqual(r, { width: 960, height: 540, scale: 0.5 });
    const tall = fit.fitSize(1080, 1920, 1000, 960, 1);
    assert.equal(tall.height, 960);
    assert.equal(tall.width, 540);
    assert.ok(tall.scale < 1);
});

test('the shrunk picture lands on whole real pixels and never overflows the window', () => {
    for (const dpr of [1, 1.25, 1.5, 2]) {
        for (const [w, h, pw, ph] of [[1920, 1080, 1317, 743], [2560, 1440, 1001, 999], [1366, 768, 411, 731]]) {
            const r = fit.fitSize(w, h, pw, ph, dpr);
            assert.ok(r.width <= pw + 1e-9 && r.height <= ph + 1e-9, 'fits inside ' + pw + 'x' + ph + ' at ' + dpr);
            assert.ok(Math.abs(r.width * dpr - Math.round(r.width * dpr)) < 1e-6, 'whole real pixels across');
            assert.ok(Math.abs(r.height * dpr - Math.round(r.height * dpr)) < 1e-6, 'whole real pixels down');
            assert.ok(Math.abs(r.width / r.height - w / h) < 0.01, 'same shape');
        }
    }
});

test('nonsense sizes give no size rather than a broken picture', () => {
    assert.equal(fit.fitSize(0, 768, 1000, 800, 1), null);
    assert.equal(fit.fitSize(1366, 768, 0, 800, 1), null);
    assert.equal(fit.fitSize(NaN, 768, 1000, 800, 1), null);
    assert.equal(fit.fitSize('a', 768, 1000, 800, 1), null);
    // a missing or silly pixel ratio is treated as 1
    assert.deepEqual(fit.fitSize(1366, 768, 1900, 1000, 0), { width: 1366, height: 768, scale: 1 });
    assert.deepEqual(fit.fitSize(1366, 768, 1900, 1000, undefined), { width: 1366, height: 768, scale: 1 });
});

test('actual size (1:1) also undoes display scaling', () => {
    assert.deepEqual(fit.actualSize(1920, 1080, 1.25), { width: 1536, height: 864, scale: 1 });
    assert.equal(fit.actualSize(0, 1080, 1), null);
});

test('sizing the picture never talks to the remote computer', () => {
    assert.doesNotMatch(source, /\.send\(|SendMouseMsg|SendKey|SendTouch|SendCompressionLevel|setResolution/);
});

test('the stretch-to-fill mode and a pinch-zoomed picture are left alone', () => {
    assert.match(source, /mode===2/);
    assert.match(source, /scp-zoomed/);
});

test('both remote views load the sizing before the zoom that builds on it', () => {
    for (const view of ['views/default.handlebars', 'views/sharing.handlebars']) {
        const page = fs.readFileSync(path.join(root, view), 'utf8');
        const a = page.indexOf('scripts/scp-remote-fit.js'), b = page.indexOf('scripts/scp-remote-ui.js');
        assert.ok(a > 0, view + ' loads scp-remote-fit.js');
        assert.ok(a < b, view + ' loads it before scp-remote-ui.js');
    }
});
