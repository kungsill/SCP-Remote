// Add or remove a hospital network range from the SCP-Remote access lists.
// Edits the runtime configuration and the Windows firewall rule together, because a
// range allowed in only one of the two still cannot reach the server.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const configFile = path.join(root, '.local', 'scp-remote', 'config.json');
const firewallRule = 'SCP-Remote (TCP 8443)';
const loopback = ['127.0.0.1', '::1'];

const [command, ...ranges] = process.argv.slice(2);
if (!fs.existsSync(configFile)) {
    console.error('ไม่พบไฟล์ตั้งค่า: ' + configFile);
    process.exit(2);
}
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const settings = config.settings;

function show() {
    console.log('วงที่อนุญาตให้ผู้ใช้เปิดหน้าเว็บ (userAllowedIP)');
    for (const item of settings.userAllowedIP) { console.log('  - ' + item + (loopback.includes(item) ? '  (เครื่องนี้เอง)' : '')); }
    console.log('วงที่อนุญาตให้เอเจนต์เชื่อมต่อ (agentAllowedIP)');
    for (const item of settings.agentAllowedIP) { console.log('  - ' + item + (loopback.includes(item) ? '  (เครื่องนี้เอง)' : '')); }
}

if (!command || command === 'list') {
    show();
    console.log('');
    console.log('เพิ่มวง : node scripts/allow-subnet.js add 192.168.30.0/24');
    console.log('เอาออก : node scripts/allow-subnet.js remove 192.168.30.0/24');
    process.exit(0);
}
if ((command !== 'add' && command !== 'remove') || ranges.length === 0) {
    console.error('ใช้: node scripts/allow-subnet.js <list|add|remove> [ช่วง IP ...]');
    console.error('ตัวอย่าง: node scripts/allow-subnet.js add 192.168.30.0/24 10.20.0.0/16');
    process.exit(2);
}
// Reject anything that is not a plain IPv4 address or CIDR, so a typo cannot widen
// access in a way nobody notices.
const shape = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d|[12]\d|3[0-2]))?$/;
for (const range of ranges) {
    const match = shape.exec(range);
    if (!match) { console.error('รูปแบบไม่ถูกต้อง: ' + range + '  (ต้องเป็นเช่น 192.168.30.0/24 หรือ 192.168.30.15)'); process.exit(2); }
    for (let i = 1; i <= 4; i++) { if (Number(match[i]) > 255) { console.error('เลขเกิน 255: ' + range); process.exit(2); } }
}

const before = settings.agentAllowedIP.slice();
for (const key of ['userAllowedIP', 'agentAllowedIP']) {
    const current = settings[key];
    if (command === 'add') {
        for (const range of ranges) { if (!current.includes(range)) { current.push(range); } }
    } else {
        settings[key] = current.filter(item => !ranges.includes(item));
    }
}
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
console.log((command === 'add' ? 'เพิ่ม' : 'เอาออก') + ' ' + ranges.join(', ') + ' ในไฟล์ตั้งค่าแล้ว');
console.log('');
show();

// Keep the firewall rule in step. Everything that is not loopback has to be listed
// there too, otherwise Windows drops the connection before the server sees it.
const remotes = settings.agentAllowedIP.filter(item => !loopback.includes(item));
console.log('');
if (remotes.length === 0) {
    console.log('ไม่มีวงภายนอกเหลืออยู่ ข้ามการแก้ไฟร์วอลล์');
} else if (process.platform !== 'win32') {
    console.log('ตั้งไฟร์วอลล์ของเครื่องเองให้อนุญาต TCP ' + (settings.port || 443) + ' จาก: ' + remotes.join(', '));
} else {
    const script = '$r = Get-NetFirewallRule -DisplayName "' + firewallRule + '" -ErrorAction Stop; ' +
        'Set-NetFirewallRule -InputObject $r -RemoteAddress @(' + remotes.map(r => "'" + r + "'").join(',') + ')';
    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' });
    if (result.status === 0) {
        console.log('ปรับกฎไฟร์วอลล์ "' + firewallRule + '" ให้ตรงกันแล้ว');
    } else {
        console.log('แก้ไฟร์วอลล์ไม่สำเร็จ ต้องใช้ PowerShell แบบ Run as administrator แล้วสั่ง');
        console.log('  ' + script);
        if (result.stderr) { console.log('  (' + result.stderr.trim().split('\n')[0] + ')'); }
    }
}

console.log('');
console.log('ขั้นสุดท้าย ต้องเริ่มบริการใหม่เพื่อให้ค่าใหม่มีผล');
console.log('  npm run service:restart');
if (command === 'add') {
    console.log('');
    console.log('ถ้าเครื่องในวงใหม่ยังต่อไม่ได้หลังเริ่มบริการใหม่ ให้ตรวจที่เครื่องนั้นว่า');
    console.log('  Test-NetConnection ' + (settings.cert || '192.168.2.25') + ' -Port ' + (settings.port || 443));
    console.log('ถ้าผลเป็น False แปลว่าติดเส้นทางเครือข่ายระหว่างวง ต้องให้ผู้ดูแลเครือข่ายเปิดเส้นทางให้');
}
if (before.length === settings.agentAllowedIP.length && command === 'add') {
    console.log('');
    console.log('หมายเหตุ ทุกช่วงที่สั่งเพิ่มมีอยู่แล้ว ไม่มีอะไรเปลี่ยน');
}
