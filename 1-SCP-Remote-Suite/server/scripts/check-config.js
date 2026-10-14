// SCP-Remote configuration review. Reads the runtime configuration and reports what
// still has to change before other machines on the hospital network can connect.
// Read-only: it never edits the configuration and never contacts the network.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, '.local', 'scp-remote', 'config.json');
if (!fs.existsSync(file)) {
    console.error('ไม่พบไฟล์ตั้งค่า: ' + file);
    console.error('เริ่มเซิร์ฟเวอร์ครั้งแรกด้วย npm run start:hospital เพื่อสร้างไฟล์นี้');
    process.exit(2);
}
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const settings = config.settings || {};
const domains = config.domains || {};
const loopback = ['127.0.0.1', '::1', 'localhost'];
const list = value => (Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : [])).map(item => String(item).trim()).filter(Boolean);
const remote = key => list(settings[key]).filter(item => !loopback.includes(item));
const userRanges = remote('userAllowedIP');
const agentRanges = remote('agentAllowedIP');
const blocking = [];
const notes = [];
console.log('ไฟล์ตั้งค่า: ' + file);
console.log('');
// A certificate common name without a dot makes the server fall back to LAN-only mode
// no matter what the configuration says, which changes how agents find the server.
const serverName = typeof settings.cert === 'string' ? settings.cert : null;
const multicastOnly = (settings.LANonly === true) || (serverName == null) || (serverName.indexOf('.') === -1);
if (multicastOnly) {
    notes.push('เอเจนต์จะค้นหาเซิร์ฟเวอร์ด้วย multicast (MeshServer=local) ซึ่งมักไม่ข้าม VLAN');
} else {
    notes.push('เอเจนต์จะต่อมาที่ wss://' + serverName + ':' + (settings.port || 443) + '/agent.ashx ข้าม VLAN ได้ถ้า DNS/เส้นทางถึงกัน');
}
if (multicastOnly && (userRanges.length + agentRanges.length > 0)) {
    blocking.push('ตั้ง userAllowedIP/agentAllowedIP ให้เครื่องนอกเครื่องนี้แล้ว แต่เอเจนต์ยังหาเซิร์ฟเวอร์ด้วย multicast เท่านั้น');
    blocking.push('  แก้โดยตั้ง settings.cert เป็นชื่อ DNS หรือ IP คงที่ของเซิร์ฟเวอร์ (ต้องมีจุด) และเอา LANonly ออก');
}
if (settings.portBind == null) {
    notes.push('portBind ไม่ได้กำหนด เซิร์ฟเวอร์จะฟังทุกการ์ดเครือข่าย เหมาะกับเครื่องที่มีหลายวง');
} else if (loopback.includes(settings.portBind)) {
    notes.push('portBind = ' + settings.portBind + ' ยังเป็นโหมดทดสอบ เครื่องอื่นเชื่อมต่อไม่ได้');
} else {
    notes.push('portBind = ' + settings.portBind + ' จะรับเฉพาะการ์ดที่ถือ IP นี้ วงอื่นต้องมีเส้นทางมาที่ IP นี้');
}
for (const [key, ranges] of [['userAllowedIP', userRanges], ['agentAllowedIP', agentRanges]]) {
    // An absent key is not a narrow list, it is no restriction at all. Reporting that as
    // "this machine only" says the opposite of what the server will do.
    if (settings[key] == null) {
        notes.push(key + ' ไม่ได้กำหนด = ไม่จำกัดที่มา (รับจากทุกที่ ให้ Cloudflare Access กับ 2FA เป็นด่านแทน)');
    } else if (ranges.length === 0) {
        notes.push(key + ' อนุญาตเฉพาะเครื่องนี้ (loopback) ยังไม่เปิดให้เครือข่ายอื่น');
    } else {
        notes.push(key + ' อนุญาต ' + ranges.length + ' รายการ: ' + ranges.join(', '));
    }
}
if (settings.selfUpdate !== false) { blocking.push('selfUpdate ไม่ได้ปิด เซิร์ฟเวอร์อาจอัปเดตตัวเองโดยไม่ได้วางแผน'); }
if (settings.webRTC !== false) { notes.push('webRTC ไม่ได้ปิด การเชื่อมต่อบางส่วนอาจไม่ผ่านเซิร์ฟเวอร์'); }

// The hospital page is about 1.6 MB before compression. Sending it raw over a ward link to an
// old computer is the difference between a page that opens and one that feels broken.
if (settings.compression === true) {
    notes.push('compression เปิดอยู่ หน้าเว็บถูกบีบอัดก่อนส่ง (หน้าไทยเหลือราว 18% ของขนาดเดิม)');
} else {
    notes.push('compression ยังไม่เปิด หน้าเว็บถูกส่งแบบไม่บีบอัด ราว 1.6 MB ต่อการเปิดหนึ่งครั้ง');
    notes.push('  เปิดด้วย settings.compression = true แล้วเริ่มบริการใหม่');
}

// minify looks like free speed and is a trap here. It does two things: it serves the minified
// page, which exists, AND it rewrites every core script tag to a -min.js file. Upstream builds
// those; this fork never has. Turning it on 404s the scripts that draw the whole interface, so
// the page loads and then does nothing at all. Name the missing files rather than the setting.
const minifiedCore = ['common-0.0.1', 'meshcentral', 'amt-0.2.0', 'amt-wsman-0.2.0', 'amt-desktop-0.0.2',
    'amt-terminal-0.0.2', 'amt-redir-ws-0.1.0', 'amt-wsman-ws-0.2.0', 'agent-redir-ws-0.1.1',
    'agent-redir-rtc-0.1.0', 'agent-desktop-0.0.2', 'agent-rdp-0.0.1'];
const missingMin = minifiedCore.filter(name => !fs.existsSync(path.join(root, 'public', 'scripts', name + '-min.js')));
const minifyOn = (settings.minify === true) || Object.keys(domains).some(id => domains[id] && domains[id].minify === true);
if (minifyOn && (missingMin.length > 0)) {
    blocking.push('minify เปิดอยู่ แต่ไม่มีไฟล์ย่อของสคริปต์แกนหลัก ' + missingMin.length + ' ตัว หน้าเว็บจะโหลดแล้วใช้งานไม่ได้');
    blocking.push('  ที่ขาด: ' + missingMin.slice(0, 3).join('-min.js, ') + '-min.js ...');
    blocking.push('  แก้โดยปิด minify (ใช้ compression แทน ได้ผลดีกว่าและไม่พัง)');
} else if (missingMin.length > 0) {
    notes.push('minify ปิดอยู่ และต้องปิดไว้: ไม่มีไฟล์ย่อของสคริปต์แกนหลัก ' + missingMin.length + ' ตัว เปิดแล้วหน้าเว็บจะใช้งานไม่ได้');
}
// Reachable from the internet is a different thing from reachable on the ward LAN. Until now
// the address allowlist has been the fence: a stolen password was only useful to someone
// already inside the hospital network. A tunnel or a forwarded port removes that fence, and
// the only thing left is the password. So the moment the configuration looks outward-facing,
// a second factor stops being good practice and becomes the fence itself.
const everywhere = ['0.0.0.0/0', '::/0', '0.0.0.0', '*'];
const openToAll = key => { const v = list(settings[key]); return (v.length === 0) || v.some(item => everywhere.includes(item)); };
const behindProxy = (settings.trustedProxy != null) || (settings.tlsOffload != null);
const usersOpen = openToAll('userAllowedIP'), agentsOpen = openToAll('agentAllowedIP');
const facingInternet = behindProxy || usersOpen || agentsOpen;

const requirements = (domains[''] && domains[''].passwordRequirements) || {};
const forced = requirements.force2factor === true;

// Accounts live in the database beside the configuration, not in it. A checkout without a
// server next to it simply has nothing to say here.
let noSecondFactor = null;
try {
    const dbFile = path.join(path.dirname(file), 'meshcentral.db');
    if (fs.existsSync(dbFile)) {
        const accounts = new Map();
        for (const line of fs.readFileSync(dbFile, 'utf8').split('\n')) {
            if (!line) continue;
            let row; try { row = JSON.parse(line); } catch (ex) { continue; }
            if (row.$$deleted) { accounts.delete(row._id); continue; }
            if (row.type === 'user') accounts.set(row._id, row);
        }
        noSecondFactor = [...accounts.values()].filter(u =>
            !u.otpsecret && !(u.otphkeys && u.otphkeys.length) && !(u.otpkeys && u.otpkeys.keys && u.otpkeys.keys.length)
        ).map(u => u.name || u._id);
    }
} catch (ex) { noSecondFactor = null; }

if (facingInternet) {
    notes.push('การตั้งค่านี้เปิดให้เข้าถึงจากนอกเครือข่ายโรงพยาบาลได้ (' +
        [behindProxy && 'ผ่าน proxy/tunnel', usersOpen && 'userAllowedIP ไม่จำกัด', agentsOpen && 'agentAllowedIP ไม่จำกัด'].filter(Boolean).join(', ') + ')');
    if (!forced) {
        blocking.push('เปิดให้เข้าถึงจากภายนอกได้ แต่ยังไม่บังคับ 2FA — รหัสผ่านที่หลุดครั้งเดียวได้ทุกเครื่องในโรงพยาบาล');
        blocking.push('  ตั้ง domains."".passwordRequirements.force2factor = true แล้วเริ่มบริการใหม่');
    }
    if (noSecondFactor && noSecondFactor.length > 0) {
        blocking.push('มีบัญชีที่ยังไม่ได้ตั้ง 2FA ' + noSecondFactor.length + ' บัญชี: ' + noSecondFactor.join(', '));
        blocking.push('  ให้เจ้าของบัญชีตั้ง Authenticator ที่หน้าเว็บก่อน มิฉะนั้นการบังคับ 2FA จะล็อกคนเหล่านี้ออกจากระบบ');
    }
    if (behindProxy && !usersOpen && !agentsOpen) {
        notes.push('อยู่หลัง proxy/tunnel แต่ allowlist ยังเป็นวงภายใน เครื่องจากภายนอกจะถูกปฏิเสธ (ตั้งใจแบบนี้หรือไม่?)');
    }
    if (!behindProxy) {
        blocking.push('allowlist เปิดกว้างแต่ไม่ได้ตั้ง trustedProxy — บันทึกการใช้งานจะเห็น IP ของ proxy แทน IP จริงของผู้ใช้');
        blocking.push('  ถ้าใช้ Cloudflare Tunnel ให้ตั้ง settings.trustedProxy = "127.0.0.1"');
    }
} else if (noSecondFactor && noSecondFactor.length > 0 && !forced) {
    notes.push('ยังไม่มีบัญชีใดตั้ง 2FA (' + noSecondFactor.join(', ') + ') — รับได้เพราะยังจำกัดเฉพาะเครือข่ายภายใน');
    notes.push('  แต่ต้องตั้งก่อนเปิดให้เข้าถึงจากภายนอก ดู hospital/REMOTE-OVER-INTERNET.md');
}

console.log('สรุปสถานะ');
for (const note of notes) { console.log('  - ' + note); }
console.log('');
console.log('ต้องทำเองเสมอ ไม่มีในไฟล์ตั้งค่านี้');
console.log('  - เปิดไฟร์วอลล์ของเซิร์ฟเวอร์ให้ TCP ' + (settings.port || 443) + ' เฉพาะวงที่ต้องใช้ ไม่ทำ port forwarding จากอินเทอร์เน็ต');
console.log('  - ติดตั้งใบรับรอง TLS ที่เครื่องในโรงพยาบาลเชื่อถือ และตรงกับชื่อที่ผู้ใช้พิมพ์');
console.log('  - สำรอง .local/scp-remote/ ซึ่งเก็บฐานข้อมูล ใบรับรอง และบัญชีผู้ใช้');
if (blocking.length > 0) {
    console.log('');
    console.log('ยังไม่พร้อมเปิดใช้');
    for (const item of blocking) { console.log('  ! ' + item); }
    process.exitCode = 1;
}
