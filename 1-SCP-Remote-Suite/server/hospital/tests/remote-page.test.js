'use strict';
// The Remote page: the first thing in the left menu. Find a computer by name, IP, user or
// department, see whether it is on, press Remote. Nothing else is on the page, so a technician
// who only wants to help someone does not have to read the dashboard first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../../public/styles/scp-dashboard.css'), 'utf8');
const page = src.slice(src.indexOf('function renderRemotePage('), src.indexOf('function matchesRemote('));

test('the Remote entry is the first button in the left menu, above the dashboard', () => {
    assert.match(src, /remoteNavButton\.id = 'LeftMenuScpRemote'/);
    assert.match(src, /bar\.insertBefore\(remoteNavButton, first\);\s*\n\s*bar\.insertBefore\(navButton, first\);/);
});

test('each menu button opens its own page: Remote the remote page, Dashboard the dashboard', () => {
    assert.match(src, /function openRemotePage\(\) \{ remoteMode = true;/);
    assert.match(src, /function openDashboardPage\(\) \{ remoteMode = false;/);
    assert.match(src, /getElementById\(remoteMode \? 'LeftMenuScpRemote' : 'LeftMenuScpDashboard'\)/, 'the right one is highlighted');
    assert.match(src, /panel\.classList\.toggle\('scp-dash-remote-mode', remoteMode\)/);
    assert.match(css, /\.scp-dash-remote-mode \.scp-dash-heading\s*\{\s*display:\s*none/, 'the dashboard heading and its menus are not shown on the Remote page');
});

test('the page is drawn instead of the dashboard, not on top of it', () => {
    assert.match(src, /if \(remoteMode\) \{ renderRemotePage\(list, remoteCaret\); panel\.scrollTop = scrollTop; return; \}/);
});

test('a computer that is on has a Remote button that uses the normal remote path', () => {
    assert.ok(page.length > 500, 'renderRemotePage is where it is expected');
    // openRemote goes through gotoDevice, so consent, rights and logging are exactly as before
    assert.match(page, /openRemote\(node\)/);
    assert.doesNotMatch(page, /meshserver\.send|runcommands|CreateAgentRedirect/);
});

test('a computer that is off says why instead of offering a button that fails', () => {
    assert.match(page, /go\.disabled = true/);
    assert.match(page, /เครื่องปิดอยู่ หรือไม่ได้ต่อเครือข่าย/);
});

test('searching looks in every department, whatever department filter is on', () => {
    assert.match(page, /remoteText \? matchesRemote\(node\) : roomShown\(roomOf\(node\)\)/);
    const m = src.slice(src.indexOf('function matchesRemote('), src.indexOf('function matchesRemote(') + 400);
    assert.match(m, /node\.name, node\.rname, node\.host, node\.ip, signedInUser\(node\), roomOf\(node\)/);
});

test('typing is not interrupted by the page refreshing itself every ten seconds', () => {
    // noted before the page is cleared: clearing removes the box, and with it the focus
    assert.match(src, /var remoteCaret = \(remoteFind && document\.activeElement === remoteFind\) \? remoteFind\.selectionStart : -1;\s*\n\s*body\.textContent = '';/);
    assert.match(page, /if \(hadFocus\) \{ remoteFind\.focus\(\);/);
});

test('computers that are on come first', () => {
    assert.match(page, /\(isOnline\(b\) \? 1 : 0\) - \(isOnline\(a\) \? 1 : 0\)/);
});
