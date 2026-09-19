'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');

function setup(t, online) {
    const dom = new JSDOM('<html lang="th"><body></body></html>', { url: 'https://hospital.example/', runScripts: 'outside-only' });
    const w = dom.window;
    t.after(() => w.close());
    const sent = [];
    w.meshserver = { send: m => sent.push(m) };
    w.confirm = () => true;
    w.alert = () => {};
    w.setTimeout = () => 1;
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.eval(fs.readFileSync(path.join(root, 'public/scripts/scp-care.js'), 'utf8'));
    const nodes = online || [
        { _id: 'node//1', name: 'OPD 5', conn: 1 },
        { _id: 'node//2', name: 'pc-off', conn: 0 }
    ];
    return { w, sent, nodes, text: () => w.document.getElementById('scpCare').textContent };
}

// The whole reason this can be one press for the whole fleet is that it only ever turns
// protection on. If it could turn something off, it could not be safe to run everywhere.
test('the maintenance script only enables protection -- it never disables, removes or restarts', () => {
    const source = fs.readFileSync(path.join(root, 'public/scripts/scp-care.js'), 'utf8');
    assert.match(source, /Set-NetFirewallProfile[^\n]*-Enabled True/, 'firewall is enabled');
    assert.match(source, /Update-MpSignature/, 'signatures are updated');
    assert.match(source, /DisableRealtimeMonitoring \$false/, 'Defender real-time is turned on');
    // Every alternative here would take protection away or disrupt the machine.
    assert.doesNotMatch(source, /-Enabled False|DisableRealtimeMonitoring \$true|Uninstall|Remove-Item|Restart-Computer|shutdown|Stop-Service/,
        'nothing here turns anything off, removes, or restarts');
});

test('Defender is switched on only where nothing else is guarding', () => {
    const source = fs.readFileSync(path.join(root, 'public/scripts/scp-care.js'), 'utf8');
    // The guard test must require an antivirus that is on, current, and not Defender itself.
    assert.match(source, /productState -band 0x1000\) -ne 0/, 'the other product has to be switched on');
    assert.match(source, /productState -band 0x10\) -eq 0/, 'and up to date');
    assert.match(source, /displayName -notmatch 'Defender'/, 'and not Defender itself');
    assert.match(source, /if \(\$guard\.Count -eq 0\)/, 'Defender is enabled only when that set is empty');
});

test('it is sent only to the connected machines, as the agent, asking for a reply', (t) => {
    const s = setup(t);
    s.w.ScpCare.run(s.nodes);
    assert.equal(s.sent.length, 1);
    const message = s.sent[0];
    assert.deepEqual([...message.nodeids], ['node//1'], 'the offline computer is left out');
    assert.equal(message.runAsUser, 0);
    assert.equal(message.reply, true);
    assert.match(message.responseid, /^scpcare\d+_\d+$/);
    assert.match(message.cmds, /SCP_CARE/);
});

test('nothing is sent when none of the computers are connected', (t) => {
    const s = setup(t, [{ _id: 'node//9', name: 'pc-off', conn: 0 }]);
    s.w.ScpCare.run(s.nodes);
    assert.equal(s.sent.length, 0);
});

test('each reply is read against the request this panel sent, and reported per computer', (t) => {
    const s = setup(t, [{ _id: 'node//1', name: 'OPD 5', conn: 1 }, { _id: 'node//2', name: 'ARI', conn: 1 }]);
    s.w.ScpCare.run(s.nodes);
    const ticket = s.sent[0].responseid;
    assert.equal(s.w.ScpCare.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: 'not-ours',
        result: 'SCP_CARE:{"firewall":"on"}' }), false, 'a stray reply is not ours');
    s.w.ScpCare.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: ticket,
        result: 'SCP_CARE:{"firewall":"on","signatures":"updated","defender":"on"}' });
    s.w.ScpCare.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//2', responseid: ticket,
        result: 'FAILED COMMAND_BUSY: Another command is still running.' });
    const text = s.text();
    assert.ok(text.indexOf('เปิดแล้ว') >= 0, 'it says what it turned on');
    assert.ok(text.indexOf('ข้ามไป') >= 0, 'a busy computer is skipped and said so, not counted as done');
});

test('a progress frame is not mistaken for a result', (t) => {
    const s = setup(t, [{ _id: 'node//1', name: 'OPD 5', conn: 1 }]);
    s.w.ScpCare.run(s.nodes);
    assert.equal(s.w.ScpCare.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: s.sent[0].responseid,
        progress: true, result: 'anything' }), false);
});
