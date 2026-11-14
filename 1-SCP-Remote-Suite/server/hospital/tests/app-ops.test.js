'use strict';
// Server operations for the Android app (over the control channel, action 'scpops'):
// appDevices - the computers this account may see, with what it may do on each, worked out by the
//   server (GetNodeWithRights) so the app never decides rights for itself;
// fixPrinter - the printer fix, only for an account that may run commands on that computer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ops = require('../operations');
const mobile = require('../mobile');

function setup(rightsById) {
    const rows = new Map(), sent = [];
    const db = {
        Get: (id, cb) => cb(null, rows.has(id) ? [structuredClone(rows.get(id))] : []),
        Set: (r, cb) => { rows.set(r._id, structuredClone(r)); if (cb) cb(); },
        GetAllTypeNoTypeField: (t, d, cb) => cb(null, [...rows.values()].filter(r => r.type === t && r.domain === d)),
        Remove: (id, cb) => { rows.delete(id); cb(); }
    };
    const agent = id => ({ authenticated: 2, agentInfo: { agentId: 4 }, send: text => sent.push({ id, command: JSON.parse(text) }) });
    const user = { _id: 'user//tech', name: 'tech', domain: '', siteadmin: 0 };
    const parent = {
        db, users: { 'user//tech': user },
        wsagents: { 'node//a': agent('node//a'), 'node//c': agent('node//c'), 'node//d': agent('node//d') },
        GetNodeWithRights: (d, u, id, cb) => { const r = rightsById[id]; cb(r == null ? null : rows.get(id), r == null ? 0 : r, r != null); }
    };
    rows.set('mesh//er', { _id: 'mesh//er', type: 'mesh', domain: '', name: 'ER' });
    rows.set('mesh//rx', { _id: 'mesh//rx', type: 'mesh', domain: '', name: 'ห้องยา' });
    const node = (id, name, meshid, host) => rows.set(id, { _id: id, type: 'node', domain: '', name, meshid, host, users: ['HOSP\\somchai'] });
    node('node//a', 'ER-1', 'mesh//er', '192.168.4.21');
    node('node//b', 'ER-2', 'mesh//er', '192.168.4.22');
    node('node//c', 'RX-1', 'mesh//rx', '192.168.6.40');
    node('node//d', 'RX-2', 'mesh//rx', '192.168.6.41');
    node('node//e', 'HIDDEN', 'mesh//rx', '192.168.6.42');
    return { ctx: { db, parent, user, domain: { id: '' } }, rows, sent };
}

test('appDevices lists only computers the account may see, with rights-derived flags', async () => {
    const { ctx } = setup({ 'node//a': 8, 'node//b': 8 | 256, 'node//c': 8 | 0x20000, 'node//d': 0x10000 | 8 });
    const r = await ops.handle(ctx, { op: 'appDevices' });
    assert.equal(r.user.name, 'tech');
    const by = Object.fromEntries(r.devices.map(d => [d.id, d]));
    assert.deepEqual(Object.keys(by).sort(), ['node//a', 'node//b', 'node//c', 'node//d'], 'the hidden computer is not listed');
    assert.deepEqual([by['node//a'].canView, by['node//a'].canControl, by['node//a'].viewOnly, by['node//a'].canFixPrinter], [true, true, false, false]);
    assert.deepEqual([by['node//b'].canView, by['node//b'].canControl, by['node//b'].viewOnly], [true, false, true]);
    assert.equal(by['node//c'].canFixPrinter, true);
    assert.equal(by['node//d'].canView, false, 'no desktop right');
    assert.equal(by['node//a'].online, true);
    assert.equal(by['node//b'].online, false, 'no agent connected');
    assert.equal(by['node//a'].ip, '192.168.4.21');
    assert.deepEqual(by['node//a'].users, ['HOSP\\somchai']);
    assert.equal(by['node//c'].groupId, 'mesh//rx');
    assert.deepEqual(r.groups.map(g => g.name).sort(), ['ER', 'ห้องยา']);
});

test('a full administrator can do everything on every computer', async () => {
    const { ctx } = setup({ 'node//a': 0xFFFFFFFF });
    const d = (await ops.handle(ctx, { op: 'appDevices' })).devices[0];
    assert.deepEqual([d.canView, d.canControl, d.viewOnly, d.canFixPrinter], [true, true, false, true]);
});

test('fixPrinter refuses without the right to run commands, and nothing reaches the computer', async () => {
    const { ctx, sent } = setup({ 'node//a': 8 });
    await assert.rejects(ops.handle(ctx, { op: 'fixPrinter', nodeid: 'node//a' }), /ACCESS_DENIED/);
    await assert.rejects(ops.handle(ctx, { op: 'fixPrinter', nodeid: 'node//zzz' }), /ACCESS_DENIED/);
    assert.equal(sent.length, 0);
});

test('fixPrinter runs the server\'s fixed command for an allowed computer and returns its result', async () => {
    const { ctx, sent } = setup({ 'node//c': 8 | 0x20000 });
    const pending = ops.handle(ctx, { op: 'fixPrinter', nodeid: 'node//c', cmds: 'format c:' });
    await new Promise(r => setTimeout(r, 5));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].command.action, 'runcommands');
    assert.match(sent[0].command.responseid, /^scpmfix/);
    assert.doesNotMatch(sent[0].command.cmds, /format c:/);
    mobile.receive('node//c', { responseid: sent[0].command.responseid, result: 'SCP_FIX:{"ok":true,"before":2,"after":0,"spooler":"Running"}' });
    assert.deepEqual(await pending, { ok: true, before: 2, after: 0, spooler: 'Running' });
});
