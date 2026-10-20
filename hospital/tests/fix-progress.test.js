'use strict';
// "Fix printing" shows 0-100% by step (public/scripts/scp-health.js): the script announces its steps,
// the agent forwards them for tickets starting "scpprog", and a card on the page draws them.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'public/scripts/scp-health.js'), 'utf8');
const agent = fs.readFileSync(path.join(root, 'agents/meshcore.js'), 'utf8');
const windows = [];
after(() => windows.forEach(w => w.close()));

function page(node) {
    const dom = new JSDOM('<!doctype html><html lang="th"><body></body></html>', { runScripts: 'outside-only', url: 'https://scp.local/' });
    windows.push(dom.window);
    const w = dom.window, sent = [];
    w.meshserver = { send: m => sent.push(m) };
    w.ScpDashboard = { nodes: () => [node] };
    w.confirm = () => true;
    w.fetch = () => Promise.reject(new Error('offline')); // the re-check after a fix asks for the font list
    w.eval(src);
    return { w, sent, H: w.ScpHealth };
}
const node = { _id: 'node//a', name: 'ตึกชาย เครื่องเจ้าพนักงาน', conn: 1, agent: { id: 4 } };
const step = (m, n, what) => ({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: m.responseid, progress: true, result: 'SCP_PROGRAM_STEP:{"n":' + n + ',"of":5,"what":"' + what + '"}\r\n' });

test('the print fix script announces five steps and is valid PowerShell (parsed, not run)', { skip: process.platform !== 'win32' }, () => {
    const { H } = page(node);
    const script = H.FIX.printer_fix();
    assert.equal((script.match(/SCP_PROGRAM_STEP:/g) || []).length, 5);
    for (const line of script.split('\r\n')) assert.ok(line.trim() !== '', 'no blank line: the agent feeds it through stdin');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scp-fp-')), 'fix.ps1');
    fs.writeFileSync(file, script);
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('" + file + "',[ref]$t,[ref]$e);if($e.Count){$e|ForEach-Object{$_.Message};exit 1}"], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // the lines match what the agent looks for
    for (const m of script.match(/SCP_PROGRAM_STEP:\{[^\r\n']*\}/g) || []) assert.match(m.replace(/\\"/g, '"'), /^SCP_PROGRAM_STEP:\{[^\r\n]*\}$/);
});

test('the agent forwards step lines for tickets that start with scpprog, and the fix uses such a ticket', () => {
    assert.match(agent, /responseid\.indexOf\('scpprog'\) === 0/);
    assert.ok(agent.includes('SCP_PROGRAM_STEP:'), 'the agent looks for step lines');
    const { w, sent, H } = page(node);
    H.fix(node, 'printer_fix', null, { noConfirm: true });
    assert.equal(sent.length, 1);
    assert.match(sent[0].responseid, /^scpprog/);
    // other fixes keep the old prefix: the agent does not need to forward anything for them
    H.fix(node, 'dns_flush', null, { noConfirm: true });
});

test('pressing Fix printing shows a 0-100% card that follows the steps and ends at 100%', () => {
    const { w, sent, H } = page(node);
    H.fix(node, 'printer_fix', null, { noConfirm: true });
    const card = () => w.document.querySelector('.scp-fixprog-card');
    assert.ok(card(), 'a card appears at once');
    assert.match(card().textContent, /^🖨️.*0%.*ส่งคำสั่งแล้ว รอเครื่องตอบ/s);
    const wanted = [[1, 'count', 0, /นับงานพิมพ์ที่ค้าง/], [2, 'stop', 20, /หยุด Print Spooler/], [3, 'clear', 40, /ลบงานที่ค้างในคิว/], [4, 'start', 60, /เปิด Print Spooler ใหม่/], [5, 'verify', 80, /ตรวจว่า Spooler/]];
    for (const [n, what, pct, text] of wanted) {
        assert.equal(H.receive(step(sent[0], n, what)), true, 'progress is ours');
        assert.match(card().textContent, new RegExp('^🖨️.*' + pct + '% · ขั้นที่ ' + n + '/5'), what);
        assert.match(card().textContent, text);
        assert.equal(card().querySelector('[role=progressbar]').getAttribute('aria-valuenow'), String(pct));
    }
    const result = { action: 'printer_fix', ok: true, before: 4, removed: 4, after: 0, spooler: 'Running' };
    assert.equal(H.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[0].responseid, result: 'SCP_PROGRAM_STEP:{"n":5,"of":5,"what":"verify"}\r\nSCP_FIX:' + JSON.stringify(result) }), true);
    assert.equal(card().querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '100');
    assert.match(card().textContent, /100% · .*งานค้างก่อน 4/);
    assert.ok(card().classList.contains('done'));
    card().querySelector('button').click();
    assert.equal(card(), null, 'the card can be closed');
});

test('a failed fix shows red with what it reached, and other windows\' progress is not claimed', () => {
    const { w, sent, H } = page(node);
    H.fix(node, 'printer_fix', null, { noConfirm: true });
    H.receive(step(sent[0], 3, 'clear'));
    H.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[0].responseid, result: 'SCP_FIX:' + JSON.stringify({ action: 'printer_fix', ok: false, before: 3, after: 3, spooler: 'Stopped' }) });
    const card = w.document.querySelector('.scp-fixprog-card');
    assert.ok(card.classList.contains('failed'));
    assert.match(card.textContent, /40% · /);
    assert.equal(H.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//other', responseid: 'scpprog5_1', progress: true, result: 'SCP_PROGRAM_STEP:{"n":1,"of":8,"what":"checks"}' }), false, 'a forced program removal is left to its own window');
});
