'use strict';
// Copy the nightly backups, and the signed agents the backup deliberately leaves out,
// onto a second drive. The server writes its backups to one folder on one disk; a disk
// that fails takes the server and every copy of its backup with it.
//
//   npm run backup:copy -- H:\SCP-Remote-Backups
//
// This is not an off-site copy. Everything here is still inside the same building and
// the same machine, so it survives a failed disk and nothing else. A copy that leaves
// the building — a NAS, or a drive somebody carries home — is still needed.
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', '.local', 'scp-remote');
const configPath = path.join(dataPath, 'config.json');
const signedAgents = path.join(dataPath, 'signedagents');

function readConfig() {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (error) { return null; }
}

function backupSettings(config) {
    const settings = (config && config.settings) || {};
    const auto = settings.autoBackup || settings.AutoBackup || {};
    return {
        source: auto.backupPath || null,
        keepDays: (typeof auto.keepLastDaysBackup === 'number') ? auto.keepLastDaysBackup : 30
    };
}

// Windows records file times more finely than utimes can write them back, so a copy
// reads as a fraction of a second older than the file it came from. Without room for
// that, every run would copy everything again. Two seconds is the tolerance file-sync
// tools use for the same reason.
const SAME_TIME_MS = 2000;

function copyIfNewer(from, to) {
    let target = null;
    try { target = fs.statSync(to); } catch (error) { /* not there yet */ }
    const source = fs.statSync(from);
    if (target && (target.size === source.size) && ((source.mtimeMs - target.mtimeMs) < SAME_TIME_MS)) { return false; }
    fs.copyFileSync(from, to);
    fs.utimesSync(to, source.atime, source.mtime);
    return true;
}

function copyFolder(from, to) {
    if (!fs.existsSync(from)) { return { copied: 0, skipped: 0 }; }
    fs.mkdirSync(to, { recursive: true });
    let copied = 0, skipped = 0;
    for (const name of fs.readdirSync(from)) {
        const source = path.join(from, name);
        if (fs.statSync(source).isDirectory()) {
            const inner = copyFolder(source, path.join(to, name));
            copied += inner.copied; skipped += inner.skipped;
            continue;
        }
        if (copyIfNewer(source, path.join(to, name))) { copied++; } else { skipped++; }
    }
    return { copied: copied, skipped: skipped };
}

// Only ever removes copies this script made, matching the server's own retention, and
// never touches the folder the server writes to.
function prune(folder, keepDays) {
    if (keepDays <= 0) { return 0; }
    const cutoff = Date.now() - (keepDays * 86400000);
    let removed = 0;
    for (const name of fs.readdirSync(folder)) {
        if (!/^meshcentral-autobackup-.*\.zip$/.test(name)) { continue; }
        const file = path.join(folder, name);
        if (fs.statSync(file).mtimeMs >= cutoff) { continue; }
        fs.unlinkSync(file);
        removed++;
    }
    return removed;
}

function run(destination) {
    const config = readConfig();
    if (config == null) { throw new Error('อ่านไฟล์ตั้งค่าไม่ได้: ' + configPath); }
    const settings = backupSettings(config);
    if (!settings.source) { throw new Error('ไฟล์ตั้งค่าไม่ได้กำหนด autoBackup.backupPath จึงไม่รู้ว่าจะก๊อปอะไร'); }
    if (!fs.existsSync(settings.source)) { throw new Error('ไม่พบโฟลเดอร์สำรองต้นทาง: ' + settings.source); }
    if (path.resolve(settings.source) === path.resolve(destination)) { throw new Error('ปลายทางเป็นที่เดียวกับต้นทาง การก๊อปแบบนี้ไม่ช่วยอะไร'); }

    fs.mkdirSync(destination, { recursive: true });

    const backups = copyFolder(settings.source, destination);
    // The nightly backup skips signedagents to stay small, so those files exist in only
    // one place. They are what the server hands out when someone installs an agent.
    const agents = copyFolder(signedAgents, path.join(destination, 'signedagents'));
    const removed = prune(destination, settings.keepDays);

    return { source: settings.source, destination: destination, backups: backups, agents: agents, removed: removed, keepDays: settings.keepDays };
}

module.exports = { run: run, backupSettings: backupSettings, prune: prune, copyFolder: copyFolder };

if (require.main === module) {
    const destination = process.argv[2];
    if (!destination) {
        console.error('ต้องบอกปลายทางด้วย เช่น  npm run backup:copy -- H:\\SCP-Remote-Backups');
        console.error('ปลายทางควรเป็นไดรฟ์คนละลูกกับที่เซิร์ฟเวอร์เขียนไฟล์สำรอง');
        process.exit(2);
    }
    try {
        const result = run(destination);
        console.log('ก๊อปไฟล์สำรอง');
        console.log('  จาก : ' + result.source);
        console.log('  ไป  : ' + result.destination);
        console.log('  ไฟล์สำรอง: ก๊อปใหม่ ' + result.backups.copied + ' ไฟล์, มีอยู่แล้ว ' + result.backups.skipped + ' ไฟล์');
        console.log('  เอเจนต์ที่เซ็นแล้ว: ก๊อปใหม่ ' + result.agents.copied + ' ไฟล์, มีอยู่แล้ว ' + result.agents.skipped + ' ไฟล์');
        console.log('  ลบสำเนาที่เก่ากว่า ' + result.keepDays + ' วัน: ' + result.removed + ' ไฟล์');
        console.log('');
        console.log('ยังไม่ใช่การสำรองนอกสถานที่ ไฟล์ทั้งหมดยังอยู่ในเครื่องเดียวกัน');
        console.log('ควรมีสำเนาที่ออกไปนอกอาคารด้วย เช่น NAS หรือฮาร์ดดิสก์ที่ถือกลับ');
    } catch (error) {
        console.error('ก๊อปไม่สำเร็จ: ' + error.message);
        process.exit(1);
    }
}
