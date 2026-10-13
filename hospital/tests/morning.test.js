'use strict';
// The morning health check (hospital/morning-check.js), disk trends, and the phone's
// "fix printing" button (hospital/mobile.js m-fix).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const morning = require('../morning-check');
const mobile = require('../mobile');

function fakeDb() {
    const rows = new Map();
    return { rows, Get(id, cb) { cb(null, rows.has(id) ? [rows.get(id)] : []); }, Set(row, cb) { rows.set(row._id, JSON.parse(JSON.stringify(row))); if (cb) cb(); } };
}
function agent(id) { const sent = []; return { sent, authenticated: 2, agentInfo: { agentId: id }, domain: { id: '' }, send(m) { sent.push(JSON.parse(m)); } }; }

test('it runs once a day, at the set time, and can be turned off', () => {
    const db = fakeDb();
    const parent = { db, config: { settings: {} }, webserver: { wsagents: {} } };
    const m = morning.CreateScpMorning(parent);
    let runs = 0; m.run = () => { runs++; };
    assert.equal(m.tick(new Date(2026, 9, 13, 7, 0)), false, 'not before 07:30');
    assert.equal(m.tick(new Date(2026, 9, 13, 7, 30)), true);
    assert.equal(m.tick(new Date(2026, 9, 13, 8, 0)), false, 'once a day');
    assert.equal(m.tick(new Date(2026, 9, 14, 13, 0)), false, 'a server started in the afternoon does not run the morning check');
    assert.equal(m.tick(new Date(2026, 9, 15, 9, 0)), true, 'started a little late still runs');
    parent.config.settings.scpmorningcheck = 'off';
    assert.equal(m.tick(new Date(2026, 9, 16, 7, 45)), false);
    parent.config.settings.scpmorningcheck = '06:15';
    assert.equal(m.tick(new Date(2026, 9, 17, 6, 20)), true);
    assert.equal(runs, 3);
});

test('it sends the read-only check to Windows computers only, keeps the answers and a history', async () => {
    const db = fakeDb();
    const win = agent(3), mac = agent(16);
    db.Set({ _id: 'node//pc1', name: 'ห้องยา-1' });
    const parent = { db, config: { settings: {} }, webserver: { wsagents: { 'node//pc1': win, 'node//mac': mac } } };
    const m = morning.CreateScpMorning(parent);
    const done = m.run('test');
    assert.equal(win.sent.length, 1);
    assert.equal(mac.sent.length, 0, 'not to a Mac');
    const cmd = win.sent[0];
    assert.equal(cmd.action, 'runcommands');
    assert.match(cmd.cmds, /SCP_HEALTH:/);
    assert.doesNotMatch(cmd.cmds, /Remove-Item|Stop-Service|Restart-Service|New-ItemProperty/);
    const data = { upDays: 21, ramPct: 40, ramGb: 8, cpu: 5, freeGb: 3, diskGb: 100, diskType: 'SSD', adapters: ['e'], ip: '10.0.0.2', gw: '10.0.0.1', gwOk: true, dnsOk: true, netOk: true, spooler: 'Running', jobs: 2, oldestJobMin: 30, printers: [], startup: [], tempMb: 10, fontsMissing: [], thSarabun: true };
    assert.equal(m.receive('node//pc1', '', { responseid: 'other', result: '' }), false, 'ignores answers to other requests');
    assert.equal(m.receive('node//pc1', '', { responseid: cmd.responseid, result: 'noise\nSCP_HEALTH:' + JSON.stringify(data) + '\n' }), true);
    const summary = await done;
    assert.equal(summary.checked, 1);
    assert.equal(summary.problems.length, 1);
    assert.equal(summary.problems[0].name, 'ห้องยา-1');
    assert.match(summary.text, /ห้องยา-1/);
    assert.equal(db.rows.get('scphealth/node//pc1').data.freeGb, 3);
    assert.equal(db.rows.get('scphealthhist/node//pc1').entries.length, 1);
    assert.equal(db.rows.get('scpmorning/').checked, 1);
});

test('the summary leaves the server only when a destination is set', async () => {
    const r = await morning.deliver({}, { text: 'x', problems: [], at: Date.now(), checked: 0 });
    assert.deepEqual(r, { sent: 0, tried: 0 });
    const r2 = await morning.deliver({ scptelegram: { token: 'not a token', chat: 1 } }, { text: 'x', problems: [], at: Date.now(), checked: 0 });
    assert.equal(r2.tried, 0, 'a malformed Telegram token is not used');
});

test('disk trend: days until full from the morning checks', () => {
    const window = {};
    new Function('window', 'document', 'btoa', 'location', fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-health.js'), 'utf8'))(window, { documentElement: { lang: 'th' } }, s => Buffer.from(s, 'binary').toString('base64'), { href: 'https://x/' });
    const day = 86400000, t0 = Date.UTC(2026, 9, 1);
    const shrinking = Array.from({ length: 10 }, (_, i) => ({ at: t0 + i * day, freeGb: 20 - i }));
    assert.equal(window.ScpHealth.daysUntilFull(shrinking), 11);
    const steady = Array.from({ length: 10 }, (_, i) => ({ at: t0 + i * day, freeGb: 50 }));
    assert.equal(window.ScpHealth.daysUntilFull(steady), null);
    assert.equal(window.ScpHealth.daysUntilFull(shrinking.slice(0, 3)), null, 'too few points to say');
});

function fakeRes() {
    const res = { code: 200, body: null, headers: {}, status(c) { res.code = c; return res; }, json(b) { res.body = b; return res; }, setHeader(k, v) { res.headers[k] = v; } };
    return res;
}
function fakeReq(body, headers) {
    const handlers = {};
    const req = { session: { userid: 'user//it' }, get: h => (headers || {})[h], setEncoding() { }, on(ev, fn) { handlers[ev] = fn; return req; }, destroy() { } };
    setImmediate(() => { handlers.data && handlers.data(JSON.stringify(body)); handlers.end && handlers.end(); });
    return req;
}
test('fix printing from the phone: needs the header, the Run Commands right, and answers with the result', async () => {
    const db = fakeDb();
    const pc = agent(3);
    const web = { users: { 'user//it': { _id: 'user//it' } }, db, wsagents: { 'node//pc1': pc }, parent: { config: { domains: { '': { id: '' } } } },
        GetNodeWithRights(d, u, id, cb) { cb(id === 'node//pc1' ? { _id: id } : null, web.rights, true); }, rights: 0x00020000 };
    // a request another site could forge has no header
    let res = fakeRes(); mobile.fix(web, fakeReq({ nodeid: 'node//pc1', action: 'printer' }, {}), res);
    assert.equal(res.code, 403);
    // without the right
    web.rights = 0x8; res = fakeRes(); mobile.fix(web, fakeReq({ nodeid: 'node//pc1', action: 'printer' }, { 'X-SCP-Request': '1' }), res);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(res.body.error, 'ACCESS_DENIED');
    assert.equal(pc.sent.length, 0);
    // with it
    web.rights = 0x00020000; res = fakeRes(); mobile.fix(web, fakeReq({ nodeid: 'node//pc1', action: 'printer' }, { 'X-SCP-Request': '1' }), res);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(pc.sent.length, 1);
    assert.match(pc.sent[0].cmds, /spool\\\\PRINTERS|spool\\PRINTERS/);
    const ok = mobile.receive('node//pc1', { responseid: pc.sent[0].responseid, result: 'SCP_FIX:{"action":"printer_fix","ok":true,"before":4,"after":0,"spooler":"Running"}' });
    assert.equal(ok, true);
    assert.deepEqual(res.body, { ok: true, before: 4, after: 0, spooler: 'Running' });
    const log = db.rows.get('scphealthlog/node//pc1');
    assert.equal(log.entries[0].by, 'user//it');
    assert.equal(log.entries[0].from, 'mobile');
});
