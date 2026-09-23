'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// scripts/tunnel-mode.js moves four settings that have to change together. Two of the wrong
// orderings are expensive: turning on enforced 2FA before the only administrator has enrolled
// locks them out of their own server, and opening the allowlist without a second factor leaves
// 91 hospital computers behind one password. These drive the real script over a throwaway
// configuration so those orderings cannot quietly become possible again.
const root = path.join(__dirname, '../..');
const script = path.join(root, 'scripts', 'tunnel-mode.js');

function sandbox(accounts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-tunnel-'));
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify({
        settings: {
            cert: '192.168.2.25', port: 8443, compression: true,
            userAllowedIP: ['127.0.0.1', '192.168.2.0/24'],
            agentAllowedIP: ['127.0.0.1', '192.168.2.0/24']
        },
        domains: { '': { title: 'SCP-Remote' } }
    }, null, 2));
    if (accounts) {
        fs.writeFileSync(path.join(dir, 'meshcentral.db'), accounts.map((a, i) =>
            JSON.stringify({ _id: 'user//' + a.name, type: 'user', name: a.name, otpsecret: a.otp ? 'S' + i : undefined })
        ).join('\n') + '\n');
    }
    return {
        dir: dir, file: file,
        run(cmd) {
            const r = spawnSync(process.execPath, [script, cmd], { encoding: 'utf8', env: Object.assign({}, process.env, { SCP_CONFIG: file }) });
            return { out: (r.stdout || '') + (r.stderr || ''), code: r.status };
        },
        config() { return JSON.parse(fs.readFileSync(file, 'utf8')); },
        backups() { return fs.readdirSync(dir).filter(n => n.includes('.bak-tunnel-')); },
        clean() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (ex) { } }
    };
}

const enrolled = [{ name: 'admin', otp: true }];
const notEnrolled = [{ name: 'admin', otp: false }];

test('status reads the server as LAN-only before anything is changed', t => {
    const s = sandbox(enrolled); t.after(() => s.clean());
    const r = s.run('status');
    assert.equal(r.code, 0);
    assert.ok(r.out.includes('เฉพาะเครือข่ายภายใน'));
    assert.ok(r.out.includes('ตั้ง 2FA ครบทุกบัญชีแล้ว'));
});

test('enable refuses while an account has no second factor, and changes nothing', t => {
    const s = sandbox(notEnrolled); t.after(() => s.clean());
    const before = fs.readFileSync(s.file, 'utf8');
    const r = s.run('enable');
    assert.equal(r.code, 1);
    assert.ok(r.out.includes('admin'), 'name the account that would be locked out');
    assert.equal(fs.readFileSync(s.file, 'utf8'), before, 'a refusal must leave the file untouched');
    assert.equal(s.backups().length, 0, 'and must not litter backups for a change it did not make');
});

test('enable refuses when it cannot read the accounts at all', t => {
    // Guessing here is the whole failure this script exists to prevent.
    const s = sandbox(null); t.after(() => s.clean());
    const r = s.run('enable');
    assert.equal(r.code, 1);
    assert.ok(/อ่านฐานข้อมูลบัญชีไม่ได้/.test(r.out));
});

test('enable moves all four settings together once everyone has enrolled', t => {
    const s = sandbox(enrolled); t.after(() => s.clean());
    const r = s.run('enable');
    assert.equal(r.code, 0, r.out);
    const c = s.config();
    // Both loopback forms: a service URL of "localhost" arrives on ::1 on Windows, and
    // ipcheck does not treat ::1 as matching 127.0.0.1, so listing one silently does nothing.
    assert.deepEqual(c.settings.trustedProxy, ['127.0.0.1', '::1'], 'real client addresses must reach the log');
    assert.equal(c.settings.userAllowedIP, undefined, 'a technician at home is never on the allowlist');
    assert.equal(c.settings.agentAllowedIP, undefined);
    assert.equal(c.domains[''].passwordRequirements.force2factor, true, 'the second factor is the fence now');
    assert.deepEqual(c.settings.scpLanAllowlist.userAllowedIP, ['127.0.0.1', '192.168.2.0/24'], 'keep the old list to go back to');
    assert.equal(s.backups().length, 1, 'the previous configuration is kept');
});

test('disable puts the allowlist back exactly as it was', t => {
    const s = sandbox(enrolled); t.after(() => s.clean());
    s.run('enable');
    const r = s.run('disable');
    assert.equal(r.code, 0, r.out);
    const c = s.config();
    assert.equal(c.settings.trustedProxy, undefined);
    assert.deepEqual(c.settings.userAllowedIP, ['127.0.0.1', '192.168.2.0/24']);
    assert.deepEqual(c.settings.agentAllowedIP, ['127.0.0.1', '192.168.2.0/24']);
    assert.equal(c.settings.scpLanAllowlist, undefined, 'the saved copy is consumed, not left behind');
});

test('disable keeps enforced 2FA, because turning it back off only weakens the server', t => {
    const s = sandbox(enrolled); t.after(() => s.clean());
    s.run('enable');
    const r = s.run('disable');
    assert.equal(s.config().domains[''].passwordRequirements.force2factor, true);
    assert.ok(r.out.includes('ยังบังคับ 2FA'), 'and says so, so it does not look like an oversight');
});

test('running enable or disable twice does nothing the second time', t => {
    const s = sandbox(enrolled); t.after(() => s.clean());
    s.run('enable');
    const again = s.run('enable');
    assert.equal(again.code, 0);
    assert.ok(again.out.includes('เปิดอยู่แล้ว'));
    assert.equal(s.backups().length, 1, 'no second backup for a change that did not happen');
    s.run('disable');
    const off = s.run('disable');
    assert.ok(off.out.includes('ปิดอยู่แล้ว'));
});

test('the round trip leaves the configuration byte-identical apart from enforced 2FA', t => {
    const s = sandbox(enrolled); t.after(() => s.clean());
    const before = s.config();
    s.run('enable'); s.run('disable');
    const after = s.config();
    after.domains[''].passwordRequirements = undefined;
    delete after.domains[''].passwordRequirements;
    assert.deepEqual(after, before, 'nothing else should have moved');
});

test('the firewall is never touched: the tunnel arrives on loopback', () => {
    // Opening an inbound port would undo the main reason for choosing a tunnel.
    const source = fs.readFileSync(script, 'utf8');
    assert.ok(!/NetFirewallRule|netsh|spawnSync/.test(source), 'this script must not run firewall commands');
});

test('the next steps name every path an agent needs, not only agent.ashx', () => {
    // An Access policy over the whole hostname leaves every computer online while no remote
    // screen will open, because agents also dial meshrelay.ashx themselves.
    const source = fs.readFileSync(script, 'utf8');
    for (const p of ['/agent.ashx', '/meshrelay.ashx', '/agenttransfer.ashx', '/agentdownload.ashx']) {
        assert.ok(source.includes(p), 'the instructions should mention ' + p);
    }
});

test('the trusted proxy list covers the loopback form the tunnel actually arrives on', () => {
    // ipcheck.match('::1', '127.0.0.1') is false. A route whose service URL says "localhost"
    // reaches the server on ::1 on Windows, so trusting only the IPv4 form reads as configured
    // while changing nothing: every visitor stays recorded as loopback.
    const ipcheck = require('ipcheck');
    const s = sandbox(enrolled);
    try {
        s.run('enable');
        const trusted = s.config().settings.trustedProxy;
        for (const arriving of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
            assert.ok(trusted.some(p => ipcheck.match(arriving, p)),
                'a connection arriving from ' + arriving + ' must be recognised as the tunnel');
        }
    } finally { s.clean(); }
});
