'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Two computers sharing a name inside one ward means a technician takes over the wrong
// screen. The guard lives in meshuser.js, an upstream MeshCentral file, so these run
// against the real source: if an upgrade drops the guard, or someone rewrites it to read
// an in-memory node list that does not exist, these fail instead of the check going quiet.
const source = fs.readFileSync(path.join(__dirname, '../../meshuser.js'), 'utf8');

// Pull findDuplicateDeviceInMesh out of the file and hand it a database of our own.
function loadFinder(nodes, err) {
    const start = source.indexOf('    function findDuplicateDeviceInMesh(');
    assert.ok(start > 0, 'findDuplicateDeviceInMesh should still exist in meshuser.js');
    const end = source.indexOf('\n    }', start);
    assert.ok(end > start, 'could not find the end of findDuplicateDeviceInMesh');
    const body = source.substring(start, end + 6);

    const asked = [];
    const db = {
        GetAllTypeNoTypeFieldMeshFiltered: function (meshes, extrasids, domainid, type, id, skip, limit, func) {
            asked.push({ meshes: meshes, domainid: domainid, type: type });
            func(err || null, err ? null : nodes);
        }
    };
    const make = new Function('db', 'domain', body + '\nreturn findDuplicateDeviceInMesh;');
    return { find: make(db, { id: '' }), asked: asked };
}

const ward = [
    { _id: 'node/x/aaa', meshid: 'mesh/x/er', name: 'ER 1', host: '192.168.6.118' },
    { _id: 'node/x/bbb', meshid: 'mesh/x/er', name: 'ER 2', host: '192.168.6.134' }
];

test('a name already used in the group is reported, with the device holding it', () => {
    const l = loadFinder(ward);
    let answer = 'not called';
    l.find('mesh/x/er', 'ER 2', null, 'node/x/aaa', r => { answer = r; });
    assert.notEqual(answer, 'not called', 'the callback must always be called');
    assert.ok(answer != null, 'a duplicate name should be found');
    assert.equal(answer.field, 'name');
    assert.equal(answer.node._id, 'node/x/bbb');
});

test('a free name is allowed', () => {
    const l = loadFinder(ward);
    let answer = 'not called';
    l.find('mesh/x/er', 'ER 3', null, 'node/x/aaa', r => { answer = r; });
    assert.equal(answer, null);
});

test('a device does not collide with itself, so re-saving its own name is allowed', () => {
    const l = loadFinder(ward);
    let answer = 'not called';
    l.find('mesh/x/er', 'ER 1', null, 'node/x/aaa', r => { answer = r; });
    assert.equal(answer, null);
});

test('the same name in different case or with stray spaces still counts as taken', () => {
    const l = loadFinder(ward);
    let answer = 'not called';
    l.find('mesh/x/er', '  er 2 ', null, 'node/x/aaa', r => { answer = r; });
    assert.ok(answer != null, 'names should compare without case or surrounding spaces');
    assert.equal(answer.node._id, 'node/x/bbb');
});

test('a hostname already used in the group is reported as a host clash', () => {
    const l = loadFinder(ward);
    let answer = 'not called';
    l.find('mesh/x/er', null, '192.168.6.134', 'node/x/aaa', r => { answer = r; });
    assert.ok(answer != null);
    assert.equal(answer.field, 'host');
    assert.equal(answer.node._id, 'node/x/bbb');
});

test('only the group being renamed into is searched', () => {
    const l = loadFinder(ward);
    l.find('mesh/x/er', 'ER 2', null, 'node/x/aaa', () => { });
    assert.equal(l.asked.length, 1, 'exactly one database query per check');
    assert.deepEqual(l.asked[0].meshes, ['mesh/x/er']);
    assert.equal(l.asked[0].type, 'node');
});

test('a device recorded under another group is never treated as a clash', () => {
    const l = loadFinder([{ _id: 'node/x/ccc', meshid: 'mesh/x/lab', name: 'ER 2' }]);
    let answer = 'not called';
    l.find('mesh/x/er', 'ER 2', null, 'node/x/aaa', r => { answer = r; });
    assert.equal(answer, null);
});

test('a database failure lets the rename through rather than blocking the ward', () => {
    const l = loadFinder(null, new Error('database is busy'));
    let answer = 'not called';
    l.find('mesh/x/er', 'ER 2', null, 'node/x/aaa', r => { answer = r; });
    assert.equal(answer, null, 'a database hiccup must not stop an administrator renaming a device');
});

test('nothing worth checking answers at once, without asking the database', () => {
    for (const [name, host] of [[null, null], ['', ''], ['   ', null]]) {
        const l = loadFinder(ward);
        let answer = 'not called';
        l.find('mesh/x/er', name, host, 'node/x/aaa', r => { answer = r; });
        assert.equal(answer, null);
        assert.equal(l.asked.length, 0, 'an empty name should not cost a database query');
    }
});

test('the check reads the database, not an in-memory node list that does not exist', () => {
    const start = source.indexOf('    function findDuplicateDeviceInMesh(');
    const body = source.substring(start, source.indexOf('\n    }', start));
    assert.ok(body.includes('GetAllTypeNoTypeFieldMeshFiltered'), 'the group must be read from the database');
    assert.ok(!body.includes('parent.nodes'), 'parent.nodes does not exist; reading it silently finds nothing');
    assert.ok(!/parent\.meshes\[[^\]]*\]\.nodes/.test(body), 'mesh records carry no node list; reading one silently finds nothing');
});

test('changedevice refuses the rename before writing, and only then', () => {
    const at = source.indexOf("case 'changedevice':");
    assert.ok(at > 0, 'the changedevice handler should still exist');
    const handler = source.substring(at, source.indexOf("case 'uploadagentcore':", at));
    assert.ok(handler.includes('findDuplicateDeviceInMesh('), 'changedevice must ask before it writes');
    assert.ok(handler.includes('scpApplyDeviceChange()'), 'the write path must be held behind the check');

    // The refusal has to come before the node is touched: the first thing the handler does
    // with a name is ask, and only the callback reaches the code that assigns node.name.
    const asks = handler.indexOf('findDuplicateDeviceInMesh(');
    const writes = handler.indexOf('node.name = command.name');
    assert.ok(writes > asks, 'the duplicate check must run before node.name is assigned');
});

test('a refused rename is said on screen, not only in a response nobody asked for', () => {
    const at = source.indexOf("case 'changedevice':");
    const handler = source.substring(at, source.indexOf("case 'uploadagentcore':", at));
    const refusal = handler.substring(handler.indexOf('findDuplicateDeviceInMesh('));

    // views/default.handlebars sends the rename without a responseid, so a result alone is
    // swallowed and the name just fails to change. The notify is the only thing the person sees.
    assert.ok(/type: 'notify'/.test(refusal), 'the refusal must reach the screen as a notification');
    assert.ok(refusal.indexOf("type: 'notify'") < refusal.indexOf('command.responseid'),
        'the notification must not be conditional on a responseid being present');
});

test('the rename dialog still sends no responseid, which is why the notification is needed', () => {
    // If this ever fails, the dialog learned to ask for a response and the refusal could be
    // reported inline instead — at which point revisit the notification above.
    const ui = fs.readFileSync(path.join(__dirname, '../../views/default.handlebars'), 'utf8');
    const send = ui.indexOf("var x = { action: 'changedevice', nodeid: currentNode._id };");
    assert.ok(send > 0, 'showEditNodeValueDialogEx should still send changedevice');
    assert.ok(!ui.substring(send, send + 400).includes('responseid'), 'the rename dialog sends no responseid');
});

test('asking the database for a whole group really returns the whole group', () => {
    // findDuplicateDeviceInMesh passes skip 0 and limit 0, the way the device list does. If
    // NeDB ever read limit 0 as "no documents" rather than "no limit", the check would find
    // nothing and wave every duplicate through - silently, which is how the version it
    // replaced failed. Ask the installed database rather than trusting the reading.
    const Datastore = require('@seald-io/nedb');
    const db = new Datastore();
    const query = { type: 'node', domain: '', meshid: { $in: ['mesh/x/er'] } };
    return new Promise((resolve, reject) => {
        db.insert([
            { type: 'node', domain: '', meshid: 'mesh/x/er', name: 'ER 1' },
            { type: 'node', domain: '', meshid: 'mesh/x/er', name: 'ER 2' },
            { type: 'node', domain: '', meshid: 'mesh/x/lab', name: 'Lab 1' }
        ], err => {
            if (err) { reject(err); return; }
            db.find(query).sort({ name: 1 }).skip(0).limit(0).exec((e, rows) => {
                try {
                    assert.equal(e, null);
                    assert.equal(rows.length, 2, 'limit 0 must mean no limit, not no rows');
                    resolve();
                } catch (ex) { reject(ex); }
            });
        });
    });
});
