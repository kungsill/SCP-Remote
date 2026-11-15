'use strict';
// The repair form's own lists: symptoms and departments IT staff add themselves, kept on the
// server so everyone sees the same ones, next to the built-in lists in scp-ticket-presets.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ops = require('../operations');

function setup(siteadmin = 0) {
    const rows = new Map();
    const db = {
        Get: (id, cb) => cb(null, rows.has(id) ? [structuredClone(rows.get(id))] : []),
        Set: (r, cb) => { rows.set(r._id, structuredClone(r)); cb(); },
        GetAllTypeNoTypeField: (t, d, cb) => cb(null, [...rows.values()].filter(r => r.type === t && r.domain === d)),
        Remove: (id, cb) => { rows.delete(id); cb(); },
    };
    const user = { _id: 'user//tech', name: 'tech', domain: '', siteadmin };
    const parent = { users: { 'user//tech': user }, GetNodeWithRights: (d, u, id, cb) => cb(id === 'node//allowed' ? {} : null, 8, true) };
    return { ctx: { db, parent, user, domain: { id: '' } }, rows };
}

test('empty to start with', async () => {
    const { ctx } = setup();
    assert.deepEqual(await ops.handle(ctx, { op: 'ticketLists' }), { symptoms: [], departments: [] });
});

test('a symptom added is there for the next form, with who added it', async () => {
    const { ctx } = setup();
    await ops.handle(ctx, { op: 'ticketListsSave', kind: 'symptoms', action: 'add', title: ' จอทัชสกรีนไม่ตอบสนอง ', description: 'ทำความสะอาดจอ ตั้งค่า Calibrate ใหม่' });
    const lists = await ops.handle(ctx, { op: 'ticketLists' });
    assert.equal(lists.symptoms.length, 1);
    assert.equal(lists.symptoms[0].title, 'จอทัชสกรีนไม่ตอบสนอง');
    assert.equal(lists.symptoms[0].description, 'ทำความสะอาดจอ ตั้งค่า Calibrate ใหม่');
    assert.equal(lists.symptoms[0].by, 'tech');
});

test('adding the same title again updates it instead of a second copy', async () => {
    const { ctx } = setup();
    await ops.handle(ctx, { op: 'ticketListsSave', kind: 'symptoms', action: 'add', title: 'A', description: 'one' });
    await ops.handle(ctx, { op: 'ticketListsSave', kind: 'symptoms', action: 'add', title: 'a ', description: 'two' });
    const lists = await ops.handle(ctx, { op: 'ticketLists' });
    assert.equal(lists.symptoms.length, 1);
    assert.equal(lists.symptoms[0].description, 'two');
});

test('departments are added once and removed by name', async () => {
    const { ctx } = setup();
    await ops.handle(ctx, { op: 'ticketListsSave', kind: 'departments', action: 'add', name: 'ห้องแยกโรค' });
    await ops.handle(ctx, { op: 'ticketListsSave', kind: 'departments', action: 'add', name: 'ห้องแยกโรค' });
    assert.deepEqual((await ops.handle(ctx, { op: 'ticketLists' })).departments.map(d => d.name), ['ห้องแยกโรค']);
    const after = await ops.handle(ctx, { op: 'ticketListsSave', kind: 'departments', action: 'remove', name: 'ห้องแยกโรค' });
    assert.deepEqual(after.departments, []);
});

test('bad input is refused', async () => {
    const { ctx } = setup();
    await assert.rejects(ops.handle(ctx, { op: 'ticketListsSave', kind: 'symptoms', action: 'add', title: '   ' }), /INVALID_INPUT/);
    await assert.rejects(ops.handle(ctx, { op: 'ticketListsSave', kind: 'users', action: 'add', name: 'x' }), /INVALID_INPUT/);
    await assert.rejects(ops.handle(ctx, { op: 'ticketListsSave', kind: 'symptoms', action: 'wipe' }), /INVALID_INPUT/);
    await assert.rejects(ops.handle(ctx, { op: 'ticketListsSave', kind: 'symptoms', action: 'add', title: 'x'.repeat(201) }), /INVALID_INPUT/);
});

test('the lists stay a sensible size', async () => {
    const { ctx } = setup();
    for (let i = 0; i < 300; i++) await ops.handle(ctx, { op: 'ticketListsSave', kind: 'departments', action: 'add', name: 'dept ' + i });
    assert.equal((await ops.handle(ctx, { op: 'ticketLists' })).departments.length, 200);
});
