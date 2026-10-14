'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');

function setup(t, list) {
    const dom = new JSDOM('<html lang="th"><body></body></html>', { url: 'https://hospital.example/', runScripts: 'outside-only' });
    const w = dom.window;
    t.after(() => w.close());
    const sent = [];
    w.meshserver = { send: message => sent.push(message) };
    w.confirm = () => true;
    w.alert = () => {};
    const timers = [];
    w.setTimeout = fn => { timers.push(fn); return timers.length; };
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.eval(fs.readFileSync(path.join(root, 'public/scripts/scp-programs.js'), 'utf8'));
    const node = { _id: 'node//1', name: 'OPD 2' };
    w.ScpPrograms.open(node, list || [
        { name: 'Stubborn Toolbar', version: '1.0', publisher: 'Nobody', uninstall: 'C:\\Junk\\uninst.exe', location: 'C:\\Junk' }
    ]);
    const click = name => {
        const rows = [...w.document.querySelectorAll('.scp-program-row')];
        const row = rows.find(r => r.textContent.indexOf(name) >= 0);
        assert.ok(row, 'no row for ' + name);
        row.querySelector('button').click();
    };
    return { w, sent, node, click, timers, text: () => w.document.getElementById('scpPrograms').textContent };
}

// The three refusals are the point of the tool having a script of its own rather than
// being a free-text command box: they hold whatever the page asks for.
test('the removal refuses the remote agent, the protecting antivirus, and Windows system folders', () => {
    const source = fs.readFileSync(path.join(root, 'public/scripts/scp-programs.js'), 'utf8');
    assert.match(source, /REFUSED_REMOTE_AGENT/);
    assert.match(source, /mesh \?agent\|meshcentral\|scp\[- \]\?remote/i, 'the agent is matched by name, not by a list of ids');
    assert.match(source, /REFUSED_ACTIVE_ANTIVIRUS/);
    assert.match(source, /productState -band 0x1000/, 'the antivirus has to be switched on to be protected from removal');
    // A derelict antivirus -- switched on but never updating -- is the reason Windows calls a
    // machine unprotected. Removing it is the repair, and Defender takes over once it is gone.
    assert.match(source, /productState -band 0x10\)/, 'and up to date, or the broken one could never be removed');
    assert.match(source, /-and \(-not \$stale\)/, 'a stale antivirus is not protected from removal');
    assert.match(source, /REFUSED_SYSTEM_LOCATION/);
});

test('what puts the program back is removed before the program is', () => {
    const source = fs.readFileSync(path.join(root, 'public/scripts/scp-programs.js'), 'utf8');
    const order = ['Unregister-ScheduledTask', 'sc.exe', 'Remove-ItemProperty', 'Stop-Process', 'Start-Process', 'Remove-Item -LiteralPath $trimmed'];
    let last = -1;
    for (const step of order) {
        const at = source.indexOf(step);
        assert.ok(at > last, step + ' runs out of order; deleting first only invites it back');
        last = at;
    }
});

test('a removal is addressed to one computer and carries its own ticket', (t) => {
    const s = setup(t);
    s.click('Stubborn Toolbar');
    assert.equal(s.sent.length, 1);
    const message = s.sent[0];
    // Spread first: an array built inside jsdom has jsdom's Array prototype, and strict
    // deep equality compares prototypes.
    assert.deepEqual([...message.nodeids], ['node//1']);
    assert.equal(message.runAsUser, 0, 'nobody has to be signed in at the far end');
    assert.equal(message.reply, true);
    assert.match(message.responseid, /^scpprog\d+_\d+$/);
    assert.match(message.cmds, /SCP_PROGRAM_REMOVE/);
    assert.doesNotMatch(message.cmds, /__NAME__|__LOC__|__UN__/, 'the placeholders are filled in');
    assert.doesNotMatch(message.cmds, /Restart-Computer|shutdown\.exe/, 'removing a program never restarts a ward computer');
});

test('only a reply to the question this dialog asked is read as its answer', (t) => {
    const s = setup(t);
    s.click('Stubborn Toolbar');
    const ticket = s.sent[0].responseid;
    assert.equal(s.w.ScpPrograms.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: 'someone-elses',
        result: 'SCP_PROGRAM_REMOVE:{"ok":true,"steps":["folder: removed"]}' }), false, 'another console session keeps its own answer');
    assert.equal(s.w.ScpPrograms._jobs['node//1'].state, 'working');
    assert.equal(s.w.ScpPrograms.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: ticket,
        result: 'SCP_PROGRAM_REMOVE:{"ok":true,"steps":["task: Updater","folder: removed","listed: gone"]}' }), true);
    assert.equal(s.w.ScpPrograms._jobs['node//1'].state, 'done');
    assert.ok(s.text().indexOf('\u0e25\u0e1a\u0e07\u0e32\u0e19\u0e15\u0e31\u0e49\u0e07\u0e40\u0e27\u0e25\u0e32') >= 0, 'it says what it actually did');
});

test('a refusal is reported as a sentence, not as a code', (t) => {
    const s = setup(t);
    s.click('Stubborn Toolbar');
    s.w.ScpPrograms.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: s.sent[0].responseid,
        result: 'SCP_PROGRAM_REMOVE:{"ok":false,"error":"REFUSED_REMOTE_AGENT","steps":[]}' });
    const text = s.text();
    assert.equal(text.indexOf('REFUSED_REMOTE_AGENT'), -1);
    assert.ok(text.indexOf('\u0e40\u0e2d\u0e40\u0e08\u0e19\u0e15\u0e4c\u0e17\u0e35\u0e48\u0e43\u0e0a\u0e49\u0e23\u0e35\u0e42\u0e21\u0e15') >= 0);
});

test('a busy computer is said to be busy, and an unreadable reply is not called success', (t) => {
    let s = setup(t);
    s.click('Stubborn Toolbar');
    s.w.ScpPrograms.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: s.sent[0].responseid,
        result: 'FAILED COMMAND_BUSY: Another command is still running.' });
    assert.equal(s.w.ScpPrograms._jobs['node//1'].state, 'failed');
    assert.ok(s.text().indexOf('\u0e01\u0e33\u0e25\u0e31\u0e07\u0e17\u0e33\u0e04\u0e33\u0e2a\u0e31\u0e48\u0e07\u0e2d\u0e37\u0e48\u0e19') >= 0);

    s = setup(t);
    s.click('Stubborn Toolbar');
    s.w.ScpPrograms.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: s.sent[0].responseid, result: '' });
    assert.equal(s.w.ScpPrograms._jobs['node//1'].state, 'unknown', 'an empty reply is not a removal');
});

test('progress lines on the way are not mistaken for the result', (t) => {
    const s = setup(t);
    s.click('Stubborn Toolbar');
    s.w.ScpPrograms.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: s.sent[0].responseid,
        progress: true, result: 'working' });
    assert.equal(s.w.ScpPrograms._jobs['node//1'].state, 'working');
});

test('a silent flag is added only when the registered uninstaller has none', () => {
    const source = fs.readFileSync(path.join(root, 'public/scripts/scp-programs.js'), 'utf8');
    assert.match(source, /quiet -notmatch/, 'an uninstaller already told to be quiet is not told twice');
    assert.match(source, /\/I','\/X'/, 'an MSI is switched to uninstall rather than repaired');
});

test('the name, folder and uninstaller are carried as data, not pasted into the command', (t) => {
    const s = setup(t, [{ name: "Weird'; Start-Process calc; #", version: '1', publisher: 'x',
        uninstall: 'C:\\x\\u.exe', location: 'C:\\x' }]);
    s.click('Weird');
    const cmds = s.sent[0].cmds;
    assert.equal(cmds.indexOf('Start-Process calc'), -1, 'a program name cannot become part of the script');
    assert.match(cmds, /FromBase64String\('[A-Za-z0-9+/=]+'\)/);
});

test('an antivirus is flagged as one that will resist being removed this way', (t) => {
    const s = setup(t, [{ name: 'ESET Security', version: '9', publisher: 'ESET', uninstall: 'C:/ESET/u.exe', location: 'C:/ESET' }]);
    let asked = '';
    s.w.confirm = text => { asked = text; return false; };
    s.click('ESET Security');
    assert.ok(asked.indexOf('Safe Mode') >= 0, 'the reliable route is named rather than implied');
    assert.equal(s.sent.length, 0, 'and saying no sends nothing');
});

// "I pressed uninstall again and again and it is still there" is the case this is for, so
// what it must never do is report a removal it has not checked.
test('each step is counted as it finishes, so there is a percentage to watch', (t) => {
    const s = setup(t);
    s.click('Stubborn Toolbar');
    const ticket = s.sent[0].responseid;
    assert.match(s.sent[0].cmds, /SCP_PROGRAM_STEP/, 'the far end reports each step');
    s.w.ScpPrograms.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: ticket,
        progress: true, result: 'SCP_PROGRAM_STEP:{"n":6,"of":8,"what":"uninstaller"}' });
    assert.equal(s.w.ScpPrograms._jobs['node//1'].state, 'working', 'a step is not a result');
    const text = s.text();
    assert.ok(text.indexOf('75%') >= 0, 'six of eight is seventy-five per cent');
    assert.ok(text.indexOf('6/8') >= 0);
});

test('a program still there after every step is not reported as removed', (t) => {
    const s = setup(t);
    s.click('Stubborn Toolbar');
    s.w.ScpPrograms.receive({ action: 'msg', type: 'runcommands', nodeid: 'node//1', responseid: s.sent[0].responseid,
        result: 'SCP_PROGRAM_REMOVE:{"ok":false,"error":"STILL_PRESENT","restart":true,"steps":["listed: still there","disabled at boot: ekrn"]}' });
    const job = s.w.ScpPrograms._jobs['node//1'];
    assert.equal(job.state, 'failed', 'still there is not success');
    const text = s.text();
    assert.equal(text.indexOf('STILL_PRESENT'), -1, 'and the reason is a sentence');
    assert.ok(text.indexOf('Safe Mode') >= 0, 'the last resort is named');
    assert.ok(text.indexOf('รีสตาร์ต') >= 0, 'and the next step is a restart');
});

test('the removal checks what is left rather than trusting the uninstaller', () => {
    const source = fs.readFileSync(path.join(root, 'public/scripts/scp-programs.js'), 'utf8');
    assert.match(source, /\$stillListed/, 'the entry is looked for again');
    assert.match(source, /\$stillFolder/, 'so is the folder');
    assert.match(source, /\$stillSvc/, 'so are the services');
    // Naming the variables is not enough; they have to be what decides the verdict.
    assert.ok(source.indexOf("if ($stillListed -or $stillFolder -or $stillSvc.Count)") >= 0,
        'what is left over is what decides whether the removal worked');
    assert.ok(source.indexOf("$ok = $false; $err = 'STILL_PRESENT'") >= 0, 'and anything left over fails the job');
    assert.match(source, /Name Start -Value 4/, 'and what survives is stopped from starting again');
});
