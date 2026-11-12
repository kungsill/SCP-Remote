'use strict';
// One installer for the whole hospital: every newly installed computer arrives in one arrival
// group (ทดสอบ). The dashboard shows those computers on its first page, whatever department
// filter is on, with one button each to move the computer to the department it belongs to.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8');

function isIntake() {
    const m = /function isIntakeGroupName\(name\) \{[^\n]*\}/.exec(src);
    assert.ok(m, 'isIntakeGroupName should still be one line in scp-dashboard.js');
    const ctx = {}; vm.createContext(ctx); vm.runInContext(m[0], ctx);
    return name => vm.runInContext('isIntakeGroupName(n)', Object.assign(ctx, { n: name }));
}

test('the arrival group is ทดสอบ, or the "new computers" group the dashboard makes itself', () => {
    const f = isIntake();
    assert.equal(f('ทดสอบ'), true);
    assert.equal(f(' ทดสอบ '), true);
    assert.equal(f('เครื่องใหม่'), true);
    assert.equal(f('New computers'), true);
});

test('real departments are never treated as the arrival group', () => {
    const f = isIntake();
    for (const name of ['ER', 'OPD', 'ห้องยา', 'แผนไทย', 'ห้องทดสอบสมรรถภาพ', 'ทดสอบระบบ', '', null, undefined]) {
        assert.equal(f(name), false, String(name));
    }
});

test('the new computers are listed from every computer, not from the department filter', () => {
    const fn = src.slice(src.indexOf('function intakePanel()'), src.indexOf('function moveComputer('));
    assert.ok(fn.length > 200, 'intakePanel should come just before moveComputer');
    assert.match(fn, /allNodes\(\)\.filter\(/);
    assert.match(fn, /if \(!fresh\.length\) return null;/, 'nothing new: no panel at all');
    assert.match(fn, /moveComputer\(node\)/);
});

test('the panel sits on the first page, above the fleet summary', () => {
    assert.match(src, /var intake = intakePanel\(\); if \(intake\) sections\.overview\.appendChild\(intake\);\s*\n\s*overview\.appendChild\(fleet\)/);
});

test('moving uses MeshCentral\'s own command, so its permission checks still apply', () => {
    const fn = src.slice(src.indexOf('function moveComputer('), src.indexOf('// Line icons in the same style'));
    assert.match(fn, /action: 'changeDeviceMesh', nodeids: \[node\._id\], meshid: g\._id/);
    assert.match(fn, /g\._id !== node\.meshid/, 'the group it is already in is not offered');
    // the server may refuse (no right on the target group): say so instead of pretending
    assert.match(fn, /moveFailed/);
    assert.doesNotMatch(fn, /runcommands|createmesh|removedevices/);
});
