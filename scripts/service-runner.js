// Runs inside the SCP-Remote Windows service. node-windows starts this file with no
// arguments, so the data path that npm run start:hospital passes on the command line
// is set here instead. Without it the server would fall back to its default folder and
// come up as a separate, empty installation with none of the hospital configuration.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const server = path.join(root, 'meshcentral.js');
const dataPath = path.join(root, '.local', 'scp-remote');
process.chdir(root);
process.argv = [process.argv[0], server, '--datapath', dataPath];

// Copy the nightly backup onto a second drive from inside the service that is already
// running, rather than from a separate scheduled task. There is then nothing extra to
// install, nothing that stops when nobody is logged on, and nothing that can be removed
// without anyone noticing: it starts and stops with the server itself. Set the
// destination as settings.autoBackup.scpBackupCopyPath in the configuration, next to the
// backup path it copies from; leave it out and this does nothing at all.
startBackupCopies();

require(server).mainStart();

function startBackupCopies() {
    let destination = null;
    try {
        const settings = JSON.parse(fs.readFileSync(path.join(dataPath, 'config.json'), 'utf8')).settings || {};
        const auto = settings.autoBackup || settings.AutoBackup || {};
        destination = auto.scpBackupCopyPath || auto.scpbackupcopypath || settings.scpBackupCopyPath || null;
    } catch (error) {
        console.log('[backup-copy] อ่านไฟล์ตั้งค่าไม่ได้ จึงไม่ก๊อปไฟล์สำรอง: ' + error.message);
        return;
    }
    if (!destination) { return; }
    try {
        // Half past three. The server's own backup is asked for at two but its file is written
        // at about 02:33 (the name says so), so a copy at 02:30 always took yesterday's file and
        // the second copy ran a day behind. An hour's margin puts both copies on the same night.
        require('./copy-backups.js').scheduleDaily(destination, 3, 30);
        console.log('[backup-copy] จะก๊อปไฟล์สำรองไปที่ ' + destination + ' ทุกวันเวลา 03:30');
    } catch (error) {
        console.log('[backup-copy] ตั้งเวลาไม่สำเร็จ: ' + error.message);
    }
}
