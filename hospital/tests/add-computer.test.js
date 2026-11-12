'use strict';
// Adding a computer from the dashboard: a new server has nothing to show and no device group,
// so the dashboard must lead straight to the install page instead of an empty screen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8');

test('add a computer opens MeshCentral\'s add-agent dialog, making the first device group when there is none', () => {
    const fn = src.slice(src.indexOf('function addComputer()'), src.indexOf('// Line icons in the same style'));
    assert.match(fn, /window\.addAgentToMesh\(g\._id\)/);
    assert.match(fn, /action: 'createmesh', meshtype: 2, meshname: thai \? 'เครื่องใหม่'/);
    assert.match(fn, /groups\.length === 1\) \{ open\(groups\[0\]\)/, 'one group: straight to the install page');
    assert.match(fn, /overlayDialog\(/, 'several groups: ask which');
});

test('the empty dashboard and refresh with no computers lead there', () => {
    assert.match(src, /if \(!allNodes\(\)\.length\) \{ empty\.appendChild\(element\('br'\)\); empty\.appendChild\(button\(thai \? '➕ เพิ่มเครื่องแรก/);
    assert.match(src, /button\(t\('refresh'\), 'scp-dash-refresh', function \(\) \{ render\(\); if \(!allNodes\(\)\.length\) \{ addComputer\(\); \} \}\)/);
});

test('the Care menu no longer offers to add a computer', () => {
    // Removed at the administrator's request on 12 Nov 2026: with computers already enrolled
    // it sat first in the menu and is not something used day to day. A server with no
    // computers still leads to the install page (above); otherwise use the device group page.
    assert.doesNotMatch(src, /'➕ เพิ่มเครื่อง \(ติดตั้งเอเจนต์\)'/);
    assert.doesNotMatch(src, /order: \[\/เพิ่มเครื่อง/);
});
