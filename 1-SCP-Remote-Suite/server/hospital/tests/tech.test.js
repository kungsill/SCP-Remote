'use strict';
// SCPclear technician tools (public/scripts/scp-tech.js + scp-tech.ps1).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../..');
const ps1 = fs.readFileSync(path.join(root, 'public/scripts/scp-tech.ps1'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/scripts/scp-tech.js'), 'utf8');

// The same way the agent runs Run Commands (agents/meshcore.js): the text goes to
// "powershell -command -" through stdin and ends with a blank line and "exit".
function agentRun(task, arg, extra) {
    const cmds = "$ScpTask = '" + task + "'\r\n$ScpArg = '" + (arg || '') + "'\r\n" + ps1.replace(/\r?\n/g, '\r\n') + (extra ? '\r\n' + extra : '');
    const r = spawnSync('powershell.exe', ['-noprofile', '-nologo', '-command', '-'], { input: cmds + '\r\n\r\nexit\r\n', encoding: 'utf8', timeout: 120000, windowsHide: true });
    return r.stdout || '';
}
function answer(out) { const m = out.match(/SCP_TECH:(\{[^\r\n]*\})/); assert.ok(m, out); return JSON.parse(m[1]); }

test('the script survives the agent: no blank lines, plain ASCII, one answer marker', () => {
    ps1.split(/\r?\n/).slice(0, -1).forEach((line, i) => assert.ok(line.trim() !== '', 'blank line ' + (i + 1) + ' would close an open block'));
    assert.doesNotMatch(ps1, /[^\x00-\x7F]/, 'stdin is read in the OEM code page');
    assert.match(ps1, /Write-Output \('SCP_TECH:' \+ \$j\)/);
    for (const task of ['inventory', 'bench', 'sfc', 'dism', 'lan', 'winget', 'deploy']) assert.match(ps1, new RegExp("'" + task + "' \\{"), task);
});

test('repairs are not run: SFC and DISM only look', () => {
    assert.match(ps1, /'\/verifyonly'/);
    assert.match(ps1, /\/Cleanup-Image \/CheckHealth/);
    assert.doesNotMatch(ps1, /scannow|RestoreHealth'|Restart-Computer|Stop-Computer|Format-Volume|Clear-Disk/i);
});

test('unknown task answers instead of hanging', { skip: process.platform !== 'win32' }, () => {
    const a = answer(agentRun('nope'));
    assert.equal(a.ok, false);
    assert.equal(a.error, 'UNKNOWN_TASK');
});

test('deploy refuses a bad path or hash before downloading anything', { skip: process.platform !== 'win32' }, () => {
    assert.equal(answer(agentRun('deploy', 'tools/../x.exe;calc|AB|https://x/')).error, 'BAD_ARGUMENT');
    assert.equal(answer(agentRun('deploy', 'tools/x.exe|' + 'G'.repeat(64) + '|https://x/')).error, 'BAD_ARGUMENT');
});

test('the minidump reader names the driver that holds the crash address, not the kernel', { skip: process.platform !== 'win32' }, () => {
    const b = Buffer.alloc(0x3000);
    b.write('PAGEDU64', 0, 'ascii');
    b.writeUInt32LE(0xD1, 0x38);
    const kernel = 0xFFFFF80000000000n, evil = 0xFFFFF80010000000n;
    b.writeBigUInt64LE(0x2n, 0x40); b.writeBigUInt64LE(0n, 0x48);
    b.writeBigUInt64LE(evil + 0x120n, 0x50); b.writeBigUInt64LE(kernel + 0x500n, 0x58);
    const t = 0x2000, list = 0x2100, pool = 0x2400, size = 0x90;
    b.writeUInt32LE(list, t + 0x30); b.writeUInt32LE(2, t + 0x34); b.writeUInt32LE(pool, t + 0x38); b.writeUInt32LE(0x200, t + 0x3C);
    let at = pool;
    [['ntoskrnl.exe', kernel, 0x1000000], ['evil.sys', evil, 0x10000]].forEach(([name, base, len], k) => {
        const e = list + k * size;
        b.writeUInt32LE(at, e); b.writeBigUInt64LE(base, e + 0x38); b.writeUInt32LE(len, e + 0x48);
        b.writeUInt32LE(name.length, at); b.write(name, at + 4, 'utf16le'); at += 4 + name.length * 2 + 2;
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-tech-')), file = path.join(dir, 'test.dmp');
    fs.writeFileSync(file, b);
    try {
        const out = agentRun('none', '', "ScpAddMiniDump\r\nWrite-Output ('MD:' + ([ScpTech.MiniDump]::Read('" + file + "') -join '|'))");
        assert.match(out, /MD:209\|evil\.sys/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('inventory reads RAM on this computer and answers as one JSON line', { skip: process.platform !== 'win32' }, () => {
    const a = answer(agentRun('inventory', '30'));
    assert.equal(a.ok, true);
    assert.equal(a.days, 30);
    assert.ok(Array.isArray(a.crash));
    assert.ok(a.ram && a.ram.totalGb > 0, JSON.stringify(a.ram));
});

const windows = [];
after(() => windows.forEach(w => w.close())); // the pages' answer timers would keep the run alive
function page(nodes) {
    const dom = new JSDOM('<!doctype html><html lang="th"><body></body></html>', { runScripts: 'outside-only', url: 'https://scp.local/' });
    windows.push(dom.window);
    const w = dom.window, sent = [];
    w.meshserver = { send: m => sent.push(m) };
    w.ScpDashboard = { nodes: () => nodes };
    w.fetch = url => Promise.resolve(/scpclear\.json/.test(url)
        ? { ok: true, json: () => Promise.resolve({ version: '2.3.0', file: 'SCPclear.exe', size: 1000, sha256: 'A'.repeat(64) }) }
        : { ok: true, text: () => Promise.resolve(ps1) });
    w.confirmAnswer = true;
    w.confirm = () => w.confirmAnswer;
    w.alert = () => { };
    w.eval(js);
    return { w, sent, T: w.ScpTech };
}
const tick = () => new Promise(r => setTimeout(r, 20));
const pc = (id, name) => ({ _id: id, name, conn: 1, agent: { id: 4 } });

test('the computer window runs the inventory and explains the crashing driver in Thai', async () => {
    const node = pc('node//a', 'OPD-01'), { w, sent, T } = page([node]);
    const box = T.section(node);
    w.document.body.appendChild(box);
    const read = [...box.querySelectorAll('button')].find(b => /BSOD/.test(b.textContent));
    read.click(); await tick();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].action, 'runcommands');
    assert.equal(sent[0].runAsUser, 0);
    assert.match(sent[0].responseid, /^scptech/);
    assert.match(sent[0].cmds, /^\$ScpTask = 'inventory'\r\n\$ScpArg = '180'\r\n/);
    const data = { ok: true, task: 'inventory', days: 180, crash: [{ at: '2026-07-09T15:08:23', code: 209, driver: 'Ld2VMMR0.r0', src: 'dump' }, { at: '2026-07-08T11:53:06', code: 209, driver: 'Ld2VMMR0.r0', src: 'dump' }], owners: {}, power: [], ram: { slots: 2, maxGb: 64, totalGb: 4, sticks: [{ gb: 4, speed: 2666, type: 26, form: 8, slot: 'DIMM1' }] }, battery: null };
    assert.equal(T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[0].responseid, result: 'x\r\nSCP_TECH:' + JSON.stringify(data) + '\r\n' }), true);
    const text = box.textContent;
    assert.match(text, /Ld2VMMR0\.r0 × 2/);
    assert.match(text, /LDPlayer/);
    assert.match(text, /DRIVER_IRQL_NOT_LESS_OR_EQUAL/);
    assert.match(text, /เพิ่ม RAM ในช่องว่างได้: DDR4 DIMM/);
});

test('disk test asks first; a busy computer is retried, not failed', async () => {
    const node = pc('node//b', 'ER-02'), { w, sent, T } = page([node]);
    const box = T.section(node); w.document.body.appendChild(box);
    w.confirmAnswer = false;
    [...box.querySelectorAll('button')].find(b => /ความเร็วดิสก์/.test(b.textContent)).click(); await tick();
    assert.equal(sent.length, 0, 'declined: nothing sent');
    w.confirmAnswer = true;
    [...box.querySelectorAll('button')].find(b => /ความเร็วดิสก์/.test(b.textContent)).click(); await tick();
    assert.equal(sent.length, 1);
    T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[0].responseid, result: 'FAILED COMMAND_BUSY' });
    assert.equal(T.state(node._id, 'bench').state, 'waiting');
    assert.match(box.textContent, /จะลองใหม่อัตโนมัติ/);
});

test('winget ids are checked, so nothing but an id reaches PowerShell', () => {
    const { T } = page([]);
    assert.ok(T.WINGET_ID.test('Notepad++.Notepad++'));
    assert.ok(T.WINGET_ID.test('Microsoft.VCRedist.2015+.x64'));
    for (const bad of ["a'b", 'a;calc', 'a b', '$(calc)', '-x']) assert.ok(!T.WINGET_ID.test(bad), bad);
    for (const c of T.CATALOG) assert.ok(T.WINGET_ID.test(c[0]), c[0]);
    assert.match(ps1, /\$ScpArg -split ',' \| Where-Object \{ \$_ -match '\^\[A-Za-z0-9\]\[A-Za-z0-9\.\+_-\]\*\$' \}/);
});

test('the hospital page adds up which driver crashes the most computers', async () => {
    const a = pc('n/a', 'A'), b = pc('n/b', 'B'), c = pc('n/c', 'C'), { w, sent, T } = page([a, b, c]);
    const dialogs = [];
    const overlay = title => { const box = w.document.createElement('div'); w.document.body.appendChild(box); const d = { box, title, close() { box.remove(); } }; dialogs.push(d); return d; };
    w.localStorage.setItem('scpTechTab', 'crash');
    T.openFleet([a, b, c], overlay);
    [...dialogs[0].box.querySelectorAll('button')].find(x => /อ่านทุกเครื่องที่ออนไลน์/.test(x.textContent)).click(); await tick();
    assert.equal(sent.length, 3);
    const inv = drv => ({ ok: true, task: 'inventory', days: 180, crash: drv ? [{ at: '2026-10-01T10:00:00', code: 0x116, driver: drv, src: 'dump' }] : [], owners: {}, power: [], ram: { slots: 2, maxGb: 32, totalGb: 8, sticks: [{ gb: 8, type: 26, form: 12, speed: 3200 }] }, battery: drv ? null : { charge: 80, status: 2, design: 50000, full: 20000, cycles: 400, health: 40 } });
    sent.forEach((m, i) => T.receive({ action: 'msg', type: 'runcommands', nodeid: m.nodeids[0], responseid: m.responseid, result: 'SCP_TECH:' + JSON.stringify(inv(i < 2 ? 'nvlddmkm.sys' : '')) }));
    await new Promise(r => setTimeout(r, 700));
    const text = dialogs[0].box.textContent;
    assert.match(text, /nvlddmkm\.sys2/, 'two computers for the one driver');
    assert.match(text, /NVIDIA/);
    [...dialogs[0].box.querySelectorAll('button')].find(x => /แบตโน้ตบุ๊ก/.test(x.textContent)).click();
    assert.match(dialogs[0].box.textContent, /40%/);
    assert.match(dialogs[0].box.textContent, /ควรเปลี่ยนแบต/);
});

test('SCPclear on the server matches its published SHA-256', () => {
    const info = JSON.parse(fs.readFileSync(path.join(root, 'public/tools/scpclear.json'), 'utf8'));
    const file = path.join(root, 'public/tools', info.file);
    assert.match(info.sha256, /^[0-9A-F]{64}$/);
    assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(), info.sha256);
    assert.equal(fs.statSync(file).size, info.size);
});

test('LAN scans list Windows computers that SCP-Remote does not know yet, ready to print', async () => {
    const a = Object.assign(pc('n/a', 'OPD-01'), { ip: '192.168.2.31' }), b = pc('n/b', 'ER-02');
    const { w, sent, T } = page([a, b]);
    const opened = [];
    w.open = () => { const doc = { html: '', write(s) { this.html += s; }, close() { } }; opened.push(doc); return { document: doc }; };
    const box = T.section(a); w.document.body.appendChild(box);
    [...box.querySelectorAll('button')].find(x => /สแกน LAN/.test(x.textContent)).click(); await tick();
    const hosts = [
        { ip: '192.168.2.1', mac: '', name: '', ports: '80,443', ms: 1 },          // gateway
        { ip: '192.168.2.31', mac: '', name: 'OPD-01', ports: '445', ms: 0 },      // the scanning computer itself
        { ip: '192.168.2.40', mac: 'AA', name: 'er-02.hosp.local', ports: '445', ms: 1 }, // known by name
        { ip: '192.168.2.77', mac: 'BB', name: 'NURSE-PC', ports: '445,3389', ms: 1 }, // not installed
        { ip: '192.168.2.9', mac: 'CC', name: '', ports: '3389', ms: 1 },          // not installed, no name
        { ip: '192.168.2.50', mac: 'DD', name: '', ports: '9100,80', ms: 1 }       // printer: not a computer
    ];
    T.receive({ action: 'msg', type: 'runcommands', nodeid: a._id, responseid: sent[0].responseid, result: 'SCP_TECH:' + JSON.stringify({ ok: true, task: 'lan', self: '192.168.2.31', gateway: '192.168.2.1', prefix: '192.168.2', hosts }) });
    assert.equal(T.notInstalled().map(h => h.ip).join(' '), '192.168.2.9 192.168.2.77');
    assert.equal(box.querySelectorAll('tr.scp-tech-missing').length, 2);
    assert.match(box.textContent, /ยังไม่ได้ลง SCP-Remote/);
    const dialogs = [];
    const overlay = title => { const d = w.document.createElement('div'); w.document.body.appendChild(d); const o = { box: d, close() { d.remove(); } }; dialogs.push(o); return o; };
    w.localStorage.setItem('scpTechTab', 'lan');
    T.openFleet([a, b], overlay);
    assert.match(dialogs[0].box.textContent, /ที่ยังไม่ได้ลง SCP-Remote \(รวมทุกการสแกน\): 2/);
    [...dialogs[0].box.querySelectorAll('button')].find(x => /พิมพ์รายการไปติดตั้ง/.test(x.textContent)).click();
    assert.equal(opened.length, 1);
    assert.match(opened[0].html, /NURSE-PC/);
    assert.doesNotMatch(opened[0].html, /192\.168\.2\.50|er-02/);
});

test('antivirus: the script only reads, and refuses the active antivirus and the remote agent', () => {
    assert.match(ps1, /'avscan' \{/);
    assert.match(ps1, /REFUSED_ACTIVE_ANTIVIRUS/);
    assert.match(ps1, /REFUSED_REMOTE_AGENT/);
    assert.match(ps1, /\$ScpArg -match '\^\[A-Za-z0-9\{\}_\. -\]\{1,120\}\$'/, 'the program key is checked before use');
    // it calls the program's own uninstaller; it never stops services or drivers to get past self-protection
    const av = ps1.slice(ps1.indexOf("'avremove' {"), ps1.indexOf("'winget' {"));
    assert.doesNotMatch(av, /Stop-Service|sc\.exe|Stop-Process|taskkill|Set-ItemProperty|Remove-Item|Unregister-ScheduledTask/i);
    assert.match(av, /msiexec\.exe/);
});

test('antivirus scan answers on this computer without changing anything', { skip: process.platform !== 'win32' }, () => {
    const a = answer(agentRun('avscan'));
    assert.equal(a.ok, true);
    assert.ok(Array.isArray(a.products) && Array.isArray(a.entries));
    assert.ok(a.defender && 'present' in a.defender);
    assert.equal(answer(agentRun('avremove', 'no-such-program-key')).error, 'NOT_FOUND');
});

test('the antivirus tab lists computers with no working protection first', async () => {
    const a = pc('n/a', 'OLD-01'), b = pc('n/b', 'GOOD-02'), { w, sent, T } = page([a, b]);
    const dialogs = [];
    const overlay = title => { const d = w.document.createElement('div'); w.document.body.appendChild(d); const o = { box: d, close() { d.remove(); } }; dialogs.push(o); return o; };
    w.localStorage.setItem('scpTechTab', 'av');
    T.openFleet([a, b], overlay);
    [...dialogs[0].box.querySelectorAll('button')].find(x => /ตรวจแอนตี้ไวรัสทุกเครื่อง/.test(x.textContent)).click(); await tick();
    assert.equal(sent.length, 2);
    assert.match(sent[0].cmds, /^\$ScpTask = 'avscan'\r\n/);
    const reply = (m, d) => T.receive({ action: 'msg', type: 'runcommands', nodeid: m.nodeids[0], responseid: m.responseid, result: 'SCP_TECH:' + JSON.stringify(Object.assign({ ok: true, task: 'avscan' }, d)) });
    const byNode = id => sent.find(m => m.nodeids[0] === id);
    reply(byNode('n/b'), { products: [{ name: 'Windows Defender', on: true, old: false }], defender: { present: true, enabled: true, mode: 'Normal', sigAge: 0 }, entries: [] });
    reply(byNode('n/a'), { products: [{ name: 'ESET NOD32 Antivirus', on: true, old: true }], defender: { present: true, enabled: true, mode: 'Passive', sigAge: 400 }, entries: [{ key: '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}', name: 'ESET NOD32 Antivirus', version: '4.2.71', publisher: 'ESET', silent: true, guid: true, wow: true }] });
    await new Promise(r => setTimeout(r, 700));
    const rows = [...dialogs[0].box.querySelectorAll('.scp-health-fleet-row')].map(r => r.textContent);
    assert.match(rows[0], /OLD-01/);
    assert.match(rows[0], /ESET NOD32 Antivirus 4\.2\.71/);
    assert.match(rows[0], /Passive/);
    assert.match(rows[1], /GOOD-02/);
    assert.match(dialogs[0].box.textContent, /ไม่มีตัวป้องกันที่ใช้งานได้: 1 \/ 2/);
});

test('antivirus uninstall: asks first, sends only the program key, and shows what happened', async () => {
    const node = pc('n/old', 'OLD-01'), { w, sent, T } = page([node]);
    const box = T.section(node); w.document.body.appendChild(box);
    [...box.querySelectorAll('button')].find(x => /แอนตี้ไวรัส: ตรวจ/.test(x.textContent)).click(); await tick();
    assert.match(sent[0].cmds, /^\$ScpTask = 'avscan'\r\n/);
    const KEY = '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}';
    T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[0].responseid, result: 'SCP_TECH:' + JSON.stringify({ ok: true, task: 'avscan', products: [{ name: 'ESET NOD32 Antivirus', on: true, old: true }], defender: { present: true, enabled: true, mode: 'Passive', sigAge: 400 }, entries: [{ key: KEY, name: 'ESET NOD32 Antivirus', version: '4.2.71', publisher: 'ESET', silent: true, guid: true, wow: true }, { key: 'x', name: 'Old AV', silent: false }] }) });
    assert.match(box.textContent, /ESET NOD32 Antivirus \(32-bit\)/);
    assert.match(box.textContent, /ไม่มีตัวถอนแบบเงียบ/);
    const go = () => [...box.querySelectorAll('button')].find(x => /ถอนด้วยตัวถอนของมัน/.test(x.textContent));
    w.confirmAnswer = false; go().click(); await tick();
    assert.equal(sent.length, 1, 'declined: nothing sent');
    w.confirmAnswer = true; go().click(); await tick();
    assert.equal(sent.length, 2);
    assert.match(sent[1].cmds, /^\$ScpTask = 'avremove'\r\n\$ScpArg = '\{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA\}'\r\n/);
    T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[1].responseid, result: 'SCP_TECH:' + JSON.stringify({ ok: true, task: 'avremove', name: 'ESET NOD32 Antivirus', code: 3010, gone: true, restart: true, defender: { present: true, enabled: true, mode: 'Normal', sigAge: 0 }, products: [], tail: '' }) });
    assert.match(box.textContent, /หายไปจากรายการโปรแกรมแล้ว/);
    assert.match(box.textContent, /ต้องรีสตาร์ท/);
    assert.match(box.textContent, /Microsoft Defender: เปิดอยู่ \(Normal\)/);
    // refused by the computer: the reason is shown
    go().click(); await tick();
    T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[2].responseid, result: 'SCP_TECH:' + JSON.stringify({ ok: false, task: 'avremove', error: 'REFUSED_ACTIVE_ANTIVIRUS' }) });
    assert.match(box.textContent, /ฐานไวรัสล่าสุด คือตัวที่กำลังป้องกันเครื่อง/);
});

test('Windows Update repair: gentle steps only, and it leaves a deliberately switched-off Windows Update alone', () => {
    const wu = ps1.slice(ps1.indexOf("'wurepair' {"), ps1.indexOf("'wuinstall' {"));
    assert.equal((wu.match(/SCP_PROGRAM_STEP:/g) || []).length, 6);
    assert.match(wu, /'WU_DISABLED'/);
    assert.match(wu, /NoAutoUpdate -eq 1/);
    assert.match(wu, /StartType -eq 'Disabled'/);
    assert.match(wu, /\$freeGb -lt 8/);
    // only the half-downloaded cache goes; no install, no restart, no repair of system files
    assert.ok(wu.includes('SoftwareDistribution' + String.fromCharCode(92) + "Download'"), 'only the Download folder is cleared');
    assert.doesNotMatch(wu, /SoftwareDistribution'|DataStore|catroot2|Restart-Computer|Stop-Computer|RestoreHealth|scannow|\.Download\(\)|\.Install\(\)|UsoClient|wuauclt/i);
    assert.match(wu, /\/Cleanup-Image \/CheckHealth/);
    assert.match(wu, /Wait-Job \$job -Timeout 360/);
});

test('Windows Update repair button: asks first, shows 0-100% by step, then the result', async () => {
    const node = pc('n/wu', 'WARD-07'), { w, sent, T } = page([node]);
    const box = T.section(node); w.document.body.appendChild(box);
    const btnWu = () => [...box.querySelectorAll('button')].find(x => /ซ่อม Windows Update/.test(x.textContent));
    w.confirmAnswer = false; btnWu().click(); await tick();
    assert.equal(sent.length, 0, 'declined: nothing sent');
    w.confirmAnswer = true; btnWu().click(); await tick();
    assert.equal(sent.length, 1);
    assert.match(sent[0].responseid, /^scpprogtech/, 'the agent forwards step lines for this prefix');
    assert.match(sent[0].cmds, /^\$ScpTask = 'wurepair'\r\n/);
    assert.match(box.textContent, /0%.*ส่งคำสั่งแล้ว รอเครื่องตอบ/s);
    const stepMsg = (n, what) => ({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[0].responseid, progress: true, result: 'SCP_PROGRAM_STEP:{"n":' + n + ',"of":6,"what":"' + what + '"}\r\n' });
    for (const [n, what, pct, text] of [[2, 'services', 17, /เปิดบริการอัปเดต/], [4, 'cache', 50, /ล้างแคชดาวน์โหลดที่ค้าง/], [6, 'scan', 83, /ถาม Windows Update/]]) {
        assert.equal(T.receive(stepMsg(n, what)), true);
        assert.match(box.textContent, new RegExp(pct + '%.*ขั้นที่ ' + n + '/6', 's'));
        assert.match(box.textContent, text);
        assert.equal(box.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), String(pct));
    }
    const data = { ok: true, task: 'wurepair', freedMb: 1840, left: 0, log: [], dism: 'clean', scan: 'done', pending: 2, titles: ['2026-10 Cumulative Update KB5099999', 'Defender definitions KB2267602'], reboot: true, freeGb: 31.5 };
    T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[0].responseid, result: 'SCP_PROGRAM_STEP:{"n":6,"of":6,"what":"scan"}\r\nSCP_TECH:' + JSON.stringify(data) });
    assert.equal(box.querySelector('[role=progressbar]'), null, 'the bar goes when it is done');
    assert.match(box.textContent, /ซ่อม Windows Update แล้ว: ล้างแคช 1840 MB/);
    assert.match(box.textContent, /ไฟล์ระบบ \(DISM\): ปกติ/);
    assert.match(box.textContent, /รออยู่ 2 รายการ/);
    assert.match(box.textContent, /KB5099999/);
    assert.match(box.textContent, /มีรีสตาร์ทรออยู่/);
    // switched off on purpose: the reason is shown, nothing is claimed as repaired
    btnWu().click(); await tick();
    T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[1].responseid, result: 'SCP_TECH:' + JSON.stringify({ ok: false, task: 'wurepair', error: 'WU_DISABLED' }) });
    assert.match(box.textContent, /เครื่องนี้ปิด Windows Update ไว้/);
});

test('install updates: bounded, skips version upgrades and drivers, and never restarts by itself', () => {
    const wi = ps1.slice(ps1.indexOf("'wuinstall' {"), ps1.indexOf("'wurestart' {"));
    assert.equal((wi.match(/SCP_PROGRAM_STEP:/g) || []).length, 2, 'step 1 is written by the script, the rest by the polling loop');
    assert.match(wi, /Type='Software'/, 'drivers are not installed here');
    assert.match(wi, /Feature update\|Upgrade to Windows/);
    assert.match(wi, /CanRequestUserInput/);
    assert.match(wi, /\$list\.Count -ge 10/);
    assert.match(wi, /\$wuSvc\.StartType -eq 'Disabled'/);
    assert.match(wi, /NoAutoUpdate -eq 1/);
    assert.match(wi, /AllowSourcePrompts = \$false/);
    assert.doesNotMatch(wi, /Restart-Computer|shutdown|Stop-Computer|Set-Service|Set-ItemProperty|New-ItemProperty/i, 'it reports that a restart is needed; it does not restart');
});

test('restart: five minutes of warning, cancellable, message passed as base64', () => {
    const wr = ps1.slice(ps1.indexOf("'wurestart' {"), ps1.indexOf("'avscan' {"));
    assert.match(wr, /\/r \/t 300 \/c/);
    assert.match(wr, /shutdown\.exe/);
    assert.match(wr, /'\/a'/);
    assert.match(wr, /\^\[A-Za-z0-9\+\/=\]\{1,700\}\$/);
    assert.doesNotMatch(wr, /\/t 0|\/f\b/, 'no immediate or forced restart');
    assert.equal(answer(agentRun('wurestart', 'restart|not base64 !!')).error, 'BAD_ARGUMENT');
    assert.equal(answer(agentRun('wurestart', 'format C:')).error, 'BAD_ARGUMENT');
});

test('install updates button: asks first, shows steps, lists what was installed and offers the restart', async () => {
    const node = pc('n/wi', 'WARD-08'), { w, sent, T } = page([node]);
    const box = T.section(node); w.document.body.appendChild(box);
    const byText = re => [...box.querySelectorAll('button')].find(x => re.test(x.textContent));
    w.confirmAnswer = false; byText(/ติดตั้งอัปเดต/).click(); await tick();
    assert.equal(sent.length, 0, 'declined: nothing sent');
    w.confirmAnswer = true; byText(/ติดตั้งอัปเดต/).click(); await tick();
    assert.equal(sent.length, 1);
    assert.match(sent[0].responseid, /^scpprogtech/);
    assert.match(sent[0].cmds, /^\$ScpTask = 'wuinstall'\r\n/);
    const stepMsg = (n, what) => ({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[0].responseid, progress: true, result: 'SCP_PROGRAM_STEP:{"n":' + n + ',"of":5,"what":"' + what + '"}\r\n' });
    T.receive(stepMsg(3, 'download'));
    assert.match(box.textContent, /40%.*ขั้นที่ 3\/5.*ดาวน์โหลดอัปเดต/s);
    T.receive(stepMsg(4, 'install'));
    assert.match(box.textContent, /60%.*กำลังติดตั้งอัปเดต \(อย่าปิดเครื่อง\)/s);
    const data = { ok: true, task: 'wuinstall', state: 'done', found: 4, installed: ['2026-10 Cumulative Update KB5099999', 'Defender KB2267602'], failed: ['Some update KB1'], skipped: ['Feature update to Windows 11, version 26H2'], reboot: true };
    T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[0].responseid, result: 'SCP_TECH:' + JSON.stringify(data) });
    assert.match(box.textContent, /ติดตั้งสำเร็จ 2 รายการ/);
    assert.match(box.textContent, /KB5099999/);
    assert.match(box.textContent, /ไม่สำเร็จ\/โหลดไม่ได้: 1/);
    assert.match(box.textContent, /ข้ามไว้.*Feature update/s);
    assert.match(box.textContent, /ต้องรีสตาร์ทเครื่องให้เสร็จ/);
    // the restart: confirm, then a five-minute restart with a message the user will read
    w.confirmAnswer = false; byText(/รีสตาร์ท \(แจ้งผู้ใช้ 5 นาที\)/).click(); await tick();
    assert.equal(sent.length, 1);
    w.confirmAnswer = true; byText(/รีสตาร์ท \(แจ้งผู้ใช้ 5 นาที\)/).click(); await tick();
    assert.equal(sent.length, 2);
    const arg = sent[1].cmds.match(/\$ScpArg = '([^']*)'/)[1];
    assert.match(arg, /^restart\|[A-Za-z0-9+/=]+$/);
    assert.match(Buffer.from(arg.split('|')[1], 'base64').toString('utf8'), /จะรีสตาร์ทในอีก 5 นาที/);
    T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[1].responseid, result: 'SCP_TECH:' + JSON.stringify({ ok: true, task: 'wurestart', action: 'restart', seconds: 300 }) });
    assert.match(box.textContent, /ตั้งรีสตาร์ทในอีก 5 นาที/);
    byText(/ยกเลิกรีสตาร์ท/).click(); await tick();
    assert.match(sent[2].cmds, /\$ScpArg = 'cancel'/);
    // already scheduled / switched off on purpose
    T.receive({ action: 'msg', type: 'runcommands', nodeid: node._id, responseid: sent[2].responseid, result: 'SCP_TECH:' + JSON.stringify({ ok: true, task: 'wurestart', action: 'cancel', none: false }) });
    assert.match(box.textContent, /ยกเลิกการรีสตาร์ทที่ตั้งไว้แล้ว/);
});
