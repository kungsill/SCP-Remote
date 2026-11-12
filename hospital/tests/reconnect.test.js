'use strict';
// A remote session that drops is reopened by itself; one that was refused or closed on purpose
// is not. And every way a session fails is written down against the computer, so unreliable
// remote access can be traced to particular computers and causes instead of being a feeling.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const session = require('../../public/scripts/scp-session');
const source = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-session.js'), 'utf8');

const dropped = extra => Object.assign({ hadImage: true, userClosed: false, outcome: 'ended', attempts: 0, online: true, onScreen: true }, extra);

test('a session that had a picture and then ended by itself is reopened, a little later each time', () => {
    assert.equal(session.reconnectIn(dropped()), 2000);
    assert.equal(session.reconnectIn(dropped({ attempts: 1 })), 5000);
    assert.equal(session.reconnectIn(dropped({ attempts: 2 })), 10000);
    assert.equal(session.reconnectIn(dropped({ attempts: 3 })), null, 'three tries, then it is left to the technician');
    assert.equal(session.reconnectIn(dropped({ online: undefined })), 2000, 'not knowing whether it is on is not a reason to give up');
});

test('it is never reopened when someone ended it, refused it, or there is nothing to come back to', () => {
    assert.equal(session.reconnectIn(dropped({ userClosed: true })), null, 'the technician pressed Disconnect');
    assert.equal(session.reconnectIn(dropped({ outcome: 'denied' })), null, 'the person there said no');
    assert.equal(session.reconnectIn(dropped({ outcome: 'refused' })), null);
    assert.equal(session.reconnectIn(dropped({ online: false })), null, 'the computer went off');
    assert.equal(session.reconnectIn(dropped({ onScreen: false })), null, 'the technician has left the remote screen');
    assert.equal(session.reconnectIn(dropped({ hadImage: false })), null, 'it never connected: that is a failure to report, not a drop');
});

test('what gets written down: failures and drops, never a working or still-connecting session', () => {
    for (const f of ['offline', 'serverTimeout', 'agentTimeout', 'consentTimeout', 'denied', 'refused', 'imageTimeout']) assert.equal(session.failureOf(f, false, false), f);
    assert.equal(session.failureOf('ended', true, false), 'dropped');
    assert.equal(session.failureOf('ended', true, true), null, 'closed on purpose');
    assert.equal(session.failureOf('ended', false, false), null, 'never had a picture');
    for (const ok of ['ready', 'server', 'agent', 'consent', 'image']) assert.equal(session.failureOf(ok, true, false), null);
});

test('Disconnect, however it is pressed, is recognised as on purpose; our own reconnect is not', () => {
    assert.match(source, /root\.connectDesktop=function\(e,mode\)\{if\(!internalCall\)\{userClosed=\(mode===0\);/);
    assert.match(source, /function reopen\(\)\{internalCall=true;try\{[^}]*root\.connectDesktop\(null,3\);\}catch\(e\)\{\}finally\{internalCall=false;\}\}/);
});

test('each failure is sent once per session, and only where there is a server channel to send it', () => {
    assert.match(source, /if\(!outcome\|\|!target\|\|logged===outcome\)return;logged=outcome;/);
    assert.match(source, /root\.ScpOperations\.request\('sessionLog',\{nodeid:target,outcome:outcome,ms:Date\.now\(\)-startedAt\}\)/);
});

test('the Retry button starts the count again', () => {
    assert.match(source, /retry\.onclick=\(\)=>\{[^}]*attempts=0;userClosed=false;reopen\(\);\};/);
});
