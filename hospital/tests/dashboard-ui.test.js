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
    w.meshserver = { send: () => {} };
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

    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    t.after(() => { try { w.ScpDashboard.hide(); } catch (error) { /* already closed */ } w.close(); });
    return { w, connections, tick, api: w.ScpDashboard, panel: w.document.getElementById('scpDashboard') };
}

function liveButton(w) {
    return w.document.querySelector('.scp-dash-live');
}

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
