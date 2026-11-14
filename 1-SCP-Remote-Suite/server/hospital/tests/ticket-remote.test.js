'use strict';
// A repair ticket and the remote session that fixes it are one job: open the ticket, press
// Remote, fix it, and on the way back the ticket is waiting to be closed with the repair note.
// And what the technician tools found is kept on the server, not in one browser.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const script = name => fs.readFileSync(path.join(__dirname, '../../public/scripts', name), 'utf8');
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 5)); };

function opsPage(t, tickets, extra) {
    const dom = new JSDOM('<html lang="th"><body></body></html>', { runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window, sent = [], remoted = [];
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.nodes = [{ _id: 'node//1', name: 'ER-NURSE-1', conn: 1 }, { _id: 'node//2', name: 'RX-COUNTER', conn: 0 }];
    w.userinfo = { _id: 'user//tech', siteadmin: 0 };
    w.users = { 'user//tech': { _id: 'user//tech', name: 'tech' } };
    w.ScpDashboard = { openRemote: node => remoted.push(node._id) };
    Object.assign(w, extra || {});
    // answer every request the way the server would
    w.meshserver = { send: c => { sent.push(c); setTimeout(() => {
        let result;
        if (c.op === 'tickets') result = tickets;
        else if (c.op === 'updateTicket') { const row = tickets.find(x => x._id === c.id); Object.assign(row, { status: c.status, assignee: c.assignee, revision: row.revision + 1 }); row.history.push({ at: Date.now(), by: 'user//tech', status: c.status, note: c.note }); result = row; }
        w.ScpOperations.receive({ tag: c.tag, result });
    }, 0); } };
    w.eval(script('scp-operations.js'));
    return { w, sent, remoted, doc: w.document };
}
const ticket = (id, nodeid, status, title, created) => ({ _id: id, nodeid, status, title, description: 'd', department: 'ER', contact: 'x', assignee: '', revision: 1, created: created || Date.now(), updated: Date.now(), history: [{ at: Date.now(), by: 'user//tech', status: 'open', note: 'Created' }] });
const buttonNamed = (doc, text) => [...doc.querySelectorAll('button')].find(b => b.textContent === text);

test('Remote on a ticket marks it in progress under this technician and opens the screen', async (t) => {
    const tickets = [ticket('t1', 'node//1', 'open', 'ปริ้นไม่ออก')];
    const { w, sent, remoted, doc } = opsPage(t, tickets);
    await w.ScpOperations.openTicket('t1');
    await settle();
    const btn = doc.getElementById('scpTicketRemote');
    assert.ok(btn, 'the ticket has a Remote button');
    btn.click();
    await settle();
    const update = sent.find(c => c.op === 'updateTicket');
    assert.equal(update.status, 'working');
    assert.equal(update.assignee, 'user//tech');
    assert.match(update.note, /รีโมต/);
    assert.deepEqual(remoted, ['node//1']);
    assert.equal(w.scpTicketReturn, 't1', 'remembered for the way back');
    assert.equal(doc.getElementById('scpOperations').open, false, 'the dialog is out of the way of the screen');
});

test('a ticket already in progress is not touched again, only opened', async (t) => {
    const tickets = [ticket('t1', 'node//1', 'working', 'ปริ้นไม่ออก')];
    const { w, sent, remoted, doc } = opsPage(t, tickets);
    await w.ScpOperations.openTicket('t1'); await settle();
    doc.getElementById('scpTicketRemote').click(); await settle();
    assert.equal(sent.some(c => c.op === 'updateTicket'), false);
    assert.deepEqual(remoted, ['node//1']);
});

test('a computer that is off is not remoted, and the ticket is left as it was', async (t) => {
    const tickets = [ticket('t2', 'node//2', 'open', 'เปิดไม่ติด')];
    const { w, sent, remoted, doc } = opsPage(t, tickets);
    await w.ScpOperations.openTicket('t2'); await settle();
    doc.getElementById('scpTicketRemote').click(); await settle();
    assert.deepEqual(remoted, []);
    assert.equal(sent.some(c => c.op === 'updateTicket'), false);
    assert.match(doc.body.textContent, /เครื่องปิดอยู่/);
});

test('coming back from the screen shows the ticket set to Closed, waiting for the repair note', async (t) => {
    const tickets = [ticket('t1', 'node//1', 'working', 'ปริ้นไม่ออก')];
    const { w, sent, doc } = opsPage(t, tickets);
    await w.ScpOperations.openTicket('t1', true); await settle();
    const status = [...doc.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'closed'));
    assert.equal(status.value, 'closed');
    assert.match(doc.body.textContent, /กลับจากรีโมตแล้ว/);
    assert.equal(sent.some(c => c.op === 'updateTicket'), false, 'nothing is closed until the technician saves');
    // opening it the ordinary way afterwards does not pre-select Closed
    await w.ScpOperations.openTicket('t1'); await settle();
    const again = [...doc.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'closed'));
    assert.equal(again.value, 'working');
});

test('a computer reported again and again says so on the ticket', async (t) => {
    const day = 86400000, now = Date.now();
    const tickets = [ticket('t1', 'node//1', 'open', 'ปริ้นไม่ออก', now), ticket('t0', 'node//1', 'closed', 'ปริ้นไม่ออกอีก', now - 20 * day), ticket('tx', 'node//1', 'closed', 'เก่ามาก', now - 200 * day), ticket('ty', 'node//2', 'closed', 'เครื่องอื่น', now - day)];
    const { w, doc } = opsPage(t, tickets);
    await w.ScpOperations.openTicket('t1'); await settle();
    const note = doc.getElementById('scpTicketRepeat');
    assert.ok(note);
    assert.match(note.textContent, /อีก 1 ครั้งใน 90 วัน/);
    assert.match(note.textContent, /ปริ้นไม่ออกอีก/);
    assert.doesNotMatch(note.textContent, /เก่ามาก|เครื่องอื่น/);
});

test('leaving the remote screen brings the ticket back', () => {
    const dash = script('scp-dashboard.js');
    const fn = dash.slice(dash.indexOf('function returnFromRemote()'), dash.indexOf('function returnFromRemote()') + 900);
    assert.match(fn, /var ticket = window\.scpTicketReturn; window\.scpTicketReturn = null;/);
    assert.match(fn, /window\.ScpOperations\.openTicket\(ticket, true\)/);
});

// ---- technician results on the server -------------------------------------------------------
function techPage(t, serverResults, local) {
    const dom = new JSDOM('<html lang="th"><body></body></html>', { url: 'https://hospital.example/', runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window, calls = [];
    if (local) w.localStorage.setItem('scpTech:/', JSON.stringify(local));
    w.meshserver = { send() { } };
    w.ScpOperations = { request: (op, payload) => { calls.push({ op, payload }); return Promise.resolve(op === 'techList' ? serverResults : { saved: (payload.items || []).length }); } };
    w.setTimeout = (fn) => { fn(); return 1; };
    w.eval(script('scp-tech.js'));
    return { w, calls };
}

test('results from the server are shown here, and this browser\'s newer ones are sent up', async (t) => {
    const { w, calls } = techPage(t,
        { 'node//1': { bench: { data: { read: 500 }, at: 2000 }, sfc: { data: { ok: true }, at: 500 } } },
        { 'node//1': { sfc: { data: { ok: false }, at: 900 } }, 'node//2': { dism: { data: { healthy: true }, at: 700 } } });
    await settle();
    assert.deepEqual(JSON.parse(JSON.stringify(w.ScpTech.result('node//1', 'bench'))), { data: { read: 500 }, at: 2000 }, 'found on another computer, visible here');
    assert.deepEqual(JSON.parse(JSON.stringify(w.ScpTech.result('node//1', 'sfc'))), { data: { ok: false }, at: 900 }, 'the newer one wins');
    const up = calls.find(c => c.op === 'techSave');
    assert.ok(up, 'what only this browser had is uploaded');
    assert.deepEqual([...up.payload.items].map(i => i.nodeid + ':' + i.task).sort(), ['node//1:sfc', 'node//2:dism']);
    assert.equal(calls.filter(c => c.op === 'techList').length, 1);
});

test('when the server cannot be reached the browser\'s copy still works', async (t) => {
    const dom = new JSDOM('<html lang="th"><body></body></html>', { url: 'https://hospital.example/', runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window;
    w.localStorage.setItem('scpTech:/', JSON.stringify({ 'node//1': { bench: { data: { read: 9 }, at: 5 } } }));
    w.meshserver = { send() { } };
    w.ScpOperations = { request: () => Promise.reject(Error('UNKNOWN_OPERATION')) };
    w.setTimeout = (fn) => { fn(); return 1; };
    w.eval(script('scp-tech.js'));
    await settle();
    assert.deepEqual(JSON.parse(JSON.stringify(w.ScpTech.result('node//1', 'bench'))), { data: { read: 9 }, at: 5 });
});
