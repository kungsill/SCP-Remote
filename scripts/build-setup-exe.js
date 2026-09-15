// Build the SCP-Remote client setup into a single Windows executable, using the C#
// compiler that ships with the .NET Framework so nothing has to be downloaded.
// The hospital logo is compiled into the file, so only the setup program and the
// agent installer for the device group have to be copied to a client machine.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const setupDir = path.join(root, 'hospital', 'client-setup');
const srcDir = path.join(setupDir, 'src');
const logo = path.join(root, 'hospital', 'brand', 'logo.png');
const output = path.join(setupDir, 'SCP-Remote-Setup.exe');

if (process.platform !== 'win32') {
    console.error('สร้างไฟล์ .exe ได้เฉพาะบน Windows');
    process.exit(1);
}
for (const file of [path.join(srcDir, 'Setup.cs'), path.join(srcDir, 'app.manifest'), logo]) {
    if (!fs.existsSync(file)) { console.error('ไม่พบไฟล์ที่ต้องใช้: ' + file); process.exit(2); }
}

// The .NET Framework compiler lives beside Windows itself. Prefer 64-bit.
const compilers = [
    path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
];
const csc = compilers.find(file => fs.existsSync(file));
if (!csc) {
    console.error('ไม่พบตัวคอมไพล์ csc.exe ของ .NET Framework 4 บนเครื่องนี้');
    process.exit(3);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-setup-'));
const iconPng = path.join(work, 'icon256.png');
const iconFile = path.join(work, 'setup.ico');

// Shrink the logo to the largest size an icon holds, then wrap it. An icon entry may
// carry a PNG as-is, which keeps the transparent edges clean at every size Windows asks for.
const resize = [
    'Add-Type -AssemblyName System.Drawing',
    '$src = [System.Drawing.Image]::FromFile(' + JSON.stringify(logo) + ')',
    '$bmp = New-Object System.Drawing.Bitmap 256, 256',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.InterpolationMode = "HighQualityBicubic"',
    '$g.SmoothingMode = "AntiAlias"',
    '$g.PixelOffsetMode = "HighQuality"',
    '$g.Clear([System.Drawing.Color]::Transparent)',
    '$g.DrawImage($src, 0, 0, 256, 256)',
    '$g.Dispose()',
    '$bmp.Save(' + JSON.stringify(iconPng) + ', [System.Drawing.Imaging.ImageFormat]::Png)',
    '$bmp.Dispose()',
    '$src.Dispose()'
].join('; ');
const resized = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', resize], { encoding: 'utf8' });
if (resized.status !== 0 || !fs.existsSync(iconPng)) {
    console.error('ย่อโลโก้เป็นไอคอนไม่สำเร็จ');
    if (resized.stderr) console.error(resized.stderr.trim());
    process.exit(4);
}
const pngBytes = fs.readFileSync(iconPng);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);                 // reserved
header.writeUInt16LE(1, 2);                 // type: icon
header.writeUInt16LE(1, 4);                 // one image in this file
header.writeUInt8(0, 6);                    // width 0 means 256
header.writeUInt8(0, 7);                    // height 0 means 256
header.writeUInt8(0, 8);                    // colours in palette: none, it is truecolour
header.writeUInt8(0, 9);                    // reserved
header.writeUInt16LE(1, 10);                // colour planes
header.writeUInt16LE(32, 12);               // bits per pixel
header.writeUInt32LE(pngBytes.length, 14);  // size of the image data
header.writeUInt32LE(22, 18);               // where the image data starts
fs.writeFileSync(iconFile, Buffer.concat([header, pngBytes]));

// Compile the device-group agent into the program so the finished file works on its
// own. Whatever sits next to the program at run time still takes priority, so a newer
// download can replace the built-in copy without rebuilding.
const agentDir = path.join(setupDir, 'agents');
const agentResources = [];

// The server appends the device-group settings to the end of every agent download:
// the settings text, its length as four big-endian bytes, then a 16 byte marker.
function readAgentSettings(file) {
    try {
        const data = fs.readFileSync(file);
        if (data.length < 24) return null;
        const length = data.readUInt32BE(data.length - 20);
        if (length <= 0 || length > data.length - 20) return null;
        const text = data.slice(data.length - 20 - length, data.length - 20).toString('utf8');
        const name = /MeshName=(.*)/.exec(text);
        const server = /MeshServer=(.*)/.exec(text);
        const machine = (() => {
            const offset = data.readUInt32LE(0x3c);
            const value = data.readUInt16LE(offset + 4);
            return { 0x014c: 'Windows 32 บิต', 0x8664: 'Windows 64 บิต', 0xaa64: 'Windows ARM 64 บิต' }[value] || ('0x' + value.toString(16));
        })();
        return { group: name ? name[1].trim() : null, server: server ? server[1].trim() : null, machine: machine };
    } catch (error) { return null; }
}

if (!fs.existsSync(agentDir)) {
    console.log('ไม่พบโฟลเดอร์ ' + path.relative(root, agentDir) + ' ตัวติดตั้งจะต้องใช้ไฟล์เอเจนต์วางคู่กัน');
} else {
    const found = fs.readdirSync(agentDir).filter(file => file.toLowerCase().endsWith('.exe')).sort();
    if (found.length === 0) {
        console.log('ไม่มีไฟล์เอเจนต์ใน ' + path.relative(root, agentDir) + ' ตัวติดตั้งจะต้องใช้ไฟล์เอเจนต์วางคู่กัน');
    } else {
        const details = found.map(file => ({ file: file, info: readAgentSettings(path.join(agentDir, file)) }));
        console.log('ไฟล์เอเจนต์ที่จะฝังลงตัวติดตั้ง');
        for (const entry of details) {
            const info = entry.info;
            console.log('  ' + entry.file + (info ? '  [' + info.machine + ']  กลุ่ม: ' + info.group : '  (อ่านค่าที่ฝังไม่ได้)'));
        }
        // Every architecture has to lead to the same device group, otherwise which group
        // a computer joins would depend on whether it is 32 or 64 bit.
        const groups = [...new Set(details.map(entry => entry.info && entry.info.group).filter(Boolean))];
        const servers = [...new Set(details.map(entry => entry.info && entry.info.server).filter(Boolean))];
        if (groups.length > 1) {
            console.error('');
            console.error('หยุดสร้างไฟล์ ไฟล์เอเจนต์มาจากคนละกลุ่มอุปกรณ์: ' + groups.join(', '));
            console.error('เครื่องจะเข้ากลุ่มต่างกันตามสถาปัตยกรรม ซึ่งไม่ใช่สิ่งที่ต้องการ');
            console.error('ให้ดาวน์โหลดไฟล์เอเจนต์ทุกแบบจากกลุ่มเดียวกัน แล้วสั่งใหม่');
            process.exit(6);
        }
        if (servers.length > 1) {
            console.error('');
            console.error('หยุดสร้างไฟล์ ไฟล์เอเจนต์ชี้ไปคนละเซิร์ฟเวอร์: ' + servers.join(', '));
            process.exit(7);
        }
        const machines = details.map(entry => entry.info && entry.info.machine).filter(Boolean);
        if (machines.length !== new Set(machines).size) {
            console.log('');
            console.log('เตือน มีไฟล์สถาปัตยกรรมซ้ำกัน ตัวติดตั้งจะใช้ไฟล์แรกที่ตรงกับเครื่อง');
        }
        found.forEach((file, index) => {
            // The resource name has to stay ASCII, because agent downloads carry the Thai
            // device-group name in their file name.
            agentResources.push('/resource:' + path.join(agentDir, file) + ',agent' + index + '.exe');
        });
        if (groups.length === 1) { console.log('ทุกไฟล์อยู่กลุ่มเดียวกัน: ' + groups[0]); }
    }
}

const args = [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/out:' + output,
    '/win32manifest:' + path.join(srcDir, 'app.manifest'),
    '/win32icon:' + iconFile,
    '/resource:' + logo + ',logo.png'
].concat(agentResources).concat([
    '/reference:System.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.ServiceProcess.dll',
    path.join(srcDir, 'Setup.cs')
]);
const built = spawnSync(csc, args, { encoding: 'utf8', cwd: srcDir });
process.stdout.write(built.stdout || '');
if (built.status !== 0) {
    process.stderr.write(built.stderr || '');
    console.error('คอมไพล์ไม่สำเร็จ');
    fs.rmSync(work, { recursive: true, force: true });
    process.exit(built.status || 5);
}
fs.rmSync(work, { recursive: true, force: true });

const size = fs.statSync(output).size;
console.log('สร้างไฟล์สำเร็จ: ' + path.relative(root, output).split(path.sep).join('/'));
console.log('ขนาด ' + (size / 1024).toFixed(0) + ' KB  รวมโลโก้และไอคอนไว้ในไฟล์แล้ว');
console.log('ไฟล์นี้ขอสิทธิ์ผู้ดูแลเครื่องเองเมื่อเปิด' + (agentResources.length ? ' และใช้งานได้ด้วยตัวเอง ไม่ต้องมีไฟล์อื่นวางคู่' : ' และต้องวางคู่กับไฟล์เอเจนต์ของกลุ่มอุปกรณ์'));
