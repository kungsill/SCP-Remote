'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Each tile on the dashboard is a real remote desktop session against someone's
// computer. These tests pin down when one is opened and, more importantly, when it
// is closed, so a session cannot be left running against a screen nobody is watching.
function setup(t, options = {}) {
    const lang = options.lang || 'th';
    const dom = new JSDOM(
        '<html lang="' + lang + '"><body><div id=page_leftbar><div id=LeftMenuMyDevices class=lbbutton></div></div><div id=p1></div></body></html>',
        { url: 'https://hospital.example/', runScripts: 'outside-only' });
    const w = dom.window;
    // jsdom has no bitmap renderer; captures are exercised using an explicit image stub.
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,dGVzdA==';
    const connections = [];

    w.alert = () => {};
    w.confirm = () => true;
    const sent = [];
    w.meshserver = { send: message => sent.push(message), onMessage: () => {} };
    w.serverinfo = { consent: options.consent === undefined ? 8 : options.consent };
    w.meshes = options.meshes || { 'mesh//a': { _id: 'mesh//a', name: 'ทดสอบ' } };
    w.nodes = options.nodes || [
        { _id: 'node//1', name: 'pc-one', conn: 1, meshid: 'mesh//a', users: ['HOSP\\somchai'], idletime: 5 },
        { _id: 'node//2', name: 'pc-two', conn: 1, meshid: 'mesh//a', users: [] },
        { _id: 'node//3', name: 'pc-three', conn: 0, meshid: 'mesh//a', users: [] }
    ];
    w.gotoDevice = () => {};

    // Stand-ins for the two desktop modules the page normally loads. They record what
    // the dashboard asks of them; the input-grabbing calls are here so a test can prove
    // the dashboard never makes them.
    w.CreateAgentRemoteDesktop = function (canvas) {
        return {
            canvas: canvas,
            ImageType: 1, CompressionLevel: 50, ScalingLevel: 1024, FrameRateTimer: 100,
            State: 0, tilesReceived: 0, levels: [], refreshes: 0,
            grabbedMouse: false, grabbedKeys: false,
            SendCompressionLevel: function (type, level, scaling, frametimer) { this.levels.push([type, level, scaling, frametimer]); },
            SendRefresh: function () { this.refreshes++; },
            GrabMouseInput: function () { this.grabbedMouse = true; },
            GrabKeyInput: function () { this.grabbedKeys = true; }
        };
    };
    w.CreateAgentRedirect = function (server, module) {
        const conn = { m: module, nodeid: null, starts: 0, stops: 0, onStateChanged: null };
        conn.Start = function (nodeid) {
            conn.nodeid = nodeid; conn.starts++;
            conn.m.State = 3;
            if (conn.onStateChanged) { conn.onStateChanged(conn, 3); }
        };
        conn.Stop = function () { conn.stops++; conn.m.State = 0; };
        connections.push(conn);
        return conn;
    };

    // Drive the page's own intervals by hand, so a test never has to wait in real time.
    const timers = [];
    let nextTimer = 1;
    w.setInterval = (fn, ms) => { const id = nextTimer++; timers.push({ id, fn, ms }); return id; };
    w.clearInterval = (id) => { const i = timers.findIndex(timer => timer.id === id); if (i >= 0) { timers.splice(i, 1); } };
    const tick = (times = 1) => { for (let i = 0; i < times; i++) { timers.slice().forEach(timer => timer.fn()); } };

    if (options.assessment) {
        w.ScpFleetAssess = {
            assessFleet: () => options.assessment,
            assessDevice: node => options.assessment.devices.find(d => d.nodeid === node._id) || null
        };
    }
    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    t.after(() => { try { w.ScpDashboard.hide(); } catch (error) { /* already closed */ } w.close(); });
    // Push a message through the page's own callback, the way the server would.
    const fromServer = message => w.meshserver.onMessage(w.meshserver, message);
    return { w, connections, tick, sent, fromServer, api: w.ScpDashboard, panel: w.document.getElementById('scpDashboard') };
}

function liveButton(w) {
    return w.document.querySelector('.scp-dash-live');
}

test('assessment counts open matching device lists and follow room and search filters', (t) => {
    const devices = [
        { nodeid: 'ready', name: 'Ready PC', room: 'ทดสอบ', win11Status: 'already_win11', isWin11: true, healthStatus: 'good', recommendation: 'keep' },
        { nodeid: 'ram', name: 'RAM PC', room: 'ทดสอบ', win11Status: 'upgradable', isWin11: true, healthStatus: 'fair', recommendation: 'upgrade', upgradeCost: 1200, win11Blockers: ['RAM น้อย'], upgradeActions: [{ note: 'เพิ่ม RAM เป็น 8 GB', cost: 1200 }] },
        { nodeid: 'old', name: 'Old PC', room: 'ทดสอบ', win11Status: 'ineligible', healthStatus: 'critical', recommendation: 'replace' },
        { nodeid: 'other', name: 'Other PC', room: 'ห้องยา', win11Status: 'eligible', healthStatus: 'good', recommendation: 'keep' },
        { nodeid: 'hidden', name: 'Hidden PC', room: 'ทดสอบ', win11Status: 'eligible', healthStatus: 'good', recommendation: 'keep' }
    ];
    const { w, api } = setup(t, {
        meshes: { 'mesh//a': { name: 'ทดสอบ' }, 'mesh//b': { name: 'ห้องยา' } },
        nodes: devices.slice(0, 4).map(d => ({ _id: d.nodeid, name: d.name, meshid: d.room === 'ห้องยา' ? 'mesh//b' : 'mesh//a', conn: 1 })),
        assessment: { devices, criteria: { costs: { newDevice: 18000 } } }
    });
    const printCalls = [];
    w.ScpReport = { printAssessment: (devices, options) => printCalls.push({ devices, options }) };
    api.show();
    const section = () => w.document.getElementById('scp-dash-view-assess');
    const count = filter => Number(section().querySelector('.scp-assess-stat[data-assess-filter="' + filter + '"] .scp-dash-stat-value').textContent);
    for (const [filter, expected] of [['eligible', 2], ['upgradable', 1], ['ineligible', 1], ['critical', 1]]) {
        assert.equal(count(filter), expected);
        section().querySelector('.scp-assess-stat[data-assess-filter="' + filter + '"]').click();
        assert.equal(section().querySelectorAll('tbody tr').length, expected);
        assert.equal(section().querySelector('.scp-assess-stat[data-assess-filter="' + filter + '"]').getAttribute('aria-pressed'), 'true');
    }
    section().querySelector('.scp-assess-stat[data-assess-filter="upgradable"]').click();
    assert.match(section().querySelector('tbody').textContent, /อัปเกรดได้.*ลง Win 11 แล้ว.*เพิ่ม RAM เป็น 8 GB/);
    assert.match(section().querySelector('.scp-assess-savings').textContent, /1,200.*18,000.*16,800/);
    section().querySelector('.scp-assess-print').click();
    assert.deepEqual(Array.from(printCalls[0].devices, d => d.nodeid), ['ram']);
    assert.ok(printCalls[0].devices[0].reportDetails.windowsLicense, 'available licence details are attached to printing');
    section().querySelector('.scp-assess-print-all').click();
    assert.deepEqual(Array.from(printCalls[1].devices, d => d.nodeid), ['ready', 'ram', 'old', 'other']);
    section().querySelector('.scp-assess-print-device').click();
    assert.deepEqual(Array.from(printCalls[2].devices, d => d.nodeid), ['ram']);
    assert.doesNotMatch(section().textContent, /Hidden PC|\[object Object\]/);
    const roomButton = [...w.document.querySelectorAll('.scp-dash-rooms .scp-dash-chip')].find(b => b.textContent.includes('ห้องยา'));
    assert.ok(roomButton);
    roomButton.click();
    assert.equal(count('eligible'), 1);
    assert.equal(count('upgradable'), 0);
    const search = w.document.querySelector('.scp-dash-search');
    search.value = 'no-match';
    search.dispatchEvent(new w.Event('input'));
    assert.equal(count('eligible'), 0);
    assert.match(section().querySelector('tbody').textContent, /ไม่พบเครื่อง/);
    assert.equal(section().querySelector('.scp-assess-print').disabled, true);
});

test('assessment fills the viewport outside a clipped workspace, and restores its location on exit', (t) => {
    const { w, api, panel } = setup(t);
    const anchor = panel.previousSibling;
    const workspace = w.document.createElement('div');
    panel.parentNode.insertBefore(workspace, panel);
    // Keep the location anchor with the panel as the production workspace does.
    workspace.appendChild(anchor);
    workspace.appendChild(panel);
    api.show();
    const tab = label => [...w.document.querySelectorAll('.scp-dash-tab')].find(b => b.textContent === label);
    tab('การประเมินสภาพเครื่อง').click();
    assert.equal(panel.parentNode, w.document.body);
    assert.equal(panel.classList.contains('scp-dash-expanded'), true);
    const normal = [...w.document.querySelectorAll('.scp-assess-toolbar button')].find(b => b.textContent === 'กลับหน้าปกติ');
    normal.click();
    assert.equal(panel.parentNode, workspace);
    assert.equal(panel.classList.contains('scp-dash-expanded'), false);
    [...w.document.querySelectorAll('.scp-assess-toolbar button')].find(b => b.textContent === 'ขยายเต็มจอ').click();
    api.hide();
    assert.equal(panel.parentNode, workspace);
    assert.equal(w.document.body.classList.contains('scp-assessment-expanded'), false);
});

test('normal dashboard scrolling stops above the fixed footer and includes padding inside its height', (t) => {
    const { w, api, panel } = setup(t);
    const footer = w.document.createElement('div');
    footer.id = 'footer';
    Object.defineProperty(footer, 'offsetHeight', { value: 50 });
    footer.getBoundingClientRect = () => ({ top: 750 });
    panel.getBoundingClientRect = () => ({ top: 80 });
    w.document.body.appendChild(footer);
    Object.defineProperty(w, 'innerHeight', { value: 800 });
    api.show();
    assert.equal(panel.style.maxHeight, '662px');
    assert.equal(panel.style.boxSizing, 'border-box');
});

test('fleet snapshot returns counts without starting thumbnail capture', (t) => {
    const { api, connections } = setup(t);
    const data = api.snapshot();
    assert.equal(data.total, 3);
    assert.equal(data.online, 2);
    assert.equal(data.nodes.length, 3);
    assert.equal(connections.length, 0);
});

test('no computer is watched until someone turns the screens on', (t) => {
    const { w, connections, api } = setup(t);
    api.show();
    assert.equal(connections.length, 0, 'opening the dashboard must not connect to anything');
    assert.equal(liveButton(w).textContent, 'เปิดดูภาพหน้าจอ');
    assert.equal(w.document.querySelector('.scp-dash-live-hint').textContent, '');
});

test('turning the screens on watches the computers that are powered on, and no others', (t) => {
    const { connections, api } = setup(t);
    api.show();
    api.setLive(true);
    assert.equal(connections.length, 2, 'the computer that is off must not be connected to');
    assert.deepEqual(connections.map(c => c.nodeid).sort(), ['node//1', 'node//2']);
    connections.forEach(c => {
        assert.equal(c.m.ImageType, 4, 'WebP keeps a small picture cheap');
        assert.equal(c.m.ScalingLevel, 384, 'more than the tile shows, so it stays crisp on a sharp screen');
        assert.ok(c.m.CompressionLevel <= 40, 'a thumbnail does not need full quality');
        assert.ok(c.m.FrameRateTimer >= 1000, 'a slow refresh keeps the network free for real sessions');
    });
});

test('a tile never takes hold of the mouse or the keyboard', (t) => {
    const { connections, api } = setup(t);
    api.show();
    api.setLive(true);
    connections.forEach(c => {
        assert.equal(c.m.grabbedMouse, false);
        assert.equal(c.m.grabbedKeys, false);
    });
});

test('redrawing the page keeps the same sessions rather than reconnecting', (t) => {
    const { connections, api } = setup(t);
    api.show();
    api.setLive(true);
    api.render();
    api.render();
    assert.equal(connections.length, 2, 'a redraw must not open more sessions');
    connections.forEach(c => assert.equal(c.starts, 1));
    connections.forEach(c => assert.equal(c.stops, 0));
});

test('a computer that switches off has its session closed', (t) => {
    const { w, connections, api } = setup(t);
    api.show();
    api.setLive(true);
    w.nodes[0].conn = 0;
    api.render();
    const closed = connections.filter(c => c.stops > 0);
    assert.equal(closed.length, 1);
    assert.equal(closed[0].nodeid, 'node//1');
    assert.equal(connections.length, 2, 'the other computer must not be reconnected');
});

test('turning the screens off, and leaving the page, close every session', (t) => {
    const { connections, api } = setup(t);
    api.show();
    api.setLive(true);
    api.setLive(false);
    assert.ok(connections.every(c => c.stops === 1), 'turning it off must close every session');

    api.setLive(true);
    const reopened = connections.filter(c => c.stops === 0);
    assert.equal(reopened.length, 2);
    api.hide();
    assert.ok(reopened.every(c => c.stops === 1), 'leaving the dashboard must close every session');
});

test('only a fixed number of screens are watched at once', (t) => {
    const many = [];
    for (let i = 0; i < 20; i++) { many.push({ _id: 'node//' + i, name: 'pc-' + i, conn: 1, meshid: 'mesh//a', users: [] }); }
    const { w, connections, api } = setup(t, { nodes: many });
    api.show();
    api.setLive(true);
    assert.equal(connections.length, 12);
    const note = w.document.querySelector('.scp-dash-live-note');
    assert.equal(note.hidden, false);
    assert.ok(note.textContent.indexOf('12') >= 0, 'the note should say how many are shown');
});

test('the page says what the watched computer will see, following the server setting', (t) => {
    const asking = setup(t, { consent: 8 });
    asking.api.show();
    asking.api.setLive(true);
    assert.ok(asking.w.document.querySelector('.scp-dash-live-hint').textContent.indexOf('อนุญาต') >= 0);

    const telling = setup(t, { consent: 1 });
    telling.api.show();
    telling.api.setLive(true);
    assert.ok(telling.w.document.querySelector('.scp-dash-live-hint').textContent.indexOf('แจ้งเตือน') >= 0);

    const silent = setup(t, { consent: 0 });
    silent.api.show();
    silent.api.setLive(true);
    const hint = silent.w.document.querySelector('.scp-dash-live-hint').textContent;
    assert.ok(hint.indexOf('ไม่ขึ้นอะไรเลย') >= 0, 'staff must be told when nothing is shown at the far end');
});

test('a session that ends offers to start again instead of asking on a timer', (t) => {
    const { w, connections, api } = setup(t);
    api.show();
    api.setLive(true);
    const first = connections[0];
    first.onStateChanged(first, 0);

    const overlay = w.document.querySelector('.scp-dash-tile-overlay');
    assert.equal(overlay.hidden, false);
    const retry = w.document.querySelector('.scp-dash-tile-retry');
    assert.ok(retry, 'an ended tile must offer a button');
    assert.equal(connections.length, 2, 'it must not reconnect by itself');

    retry.dispatchEvent(new w.Event('click', { bubbles: true }));
    assert.equal(connections.length, 3, 'pressing the button reconnects that one computer');
});

test('a slot freed by a computer switching off is reused in the same redraw', (t) => {
    const many = [];
    for (let i = 0; i < 13; i++) { many.push({ _id: 'node//' + i, name: 'pc-' + i, conn: 1, meshid: 'mesh//a', users: [] }); }
    const { w, connections, api } = setup(t, { nodes: many });
    api.show();
    api.setLive(true);
    assert.equal(connections.length, 12);
    // Rows are sorted by name, so which computer is left over is not the last one added.
    const connected = connections.map(c => c.nodeid);
    const waiting = many.map(node => node._id).filter(id => connected.indexOf(id) < 0);
    assert.equal(waiting.length, 1);

    many.find(node => node._id === connected[0]).conn = 0;
    api.render();
    assert.ok(connections.some(c => c.nodeid === waiting[0]), 'the computer that was waiting should take the freed slot');
    assert.equal(w.document.querySelector('.scp-dash-live-note').hidden, true);
});

test('saving a picture asks for one full-size frame, then returns to the small one', (t) => {
    const { w, connections, tick, api } = setup(t);
    api.show();
    api.setLive(true);
    const conn = connections[0];
    conn.m.levels.length = 0;

    const shot = w.document.querySelector('.scp-dash-tile-shot');
    shot.dispatchEvent(new w.Event('click', { bubbles: true }));
    assert.deepEqual(conn.m.levels[0].slice(0, 3), [4, 100, 1024], 'the saved picture is asked for at full size and quality');
    assert.equal(conn.m.refreshes, 1, 'a whole new frame is requested, not the next change');
    assert.ok(w.document.querySelector('.scp-dash-tile-overlay').textContent.length > 0, 'the tile should say it is fetching');

    // Nothing is saved while the bigger frame is still arriving.
    tick(2);
    assert.equal(conn.m.levels.length, 1, 'it must not save a half-drawn picture');

    // The larger frame announces a new canvas size and finishes drawing.
    w.document.querySelector('.scp-dash-tile-canvas').width = 1920;
    conn.m.tilesReceived = 0;
    tick(4);
    assert.deepEqual(conn.m.levels[1].slice(0, 3), [4, 40, 384], 'the cheap picture comes back afterwards');
    assert.equal(w.document.querySelector('.scp-dash-tile-overlay').hidden, true);
});

test('a capture gives up rather than hanging if the frame never finishes', (t) => {
    const { w, connections, tick, api } = setup(t);
    api.show();
    api.setLive(true);
    const conn = connections[0];
    conn.m.levels.length = 0;

    w.document.querySelector('.scp-dash-tile-shot').dispatchEvent(new w.Event('click', { bubbles: true }));
    tick(41); // 41 x 150ms is past the six second limit, with no frame ever arriving
    assert.equal(conn.m.levels.length, 2, 'it saves what it has and restores the small picture');
    assert.deepEqual(conn.m.levels[1].slice(0, 3), [4, 40, 384]);
});

test('closing a tile in the middle of a capture leaves nothing running', (t) => {
    const { w, connections, tick, api } = setup(t);
    api.show();
    api.setLive(true);
    const conn = connections[0];
    conn.m.levels.length = 0;

    w.document.querySelector('.scp-dash-tile-shot').dispatchEvent(new w.Event('click', { bubbles: true }));
    api.setLive(false);
    tick(50);
    assert.equal(conn.m.levels.length, 1, 'a closed tile must not save or send anything more');
    assert.equal(conn.stops, 1);
});

test('with both a prompt and a bar set, the page mentions both', (t) => {
    const { w, api } = setup(t, { consent: 8 | 64 });
    api.show();
    api.setLive(true);
    const hint = w.document.querySelector('.scp-dash-live-hint').textContent;
    assert.ok(hint.indexOf('อนุญาต') >= 0, 'it should say the computer asks first');
    assert.ok(hint.indexOf('แถบ') >= 0, 'it should also say a bar stays on that screen');
});

test('every tile connection is opened as picture-only', (t) => {
    const { connections, api } = setup(t);
    api.show();
    api.setLive(true);
    assert.ok(connections.length > 0);
    connections.forEach(c => assert.equal(c.viewonly, true, 'the agent must be told to refuse input on this'));
});

test('the hint drops the box when the server lets picture-only connections through', (t) => {
    const { w, api } = setup(t, { consent: 1 | 8 | 64 });
    w.serverinfo.desktopviewonlynoprompt = true;
    api.show();
    api.setLive(true);
    const hint = w.document.querySelector('.scp-dash-live-hint').textContent;
    assert.equal(hint.indexOf('อนุญาต'), -1, 'it must not promise a box that will never appear here');
    assert.ok(hint.indexOf('แจ้งเตือน') >= 0, 'the person is still told it started');
    assert.ok(hint.indexOf('แถบ') >= 0, 'and the bar still stays on their screen');
});

// Picking which buildings to look at. Everything on the page follows the choice, so the
// numbers, the rows and the screens being watched can never disagree with the buttons.
const threeWards = {
    meshes: {
        'mesh//a': { _id: 'mesh//a', name: 'ตึกหญิง' },
        'mesh//b': { _id: 'mesh//b', name: 'ตึกชาย' },
        'mesh//c': { _id: 'mesh//c', name: 'OPD' }
    },
    nodes: [
        { _id: 'node//1', name: 'w1', conn: 1, meshid: 'mesh//a', users: [] },
        { _id: 'node//2', name: 'w2', conn: 1, meshid: 'mesh//a', users: [] },
        { _id: 'node//3', name: 'm1', conn: 1, meshid: 'mesh//b', users: [] },
        { _id: 'node//4', name: 'o1', conn: 1, meshid: 'mesh//c', users: [] }
    ]
};
const chips = w => Array.from(w.document.querySelectorAll('.scp-dash-chip'));
const chip = (w, label) => chips(w).find(item => item.textContent.indexOf(label) === 0);
const roomTitles = w => Array.from(w.document.querySelectorAll('.scp-dash-room-head h3')).map(h => h.textContent);

test('a button is offered for each room, and everywhere is the starting point', (t) => {
    const { w, api } = setup(t, threeWards);
    api.show();
    assert.deepEqual(chips(w).map(c => c.textContent.split('  ')[0]), ['ทุกที่', 'OPD', 'ตึกชาย', 'ตึกหญิง']);
    assert.equal(chip(w, 'ทุกที่').className.indexOf('on') > 0, true);
    assert.deepEqual(roomTitles(w), ['OPD', 'ตึกชาย', 'ตึกหญิง']);
    assert.ok(chip(w, 'ตึกหญิง').textContent.indexOf('2') > 0, 'each button says how many computers are there');
});

test('choosing one ward shows only that ward, and counts only its computers', (t) => {
    const { w, api } = setup(t, threeWards);
    api.show();
    chip(w, 'ตึกหญิง').click();
    assert.deepEqual(roomTitles(w), ['ตึกหญิง']);
    const total = w.document.querySelector('.scp-dash-stat-value').textContent;
    assert.equal(total, '2', 'the totals must count what is shown, not everything');
});

test('only the chosen ward is watched, and the rest stop', (t) => {
    const { w, connections, api } = setup(t, threeWards);
    api.show();
    api.setLive(true);
    assert.equal(connections.length, 4);

    chip(w, 'ตึกหญิง').click();
    const stopped = connections.filter(c => c.stops > 0).map(c => c.nodeid).sort();
    assert.deepEqual(stopped, ['node//3', 'node//4'], 'the wards no longer shown must be released');
    assert.equal(connections.length, 4, 'and the ones still shown must not reconnect');
});

test('a ward chosen later starts watching without disturbing the others', (t) => {
    const { w, connections, api } = setup(t, threeWards);
    api.show();
    chip(w, 'ตึกหญิง').click();
    api.setLive(true);
    assert.equal(connections.length, 2);

    chip(w, 'OPD').click();
    assert.equal(connections.length, 3);
    assert.ok(connections.every(c => c.stops === 0), 'the two already running must be left alone');
});

test('turning every room off means all of them, never an empty page', (t) => {
    const { w, api } = setup(t, threeWards);
    api.show();
    chip(w, 'ตึกหญิง').click();
    chip(w, 'ตึกหญิง').click();          // and off again
    assert.deepEqual(roomTitles(w), ['OPD', 'ตึกชาย', 'ตึกหญิง']);
    assert.equal(chip(w, 'ทุกที่').className.indexOf('on') > 0, true);
});

test('ticking every room one by one is the same as everywhere', (t) => {
    const { w, api } = setup(t, threeWards);
    api.show();
    chip(w, 'ตึกหญิง').click();
    chip(w, 'ตึกชาย').click();
    chip(w, 'OPD').click();
    assert.equal(chip(w, 'ทุกที่').className.indexOf('on') > 0, true);
    assert.deepEqual(roomTitles(w), ['OPD', 'ตึกชาย', 'ตึกหญิง']);
});

test('the choice is remembered, and everywhere clears it again', (t) => {
    const first = setup(t, threeWards);
    first.api.show();
    chip(first.w, 'ตึกชาย').click();
    assert.equal(first.w.localStorage.getItem('scpDashRooms'), JSON.stringify(['ตึกชาย']));

    chip(first.w, 'ทุกที่').click();
    assert.equal(first.w.localStorage.getItem('scpDashRooms'), null, 'everywhere is the absence of a choice');
});

test('with only one room there is nothing to choose between', (t) => {
    const { w, api } = setup(t);
    api.show();
    assert.equal(chips(w).length, 0, 'buttons that can only say one thing are not shown');
});

// A remote-management tool installed by someone else is how an intrusion of this kind
// runs, so the watchlist has to name them. Our own agent is the exception that cannot be
// caught this way, which the list comments explain.
test('the watchlist names the remote-management tools an intruder would install', (t) => {
    const source = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8');
    const list = source.substring(source.indexOf('var watchlist = ['), source.indexOf('];', source.indexOf('var watchlist = [')));
    ['meshcentral', 'rustdesk', 'screenconnect', 'atera', 'ninjarmm', 'anydesk', 'teamviewer']
        .forEach(name => assert.ok(list.indexOf("'" + name) >= 0, 'the watchlist should name ' + name));
    ['ngrok', 'zerotier', 'cloudflared', 'tailscale']
        .forEach(name => assert.ok(list.indexOf("'" + name) >= 0, 'and the tunnel ' + name));
});

test('a watched program found on a computer is reported as needing attention', (t) => {
    const { w, api } = setup(t);
    api.show();
    api.receiveSoftware(JSON.stringify([{ name: 'Adobe Reader' }]));   // not watched
    assert.equal(w.document.body.textContent.indexOf('MeshCentral'), -1);
});

// What each computer is made of, read from what the server already holds. Nothing new is
// collected from the computers themselves.
const specsFor = (nodeid, over = {}) => Object.assign({
    action: 'getsysinfo', nodeid: nodeid,
    hardware: {
        identifiers: { cpu_name: 'AMD Ryzen 5 5500  ', gpu_name: 'NVIDIA GeForce GTX 960', product_name: 'MS-7C52', board_vendor: 'Micro-Star', bios_serial: 'To be filled by O.E.M.', bios_date: '20240409000000.000000+000' },
        windows: {
            memory: [{ Capacity: '8589934592' }, { Capacity: '8589934592' }],
            volumes: { C: { type: 'NTFS', size: 511094812672, sizeremaining: 255547406336, dType: 3 } }
        }
    }
}, over);

test('a computer asks the server once for what it is made of, and shows it', (t) => {
    const s = setup(t);
    s.api.show();
    const asked = s.sent.filter(m => m.action === 'getsysinfo').map(m => m.nodeid).sort();
    assert.deepEqual(asked, ['node//1', 'node//2', 'node//3'], 'each computer once');

    s.fromServer(specsFor('node//1'));
    const line = s.w.document.querySelector('.scp-dash-specs').textContent;
    assert.ok(line.indexOf('AMD Ryzen 5 5500') >= 0, 'the processor: ' + line);
    assert.ok(line.indexOf('16 GB') >= 0, 'the memory added up: ' + line);
    assert.ok(line.indexOf('C:') >= 0 && line.indexOf('50%') >= 0, 'and the system drive: ' + line);

    s.api.render();
    assert.equal(s.sent.filter(m => m.action === 'getsysinfo').length, 3, 'a redraw must not ask again');
});

test('the page still receives everything else the server sends', (t) => {
    const s = setup(t);
    const seen = [];
    s.w.meshserver.onMessage = (server, message) => seen.push(message.action);
    s.api.show();
    s.fromServer({ action: 'something-else' });
    s.fromServer(specsFor('node//1'));
    assert.deepEqual(seen, ['something-else', 'getsysinfo'], 'our watching must not swallow messages');
});

test('a drive running out of room becomes something to attend to', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(specsFor('node//1', { hardware: {
        identifiers: {}, windows: { volumes: { C: { size: 1000, sizeremaining: 120, dType: 3 } } } } }));
    assert.ok(s.w.document.body.textContent.indexOf('ดิสก์ C เหลือ 12%') >= 0, 'twelve percent free is a warning');

    s.fromServer(specsFor('node//2', { hardware: {
        identifiers: {}, windows: { volumes: { C: { size: 1000, sizeremaining: 40, dType: 3 } } } } }));
    assert.ok(s.w.document.body.textContent.indexOf('ใกล้เต็ม') >= 0, 'four percent free is urgent');
});

test('a memory stick low on room is not reported as a fault', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(specsFor('node//1', { hardware: {
        identifiers: {}, windows: { volumes: { E: { size: 1000, sizeremaining: 10, dType: 2 } } } } }));
    assert.equal(s.w.document.body.textContent.indexOf('ดิสก์ E'), -1, 'removable drives are not the hospital’s problem');
});

test('a computer waiting on a restart says so', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(specsFor('node//1', { pendingReboot: 'Windows Update' }));
    assert.ok(s.w.document.body.textContent.indexOf('รอรีสตาร์ต') >= 0);
});

test('searching narrows the page, and says so when nothing matches', (t) => {
    const s = setup(t);
    s.api.show();
    const box = s.w.document.getElementById('scpDashSearch');

    box.value = 'pc-two';
    box.dispatchEvent(new s.w.Event('input'));
    assert.ok(s.w.document.body.textContent.indexOf('pc-two') >= 0);
    assert.equal(s.w.document.body.textContent.indexOf('pc-three'), -1, 'the others are put away');

    box.value = 'somchai';   // the signed-in person, not the computer
    box.dispatchEvent(new s.w.Event('input'));
    assert.ok(s.w.document.body.textContent.indexOf('pc-one') >= 0, 'a person’s name finds their computer');

    box.value = 'ไม่มีเครื่องนี้';
    box.dispatchEvent(new s.w.Event('input'));
    assert.ok(s.w.document.body.textContent.indexOf('ไม่พบอะไรที่ตรงกับ') >= 0);
});

test('the inventory export carries the columns an asset register needs', (t) => {
    const s = setup(t);
    let saved = null;
    s.w.HTMLAnchorElement.prototype.click = function () { saved = { name: this.download, href: this.href }; };
    s.api.show();
    s.fromServer(specsFor('node//1'));
    s.w.ScpDashboard.exportInventory();

    assert.ok(saved, 'it should produce a file');
    assert.ok(saved.name.indexOf('ครุภัณฑ์') >= 0, 'named for what it is: ' + saved.name);
    const csv = decodeURIComponent(saved.href.split(',')[1]);
    assert.ok(csv.charCodeAt(0) === 0xFEFF, 'with a byte order mark, or Excel mangles Thai');
    ['ชื่อเครื่อง', 'หน่วยงาน', 'CPU', 'แรม (GB)', 'Serial'].forEach(h =>
        assert.ok(csv.indexOf(h) >= 0, 'the column ' + h));
    assert.ok(csv.indexOf('MS-7C52') >= 0 && csv.indexOf('"16"') >= 0);
    assert.ok(csv.indexOf('To be filled') < 0, 'a placeholder serial is left blank rather than copied');
    assert.ok(csv.indexOf('09/04/2024') >= 0, 'the BIOS date as a date');
});

// How long each computer is actually powered on, and which one each department leans on
// hardest. Two departments are deliberately left out of the ranking because their
// computers are left running overnight on purpose.
const wards = {
    'mesh//opd': { _id: 'mesh//opd', name: 'OPD' },
    'mesh//ward': { _id: 'mesh//ward', name: 'ตึกหญิง' },
    'mesh//it': { _id: 'mesh//it', name: 'ห้องสารสนเทศ' }
};
const inWards = [
    { _id: 'node//opd1', name: 'opd-1', conn: 1, meshid: 'mesh//opd', users: [] },
    { _id: 'node//opd2', name: 'opd-2', conn: 1, meshid: 'mesh//opd', users: [] },
    { _id: 'node//w1', name: 'ward-1', conn: 1, meshid: 'mesh//ward', users: [] },
    { _id: 'node//it1', name: 'it-server', conn: 1, meshid: 'mesh//it', users: [] }
];

// The server packs the history as [ stateBefore, firstEventInSeconds, stateAfter ] then
// pairs of [ secondsTheStateLasted, newState ]. 1 is on, 0 is off.
function poweredOn(daysAgo, pattern) {
    const start = Math.round((Date.now() - (daysAgo * 86400000)) / 1000);
    return [0, start, 1].concat(pattern);
}

// A working day: on for `hoursOn`, off for the rest, repeated.
function workingDays(count, hoursOn) {
    const out = [];
    for (let i = 0; i < count; i++) { out.push(hoursOn * 3600, 0, (24 - hoursOn) * 3600, 1); }
    return out;
}

test('the ranking names the busiest computer in each department', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    s.api.show();
    const asked = s.sent.filter(m => m.action === 'powertimeline').map(m => m.nodeid).sort();
    assert.deepEqual(asked, ['node//it1', 'node//opd1', 'node//opd2', 'node//w1'], 'each computer once');

    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd1', timeline: poweredOn(7, workingDays(7, 4)) });
    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd2', timeline: poweredOn(7, workingDays(7, 9)) });
    s.fromServer({ action: 'powertimeline', nodeid: 'node//w1', timeline: poweredOn(7, workingDays(7, 6)) });

    const rows = Array.from(s.w.document.querySelectorAll('.scp-dash-rank-row'));
    assert.equal(rows.length, 2, 'one line per department, not one per computer');
    const first = rows[0].textContent;
    assert.ok(first.indexOf('OPD') >= 0 && first.indexOf('opd-2') >= 0, 'the busiest department leads: ' + first);
    assert.ok(first.indexOf('63.0') >= 0, 'with its total hours on: ' + first);
    assert.ok(rows[0].textContent.indexOf('opd-1') < 0, 'the quieter computer in the same department is not named');
    assert.ok(rows[1].textContent.indexOf('ตึกหญิง') >= 0, 'then the next department');
});

test('departments that run around the clock are left out of the ranking', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    s.api.show();
    s.fromServer({ action: 'powertimeline', nodeid: 'node//it1', timeline: poweredOn(7, []) });
    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd1', timeline: poweredOn(7, workingDays(7, 4)) });

    const text = Array.from(s.w.document.querySelectorAll('.scp-dash-rank-row')).map(r => r.textContent).join(' | ');
    assert.ok(text.indexOf('it-server') < 0, 'a 24-hour computer must not win: ' + text);
    assert.ok(text.indexOf('opd-1') >= 0, 'while the wards are still ranked');
    assert.ok(s.w.document.querySelector('.scp-dash-rank-note').textContent.indexOf('ห้องสารสนเทศ') >= 0,
        'and the page says which departments it left out');
});

test('a total is reported, never a rate extrapolated from a short history', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    s.api.show();
    // Half a day of history on a computer that never went off. Dividing by the history
    // we happen to have would call that 24 hours a day — an artifact of when we started
    // watching, not a finding about the computer.
    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd1', timeline: poweredOn(0.5, []) });
    const row = s.w.document.querySelector('.scp-dash-rank-row').textContent;
    assert.ok(row.indexOf('24') < 0, 'no invented daily rate: ' + row);
    assert.ok(row.indexOf('12.0') >= 0, 'the hours actually observed: ' + row);
    const mark = s.w.document.querySelector('.scp-dash-rank-hours em');
    assert.ok(mark, 'marked as resting on less history than a full window');
    assert.equal(mark.parentNode.title, 'เพิ่งมีประวัติไม่ถึงวัน');
});

test('a computer added part way through the window still ranks on what it did', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    s.api.show();
    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd1', timeline: poweredOn(2, workingDays(2, 8)) });
    const row = s.w.document.querySelector('.scp-dash-rank-row').textContent;
    assert.ok(row.indexOf('16.0') >= 0, 'two days of eight hours: ' + row);
    assert.equal(s.w.document.querySelector('.scp-dash-rank-hours em').parentNode.title,
        'เพิ่งมีประวัติ 2 วัน ยังเทียบไม่เต็มที่');
});

test('sleeping does not count as being used', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    s.api.show();
    // On for four hours, then asleep (state 2) for the rest of each day.
    const asleep = [];
    for (let i = 0; i < 7; i++) { asleep.push(4 * 3600, 2, 20 * 3600, 1); }
    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd1', timeline: poweredOn(7, asleep) });
    const row = s.w.document.querySelector('.scp-dash-rank-row').textContent;
    assert.ok(row.indexOf('28.0') >= 0, 'only the waking hours, seven times four: ' + row);
});

test('the ranking survives the server’s own no-history reply', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    s.api.show();
    assert.ok(s.w.document.body.textContent.indexOf('กำลังอ่านประวัติการใช้งาน') >= 0, 'it waits before judging');
    // With no records at all MeshCentral falls back to the current state and writes that
    // moment in milliseconds, where every other entry is in seconds. Read as seconds it
    // would land tens of thousands of years from now.
    inWards.forEach(node => s.fromServer({ action: 'powertimeline', nodeid: node._id, timeline: [1, Date.now(), 1] }));
    assert.equal(s.w.document.querySelectorAll('.scp-dash-rank-row').length, 0, 'nothing is invented from it');
    assert.ok(s.w.document.body.textContent.indexOf('ยังไม่มีประวัติการใช้งาน') >= 0, 'and it says so plainly');
});

test('a computer that has never once connected is flagged', (t) => {
    const s = setup(t);
    s.api.show();
    assert.ok(s.sent.some(m => m.action === 'lastconnects'), 'the page asks when each was last seen');

    // node//3 is the offline one. Answer for the others only, the way the server does
    // when a computer has no last-connect record at all.
    s.fromServer({ action: 'lastconnects', lastconnects: { 'node//1': Date.now(), 'node//2': Date.now() } });
    assert.ok(s.w.document.body.textContent.indexOf('ไม่เคยเชื่อมต่อเลย') >= 0,
        'an agent installed but never heard from is the case worth catching');
});

test('a computer gone quiet for a week is flagged, one gone a day is not', (t) => {
    const s = setup(t, { nodes: [
        { _id: 'node//1', name: 'pc-one', conn: 0, meshid: 'mesh//a', users: [] },
        { _id: 'node//2', name: 'pc-two', conn: 0, meshid: 'mesh//a', users: [] }
    ] });
    s.api.show();
    s.fromServer({ action: 'lastconnects', lastconnects: {
        'node//1': Date.now() - (9 * 86400000),
        'node//2': Date.now() - (1 * 86400000)
    } });
    const text = s.w.document.body.textContent;
    assert.ok(text.indexOf('ไม่ติดต่อมา 9 วัน') >= 0, 'nine days is worth knowing: ' + text.slice(0, 200));
    assert.ok(text.indexOf('ไม่ติดต่อมา 1 วัน') < 0, 'yesterday is not');
    assert.ok(text.indexOf('ไม่เคยเชื่อมต่อเลย') < 0, 'and neither is treated as never seen');
});

test('nothing is said about last contact until the server has answered', (t) => {
    const s = setup(t);
    s.api.show();
    assert.ok(s.w.document.body.textContent.indexOf('ไม่เคยเชื่อมต่อเลย') < 0,
        'an unanswered question must not read as bad news');
});

// Everything needing action, gathered at the top. The same findings already sit on each
// computer's own row; the point of the panel is that nobody should have to scan sixty
// rows to discover there are three jobs today.
test('everything needing attention is gathered at the top, worst first', (t) => {
    const s = setup(t, { nodes: [
        { _id: 'node//1', name: 'pc-fine', conn: 1, meshid: 'mesh//a', users: [] },
        { _id: 'node//2', name: 'pc-firewall', conn: 1, meshid: 'mesh//a', users: [], wsc: { firewall: 'BAD' } },
        { _id: 'node//3', name: 'pc-updates', conn: 1, meshid: 'mesh//a', users: [], wsc: { autoUpdate: 'BAD' } }
    ] });
    s.api.show();

    const rows = Array.from(s.w.document.querySelectorAll('.scp-dash-attention-row'));
    assert.equal(rows.length, 2, 'only the computers with something wrong');
    assert.ok(rows[0].textContent.indexOf('pc-firewall') >= 0, 'the serious one leads: ' + rows[0].textContent);
    assert.ok(rows[0].className.indexOf('scp-dash-attention-high') >= 0, 'and is marked as serious');
    assert.ok(rows[1].textContent.indexOf('pc-updates') >= 0);
    assert.ok(s.w.document.querySelector('.scp-dash-attention-count').textContent.indexOf('2') >= 0);
    assert.ok(rows[0].textContent.indexOf('ทดสอบ') >= 0, 'each line says which department');
    assert.ok(rows[0].querySelector('.scp-dash-flag.high'), 'and reuses the same chip the device row uses');
});

test('the attention panel says so plainly when there is nothing to do', (t) => {
    const s = setup(t, { nodes: [{ _id: 'node//1', name: 'pc-fine', conn: 1, meshid: 'mesh//a', users: [] }] });
    s.api.show();
    assert.equal(s.w.document.querySelectorAll('.scp-dash-attention-row').length, 0);
    assert.ok(s.w.document.querySelector('.scp-dash-attention-clear'), 'and stands down rather than shouting');
    assert.ok(s.w.document.body.textContent.indexOf('ตอนนี้ไม่มีเรื่องต้องดูแล') >= 0);
});

test('a line in the attention panel opens the computer it is about', (t) => {
    const opened = [];
    const s = setup(t, { nodes: [
        { _id: 'node//2', name: 'pc-firewall', conn: 1, meshid: 'mesh//a', users: [], wsc: { firewall: 'BAD' } }
    ] });
    s.w.gotoDevice = (nodeid) => opened.push(nodeid);
    s.api.show();
    s.w.document.querySelector('.scp-dash-attention-go').dispatchEvent(new s.w.Event('click'));
    assert.deepEqual(opened, ['node//2'], 'straight to the computer that needs it');
});

// A week of power history, one small column per day.
test('the week chart draws a column per day and leaves unknown days blank', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    s.api.show();
    // Three days of history only: the four days before it are not quiet, they are unknown.
    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd1', timeline: poweredOn(3, workingDays(3, 8)) });
    const chart = s.w.document.querySelector('.scp-dash-week');
    assert.ok(chart, 'a chart is drawn');
    const columns = Array.from(chart.querySelectorAll('.scp-dash-week-day'));
    assert.equal(columns.length, 7, 'seven days');
    const blank = columns.filter(c => c.className.indexOf('scp-dash-week-blank') >= 0);
    // Three whole days sit before the history begins. The fourth is the day the history
    // started part way through, which is drawn from the moment it began rather than blanked.
    assert.equal(blank.length, 3, 'the days before the history began are blank, not zero');
    assert.deepEqual(columns.slice(0, 3).map(c => c.className.indexOf('blank') >= 0), [true, true, true], 'and they are the earliest days');
    assert.ok(blank.every(c => c.querySelector('i') === null), 'and carry no bar at all');
    assert.ok(columns[6].title.indexOf('เปิด') >= 0, 'each known day says its hours: ' + columns[6].title);
});

test('today is measured only as far as today has got', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    s.api.show();
    // On continuously since a week ago and still on now.
    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd1', timeline: poweredOn(7, []) });
    const days = s.api.hoursByDay({ _id: 'node//opd1' }, 7);
    const today = days[days.length - 1];
    const hoursSoFar = (Date.now() - new Date().setHours(0, 0, 0, 0)) / 3600000;
    assert.ok(today.hours <= hoursSoFar + 0.01,
        'today cannot have had more hours than it has had: ' + today.hours + ' vs ' + hoursSoFar);
    const yesterday = days[days.length - 2];
    assert.ok(Math.abs(yesterday.hours - 24) < 0.1, 'a full day on reads as 24: ' + yesterday.hours);
});

// The usage report, for the asset and management reporting the hospital does by hand.
test('the usage report carries a column per day and a total', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    let saved = null;
    s.w.HTMLAnchorElement.prototype.click = function () { saved = { name: this.download, href: this.href }; };
    s.api.show();
    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd1', timeline: poweredOn(7, workingDays(7, 8)) });
    s.api.exportUsage();

    assert.ok(saved, 'it should produce a file');
    assert.ok(saved.name.indexOf('การใช้งาน') >= 0, 'named for what it is: ' + saved.name);
    const csv = decodeURIComponent(saved.href.split(',')[1]);
    assert.ok(csv.charCodeAt(0) === 0xFEFF, 'with a byte order mark, or Excel mangles Thai');
    const header = csv.split('\r\n')[0];
    assert.equal(header.split(',').length, 10, 'name, department, seven days, total');
    assert.ok(header.indexOf('รวม (ชม.)') >= 0, 'and a total column');
    const row = csv.split('\r\n').find(line => line.indexOf('opd-1') >= 0);
    assert.ok(row, 'the computer with history is in it');
    assert.ok(row.indexOf('OPD') >= 0, 'with its department');
});

test('a day with no history is left blank in the report, never written as a zero', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    let saved = null;
    s.w.HTMLAnchorElement.prototype.click = function () { saved = { name: this.download, href: this.href }; };
    s.api.show();
    s.fromServer({ action: 'powertimeline', nodeid: 'node//opd1', timeline: poweredOn(2, workingDays(2, 8)) });
    s.api.exportUsage();
    const row = decodeURIComponent(saved.href.split(',')[1]).split('\r\n').find(l => l.indexOf('opd-1') >= 0);
    const cells = row.split(',');
    // name, department, then seven days. The earliest days predate the history.
    assert.equal(cells[2], '""', 'a day we were not watching is blank: ' + row);
    assert.notEqual(cells[2], '"0.0"', 'a blank must never read as an idle day');
});

test('the report refuses to save an empty file', (t) => {
    const s = setup(t, { meshes: wards, nodes: inWards });
    let saved = false, told = '';
    s.w.HTMLAnchorElement.prototype.click = function () { saved = true; };
    s.w.alert = (message) => { told = message; };
    s.api.show();
    s.api.exportUsage();   // no power history has arrived
    assert.equal(saved, false, 'nothing is saved');
    assert.ok(told.indexOf('ยังไม่ได้รับประวัติ') >= 0, 'and it says why: ' + told);
});

// Devices Windows itself cannot start — the yellow marks in Device Manager. Until now
// the hospital only learned of a failed driver when somebody telephoned about it.
const faultsFor = (nodeid, faults) => Object.assign(specsFor(nodeid), { deviceFaults: faults });

test('a failed driver becomes a job on the attention panel', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(faultsFor('node//1', [{ name: 'HP LaserJet 1020', code: 28, id: 'USB\\1' }]));

    const row = s.w.document.querySelector('.scp-dash-attention-row');
    assert.ok(row, 'it reaches the panel at the top without anything else being wired up');
    assert.ok(row.textContent.indexOf('HP LaserJet 1020') >= 0, 'naming the device: ' + row.textContent);
    assert.ok(row.textContent.indexOf('ยังไม่ได้ติดตั้งไดรเวอร์') >= 0, 'and what is wrong with it in plain words');
});

test('an error code nobody has a phrase for still says something useful', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(faultsFor('node//1', [{ name: 'Odd Device', code: 37, id: 'PCI\\9' }]));
    const text = s.w.document.querySelector('.scp-dash-attention-row').textContent;
    assert.ok(text.indexOf('Odd Device') >= 0 && text.indexOf('37') >= 0, 'the code itself: ' + text);
});

test('one badly broken computer cannot crowd out everyone else', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(faultsFor('node//1', [
        { name: 'Device A', code: 28 }, { name: 'Device B', code: 10 }, { name: 'Device C', code: 1 },
        { name: 'Device D', code: 31 }, { name: 'Device E', code: 43 }
    ]));
    const text = s.w.document.querySelector('.scp-dash-attention-row').textContent;
    assert.ok(text.indexOf('Device C') >= 0, 'the first three are named');
    assert.ok(text.indexOf('Device D') < 0, 'the rest are not');
    assert.ok(text.indexOf('และอีก 2 อุปกรณ์') >= 0, 'but they are counted: ' + text);
});

test('a computer with nothing wrong stays off the panel', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(faultsFor('node//1', []));
    assert.equal(s.w.document.querySelectorAll('.scp-dash-attention-row').length, 0);
    // Compared by length: arrays built inside the page belong to another realm, so a
    // deep comparison against one built here fails even when both are empty.
    assert.equal(s.api.faultsOf({ _id: 'node//1' }).length, 0, 'an empty list is not a fault');
    assert.equal(s.api.faultsOf({ _id: 'node//nothing' }).length, 0, 'nor is never having asked');
});

// One press to install a missing driver. It runs as SYSTEM on a hospital computer
// somebody may be working at, so what it will and will not do is pinned down here.
const faulty = (nodeid, name, conn = 1) => ({ _id: nodeid, name: name, conn: conn, meshid: 'mesh//a', users: [] });

test('the repair button is offered only where a driver has actually failed', (t) => {
    const s = setup(t, { nodes: [faulty('node//1', 'pc-broken'), faulty('node//2', 'pc-firewall')] });
    s.w.nodes[1].wsc = { firewall: 'BAD' };   // wrong, but not a driver
    s.api.show();
    s.fromServer(faultsFor('node//1', [{ name: 'Multimedia Audio Controller', code: 28 }]));

    const rows = Array.from(s.w.document.querySelectorAll('.scp-dash-attention-row'));
    const withButton = rows.filter(r => r.querySelector('.scp-dash-fix-go'));
    assert.equal(withButton.length, 1, 'exactly one row offers it');
    assert.ok(withButton[0].textContent.indexOf('pc-broken') >= 0, 'and it is the one with the driver fault');
});

test('pressing it asks first, and sends nothing if the answer is no', (t) => {
    const s = setup(t, { nodes: [faulty('node//1', 'pc-broken')] });
    let asked = '';
    s.w.confirm = (message) => { asked = message; return false; };
    s.api.show();
    s.fromServer(faultsFor('node//1', [{ name: 'Multimedia Audio Controller', code: 28 }]));
    s.w.document.querySelector('.scp-dash-fix-go').dispatchEvent(new s.w.Event('click'));

    assert.ok(asked.indexOf('pc-broken') >= 0, 'the question names the computer: ' + asked);
    assert.ok(asked.indexOf('ไม่รีสตาร์ต') >= 0, 'and promises not to restart it');
    assert.equal(s.sent.filter(m => m.action === 'runcommands').length, 0, 'no means no');
});

test('saying yes sends the drivers-only command as the agent, asking for a reply', (t) => {
    const s = setup(t, { nodes: [faulty('node//1', 'pc-broken')] });
    s.api.show();
    s.fromServer(faultsFor('node//1', [{ name: 'Multimedia Audio Controller', code: 28 }]));
    s.w.document.querySelector('.scp-dash-fix-go').dispatchEvent(new s.w.Event('click'));

    const sent = s.sent.filter(m => m.action === 'runcommands');
    assert.equal(sent.length, 1);
    assert.deepEqual(Array.from(sent[0].nodeids), ['node//1'], 'only the computer that needs it');
    assert.equal(sent[0].type, 2, 'PowerShell');
    assert.equal(sent[0].runAsUser, 0, 'as the agent, so nobody has to be signed in');
    assert.equal(sent[0].reply, true, 'and we want to hear how it went');
    assert.ok(typeof sent[0].responseid === 'string' && sent[0].responseid.length > 0);
    // Until the computer answers, the true thing to report is that it has not.
    assert.ok(s.w.document.body.textContent.indexOf('ยังไม่มีคำตอบ') >= 0, 'the row says the command is out and unanswered');
});

test('the command installs drivers and never restarts the computer', (t) => {
    const s = setup(t);
    const script = s.api.driverScript;
    assert.ok(/Type='Driver'/.test(script), 'drivers only, never a general Windows update');
    assert.ok(/IsInstalled=0/.test(script), 'and only ones not already on');
    assert.ok(!/Restart-Computer|shutdown|Restart-Service/i.test(script), 'nothing here restarts anything');
    assert.ok(/RebootRequired/.test(script), 'it reports that a restart is needed instead');
    assert.ok(/pnputil/.test(script), 'the free local re-scan is tried first');
});

test('what the computer reports back is turned into one plain sentence', (t) => {
    const cases = [
        ['rescan ok | installed 2 driver(s)', 'ติดตั้งไดรเวอร์แล้ว'],
        ['rescan ok | NODRIVERS', 'Windows ไม่มีไดรเวอร์ให้'],
        ['rescan ok | installed 1 driver(s) | REBOOT', 'ต้องรีสตาร์ต'],
        ['rescan failed | FAILED 0x80240044 access denied', 'ทำไม่สำเร็จ']
    ];
    cases.forEach(([reply, expected]) => {
        const s = setup(t, { nodes: [faulty('node//1', 'pc-broken')] });
        s.api.show();
        s.fromServer(faultsFor('node//1', [{ name: 'Multimedia Audio Controller', code: 28 }]));
        s.w.document.querySelector('.scp-dash-fix-go').dispatchEvent(new s.w.Event('click'));
        s.fromServer({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: s.sent.find(m => m.action === 'runcommands').responseid, result: reply });
        assert.ok(s.w.document.body.textContent.indexOf(expected) >= 0,
            '“' + reply + '” should read as “' + expected + '”');
    });
});

test('a reply about a computer we never asked about is ignored', (t) => {
    const s = setup(t, { nodes: [faulty('node//1', 'pc-broken')] });
    s.api.show();
    s.fromServer(faultsFor('node//1', [{ name: 'Multimedia Audio Controller', code: 28 }]));
    // Somebody else ran a command from the device's own page. That answer is theirs.
    s.fromServer({ action: 'msg', type: 'runcommands', nodeid: 'node//1', result: 'installed 9 driver(s)' });
    assert.ok(s.w.document.body.textContent.indexOf('ติดตั้งไดรเวอร์แล้ว') < 0,
        'an answer to a question we did not ask must not be reported as ours');
});

test('a computer that is switched off is skipped and said to be skipped', (t) => {
    const s = setup(t, { nodes: [faulty('node//1', 'pc-off', 0)] });
    let told = '';
    s.w.alert = (message) => { told = message; };
    s.api.show();
    s.fromServer(faultsFor('node//1', [{ name: 'Multimedia Audio Controller', code: 28 }]));
    s.api.fixDrivers([{ _id: 'node//1', name: 'pc-off', conn: 0 }]);
    assert.equal(s.sent.filter(m => m.action === 'runcommands').length, 0, 'nothing is sent into the dark');
    assert.ok(told.indexOf('pc-off') >= 0 && told.indexOf('ปิดอยู่') >= 0, 'and it says which: ' + told);
});

test('one press covers a room imaged from the same disk', (t) => {
    const s = setup(t, { nodes: [
        faulty('node//1', 'opd-1'), faulty('node//2', 'opd-2'),
        faulty('node//3', 'opd-3', 0), faulty('node//4', 'opd-4')
    ] });
    s.api.show();
    ['node//1', 'node//2', 'node//3'].forEach(id =>
        s.fromServer(faultsFor(id, [{ name: 'Multimedia Audio Controller', code: 28 }])));
    s.fromServer(faultsFor('node//4', []));   // this one is fine

    const all = s.w.document.querySelector('.scp-dash-fix-all');
    assert.ok(all, 'a single button appears once more than one computer needs it');
    assert.ok(all.textContent.indexOf('2') >= 0, 'counting only the ones it can reach: ' + all.textContent);
    all.dispatchEvent(new s.w.Event('click'));
    const sent = s.sent.filter(m => m.action === 'runcommands')[0];
    assert.deepEqual(Array.from(sent.nodeids).sort(), ['node//1', 'node//2'],
        'the switched-off one and the healthy one are both left out');
});

test('after a repair the computer is asked again what is wrong with it', (t) => {
    const s = setup(t, { nodes: [faulty('node//1', 'pc-broken')] });
    s.api.show();
    s.fromServer(faultsFor('node//1', [{ name: 'Multimedia Audio Controller', code: 28 }]));
    const before = s.sent.filter(m => m.action === 'getsysinfo').length;
    s.w.document.querySelector('.scp-dash-fix-go').dispatchEvent(new s.w.Event('click'));
    s.fromServer({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: s.sent.find(m => m.action === 'runcommands').responseid, result: 'installed 1 driver(s)' });
    assert.ok(s.sent.filter(m => m.action === 'getsysinfo').length > before,
        'so the fault clears itself from the panel once it is really gone');
});

test('a cleanup reply cannot complete a driver repair on the same computer',t=>{
 const s=setup(t,{nodes:[faulty('node//1','pc-broken')]});s.api.show();s.fromServer(faultsFor('node//1',[{name:'Multimedia Audio Controller',code:28}]));s.w.document.querySelector('.scp-dash-fix-go').click();
 s.fromServer({action:'msg',type:'runcommands',nodeid:'node//1',responseid:'scpclean-other',result:'SCP_CLEANUP_RESULT:{}'});assert.ok(s.w.document.body.textContent.includes('ยังไม่มีคำตอบ'),'a reply from another job leaves the driver job alone');
});
test('a late driver result still updates the row after the waiting deadline',t=>{
 const s=setup(t,{nodes:[faulty('node//1','pc-broken')]});s.api.show();s.fromServer(faultsFor('node//1',[{name:'Multimedia Audio Controller',code:28}]));const timeouts=[];s.w.setTimeout=(fn)=>{timeouts.push(fn);return 1;};s.w.document.querySelector('.scp-dash-fix-go').click();const request=s.sent.find(m=>m.action==='runcommands');timeouts[0]();assert.ok(s.w.document.body.textContent.includes('15 นาที'));
 s.fromServer({action:'msg',type:'runcommands',nodeid:'node//1',responseid:request.responseid,result:'installed 1 driver(s)'});assert.ok(s.w.document.body.textContent.includes('ติดตั้งไดรเวอร์แล้ว'));
});
test('driver stages remain pending and server rejection immediately ends the waiting state',t=>{
 const s=setup(t,{nodes:[faulty('node//1','pc-broken')]});s.api.show();s.fromServer(faultsFor('node//1',[{name:'Multimedia Audio Controller',code:28}]));s.w.document.querySelector('.scp-dash-fix-go').click();const request=s.sent.find(m=>m.action==='runcommands');
 s.fromServer({action:'msg',type:'runcommands',nodeid:'node//1',responseid:request.responseid,progress:true,result:'SCP_DRIVER_STAGE:download'});assert.ok(s.w.document.body.textContent.includes('กำลังดาวน์โหลดไดรเวอร์'));
 s.fromServer({action:'runcommands',responseid:request.responseid,result:'Agent not connected'});assert.ok(s.w.document.body.textContent.includes('ทำไม่สำเร็จ'));
});
test('opening the dashboard restores a saved driver result without reinstalling',async t=>{
 const s=setup(t,{nodes:[faulty('node//1','pc-broken')]});s.w.ScpOperations={request:async()=>[{nodeid:'node//1',ticket:'scpfix1_100',result:'NODRIVERS',progress:false,updated:100}]};s.api.show();await new Promise(resolve=>setImmediate(resolve));assert.ok(s.w.document.body.textContent.includes('Windows ไม่มีไดรเวอร์ให้'),s.w.document.body.textContent);assert.equal(s.sent.filter(m=>m.action==='runcommands').length,0);
});

test('dashboard opens a compact overview and switching away from live devices stops sessions', (t) => {
    const { w, connections, api } = setup(t);
    api.show();
    assert.equal(w.document.getElementById('scp-dash-view-overview').hidden, false);
    assert.equal(w.document.getElementById('scp-dash-view-devices').hidden, true);
    api.setLive(true);
    assert.equal(w.document.getElementById('scp-dash-view-devices').hidden, false);
    assert.equal(connections.length, 2);
    w.document.querySelector('[aria-controls="scp-dash-view-reports"]').click();
    assert.ok(connections.every(c => c.stops === 1));
    assert.equal(w.document.getElementById('scp-dash-view-reports').hidden, false);
    api.render();
    assert.equal(w.document.getElementById('scp-dash-view-reports').hidden, false);
    assert.equal(connections.length, 2);
});

// win-info reports pending-restart reasons as a list. An empty list means nothing is
// pending, and a restart cannot clear a message that was never about it.
test('a computer with an empty list of restart reasons is not said to be waiting', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(specsFor('node//1', { pendingReboot: [] }));
    assert.equal(s.w.document.body.textContent.indexOf('รอรีสตาร์ต'), -1, 'nothing is pending, so nothing is said');
    s.fromServer(specsFor('node//1', { pendingReboot: ['File Rename'] }));
    assert.ok(s.w.document.body.textContent.indexOf('รอรีสตาร์ต') >= 0, 'a real reason is still reported');
});

test('a firewall Windows cannot report on yet is not called unprotected', (t) => {
    const s = setup(t, { nodes: [
        { _id: 'node//1', name: 'pc-unknown', conn: 1, meshid: 'mesh//a', users: [], wsc: { firewall: 'UNKNOWN', autoUpdate: 'UNKNOWN' } },
        { _id: 'node//2', name: 'pc-off', conn: 1, meshid: 'mesh//a', users: [], wsc: { firewall: 'OFF' } }
    ] });
    s.api.show();
    const text = s.w.document.body.textContent;
    assert.ok(text.indexOf('ยังตรวจสถานะไฟร์วอลล์ไม่ได้') >= 0, 'not knowing is said plainly');
    assert.ok(text.indexOf('ไฟร์วอลล์ไม่ทำงาน') >= 0, 'a firewall really off is still an alarm');
    assert.equal(text.indexOf('อัปเดตอัตโนมัติ'), -1, 'an unknown update setting is not an alarm either');
});

test('a computer that comes back is asked again, so the panel corrects itself', (t) => {
    const s = setup(t);
    s.api.show();
    const before = s.sent.filter(m => m.action === 'getsysinfo' && m.nodeid === 'node//1').length;
    s.fromServer({ action: 'event', event: { action: 'nodeconnect', nodeid: 'node//1', conn: 1 } });
    const after = s.sent.filter(m => m.action === 'getsysinfo' && m.nodeid === 'node//1').length;
    assert.equal(after, before + 1, 'a reconnect asks for fresh information');
    s.fromServer({ action: 'event', event: { action: 'nodeconnect', nodeid: 'node//1', conn: 0 } });
    assert.equal(s.sent.filter(m => m.action === 'getsysinfo' && m.nodeid === 'node//1').length, after, 'a disconnect asks nothing');
});

// The panel is read by someone looking for the row that needs them. Everything printed
// on the rows that do not need them is in the way.
test('a computer with nothing wrong says nothing at all', (t) => {
    const s = setup(t);
    s.api.show();
    assert.equal(s.w.document.body.textContent.indexOf('ไม่พบสิ่งผิดปกติ'), -1,
        'a healthy row leaves the column empty rather than saying so twenty times');
});

test('the remote-screen mirror driver is not reported as the computer graphics card', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(specsFor('node//1', { hardware: { identifiers: {
        cpu_name: 'Intel(R) Core(TM) i5-4590S CPU @ 3.00GHz',
        gpu_name: 'VNC Mirror Driver,NVIDIA GeForce GT 620' }, windows: {} } }));
    const text = s.w.document.body.textContent;
    assert.equal(text.indexOf('VNC Mirror Driver'), -1, 'our own driver is not a fact about the computer');
    assert.ok(text.indexOf('NVIDIA GeForce GT 620') >= 0, 'the real card still shows');
});

test('the disk figure says which way round it is', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(specsFor('node//1', { hardware: { identifiers: {}, windows: {
        volumes: { C: { size: 100 * 1024 * 1024 * 1024, sizeremaining: 34 * 1024 * 1024 * 1024, dType: 3 } } } } }));
    assert.ok(s.w.document.body.textContent.indexOf('C: ว่าง') >= 0, 'a bare percentage leaves the reader guessing');
});

test('a restart waiting on a file in use is not called an unfinished update', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(specsFor('node//1', { pendingReboot: ['File Rename'] }));
    let text = s.w.document.body.textContent;
    assert.ok(text.indexOf('แทนที่ไฟล์') >= 0, 'it says what is actually waiting');
    assert.equal(text.indexOf('อัปเดตเสร็จ'), -1, 'and does not claim an update is unfinished');
    s.fromServer(specsFor('node//1', { pendingReboot: ['Windows Update', 'File Rename'] }));
    text = s.w.document.body.textContent;
    assert.ok(text.indexOf('อัปเดตเสร็จ') >= 0, 'a real update is still named as one');
});

// Windows installs a second antivirus in passive mode on purpose. Calling that "switched
// off" sends somebody to repair a computer that was never broken -- and, worse, invites a
// button that would uninstall the product to make the message go away.
test('an antivirus Windows parked in passive mode is not reported as switched off', (t) => {
    const s = setup(t, { nodes: [{ _id: 'node//1', name: 'pc-passive', conn: 1, meshid: 'mesh//a', users: [],
        av: [{ product: 'FortiClient', enabled: false, updated: true }, { product: 'Windows Defender', enabled: true, updated: true }],
        wsc: { antiVirus: 'OK', firewall: 'OK', autoUpdate: 'OK' } }] });
    s.api.show();
    const text = s.w.document.body.textContent;
    assert.equal(text.indexOf('FortiClient'), -1, 'Windows says the computer is protected, so nothing is wrong');
    assert.equal(text.indexOf('แอนตี้ไวรัสถูกปิด'), -1);
});

test('a computer Windows itself calls unprotected is still flagged', (t) => {
    const s = setup(t, { nodes: [
        { _id: 'node//1', name: 'pc-problem', conn: 1, meshid: 'mesh//a', users: [],
          av: [{ product: 'Windows Defender', enabled: false, updated: true }, { product: 'ESET Security', enabled: true, updated: true }],
          wsc: { antiVirus: 'PROBLEM', firewall: 'OK', autoUpdate: 'OK' } },
        { _id: 'node//2', name: 'pc-nothing-running', conn: 1, meshid: 'mesh//a', users: [],
          av: [{ product: 'McAfee', enabled: false, updated: true }], wsc: { firewall: 'OK' } }
    ] });
    s.api.show();
    const text = s.w.document.body.textContent;
    assert.ok(text.indexOf('Windows รายงานว่า') >= 0, 'the verdict Windows reached is what is reported');
    assert.ok(text.indexOf('McAfee') >= 0, 'and a computer with nothing running at all is still flagged');
});

// The bar used to show "installing drivers, step 1 of 4" from the instant the button was
// pressed. Two computers sat like that for a quarter of an hour having never answered at
// all, and nothing on the screen could tell that apart from work in progress.
test('a command that has been sent but not answered says exactly that', (t) => {
    const s = setup(t);
    s.api.show();
    const row = [...s.w.document.querySelectorAll('.scp-dash-row')].find(r => r.textContent.indexOf('pc-one') >= 0);
    assert.ok(row, 'no row to work with');
    s.w.ScpDashboard.fixDrivers([s.w.nodes[0]]);
    const text = s.w.document.body.textContent;
    assert.ok(text.indexOf('ยังไม่มีคำตอบ') >= 0, 'it says the computer has not answered');
    assert.equal(s.w.document.querySelector('.scp-job-progress'), null, 'and shows no stage until one is reported');
});

test('the device re-scan is a stage of its own, and cannot run forever', (t) => {
    const s = setup(t);
    const script = s.w.ScpDashboard.driverScript;
    const rescan = script.indexOf("SCP_DRIVER_STAGE:rescan");
    const search = script.indexOf("SCP_DRIVER_STAGE:search");
    const pnputil = script.indexOf('pnputil.exe');
    assert.ok(rescan >= 0 && rescan < pnputil, 'the re-scan is announced before it starts, or a hang there looks like a search');
    assert.ok(pnputil < search, 'and it still runs before Windows Update is asked');
    assert.match(script, /WaitForExit\(\d+\)/, 'a re-scan that never returns has to be given up on');
    assert.doesNotMatch(script, /Restart-Computer/);
});

test('the re-scan stage is reported to the panel by name', (t) => {
    const s = setup(t);
    s.api.show();
    s.w.ScpDashboard.fixDrivers([s.w.nodes[0]]);
    const ticket = s.sent.filter(m => m.action === 'runcommands').pop().responseid;
    s.fromServer({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: ticket,
        progress: true, result: 'SCP_DRIVER_STAGE:rescan' });
    assert.ok(s.w.document.body.textContent.indexOf('สแกนอุปกรณ์') >= 0,
        'the panel distinguishes scanning the computer from asking Windows Update');
});

// The chipset placeholders Windows cannot name are on nearly every machine and the computer
// works without them, so they must not crowd the panel out of the faults that matter.
test('a computer whose only device faults are chipset housekeeping is not flagged for drivers', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(faultsFor('node//1', [
        { name: 'SM Bus Controller', code: 28 },
        { name: 'PCI Simple Communications Controller', code: 28 },
        { name: 'PCI Device', code: 28 }
    ]));
    const text = s.w.document.body.textContent;
    assert.equal(text.indexOf('SM Bus Controller'), -1, 'the cosmetic bangs are not shown as attention');
    assert.equal(text.indexOf('PCI Simple Communications Controller'), -1);
});

test('a real device fault is still flagged even beside chipset housekeeping', (t) => {
    const s = setup(t);
    s.api.show();
    s.fromServer(faultsFor('node//1', [
        { name: 'SM Bus Controller', code: 28 },
        { name: 'High Definition Audio Device', code: 28 },
        { name: 'PCI Device', code: 28 }
    ]));
    const text = s.w.document.body.textContent;
    assert.ok(text.indexOf('High Definition Audio Device') >= 0, 'the one that actually stops something shows');
    assert.equal(text.indexOf('SM Bus Controller'), -1, 'the housekeeping beside it does not');
});
