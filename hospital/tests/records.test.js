'use strict';
// Two things the server keeps so they are not lost with a browser tab:
//
// - how each remote session went wrong (offline, no answer, permission refused, dropped), so
//   "remote is unreliable" becomes "these three computers, for this reason";
// - what the technician tools found (blue screens, disk speed, SFC, antivirus), which used to
//   live in one browser's storage and so were invisible from any other computer.
//
// Both are per computer, only for computers the account may see, bounded in size, and both
// show up in that computer's history.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ops = require('../operations');

function setup() {
    const rows = new Map();
    const db = {
        Get: (id, cb) => cb(null, rows.has(id) ? [structuredClone(rows.get(id))] : []),
        Set: (r, cb) => { rows.set(r._id, structuredClone(r)); cb(); },
        GetAllTypeNoTypeField: (t, d, cb) => cb(null, [...rows.values()].filter(r => r.type === t && r.domain === d)),
        Remove: (id, cb) => { rows.delete(id); cb(); }
    };
    const user = { _id: 'user//tech', name: 'tech', domain: '', siteadmin: 0 };
    const parent = { users: { 'user//tech': user }, GetNodeWithRights: (d, u, id, cb) => cb(/^node\/\/(allowed|also)$/.test(id) ? {} : null, 8, true) };
    return { ctx: { db, parent, user, domain: { id: '' } }, rows };
}

test('a remote session that failed is recorded with why, for a computer this account may see', async () => {
    const { ctx, rows } = setup();
    await assert.rejects(ops.handle(ctx, { op: 'sessionLog', nodeid: 'node//other', outcome: 'offline' }), /ACCESS_DENIED/);
    await assert.rejects(ops.handle(ctx, { op: 'sessionLog', nodeid: 'node//allowed', outcome: 'whatever' }), /INVALID_INPUT/);
    await assert.rejects(ops.handle(ctx, { op: 'sessionLog', nodeid: 'node//allowed', outcome: 'ready' }), /INVALID_INPUT/, 'only failures are kept');
    await ops.handle(ctx, { op: 'sessionLog', nodeid: 'node//allowed', outcome: 'agentTimeout', ms: 31000, via: 'web', evil: 'x'.repeat(5000) });
    const row = rows.get('scpsessionlog/node//allowed');
    assert.equal(row.entries.length, 1);
    assert.deepEqual(Object.keys(row.entries[0]).sort(), ['at', 'by', 'ms', 'outcome']);
    assert.equal(row.entries[0].outcome, 'agentTimeout');
    assert.equal(row.entries[0].ms, 31000);
    assert.equal(row.entries[0].by, 'user//tech');
});

test('only the last fifty per computer are kept', async () => {
    const { ctx, rows } = setup();
    for (let i = 0; i < 55; i++) await ops.handle(ctx, { op: 'sessionLog', nodeid: 'node//allowed', outcome: i % 2 ? 'dropped' : 'denied', ms: i });
    const e = rows.get('scpsessionlog/node//allowed').entries;
    assert.equal(e.length, 50);
    assert.equal(e[49].ms, 54);
});

test('the fleet summary counts recent failures by computer and reason, newest trouble first', async () => {
    const { ctx, rows } = setup();
    const now = Date.now(), day = 86400000;
    rows.set('scpsessionlog/node//allowed', { _id: 'scpsessionlog/node//allowed', type: 'scpsessionlog', domain: '', nodeid: 'node//allowed', entries: [
        { at: now - 40 * day, outcome: 'offline', ms: 0, by: 'user//tech' },        // too old to count
        { at: now - 2 * day, outcome: 'agentTimeout', ms: 30000, by: 'user//tech' },
        { at: now - 1 * day, outcome: 'agentTimeout', ms: 30000, by: 'user//tech' },
        { at: now - 3600000, outcome: 'dropped', ms: 500000, by: 'user//tech' }] });
    rows.set('scpsessionlog/node//also', { _id: 'scpsessionlog/node//also', type: 'scpsessionlog', domain: '', nodeid: 'node//also', entries: [{ at: now - 5 * day, outcome: 'denied', ms: 9000, by: 'user//tech' }] });
    rows.set('scpsessionlog/node//hidden', { _id: 'scpsessionlog/node//hidden', type: 'scpsessionlog', domain: '', nodeid: 'node//hidden', entries: [{ at: now, outcome: 'offline', ms: 0, by: 'x' }] });
    const list = await ops.handle(ctx, { op: 'sessionFailures' });
    assert.deepEqual(list.map(x => x.nodeid), ['node//allowed', 'node//also'], 'hidden computers are left out; most recent first');
    assert.equal(list[0].total, 3);
    assert.deepEqual(list[0].reasons, { agentTimeout: 2, dropped: 1 });
    assert.equal(list[0].last.outcome, 'dropped');
    assert.equal(list[1].total, 1);
});

test('technician results are stored per task and per computer, bounded, and merged not replaced', async () => {
    const { ctx, rows } = setup();
    await assert.rejects(ops.handle(ctx, { op: 'techSave', items: 'x' }), /INVALID_INPUT/);
    const r = await ops.handle(ctx, { op: 'techSave', items: [
        { nodeid: 'node//allowed', task: 'bench', at: 1000, data: { read: 510, write: 480 } },
        { nodeid: 'node//allowed', task: 'sfc', at: 2000, data: { ok: true } },
        { nodeid: 'node//other', task: 'bench', at: 1000, data: { read: 1 } },          // not theirs to see
        { nodeid: 'node//allowed', task: 'rm -rf', at: 1, data: {} },                    // not a task
        { nodeid: 'node//allowed', task: 'lan', at: 3, data: { big: 'x'.repeat(200000) } }, // too large
        { nodeid: 'node//allowed', task: 'dism', at: 3, data: 'text' }                   // not an object
    ] });
    assert.equal(r.saved, 2);
    const row = rows.get('scptech/node//allowed');
    assert.deepEqual(Object.keys(row.tasks).sort(), ['bench', 'sfc']);
    assert.deepEqual(row.tasks.bench.data, { read: 510, write: 480 });
    assert.equal(row.tasks.bench.by, 'user//tech');
    assert.equal(rows.has('scptech/node//other'), false);
    // an older result does not overwrite a newer one; a newer one does
    await ops.handle(ctx, { op: 'techSave', items: [{ nodeid: 'node//allowed', task: 'bench', at: 500, data: { read: 1 } }, { nodeid: 'node//allowed', task: 'sfc', at: 9000, data: { ok: false } }] });
    const after = rows.get('scptech/node//allowed');
    assert.deepEqual(after.tasks.bench.data, { read: 510, write: 480 });
    assert.deepEqual(after.tasks.sfc.data, { ok: false });
});

test('technician results come back for every computer this account may see, shaped as the page keeps them', async () => {
    const { ctx, rows } = setup();
    await ops.handle(ctx, { op: 'techSave', items: [{ nodeid: 'node//allowed', task: 'bench', at: 1000, data: { read: 510 } }] });
    rows.set('scptech/node//hidden', { _id: 'scptech/node//hidden', type: 'scptech', domain: '', nodeid: 'node//hidden', tasks: { bench: { data: { read: 9 }, at: 1 } } });
    const map = await ops.handle(ctx, { op: 'techList' });
    assert.deepEqual(Object.keys(map), ['node//allowed']);
    assert.deepEqual(map['node//allowed'].bench, { data: { read: 510 }, at: 1000 });
});

test('both show up in the computer\'s history', async () => {
    const { ctx } = setup();
    await ops.handle(ctx, { op: 'sessionLog', nodeid: 'node//allowed', outcome: 'consentTimeout', ms: 91000 });
    await ops.handle(ctx, { op: 'techSave', items: [{ nodeid: 'node//allowed', task: 'sfc', at: Date.now() - 1000, data: { ok: true } }] });
    const history = await ops.handle(ctx, { op: 'deviceHistory', nodeid: 'node//allowed' });
    const session = history.find(h => h.kind === 'session'), tech = history.find(h => h.kind === 'tech');
    assert.equal(session.outcome, 'consentTimeout');
    assert.equal(session.by, 'tech');
    assert.equal(tech.task, 'sfc');
    assert.equal(tech.by, 'tech');
});
