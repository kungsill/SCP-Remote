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
    const connections = [];

    w.alert = () => {};
    w.confirm = () => true;
    w.meshserver = { send: () => {} };
    w.serverinfo = { consent: options.consent === undefined ? 8 : options.consent };
    w.meshes = { 'mesh//a': { _id: 'mesh//a', name: 'ทดสอบ' } };
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
            grabbedMouse: false, grabbedKeys: false,
            GrabMouseInput: function () { this.grabbedMouse = true; },
            GrabKeyInput: function () { this.grabbedKeys = true; }
        };
    };
    w.CreateAgentRedirect = function (server, module) {
        const conn = { m: module, nodeid: null, starts: 0, stops: 0, onStateChanged: null };
        conn.Start = function (nodeid) {
            conn.nodeid = nodeid; conn.starts++;
            if (conn.onStateChanged) { conn.onStateChanged(conn, 3); }
        };
        conn.Stop = function () { conn.stops++; };
        connections.push(conn);
        return conn;
    };

    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    t.after(() => { try { w.ScpDashboard.hide(); } catch (error) { /* already closed */ } w.close(); });
    return { w, connections, api: w.ScpDashboard, panel: w.document.getElementById('scpDashboard') };
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
        assert.equal(c.m.ScalingLevel, 256, 'a quarter-size picture is all a tile needs');
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
