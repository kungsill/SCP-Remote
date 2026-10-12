'use strict';
// The SCPclear-style health check and its fixes (public/scripts/scp-health.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '../..');
function load() {
    const window = {}, document = { documentElement: { lang: 'th' } };
    const btoa = s => Buffer.from(s, 'binary').toString('base64');
    new Function('window', 'document', 'btoa', 'location', fs.readFileSync(path.join(root, 'public/scripts/scp-health.js'), 'utf8'))(window, document, btoa, { href: 'https://x/' });
    return window.ScpHealth;
}
const H = load();

test('the check only reads: no command in it changes the computer', () => {
    const script = H.healthScript();
    assert.doesNotMatch(script, /\b(Remove-Item|Set-ItemProperty|New-ItemProperty|Stop-Service|Start-Service|Restart-Service|Set-Service|Remove-ItemProperty|Clear-RecycleBin|Format-|Invoke-CimMethod -MethodName (?!GetOwner))/);
    // one statement per line: the agent feeds PowerShell line by line
    for (const line of script.split('\r\n')) assert.ok(!/^\s*[{}]\s*$/.test(line), 'no line is a lone brace: ' + line);
    assert.match(script, /SCP_HEALTH:/);
});

test('fixes stay inside fixed lists: services and start-up locations cannot be named from outside', () => {
    assert.throws(() => H.FIX.svc_start('WinDefend'), /NOT_ALLOWED/);
    assert.throws(() => H.FIX.startup({ scope: 'HKLM:\SOFTWARE\Evil', name: 'x', on: false }), /NOT_ALLOWED/);
    assert.match(H.FIX.svc_start('Spooler'), /Start-Service -Name 'Spooler'/);
    // names coming from the computer (printers, start-up entries) travel as base64, never as code
    const s = H.FIX.printer_test("x'; Remove-Item C:\ -Recurse; '");
    assert.doesNotMatch(s, /Remove-Item/);
});

test('none of the fixes cuts the connection or cannot be undone', () => {
    for (const k of Object.keys(H.FIX)) {
        const arg = k === 'startup' ? { scope: 'HKCU', name: 'a', on: false } : k === 'svc_start' ? 'Spooler' : k === 'fonts' ? { base: 'https://x/', list: [] } : 'p';
        const s = H.FIX[k](arg);
        assert.doesNotMatch(s, /netsh|winsock|Clear-RecycleBin|SoftwareDistribution|Restart-Computer|Stop-Computer|Remove-AppxPackage/i, k);
        assert.match(s, /SCP_FIX:/, k);
    }
});

test('fonts are installed only after their SHA-256 matches the manifest', () => {
    const m = JSON.parse(fs.readFileSync(path.join(root, 'public/fonts/thai/manifest.json'), 'utf8'));
    assert.ok(m.fonts.length >= 5);
    for (const f of m.fonts) {
        const buf = fs.readFileSync(path.join(root, 'public/fonts/thai', f.file));
        assert.equal(crypto.createHash('sha256').update(buf).digest('hex').toUpperCase(), f.sha256, f.file);
        assert.match(f.name, / \(TrueType\)$/);
    }
    const s = H.FIX.fonts({ base: 'https://x/fonts/thai/', list: m.fonts });
    assert.match(s, /Get-FileHash \$t -Algorithm SHA256\)\.Hash -eq \$x\.h\)\) \{ Copy-Item/);
    for (const lic of ['sarabun', 'kanit', 'prompt', 'ibmplexsansthai', 'notosansthai']) assert.ok(fs.existsSync(path.join(root, 'public/fonts/thai/licenses', lic + '-OFL.txt')), lic + ' licence');
});

test('findings read the answer sensibly', () => {
    const base = { upDays: 1, lastUpdateDays: 3, ramPct: 40, ramGb: 8, cpu: 5, freeGb: 50, diskGb: 200, diskType: 'SSD', diskHealth: 'Healthy', smart: 0, adapters: ['Ethernet'], ip: '192.168.2.10', gw: '192.168.2.1', gwOk: false, dnsOk: true, netOk: true, spooler: 'Running', jobs: 0, printers: [], startup: [], tempMb: 10, fontsMissing: [], thSarabun: true };
    const levels = d => H.findings(Object.assign({}, base, d)).filter(f => f.level === 'bad').map(f => f.title);
    assert.deepEqual(levels({}), [], 'a router that ignores ping is not a fault');
    assert.ok(levels({ jobs: 4, oldestJobMin: 30 }).some(t => /งานพิมพ์/.test(t)), 'stuck print jobs');
    assert.ok(levels({ upDays: 20 }).length === 1, 'on for weeks');
    assert.ok(levels({ ip: '169.254.3.4' }).length === 1, 'no DHCP');
    const stuck = H.findings(Object.assign({}, base, { jobs: 4, oldestJobMin: 30 })).find(f => /งานพิมพ์/.test(f.title));
    assert.equal(stuck.fixes[0].action, 'printer_fix');
});

test('the server keeps the results and who pressed which fix', () => {
    const ops = fs.readFileSync(path.join(root, 'hospital/operations.js'), 'utf8');
    for (const op of ['healthSave', 'healthList', 'healthLog']) assert.ok(ops.includes("cmd.op === '" + op + "'"), op);
    assert.match(ops, /kind: 'health'/);
});
