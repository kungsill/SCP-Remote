'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// The agent reads Device Manager and reports what Windows cannot start. The code runs
// inside the agent's own interpreter and cannot be required here, so it is lifted out of
// the source and run against a stand-in WMI provider. That keeps the real thing honest:
// if somebody edits the query, these tests exercise the edited version.
const source = fs.readFileSync(path.join(__dirname, '../../agents/meshcore.js'), 'utf8');

function loadHelper(rows) {
    const start = source.indexOf('function scpDeviceFaults()');
    assert.ok(start > 0, 'the helper is still in the agent core');
    const end = source.indexOf('\nfunction ', start);
    const body = source.substring(start, end);
    const make = new Function('require', body + '; return scpDeviceFaults;');
    return make((name) => {
        if (name !== 'win-wmi-fixed') { throw new Error('unexpected module ' + name); }
        return { query: (namespace, wql, fields) => {
            assert.ok(/Win32_PnPEntity/.test(wql), 'asks Device Manager for devices');
            assert.ok(/ConfigManagerErrorCode/.test(wql), 'and about their error state');
            if (rows instanceof Error) { throw rows; }
            return rows;
        } };
    });
}

test('a device Windows cannot start is reported', (t) => {
    const faults = loadHelper([
        { Name: 'HP LaserJet 1020', DeviceID: 'USB\\1', ConfigManagerErrorCode: 28 }
    ])();
    assert.equal(faults.length, 1);
    assert.equal(faults[0].name, 'HP LaserJet 1020');
    assert.equal(faults[0].code, 28);
});

test('a device switched off on purpose is not a fault', (t) => {
    // 22 is an administrator disabling something deliberately and 45 is a device simply
    // not plugged in. Reporting either teaches the reader to ignore the whole list.
    const faults = loadHelper([
        { Name: 'Disabled NIC', ConfigManagerErrorCode: 22 },
        { Name: 'Unplugged dock', ConfigManagerErrorCode: 45 },
        { Name: 'Healthy device', ConfigManagerErrorCode: 0 },
        { Name: 'Broken scanner', ConfigManagerErrorCode: 10 }
    ])();
    assert.deepEqual(faults.map(f => f.name), ['Broken scanner']);
});

test('a machine in deep trouble sends a bounded list', (t) => {
    const many = [];
    for (let i = 0; i < 60; i++) { many.push({ Name: 'Device ' + i, ConfigManagerErrorCode: 28 }); }
    assert.equal(loadHelper(many)().length, 20, 'twenty is enough to know a person is needed');
});

test('a Windows without the provider must not break system information', (t) => {
    assert.deepEqual(loadHelper(new Error('WMI provider missing'))(), [],
        'an empty list, not an exception that would lose every other detail');
    assert.deepEqual(loadHelper(null)(), [], 'and the same when it answers with nothing');
});

test('the fault list is attached to the system information the dashboard already reads', (t) => {
    const at = source.indexOf('results.deviceFaults = scpDeviceFaults()');
    assert.ok(at > 0, 'it is attached to the sysinfo results');
    const pending = source.indexOf('results.pendingReboot');
    assert.ok((pending > 0) && (Math.abs(at - pending) < 400),
        'beside pendingReboot, which the dashboard already reads the same way');
});
