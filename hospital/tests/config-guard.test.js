'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// scripts/check-config.js is what an administrator runs before believing the server is set up
// right. These drive the real script over a configuration written for the occasion, so the
// warnings cannot quietly stop matching what the server actually does.
const root = path.join(__dirname, '../..');
const script = path.join(root, 'scripts', 'check-config.js');

// accounts, when given, is written as a small database beside the configuration, the way a
// running server keeps one: [{name, otp}] where otp says whether a second factor is set up.
function review(config, accounts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-config-'));
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
    if (accounts) {
        fs.writeFileSync(path.join(dir, 'meshcentral.db'), accounts.map((a, i) =>
            JSON.stringify({ _id: 'user//' + a.name, type: 'user', name: a.name, otpsecret: a.otp ? 'SECRET' + i : undefined })
        ).join('\n') + '\n');
    }
    const run = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (ex) { }
    return { out: (run.stdout || '') + (run.stderr || ''), code: run.status };
}

// A configuration close enough to the hospital's that only the setting under test differs.
function hospitalConfig(extra) {
    return {
        settings: Object.assign({
            cert: '192.168.2.25', port: 8443, selfUpdate: false, webRTC: false,
            userAllowedIP: ['127.0.0.1', '192.168.2.0/24'], agentAllowedIP: ['127.0.0.1', '192.168.2.0/24']
        }, extra || {}),
        domains: { '': { title: 'SCP-Remote' } }
    };
}

test('minify turned on is refused while the minified core scripts are missing', () => {
    // Turning minify on rewrites every core script tag to a -min.js this fork never builds.
    // The page then loads and does nothing, which reads as "the server is broken", not as a
    // setting. The check has to catch it before anyone restarts into that.
    const r = review(hospitalConfig({ minify: true }));
    assert.equal(r.code, 1, 'this must block, not merely be mentioned');
    assert.ok(r.out.includes('minify เปิดอยู่'), 'the refusal must name minify');
    assert.ok(/ใช้งานไม่ได้/.test(r.out), 'and say the page will not work');
    assert.ok(r.out.includes('compression'), 'and point at the setting that actually helps');
});

test('minify turned on inside a domain is caught too, not only at the top level', () => {
    const config = hospitalConfig();
    config.domains[''].minify = true;
    const r = review(config);
    assert.equal(r.code, 1, 'a domain can turn minify on by itself');
});

test('minify left off is reported as something to keep that way', () => {
    const r = review(hospitalConfig());
    assert.notEqual(r.code, 1);
    assert.ok(r.out.includes('minify ปิดอยู่ และต้องปิดไว้'), 'say why it stays off, so nobody "optimises" it later');
});

test('compression off is called out, with the way to turn it on', () => {
    const r = review(hospitalConfig());
    assert.ok(r.out.includes('compression ยังไม่เปิด'));
    assert.ok(r.out.includes('settings.compression = true'));
    assert.ok(r.out.includes('1.6 MB'), 'a size makes the cost concrete');
});

test('compression on is confirmed rather than left unsaid', () => {
    const r = review(hospitalConfig({ compression: true }));
    assert.ok(r.out.includes('compression เปิดอยู่'));
    assert.ok(!r.out.includes('compression ยังไม่เปิด'));
});

test('the minified core scripts really are absent, which is what makes minify a trap', () => {
    // If someone adds a build that produces these, the guard above should be revisited
    // rather than left telling people not to use a setting that would then be safe.
    const core = ['common-0.0.1', 'meshcentral', 'agent-desktop-0.0.2', 'agent-redir-ws-0.1.1'];
    for (const name of core) {
        assert.ok(!fs.existsSync(path.join(root, 'public', 'scripts', name + '-min.js')),
            name + '-min.js now exists; revisit the minify guard in scripts/check-config.js');
    }
});

test('the hospital configuration in use passes its own review', () => {
    const live = path.join(root, '.local', 'scp-remote', 'config.json');
    if (!fs.existsSync(live)) { return; } // Not every checkout has a running server beside it
    const run = spawnSync(process.execPath, [script, live], { encoding: 'utf8' });
    assert.notEqual(run.status, 1, 'the live configuration should not be in a blocking state:\n' + run.stdout);
});

// Until now the address allowlist has been the fence: a stolen password was only useful to
// someone already on the hospital network. A tunnel removes that fence. These check that the
// review refuses the configurations where nothing would be left but the password.
const open = { userAllowedIP: ['0.0.0.0/0'], agentAllowedIP: ['0.0.0.0/0'], trustedProxy: '127.0.0.1' };
const twoFactor = extra => {
    const c = hospitalConfig(extra);
    c.domains[''].passwordRequirements = { force2factor: true };
    return c;
};

test('opening the server to the internet without enforced 2FA is refused', () => {
    const r = review(hospitalConfig(open));
    assert.equal(r.code, 1);
    assert.ok(r.out.includes('ยังไม่บังคับ 2FA'), 'the refusal must name the missing second factor');
    assert.ok(r.out.includes('force2factor'), 'and the setting that fixes it');
});

test('a tunnel alone counts as facing the internet, even with the allowlist still narrow', () => {
    // trustedProxy only makes sense when something outside is forwarding to us.
    const r = review(hospitalConfig({ trustedProxy: '127.0.0.1' }));
    assert.equal(r.code, 1, 'a proxy in front is the moment the password becomes the only fence');
});

test('enforcing 2FA is not enough while an account has not enrolled', () => {
    // force2factor locks out anyone without a second factor, so this has to be caught before
    // the switch is thrown, not after the only administrator cannot log in.
    const r = review(twoFactor(open), [{ name: 'admin', otp: false }, { name: 'somchai', otp: true }]);
    assert.equal(r.code, 1);
    assert.ok(r.out.includes('admin'), 'the account that would be locked out must be named');
    assert.ok(!/somchai/.test(r.out.split('ยังไม่พร้อมเปิดใช้')[1] || ''), 'an enrolled account is not a problem');
});

test('an internet-facing server with 2FA enforced and everyone enrolled passes', () => {
    const r = review(twoFactor(open), [{ name: 'admin', otp: true }]);
    assert.notEqual(r.code, 1, r.out);
});

test('a wide allowlist with no trusted proxy is refused, because the log would lose the real user', () => {
    const r = review(twoFactor({ userAllowedIP: ['0.0.0.0/0'], agentAllowedIP: ['0.0.0.0/0'] }), [{ name: 'admin', otp: true }]);
    assert.equal(r.code, 1);
    assert.ok(r.out.includes('trustedProxy'), 'name the setting that restores the real address');
});

test('on the ward LAN, a missing second factor is said but does not block', () => {
    const r = review(hospitalConfig(), [{ name: 'admin', otp: false }]);
    assert.notEqual(r.code, 1, 'the allowlist is still the fence here');
    assert.ok(r.out.includes('ยังไม่มีบัญชีใดตั้ง 2FA'), 'but it should still be said out loud');
    assert.ok(r.out.includes('REMOTE-OVER-INTERNET.md'), 'and point at what to read before opening up');
});

test('a checkout with no database beside the config says nothing about accounts', () => {
    const r = review(hospitalConfig());
    assert.ok(!r.out.includes('2FA'), 'nothing is known, so nothing is claimed');
});
