'use strict';
// The Remote page and the new-computers panel, driven the way a person would: load the real
// dashboard script in a page, press the menu button, type, press Remote, press Move.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function setup(t, options = {}) {
    const dom = new JSDOM(
        '<html lang="th"><body><div id=page_leftbar><div id=LeftMenuMyDevices class=lbbutton></div></div><div id=p1></div></body></html>',
        { url: 'https://hospital.example/', runScripts: 'outside-only' });
    const w = dom.window;
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,dGVzdA==';
    const alerts = [], sent = [], opened = [];
    w.alert = message => alerts.push(message);
    w.confirm = () => true;
    w.meshserver = { send: message => sent.push(message), onMessage: () => {} };
    w.serverinfo = { consent: 8 };
    w.meshes = options.meshes || {
        'mesh//new': { _id: 'mesh//new', name: 'ทดสอบ', mtype: 2 },
        'mesh//er': { _id: 'mesh//er', name: 'ER', mtype: 2 },
        'mesh//rx': { _id: 'mesh//rx', name: 'ห้องยา', mtype: 2 }
    };
    w.nodes = options.nodes || [
        { _id: 'node//1', name: 'ER-NURSE-1', conn: 1, meshid: 'mesh//er', ip: '192.168.4.21', users: ['HOSP\\somchai'], idletime: 5 },
        { _id: 'node//2', name: 'RX-COUNTER', conn: 0, meshid: 'mesh//rx', ip: '192.168.6.40', users: [] },
        { _id: 'node//3', name: 'DESKTOP-NEW1', conn: 1, meshid: 'mesh//new', ip: '192.168.2.10', users: [] }
    ];
    w.gotoDevice = (id, view) => opened.push([id, view]);
    const timers = [];
    let nextTimer = 1;
    w.setInterval = (fn, ms) => { const id = nextTimer++; timers.push({ id, fn, ms }); return id; };
    w.clearInterval = id => { const i = timers.findIndex(timer => timer.id === id); if (i >= 0) timers.splice(i, 1); };
    const tick = (times = 1) => { for (let i = 0; i < times; i++) timers.slice().forEach(timer => timer.fn()); };
    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    t.after(() => { try { w.ScpDashboard.hide(); } catch (error) { /* already closed */ } w.close(); });
    const doc = w.document;
    return { w, doc, alerts, sent, opened, tick, api: w.ScpDashboard, panel: doc.getElementById('scpDashboard') };
}
const click = (w, el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));
const rows = doc => Array.from(doc.querySelectorAll('.scp-remote-row'));
const names = doc => rows(doc).map(r => r.querySelector('strong').textContent);

test('Remote is the first button in the left menu and opens the Remote page', (t) => {
    const { w, doc, api, panel } = setup(t);
    api.show();
    const buttons = Array.from(doc.querySelectorAll('#page_leftbar .lbbutton')).map(b => b.id);
    assert.deepEqual(buttons.slice(0, 3), ['LeftMenuScpRemote', 'LeftMenuScpDashboard', 'LeftMenuScpHosMap']);
    assert.equal(rows(doc).length, 0, 'the dashboard is what opens first');

    click(w, doc.getElementById('LeftMenuScpRemote'));
    assert.equal(panel.hidden, false);
    assert.ok(panel.classList.contains('scp-dash-remote-mode'));
    assert.ok(doc.getElementById('LeftMenuScpRemote').classList.contains('lbbuttonsel'));
    assert.ok(!doc.getElementById('LeftMenuScpDashboard').classList.contains('lbbuttonsel'));
    assert.deepEqual(names(doc), ['DESKTOP-NEW1', 'ER-NURSE-1', 'RX-COUNTER'], 'on first, then by name');
    assert.equal(doc.querySelector('.scp-dash-tabs'), null, 'none of the dashboard is drawn under it');
});

test('pressing Remote on a computer that is on opens its remote desktop', (t) => {
    const { w, doc, api, opened } = setup(t);
    api.show();
    click(w, doc.getElementById('LeftMenuScpRemote'));
    const row = rows(doc).find(r => r.querySelector('strong').textContent === 'ER-NURSE-1');
    // drawn like the SCP-Remote program: a picture of a screen, the IP, the name, Connect
    assert.ok(row.querySelector('.scp-remote-thumb svg'), 'each computer has its picture');
    assert.equal(row.querySelector('.scp-remote-ip').textContent, '192.168.4.21');
    assert.match(row.querySelector('small').textContent, /ER · ผู้ใช้ somchai/);
    assert.match(row.querySelector('.scp-remote-state').textContent, /ออนไลน์/);
    assert.equal(row.querySelector('.scp-remote-thumb-off'), null);
    click(w, row.querySelector('.scp-remote-go'));
    assert.deepEqual(opened, [['node//1', 11]]);
    row.querySelector('.scp-remote-thumb').dispatchEvent(new w.Event('dblclick', { bubbles: true }));
    assert.equal(opened.length, 2, 'double-clicking the picture connects too');
});

test('a computer that is off has no working button and says why', (t) => {
    const { w, doc, api, opened } = setup(t);
    api.show();
    click(w, doc.getElementById('LeftMenuScpRemote'));
    const row = rows(doc).find(r => r.querySelector('strong').textContent === 'RX-COUNTER');
    const go = row.querySelector('.scp-remote-go');
    assert.equal(go.disabled, true);
    assert.match(go.title, /เครื่องปิดอยู่/);
    assert.match(row.querySelector('.scp-remote-state').textContent, /ออฟไลน์/);
    assert.match(row.querySelector('.scp-remote-thumb-off').textContent, /ออฟไลน์/, 'the picture is dimmed and says so');
    go.click();
    row.querySelector('.scp-remote-thumb').dispatchEvent(new w.Event('dblclick', { bubbles: true }));
    assert.deepEqual(opened, []);
});

test('typing finds by name, IP, user and department, and survives the ten-second refresh', (t) => {
    const { w, doc, api, tick } = setup(t);
    api.show();
    click(w, doc.getElementById('LeftMenuScpRemote'));
    const type = text => { const box = doc.getElementById('scpRemoteSearch'); box.value = text; box.dispatchEvent(new w.Event('input', { bubbles: true })); };
    type('192.168.6');
    assert.deepEqual(names(doc), ['RX-COUNTER']);
    type('somchai');
    assert.deepEqual(names(doc), ['ER-NURSE-1']);
    type('ห้องยา');
    assert.deepEqual(names(doc), ['RX-COUNTER']);
    type('new1');
    assert.deepEqual(names(doc), ['DESKTOP-NEW1']);
    const box = doc.getElementById('scpRemoteSearch');
    box.focus();
    tick();
    assert.equal(doc.getElementById('scpRemoteSearch'), box, 'the same box, not a new empty one');
    assert.equal(box.value, 'new1');
    assert.equal(doc.activeElement, box, 'still being typed in');
    assert.deepEqual(names(doc), ['DESKTOP-NEW1']);
    type('zzz');
    assert.equal(rows(doc).length, 0);
    assert.match(doc.querySelector('.scp-dash-empty').textContent, /ไม่พบเครื่อง/);
});

test('the Dashboard button goes back to the dashboard', (t) => {
    const { w, doc, api, panel } = setup(t);
    api.show();
    click(w, doc.getElementById('LeftMenuScpRemote'));
    click(w, doc.getElementById('LeftMenuScpDashboard'));
    assert.ok(!panel.classList.contains('scp-dash-remote-mode'));
    assert.equal(rows(doc).length, 0);
    assert.ok(doc.querySelector('.scp-dash-tabs'), 'the dashboard is back');
    assert.ok(doc.getElementById('LeftMenuScpDashboard').classList.contains('lbbuttonsel'));
});

test('new computers are listed on the dashboard and one press moves one to its department', (t) => {
    const { w, doc, api, sent, tick } = setup(t);
    api.show();
    const panelEl = doc.querySelector('.scp-dash-intake');
    assert.ok(panelEl, 'the arrival group has a computer in it');
    assert.match(panelEl.textContent, /DESKTOP-NEW1/);
    assert.doesNotMatch(panelEl.textContent, /ER-NURSE-1/);
    click(w, panelEl.querySelector('.scp-dash-fix-go'));
    const choices = Array.from(doc.querySelectorAll('.scp-add-computer-groups button'));
    assert.deepEqual(choices.map(b => b.textContent).sort(), ['ER', 'ห้องยา'], 'every department except the one it is in');
    click(w, choices.find(b => b.textContent === 'ER'));
    const move = sent.find(m => m.action === 'changeDeviceMesh');
    assert.deepEqual(JSON.parse(JSON.stringify(move)), { action: 'changeDeviceMesh', nodeids: ['node//3'], meshid: 'mesh//er' });
    // the server moves it and the page hears about it
    w.nodes.find(n => n._id === 'node//3').meshid = 'mesh//er';
    tick();
    assert.equal(doc.querySelector('.scp-add-computer-groups'), null, 'the chooser closes');
    assert.equal(doc.querySelector('.scp-dash-intake'), null, 'nothing is left waiting');
});

test('a move the server refuses is reported, not shown as done', (t) => {
    const { w, doc, api, tick } = setup(t);
    api.show();
    click(w, doc.querySelector('.scp-dash-intake .scp-dash-fix-go'));
    click(w, doc.querySelector('.scp-add-computer-groups button'));
    tick(40);
    assert.match(doc.querySelector('.scp-extra-body .scp-health-hint').textContent, /ย้ายไม่สำเร็จ/);
    assert.equal(doc.querySelector('.scp-add-computer-groups button').disabled, false, 'it can be tried again');
    assert.ok(doc.querySelector('.scp-dash-intake'), 'the computer is still waiting');
});

test('leaving the remote screen goes back to the page the technician came from', (t) => {
    const { w, doc, api, panel } = setup(t);
    api.show();
    // from the Remote page
    click(w, doc.getElementById('LeftMenuScpRemote'));
    click(w, rows(doc).find(r => r.querySelector('strong').textContent === 'ER-NURSE-1').querySelector('.scp-remote-go'));
    assert.equal(w.scpRemoteReturn, 'remote');
    assert.equal(panel.hidden, true, 'the remote screen has the window');
    api.returnFromRemote();
    assert.equal(panel.hidden, false);
    assert.ok(panel.classList.contains('scp-dash-remote-mode'), 'back on the Remote page');
    assert.equal(rows(doc).length, 3);
    assert.equal(w.scpRemoteReturn, null);
    // from the dashboard
    click(w, doc.getElementById('LeftMenuScpDashboard'));
    api.openRemote(w.nodes[0]);
    assert.equal(w.scpRemoteReturn, 'dashboard');
    api.returnFromRemote();
    assert.equal(panel.hidden, false);
    assert.ok(!panel.classList.contains('scp-dash-remote-mode'), 'back on the dashboard');
    assert.ok(doc.querySelector('.scp-dash-tabs'));
    // opened some other way (a device's own page): the Remote page is where to go back to
    w.scpRemoteReturn = null;
    api.hide();
    api.returnFromRemote();
    assert.equal(panel.hidden, false);
    assert.ok(panel.classList.contains('scp-dash-remote-mode'));
});

// "Fix printing" used to live only on the /m page. With that page retired it sits on each
// computer's card on the Remote page, and goes through the same server endpoint, which checks
// the account's right to run commands on that computer and records who pressed it.
test('Fix printing is on the card of a computer that is on, and reports what happened', async (t) => {
    const { w, doc, api } = setup(t);
    const posts = [];
    w.fetch = (url, opts) => { posts.push({ url, opts }); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, before: 4, after: 0, spooler: 'Running' }) }); };
    w.domainUrl = '/';
    api.show();
    click(w, doc.getElementById('LeftMenuScpRemote'));
    const row = () => rows(doc).find(r => r.querySelector('strong').textContent === 'ER-NURSE-1');
    const off = rows(doc).find(r => r.querySelector('strong').textContent === 'RX-COUNTER');
    assert.equal(off.querySelector('.scp-remote-fix').disabled, true, 'not offered on a computer that is off');
    click(w, row().querySelector('.scp-remote-fix'));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, '/m-fix');
    assert.equal(posts[0].opts.method, 'POST');
    assert.equal(posts[0].opts.headers['X-SCP-Request'], '1');
    assert.deepEqual(JSON.parse(posts[0].opts.body), { nodeid: 'node//1', action: 'printer' });
    assert.equal(row().querySelector('.scp-remote-fix').disabled, true, 'not pressed twice while it runs');
    await new Promise(r => setTimeout(r, 10));
    assert.match(row().querySelector('.scp-remote-fix-note').textContent, /แก้แล้ว.*4.*0.*Running/);
    assert.equal(row().querySelector('.scp-remote-fix').disabled, false);
});

test('Fix printing asks first, and says so when the server refuses', async (t) => {
    const { w, doc, api } = setup(t);
    let posts = 0;
    w.fetch = () => { posts++; return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: 'ACCESS_DENIED' }) }); };
    api.show();
    click(w, doc.getElementById('LeftMenuScpRemote'));
    const row = () => rows(doc).find(r => r.querySelector('strong').textContent === 'ER-NURSE-1');
    w.confirm = () => false;
    click(w, row().querySelector('.scp-remote-fix'));
    assert.equal(posts, 0, 'cancelled: nothing is sent');
    w.confirm = () => true;
    click(w, row().querySelector('.scp-remote-fix'));
    await new Promise(r => setTimeout(r, 10));
    assert.match(row().querySelector('.scp-remote-fix-note').textContent, /ไม่มีสิทธิ์/);
});

test('arriving with scppage=remote opens the Remote page first', (t) => {
    const dom = new JSDOM('<html lang="th"><body><div id=page_leftbar><div id=LeftMenuMyDevices class=lbbutton></div></div><div id=p1></div></body></html>', { url: 'https://hospital.example/?m=0&scppage=remote', runScripts: 'outside-only' });
    const w = dom.window;
    w.alert = () => {}; w.meshserver = { send() {}, onMessage() {} }; w.serverinfo = { consent: 8 };
    w.meshes = { 'mesh//er': { _id: 'mesh//er', name: 'ER', mtype: 2 } };
    w.nodes = [{ _id: 'node//1', name: 'ER-NURSE-1', conn: 1, meshid: 'mesh//er', users: [] }];
    w.setInterval = () => 1; w.clearInterval = () => {};
    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    t.after(() => w.close());
    w.ScpDashboard.show();
    assert.ok(w.document.getElementById('scpDashboard').classList.contains('scp-dash-remote-mode'));
    assert.equal(w.document.querySelectorAll('.scp-remote-row').length, 1);
});

test('on a phone the Remote page fits the screen instead of running off its right edge', (t) => {
    // The site's body carries min-width:495px, wider than a phone, so the third column of cards
    // and the header were cut off. While the Remote page is showing that minimum is lifted.
    const { w, doc, api } = setup(t);
    api.show();
    click(w, doc.getElementById('LeftMenuScpRemote'));
    assert.ok(doc.body.classList.contains('scp-remote-page'));
    click(w, doc.getElementById('LeftMenuScpDashboard'));
    assert.ok(!doc.body.classList.contains('scp-remote-page'));
    click(w, doc.getElementById('LeftMenuScpRemote'));
    api.hide();
    assert.ok(!doc.body.classList.contains('scp-remote-page'), 'and it is put back when the page is left');
    const css = fs.readFileSync(path.join(__dirname, '../../public/styles/scp-dashboard.css'), 'utf8');
    assert.match(css, /@media \(max-width: 700px\) \{[^@]*body\.scp-remote-page \{ min-width: 0 !important; \}/);
    assert.match(css, /@media \(max-width: 700px\) \{[^@]*\.scp-remote-list \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'two cards across');
});
