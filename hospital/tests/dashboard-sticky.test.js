'use strict';
// The dashboard's top (title, search, departments, numbers, tabs) stays in view while the page
// below scrolls, and becomes compact once it does: one line of department chips, one line of
// numbers, no intro text. Pinned at full height it would take half the screen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function setup(t) {
    const dom = new JSDOM('<html lang="th"><body><div id=page_leftbar><div id=LeftMenuMyDevices class=lbbutton></div></div><div id=p1></div></body></html>',
        { url: 'https://hospital.example/', runScripts: 'outside-only' });
    const w = dom.window;
    w.alert = () => {}; w.confirm = () => true;
    w.meshserver = { send: () => {}, onMessage: () => {} };
    w.serverinfo = { consent: 8 };
    w.meshes = { 'mesh//a': { _id: 'mesh//a', name: 'ตึกหญิง' }, 'mesh//b': { _id: 'mesh//b', name: 'ER' } };
    w.nodes = [
        { _id: 'node//1', name: 'pc-one', conn: 1, meshid: 'mesh//a', users: [] },
        { _id: 'node//2', name: 'pc-two', conn: 0, meshid: 'mesh//b', users: [] },
    ];
    w.gotoDevice = () => {};
    const observers = [];
    w.IntersectionObserver = function (cb) { this.cb = cb; this.observe = el => { this.el = el; }; this.disconnect = () => {}; observers.push(this); };
    const timers = [];
    w.setInterval = fn => { timers.push(fn); return timers.length; };
    w.clearInterval = () => {};
    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    t.after(() => { try { w.ScpDashboard.hide(); } catch (e) { /* closed */ } w.close(); });
    w.ScpDashboard.show();
    const panel = w.document.getElementById('scpDashboard');
    return { w, panel, observers, tick: () => timers.slice().forEach(fn => fn()) };
}

test('title, search, departments, numbers and tabs share one block at the top', t => {
    const { panel } = setup(t);
    const top = panel.querySelector(':scope > .scp-dash-top');
    assert.ok(top, 'there is a top block');
    for (const part of ['.scp-dash-heading', '.scp-dash-search', '.scp-dash-rooms', '.scp-dash-stats', '.scp-dash-tabs']) {
        assert.ok(top.querySelector(part), part + ' is in it');
    }
    const body = panel.querySelector('.scp-dash-body');
    assert.ok(top.compareDocumentPosition(body) & 4, 'the views follow below it');
    assert.equal(top.querySelector('.scp-dash-view'), null, 'the views themselves scroll');
    assert.ok(body.querySelector('.scp-dash-view'));
});

test('a refresh redraws it in place, not a second copy', t => {
    const { panel, tick } = setup(t);
    tick(); tick();
    assert.equal(panel.querySelectorAll('.scp-dash-rooms').length, 1);
    assert.equal(panel.querySelectorAll('.scp-dash-tabs').length, 1);
    assert.equal(panel.querySelectorAll('.scp-dash-stats').length >= 1, true);
    assert.equal(panel.querySelector('.scp-dash-top').querySelectorAll('.scp-dash-stats').length, 1);
});

test('once it is pinned (its marker scrolled out of sight) the page turns compact, and back', t => {
    const { panel, observers } = setup(t);
    const sentinel = panel.querySelector('.scp-dash-top-sentinel');
    assert.ok(sentinel, 'a marker sits just above the top block');
    const o = observers.find(x => x.el === sentinel);
    assert.ok(o, 'it is watched');
    o.cb([{ isIntersecting: false, target: sentinel }]);
    assert.ok(panel.classList.contains('scp-dash-stuck'));
    o.cb([{ isIntersecting: true, target: sentinel }]);
    assert.ok(!panel.classList.contains('scp-dash-stuck'));
});

test('the stylesheet pins it, keeps the departments to one scrolling line and shrinks it when pinned', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../public/styles/scp-dashboard.css'), 'utf8');
    assert.match(css, /\.scp-dash-top \{[^}]*position: sticky;[^}]*top: 0;/);
    assert.match(css, /\.scp-dash-top \.scp-dash-rooms \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/);
    assert.match(css, /\.scp-dash-stuck \.scp-dash-heading > \.scp-eyebrow/);
    assert.match(css, /\.scp-dash-stuck \.scp-dash-top \.scp-dash-stats \{/);
    assert.match(css, /\.scp-dash-expanded \.scp-dash-top-slot > \.scp-dash-stats/, 'full-screen mode still hides the numbers');
});
