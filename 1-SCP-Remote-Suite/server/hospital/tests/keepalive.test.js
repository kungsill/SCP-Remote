'use strict';
// Why remote sessions dropped after a few idle minutes (found 13 Nov 2026).
//
// The viewer sends a small "rtt" message every ten seconds; the agent answers it. Besides
// measuring latency, on a screen where nothing is changing it is the only traffic on the
// connection, and so the only thing keeping it open through the hospital's routers.
//
// MeshCentral's code stopped that timer for good if no answer had arrived by the first
// ten-second tick. In the SCP-Remote program the person at the other computer has to press
// Allow first, which usually takes longer than ten seconds, so the timer stopped before the
// session had even begun and a quiet session was cut a few minutes later. Of the 65 sessions
// the server had on record, 3 lasted over ten minutes.
//
// These tests drive the real module with a fake socket and clock.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../public/scripts/agent-redir-ws-0.1.1.js'), 'utf8');

function viewer() {
    const sent = [], intervals = [];
    let socket = null;
    function WebSocket(url) { socket = this; this.url = url; this.readyState = 1; this.send = d => { if (typeof d === 'string') sent.push(d); }; this.close = () => { this.readyState = 3; }; }
    const ctx = {
        WebSocket, console, JSON, Date, Math, parseInt, btoa: s => s, atob: s => s,
        window: { location: { protocol: 'https:', host: 'h', pathname: '/' } }, location: { protocol: 'https:', host: 'h', hostname: 'h', port: '', pathname: '/' }, urlargs: {}, args: {},
        setInterval: (fn, ms) => { const t = { fn, ms, live: true }; intervals.push(t); return t; },
        clearInterval: t => { if (t) t.live = false; },
        setTimeout: () => 0, clearTimeout: () => { },
        navigator: { userAgent: 'test' }, document: { location: { protocol: 'https:' } }
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    const module = { ProcessData() { }, xxStateChange() { }, Start() { }, Stop() { } };
    const obj = ctx.CreateAgentRedirect({ send() { } }, module, 'server:8443', 'cookie', null, '/');
    obj.Start('node//x');
    return {
        obj, sent,
        connect() { if (!socket) throw Error('no socket'); socket.onopen(); },
        socket: () => socket,
        tick() { intervals.filter(t => t.live && t.ms === 10000).forEach(t => t.fn()); },
        live: () => intervals.filter(t => t.live && t.ms === 10000).length,
        rtts: () => sent.filter(s => /"type":"rtt"/.test(s)).length
    };
}

test('the keep-alive goes on even when the first answer is slow to come', () => {
    const v = viewer();
    v.connect();
    const first = v.rtts();
    assert.ok(first >= 1, 'one is sent on connecting');
    // nobody has pressed Allow yet: ten, twenty, thirty seconds with no answer
    v.tick(); v.tick(); v.tick();
    assert.equal(v.live(), 1, 'the timer is still running');
    assert.equal(v.rtts(), first + 3, 'and still asking');
});

test('it keeps going for a whole quiet session', () => {
    const v = viewer();
    v.connect();
    const first = v.rtts();
    for (let i = 0; i < 180; i++) v.tick(); // half an hour of nothing happening on screen
    assert.equal(v.rtts(), first + 180);
});

test('it stops when the session is closed, and does not send on a closed connection', () => {
    const v = viewer();
    v.connect();
    v.tick();
    const before = v.rtts();
    v.obj.Stop();
    v.tick(); v.tick();
    assert.equal(v.live(), 0, 'the timer is cleared');
    assert.ok(v.rtts() <= before, 'nothing more is sent');
});

test('the change is marked for the next MeshCentral upgrade', () => {
    assert.match(source, /SCP-Remote: keep the session alive/);
    const doc = fs.readFileSync(path.join(__dirname, '../UPSTREAM-CHANGES.md'), 'utf8');
    assert.match(doc, /agent-redir-ws-0\.1\.1\.js[^\n]*rtt/);
});
