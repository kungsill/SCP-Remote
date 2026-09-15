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
const settings = (JSON.parse(fs.readFileSync(file, 'utf8')).settings) || {};
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
    if (ranges.length === 0) {
        notes.push(key + ' อนุญาตเฉพาะเครื่องนี้ (loopback) ยังไม่เปิดให้เครือข่ายอื่น');
    } else {
        notes.push(key + ' อนุญาต ' + ranges.length + ' รายการ: ' + ranges.join(', '));
    }
}
if (settings.selfUpdate !== false) { blocking.push('selfUpdate ไม่ได้ปิด เซิร์ฟเวอร์อาจอัปเดตตัวเองโดยไม่ได้วางแผน'); }
if (settings.webRTC !== false) { notes.push('webRTC ไม่ได้ปิด การเชื่อมต่อบางส่วนอาจไม่ผ่านเซิร์ฟเวอร์'); }
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
