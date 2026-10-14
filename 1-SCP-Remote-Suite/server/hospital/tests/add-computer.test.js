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

test('the empty dashboard, refresh with no computers, and the Care menu all lead there', () => {
    assert.match(src, /if \(!allNodes\(\)\.length\) \{ empty\.appendChild\(element\('br'\)\); empty\.appendChild\(button\(thai \? '➕ เพิ่มเครื่องแรก/);
    assert.match(src, /button\(t\('refresh'\), 'scp-dash-refresh', function \(\) \{ render\(\); if \(!allNodes\(\)\.length\) \{ addComputer\(\); \} \}\)/);
    assert.match(src, /button\(thai \? '➕ เพิ่มเครื่อง \(ติดตั้งเอเจนต์\)' : '➕ Add a computer', 'scp-dash-refresh', addComputer\)/);
    assert.match(src, /order: \[\/เพิ่มเครื่อง\|Add a computer\/, \/งานช่างค้าง/, 'first in the Care menu');
});
