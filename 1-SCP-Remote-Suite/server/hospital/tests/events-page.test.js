'use strict';
// My Events as "what happened". The records below are shaped like the server's, using the message
// ids in eventsMessageId (views/default.handlebars).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const view = fs.readFileSync(path.join(root, 'views/default.handlebars'), 'utf8');
const day = new Date(); day.setHours(11, 0, 0, 0);
const at = (h, m, s) => { const d = new Date(day); d.setHours(h, m, s || 0); return d.toISOString(); };
let seq = 0;
const ev = (o) => Object.assign({ msg: 'x', etype: 'relay', action: 'relaylog', h: ++seq }, o); // the page gives each record an h
const APP = { username: 'admin', guestname: 'SCP-App: DESKTOP-TA7KT4Q [054018]' };
const events = [
    // a program session to ARI with files, 11:52:30 - 11:52:32
    ev(Object.assign({ time: at(11, 52, 29), etype: 'node', action: 'addedDeviceShare', nodeid: 'node//ari', msg: 'SCP-Remote app requested consent: DESKTOP-TA7KT4Q' })),
    ev(Object.assign({ time: at(11, 52, 30), msgid: 15, msgArgs: ['n4wn', '192.168.2.25', '192.168.7.71'], nodeid: 'node//ari' }, APP)),
    ev({ time: at(11, 52, 30), etype: 'node', action: 'agentlog', msgid: 35, nodeid: 'node//ari' }),
    ev(Object.assign({ time: at(11, 52, 30), msgid: 16, msgArgs: ['al6l', '192.168.2.25', '192.168.7.71'], nodeid: 'node//ari' }, APP)),
    ev(Object.assign({ time: at(11, 52, 32), msgid: 11, msgArgs: ['n4wn', '192.168.2.25', '192.168.7.71', 1], nodeid: 'node//ari' }, APP)),
    ev(Object.assign({ time: at(11, 52, 32), msgid: 12, msgArgs: ['al6l', '192.168.2.25', '192.168.7.71', 1], nodeid: 'node//ari' }, APP)),
    // a session to test01 that the person there closed, 11:33:21 - 11:35:51
    ev(Object.assign({ time: at(11, 33, 21), msgid: 15, msgArgs: ['l6lh', '192.168.2.25', '192.168.220.193'], nodeid: 'node//t1' }, APP)),
    ev({ time: at(11, 35, 51), etype: 'node', action: 'agentlog', msgid: 29, nodeid: 'node//t1' }),
    ev(Object.assign({ time: at(11, 35, 51), msgid: 11, msgArgs: ['l6lh', '192.168.220.193', '192.168.2.25', 150], nodeid: 'node//t1' }, APP)),
    // sign-ins
    ev({ time: at(12, 5, 43), etype: 'user', action: 'login', msgid: 107, msgArgs: ['::1', 'Edge/157.0.0.0', 'Windows'], username: 'admin' }),
    ev({ time: at(12, 6, 52), etype: 'user', action: 'logout', msgid: 2, username: 'admin' }),
    ev({ time: at(9, 1, 0), etype: 'user', action: 'authfail', msgid: 110, msgArgs: ['203.0.113.9', 'Chrome/150', 'Windows'], username: 'admin' }),
    // power-on noise
    ev({ time: at(8, 0, 0), etype: 'node', action: 'agentlog', msgid: 159, nodeid: 'node//ari' }),
    ev({ time: at(8, 5, 0), etype: 'node', action: 'agentlog', msgid: 159, nodeid: 'node//t1' }),
    ev({ time: at(8, 6, 0), etype: 'node', action: 'agentlog', msgid: 159, nodeid: 'node//t1' }),
    // a record without a message is not shown by the page either
    { time: at(10, 0, 0), etype: 'server', action: 'servertimelinestats' }
].reverse(); // the page keeps them newest first

function page(t) {
    const dom = new JSDOM('<html lang="th"><body><div id=p3><select id=p3limitdropdown><option value=60 selected>60</option><option value="">all</option></select><div id=p3events><table><tr><td>original</td></tr></table></div></div></body></html>', { runScripts: 'outside-only' });
    const w = dom.window, calls = [];
    t.after(() => w.close());
    w.events = events;
    w.nodes = [{ _id: 'node//ari', name: 'ARI เครื่องหมอ' }, { _id: 'node//t1', name: 'test01' }];
    w.eventsUpdate = () => calls.push('eventsUpdate');
    w.gotoDevice = (id, v) => calls.push(['goto', id, v]);
    w.showEventDetails = h => calls.push(['details', h]);
    w.setTimeout = () => 0;
    w.eval(fs.readFileSync(path.join(root, 'public/scripts/scp-events.js'), 'utf8'));
    w.eventsUpdate();
    return { w, doc: w.document, calls };
}
const lines = doc => [...doc.querySelectorAll('.scp-ev-row')].map(r => r.querySelector('.scp-ev-text').textContent.replace(/\s+/g, ' ').trim());

test('one remote session is one line: who, which computer, how long, how, with files', (t) => {
    const { doc } = page(t);
    const ari = lines(doc).find(l => /ARI เครื่องหมอ/.test(l));
    assert.match(ari, /admin รีโมต ARI เครื่องหมอ/);
    assert.match(ari, /1 วินาที/);
    assert.match(ari, /ผ่านโปรแกรม/);
    assert.match(ari, /เปิดช่องทางรับส่งไฟล์/);
    assert.equal(lines(doc).filter(l => /ARI/.test(l)).length, 1, 'six records, one line');
    assert.doesNotMatch(doc.getElementById('scpEventsView').textContent, /n4wn|al6l/, 'no session ids on the page');
});

test('a session the person there closed is marked, and so is a failed sign-in', (t) => {
    const { doc } = page(t);
    const rows = [...doc.querySelectorAll('.scp-ev-row')];
    const t1 = rows.find(r => /test01/.test(r.textContent));
    assert.ok(t1.classList.contains('warn'));
    assert.match(t1.textContent, /3 นาที/);
    assert.match(t1.textContent, /ผู้ใช้กดปิดการเชื่อมต่อเอง/);
    const fail = rows.find(r => /เข้าสู่ระบบไม่สำเร็จ/.test(r.textContent));
    assert.ok(fail.classList.contains('warn'));
    assert.match(fail.textContent, /203\.0\.113\.9/);
    const login = rows.find(r => /admin เข้าสู่ระบบ/.test(r.textContent));
    assert.match(login.textContent, /Edge/);
    assert.match(login.textContent, /ผ่านเครื่องเซิร์ฟเวอร์หรือพร็อกซี/);
});

test('power-on records are folded into one line a day', (t) => {
    const { doc } = page(t);
    const power = lines(doc).filter(l => /ถูกเปิดขึ้น/.test(l));
    assert.deepEqual(power, ['2 เครื่องถูกเปิดขึ้น']);
});

test('today is summed up on top', (t) => {
    const { doc } = page(t);
    const s = doc.querySelector('.scp-ev-summary').textContent;
    assert.match(s, /2 ครั้งที่รีโมต/);
    assert.match(s, /2 เครื่อง/);
    assert.match(s, /เข้าสู่ระบบไม่สำเร็จ 1/);
});

test('filters and search', (t) => {
    const { w, doc } = page(t);
    const press = name => [...doc.querySelectorAll('.scp-ev-filter')].find(b => b.textContent === name).click();
    press('ต้องดู');
    assert.equal(lines(doc).length, 2);
    press('เข้าสู่ระบบ');
    assert.equal(lines(doc).length, 3);
    press('รีโมต');
    assert.equal(lines(doc).length, 2);
    press('ทั้งหมด');
    const find = doc.querySelector('.scp-ev-find');
    find.value = 'test01'; find.dispatchEvent(new w.Event('input'));
    // the session, and the day's power-on line, which includes test01 being switched on
    assert.deepEqual(lines(doc).map(l => /รีโมต test01/.test(l) || /ถูกเปิดขึ้น/.test(l)), [true, true]);
    find.value = '203.0.113'; find.dispatchEvent(new w.Event('input'));
    assert.equal(lines(doc).length, 1, 'an IP finds the sign-in it came from');
});

test('a line opens to the records it was made from, each opening the page\'s own detail', (t) => {
    const { doc, calls } = page(t);
    const row = () => [...doc.querySelectorAll('.scp-ev-row')].find(r => /ARI/.test(r.textContent));
    row().querySelector('.scp-ev-line').click();
    const recs = [...row().querySelectorAll('.scp-ev-rec')];
    assert.equal(recs.length, 6);
    recs[0].click();
    assert.equal(calls.at(-1)[0], 'details');
    [...row().querySelectorAll('button')].find(b => /เปิดหน้าเครื่องนี้/.test(b.textContent)).click();
    assert.deepEqual(calls.at(-1), ['goto', 'node//ari', 10]);
});

test('the detailed log is the page\'s own list, one press away', (t) => {
    const { doc } = page(t);
    const original = doc.getElementById('p3events');
    assert.ok(original.classList.contains('scp-ev-hidden'));
    doc.getElementById('scpEventsRaw').click();
    assert.ok(!original.classList.contains('scp-ev-hidden'));
    assert.match(original.textContent, /original/);
    assert.ok(doc.getElementById('scpEventsView').classList.contains('scp-ev-hidden'));
});

test('the page\'s own drawing still runs, and the page loads this', (t) => {
    const { calls } = page(t);
    assert.ok(calls.includes('eventsUpdate'));
    assert.match(view, /scripts\/scp-events\.js\?v=/);
    assert.match(view, /styles\/scp-events\.css\?v=/);
});


test('unrelated device changes and ambiguous concurrent sessions stay separate', (t) => {
    const { w } = page(t);
    const input = [
        ev({ time: at(10, 0), msgid: 15, msgArgs: ['a'], nodeid: 'node//t1', username: 'one' }),
        ev({ time: at(10, 0), msgid: 15, msgArgs: ['b'], nodeid: 'node//t1', username: 'two' }),
        ev({ time: at(10, 1), action: 'changenode', nodeid: 'node//t1' }),
        ev({ time: at(10, 2), action: 'agentlog', msgid: 29, nodeid: 'node//t1' }),
        ev({ time: at(10, 3), msgid: 16, msgArgs: ['files'], nodeid: 'node//t1', username: 'one' })
    ];
    const items = w.ScpEvents.build(input);
    assert.equal(items.length, 4);
    assert.equal(items.find(i => i.user === 'one').files, true);
    assert.equal(items.find(i => i.user === 'two').files, false);
    assert.equal(items.filter(i => i.forced).length, 0);
    assert.equal(items.reduce((n, i) => n + i.records.length, 0), input.length);
});

test('missing end records do not claim a session is still active', (t) => {
    const { w, doc } = page(t);
    w.events = [ev({ time: at(10, 0), msgid: 15, msgArgs: ['partial'], nodeid: 'node//t1' })];
    w.eventsUpdate();
    assert.equal(w.ScpEvents.build(w.events)[0].secs, null);
    assert.match(doc.getElementById('scpEventsView').textContent, /ไม่พบบันทึกจบในรายการนี้/);
    assert.doesNotMatch(doc.getElementById('scpEventsView').textContent, /ยังเปิดอยู่/);
});

test('summary failure restores the original log', (t) => {
    const { w, doc } = page(t);
    w.events = { invalid: true };
    w.eventsUpdate();
    assert.equal(doc.getElementById('p3events').classList.contains('scp-ev-hidden'), false);
    assert.equal(doc.getElementById('scpEventsView').classList.contains('scp-ev-hidden'), true);
});
