'use strict';
// "Fix printing" from the SCP-Remote program: find the computer, press the button beside
// Connect, confirm, done - without opening its screen.
//
// The program was built to be unable to run commands on anyone's computer, and that stays
// true. What it may send is the name of one computer; the command itself is the server's own
// fixed printer fix. The server checks the program is approved for that computer's room and
// that the account it acts for may run commands there, and writes down that the program did it.
//
// It cannot be undone - the jobs waiting in the queue are deleted - so the program asks first,
// naming the computer, and the question is asked by the program's own process where the page
// cannot skip it. Cancel is the default button.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../desktop-clients');
const mobile = require('../mobile');

const appDir = path.join(__dirname, '../desktop-app');
const read = name => fs.readFileSync(path.join(appDir, name), 'utf8');

function setup() {
    const rows = new Map(), sent = [];
    const db = {
        Get: (id, cb) => cb(null, rows.has(id) ? [structuredClone(rows.get(id))] : []),
        Set: (r, cb) => { rows.set(r._id, structuredClone(r)); if (cb) cb(); },
        Remove: (id, cb) => { rows.delete(id); cb(); },
        GetAllTypeNoTypeField: (type, domain, cb) => cb(null, [...rows.values()].filter(r => r.type === type && r.domain === domain).map(r => { const c = structuredClone(r); delete c.type; return c; }))
    };
    const user = { _id: 'user//admin', siteadmin: 0xFFFFFFFF, domain: '' };
    const agent = id => ({ authenticated: 2, agentInfo: { agentId: 4 }, send: text => sent.push({ id, command: JSON.parse(text) }) });
    const web = {
        db, users: { [user._id]: user },
        meshes: { 'mesh//a': { _id: 'mesh//a', name: 'Room A', domain: '' }, 'mesh//b': { _id: 'mesh//b', name: 'Room B', domain: '' } },
        wsagents: { 'node//a': agent('node//a'), 'node//b': agent('node//b') },
        rights: 0xFFFFFFFF,
        GetNodeWithRights: (domain, u, nodeid, cb) => cb(rows.get(nodeid) || null, web.rights, true),
        CreateNodeDispatchTargets: (m, n) => [m, n],
        parent: { encodeCookie: () => 'signed-cookie', DispatchEvent: () => { }, config: { domains: { '': { id: '' } } } }
    };
    for (const x of ['a', 'b']) rows.set('node//' + x, { _id: 'node//' + x, type: 'node', domain: '', meshid: 'mesh//' + x, name: 'PC ' + x, agent: { scpRelease: '2026.09.21.5' }, host: '192.168.1.' + (x === 'a' ? 1 : 2) });
    return { web, ctx: { db, parent: web, user, domain: { id: '' } }, rows, sent, token: 'a'.repeat(64) };
}
async function approved(s, rooms) {
    await api.api(s.web, { op: 'register', name: 'IT-TEST' }, s.token);
    const c = [...s.rows.values()].find(r => r.type === 'scpclient');
    await api.handle(s.ctx, { op: 'desktopClientApprove', id: c._id, rooms: rooms || ['mesh//a'] });
    return c;
}
const answer = (s, i, result) => mobile.receive(s.sent[i].id, { responseid: s.sent[i].command.responseid, result });
const tick = () => new Promise(r => setTimeout(r, 5));

test('an approved program fixes printing on a computer in its room, and gets the result back', async () => {
    const s = setup(); await approved(s);
    const pending = api.api(s.web, { op: 'fixPrinter', nodeid: 'node//a' }, s.token);
    await tick();
    assert.equal(s.sent.length, 1);
    const cmd = s.sent[0].command;
    assert.equal(cmd.action, 'runcommands');
    assert.match(cmd.responseid, /^scpmfix/, 'the answer comes back through the same door as the website\'s fix');
    assert.match(cmd.cmds, /Spooler/, 'the server\'s own printer fix');
    answer(s, 0, 'noise\nSCP_FIX:{"ok":true,"before":3,"after":0,"spooler":"Running"}\n');
    assert.deepEqual(await pending, { ok: true, before: 3, after: 0, spooler: 'Running' });
});

test('what the program sends cannot choose the command', async () => {
    const s = setup(); await approved(s);
    const pending = api.api(s.web, { op: 'fixPrinter', nodeid: 'node//a', cmds: 'format c:', action: 'x', script: 'evil', type: 1 }, s.token);
    await tick();
    assert.doesNotMatch(s.sent[0].command.cmds, /format c:|evil/);
    answer(s, 0, 'SCP_FIX:{"ok":true,"before":0,"after":0,"spooler":"Running"}');
    await pending;
    const source = fs.readFileSync(path.join(__dirname, '../desktop-clients.js'), 'utf8');
    const op = source.slice(source.indexOf("input.op==='fixPrinter'"), source.indexOf("input.op==='connect'"));
    assert.doesNotMatch(op, /input\.(cmds|script|command|action)/);
});

test('it is recorded in the computer\'s history that the program did it', async () => {
    const s = setup(); await approved(s);
    const pending = api.api(s.web, { op: 'fixPrinter', nodeid: 'node//a' }, s.token);
    await tick(); answer(s, 0, 'SCP_FIX:{"ok":true,"before":1,"after":0,"spooler":"Running"}'); await pending; await tick();
    const log = s.rows.get('scphealthlog/node//a');
    assert.equal(log.entries.length, 1);
    assert.equal(log.entries[0].action, 'printer_fix');
    assert.equal(log.entries[0].by, 'user//admin');
    assert.match(log.entries[0].from, /^app: IT-TEST/);
});

test('refused: a room the program was not approved for, a program not approved, an account without the right', async () => {
    const s = setup(); await approved(s, ['mesh//a']);
    await assert.rejects(api.api(s.web, { op: 'fixPrinter', nodeid: 'node//b' }, s.token), /ACCESS_DENIED/);
    await assert.rejects(api.api(s.web, { op: 'fixPrinter', nodeid: 'node//nope' }, s.token), /ACCESS_DENIED/);
    s.web.rights = 8; // remote control but not remote commands
    await assert.rejects(api.api(s.web, { op: 'fixPrinter', nodeid: 'node//a' }, s.token), /ACCESS_DENIED/);
    assert.equal(s.sent.length, 0, 'nothing reached any computer');
    const fresh = setup();
    await api.api(fresh.web, { op: 'register', name: 'NEW' }, fresh.token);
    await assert.rejects(api.api(fresh.web, { op: 'fixPrinter', nodeid: 'node//a' }, fresh.token), /APPROVAL_REQUIRED/);
});

test('a computer that is off, or is not Windows, is refused plainly', async () => {
    const s = setup(); await approved(s);
    delete s.web.wsagents['node//a'];
    await assert.rejects(api.api(s.web, { op: 'fixPrinter', nodeid: 'node//a' }, s.token), /NOT_ONLINE/);
    s.web.wsagents['node//a'] = { authenticated: 2, agentInfo: { agentId: 6 }, send() { throw Error('should not send'); } };
    await assert.rejects(api.api(s.web, { op: 'fixPrinter', nodeid: 'node//a' }, s.token), /NOT_ONLINE/);
});

test('a computer busy with another command says so, and waiting for the answer does not hold up the program', async () => {
    const s = setup(); await approved(s);
    const pending = api.api(s.web, { op: 'fixPrinter', nodeid: 'node//a' }, s.token);
    await tick();
    // the device list still answers while the fix is waiting for the computer
    const list = await api.api(s.web, { op: 'devices' }, s.token);
    assert.equal(list.nodes.length, 1);
    answer(s, 0, 'COMMAND_BUSY');
    await assert.rejects(pending, /COMMAND_BUSY/);
});

test('the program asks first, names the computer, and Cancel is the default', () => {
    const main = read('main.js');
    const at = main.indexOf("handle('scp:fix-printer'");
    assert.ok(at > 0);
    const fn = main.slice(at, main.indexOf("handle('scp:connect'"));
    assert.match(fn, /dialog\.showMessageBox\(/, 'asked by the main process, where the page cannot skip it');
    assert.match(fn, /defaultId:1,cancelId:1/, 'Enter or Escape cancels');
    assert.ok(fn.indexOf('showMessageBox') < fn.indexOf("op:'fixPrinter'"), 'the question comes before anything is sent');
    assert.match(fn, /if\(answer\.response!==0\)return \{cancelled:true\};/);
    assert.match(fn, /name/); assert.match(fn, /ip/);
    assert.match(read('preload.js'), /fixPrinter:\(nodeid,name,ip,room\)=>ipcRenderer\.invoke\('scp:fix-printer',nodeid,name,ip,room\)/);
});

test('the button sits beside Connect on each card and is off for a computer that is off', () => {
    const r = read('renderer.js');
    const at = r.indexOf("'vnc-fix-btn'");
    assert.ok(at > 0);
    const part = r.slice(at - 200, at + 1400);
    assert.match(part, /fix\.disabled = !n\.online/);
    assert.match(part, /e\.stopPropagation\(\)/, 'pressing it does not also select or connect');
    assert.match(part, /window\.scp\.fixPrinter\(n\.id, n\.name, n\.ip/);
    assert.match(read('style.css'), /\.vnc-fix-btn/);
});
