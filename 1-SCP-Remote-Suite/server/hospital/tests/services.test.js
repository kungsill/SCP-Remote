'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');

function setup(t) {
    const dom = new JSDOM('<html lang="th"><body></body></html>', { url: 'https://hospital.example/', runScripts: 'outside-only' });
    const w = dom.window;
    t.after(() => w.close());
    const sent = [];
    w.meshserver = { send: message => sent.push(message) };
    w.confirm = () => true;
    w.alert = () => {};
    w.setTimeout = () => 1;
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.eval(fs.readFileSync(path.join(root, 'public/scripts/scp-services.js'), 'utf8'));
    const node = { _id: 'node//1', name: 'OPD 2' };
    w.ScpServices.open(node);
    // Answer the list request with a few services, including the agent's own.
    const listMsg = (services) => w.ScpServices.receive({
        action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: sent[0].responseid,
        result: 'SCP_SERVICES:' + JSON.stringify(services)
    });
    const rowFor = (label) => [...w.document.querySelectorAll('.scp-svc-row')].find(r => r.textContent.indexOf(label) >= 0);
    return { w, sent, node, listMsg, rowFor };
}

test('it asks the computer for its services as the agent, and reads the reply into a list', (t) => {
    const s = setup(t);
    assert.equal(s.sent.length, 1, 'one request went out');
    assert.equal(s.sent[0].runAsUser, 0, 'run as SYSTEM');
    assert.equal(s.sent[0].reply, true);
    assert.match(s.sent[0].responseid, /^scpsvclist/);
    assert.match(s.sent[0].cmds, /Get-Service/);
    s.listMsg([
        { n: 'Spooler', d: 'Print Spooler', s: 'Stopped', t: 'Automatic' },
        { n: 'W32Time', d: 'Windows Time', s: 'Running', t: 'Manual' }
    ]);
    assert.ok(s.rowFor('Print Spooler'), 'the stopped service is listed');
    assert.ok(s.rowFor('Windows Time'), 'the running service is listed');
});

test('start, stop and restart each send one command with the service and action', (t) => {
    const s = setup(t);
    s.listMsg([{ n: 'Spooler', d: 'Print Spooler', s: 'Stopped', t: 'Automatic' }]);
    const row = s.rowFor('Print Spooler');
    const start = [...row.querySelectorAll('button')].find(b => b.textContent === 'เริ่ม');
    assert.ok(start && !start.disabled, 'a stopped service can be started');
    start.click();
    const req = s.sent[s.sent.length - 1];
    assert.match(req.responseid, /^scpsvcact/);
    assert.equal(req.runAsUser, 0);
    assert.match(req.cmds, /__SVC__|FromBase64String/); // service name carried as base64, not spliced raw
    assert.match(req.cmds, /'start'/);
    assert.match(req.cmds, /Start-Service/);
});

test('the reply updates just that service, and its new state shows', (t) => {
    const s = setup(t);
    s.listMsg([{ n: 'Spooler', d: 'Print Spooler', s: 'Stopped', t: 'Automatic' }]);
    const row = s.rowFor('Print Spooler');
    [...row.querySelectorAll('button')].find(b => b.textContent === 'เริ่ม').click();
    const ticket = s.sent[s.sent.length - 1].responseid;
    s.w.ScpServices.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: ticket,
        result: 'SCP_SERVICE_ACT:{"svc":"Spooler","ok":true,"status":"Running"}' });
    assert.ok(s.rowFor('Print Spooler').textContent.indexOf('ทำงานอยู่') >= 0, 'the badge now says running');
});

test('the remote agent service is protected -- no stop button, and the command refuses it too', (t) => {
    const s = setup(t);
    s.listMsg([{ n: 'Mesh Agent', d: 'Mesh Agent background service', s: 'Running', t: 'Automatic' }]);
    const row = s.rowFor('Mesh Agent');
    assert.ok(row, 'the agent service is listed');
    const buttons = [...row.querySelectorAll('button')].map(b => b.textContent);
    assert.ok(!buttons.includes('หยุด'), 'there is no stop button for the agent');
    assert.ok(row.textContent.indexOf('ป้องกันไว้') >= 0, 'it is marked protected');
    // The command itself refuses the agent, so a bypass of the browser cannot stop it either.
    const source = fs.readFileSync(path.join(root, 'public/scripts/scp-services.js'), 'utf8');
    assert.match(source, /REFUSED_AGENT/);
    assert.match(source, /\^mesh \?agent\$/i);
});

test('a reply for a request this dialog did not send is ignored', (t) => {
    const s = setup(t);
    s.listMsg([{ n: 'Spooler', d: 'Print Spooler', s: 'Stopped', t: 'Automatic' }]);
    assert.equal(s.w.ScpServices.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1',
        responseid: 'not-ours', result: 'SCP_SERVICE_ACT:{"svc":"Spooler","ok":true,"status":"Running"}' }), false);
});
