// Switch SCP-Remote between "reachable on the hospital LAN only" and "also reachable through
// the Cloudflare tunnel". Four settings have to move together and in the right order; done by
// hand at the wrong moment, two of the orderings lock the only administrator out of the server
// or leave it open with nothing but a password in front of it. See hospital/REMOTE-OVER-INTERNET.md
//
// What this does NOT do: it never opens the Windows firewall. The tunnel reaches the server
// from 127.0.0.1, so the inbound rule stays exactly as narrow as it is today.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, '.local', 'scp-remote');
const configFile = process.env.SCP_CONFIG || path.join(dataDir, 'config.json');

const command = process.argv[2];
if (!fs.existsSync(configFile)) {
    console.error('ไม่พบไฟล์ตั้งค่า: ' + configFile);
    process.exit(2);
}
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const settings = config.settings || (config.settings = {});
const domain = (config.domains && config.domains['']) || null;
if (!domain) { console.error('ไม่พบโดเมนหลักในไฟล์ตั้งค่า'); process.exit(2); }

const isOn = () => settings.trustedProxy != null;

// Accounts sit in the database beside the configuration. Without it we cannot tell who would
// be locked out, and guessing is exactly the failure this script exists to prevent.
function accountsWithoutSecondFactor() {
    const dbFile = path.join(path.dirname(configFile), 'meshcentral.db');
    if (!fs.existsSync(dbFile)) { return null; }
    const users = new Map();
    for (const line of fs.readFileSync(dbFile, 'utf8').split('\n')) {
        if (!line) continue;
        let row; try { row = JSON.parse(line); } catch (ex) { continue; }
        if (row.$$deleted) { users.delete(row._id); continue; }
        if (row.type === 'user') users.set(row._id, row);
    }
    return [...users.values()]
        .filter(u => !u.otpsecret && !(u.otphkeys && u.otphkeys.length) && !(u.otpkeys && u.otpkeys.keys && u.otpkeys.keys.length))
        .map(u => u.name || u._id);
}

function status() {
    console.log('ไฟล์ตั้งค่า: ' + configFile);
    console.log('');
    console.log('โหมดปัจจุบัน : ' + (isOn() ? 'เปิดให้เข้าถึงผ่าน tunnel' : 'เฉพาะเครือข่ายภายใน (LAN)'));
    console.log('  trustedProxy   : ' + (settings.trustedProxy || 'ไม่ได้ตั้ง'));
    console.log('  userAllowedIP  : ' + (settings.userAllowedIP ? (settings.userAllowedIP.length + ' รายการ') : 'ไม่จำกัด'));
    console.log('  agentAllowedIP : ' + (settings.agentAllowedIP ? (settings.agentAllowedIP.length + ' รายการ') : 'ไม่จำกัด'));
    console.log('  force2factor   : ' + (((domain.passwordRequirements || {}).force2factor === true) ? 'บังคับ' : 'ไม่บังคับ'));
    const missing = accountsWithoutSecondFactor();
    console.log('');
    if (missing == null) {
        console.log('บัญชีผู้ใช้ : อ่านไม่ได้ (ไม่มีฐานข้อมูลข้างไฟล์ตั้งค่า)');
    } else if (missing.length === 0) {
        console.log('บัญชีผู้ใช้ : ตั้ง 2FA ครบทุกบัญชีแล้ว ✅');
    } else {
        console.log('บัญชีผู้ใช้ : ยังไม่ได้ตั้ง 2FA ' + missing.length + ' บัญชี — ' + missing.join(', '));
        console.log('              ต้องให้เจ้าของบัญชีตั้ง Authenticator ที่หน้าเว็บก่อน');
    }
}

function backup() {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const target = configFile + '.bak-tunnel-' + stamp;
    fs.copyFileSync(configFile, target);
    return target;
}

function save() { fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n'); }

function enable() {
    if (isOn()) { console.log('เปิดอยู่แล้ว ไม่มีอะไรเปลี่ยน'); return; }
    const missing = accountsWithoutSecondFactor();
    if (missing == null) {
        console.error('อ่านฐานข้อมูลบัญชีไม่ได้ จึงบอกไม่ได้ว่าใครจะถูกล็อกออก — ไม่ดำเนินการต่อ');
        process.exit(1);
    }
    if (missing.length > 0) {
        console.error('ยังเปิดไม่ได้: มีบัญชีที่ยังไม่ได้ตั้ง 2FA — ' + missing.join(', '));
        console.error('');
        console.error('การบังคับ 2FA ก่อนที่บัญชีเหล่านี้จะลงทะเบียน จะล็อกเจ้าของบัญชีออกจากเซิร์ฟเวอร์ของตัวเอง');
        console.error('ให้เข้าหน้าเว็บ → บัญชีของฉัน → ตั้ง Authenticator และเก็บรหัสสำรองไว้นอกเครื่องก่อน');
        process.exit(1);
    }
    const saved = backup();
    // Keep the LAN ranges so turning this off restores exactly what was there before.
    settings.scpLanAllowlist = {
        userAllowedIP: settings.userAllowedIP || null,
        agentAllowedIP: settings.agentAllowedIP || null
    };
    // cloudflared reaches the server from 127.0.0.1 and passes the caller's real address in a
    // header. Without this every visitor is recorded as loopback and the log stops being able
    // to say who took over which ward computer.
    settings.trustedProxy = '127.0.0.1';
    // The address allowlist cannot stay: a technician at home never has an address on it. The
    // fence becomes Cloudflare Access plus the second factor below.
    delete settings.userAllowedIP;
    delete settings.agentAllowedIP;
    if (!domain.passwordRequirements) { domain.passwordRequirements = {}; }
    domain.passwordRequirements.force2factor = true;
    save();
    console.log('เปิดโหมด tunnel แล้ว (สำรองไฟล์เดิมไว้ที่ ' + path.basename(saved) + ')');
    console.log('');
    status();
    console.log('');
    console.log('ไฟร์วอลล์ขาเข้าไม่ถูกแตะต้อง — tunnel เข้ามาทาง 127.0.0.1 จึงไม่ต้องเปิดพอร์ตเพิ่ม');
    console.log('');
    console.log('ขั้นต่อไป');
    console.log('  1. npm run check:config     ตรวจว่าไม่มีข้อติดขัด');
    console.log('  2. npm run service:restart  แล้วยืนยันว่า PID เปลี่ยนจริง');
    console.log('  3. ตั้ง route และ Access ที่ Cloudflare ตาม hospital/REMOTE-OVER-INTERNET.md');
    console.log('     อย่าลืมยกเว้น /agent.ashx /meshrelay.ashx /agenttransfer.ashx /agentdownload.ashx');
    console.log('');
    console.log('ถ้าอยากย้อนกลับ: node scripts/tunnel-mode.js disable');
}

function disable() {
    if (!isOn()) { console.log('ปิดอยู่แล้ว ไม่มีอะไรเปลี่ยน'); return; }
    const saved = backup();
    const previous = settings.scpLanAllowlist || {};
    delete settings.trustedProxy;
    if (previous.userAllowedIP) { settings.userAllowedIP = previous.userAllowedIP; }
    if (previous.agentAllowedIP) { settings.agentAllowedIP = previous.agentAllowedIP; }
    delete settings.scpLanAllowlist;
    save();
    console.log('กลับเป็นโหมดเครือข่ายภายในแล้ว (สำรองไฟล์เดิมไว้ที่ ' + path.basename(saved) + ')');
    if (!previous.userAllowedIP && !previous.agentAllowedIP) {
        console.log('');
        console.log('หมายเหตุ ไม่พบรายการ allowlist เดิมที่บันทึกไว้ ตรวจ userAllowedIP/agentAllowedIP ด้วยมืออีกครั้ง');
    }
    // force2factor is deliberately left on. It was turned on for a reason and turning it off
    // again weakens the server for no gain - everyone has already enrolled by this point.
    console.log('');
    console.log('ยังบังคับ 2FA ไว้ตามเดิม (ตั้งใจ — ทุกคนลงทะเบียนแล้ว การปิดกลับมีแต่ทำให้อ่อนลง)');
    console.log('');
    console.log('ขั้นต่อไป: npm run service:restart แล้วยืนยันว่า PID เปลี่ยนจริง');
}

if (command === 'status' || command == null) { status(); }
else if (command === 'enable') { enable(); }
else if (command === 'disable') { disable(); }
else {
    console.error('ใช้: node scripts/tunnel-mode.js <status|enable|disable>');
    process.exit(2);
}
