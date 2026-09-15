// SCP-Remote Windows service control. Installing, removing, starting or stopping a
// service changes this machine, so nothing runs on import and each command must be
// given explicitly. Installing and removing require an elevated PowerShell window.
'use strict';
const path = require('path');
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, '.local', 'scp-remote');
const commands = ['install', 'uninstall', 'start', 'stop', 'restart'];
const command = process.argv[2];
if (!commands.includes(command)) {
    console.error('Usage: node scripts/service-hospital.js <' + commands.join('|') + '>');
    process.exit(2);
}
if (process.platform !== 'win32') {
    console.error('The SCP-Remote service is Windows only. On other systems use the operating system service manager.');
    process.exit(1);
}
// A service that starts on boot would otherwise publish Thai pages from before the
// last template edit, with nobody at a console to notice.
if (['install', 'start', 'restart'].includes(command)) {
    const stale = require('../hospital/templates').stale();
    if (stale.length > 0) {
        console.error('Run npm run build:hospital before using the SCP-Remote service.');
        console.error('Waiting on: ' + stale.join(', '));
        process.exit(1);
    }
}
const service = new (require('node-windows').Service)({
    name: 'SCP-Remote',
    description: 'SCP-Remote hospital remote support server, built on MeshCentral.',
    script: path.join(__dirname, 'service-runner.js'),
    wait: 2,
    grow: 0.5
});
service.on('install', function () { console.log('SCP-Remote service installed. Data folder: ' + dataPath); service.start(); });
service.on('alreadyinstalled', function () { console.log('SCP-Remote service is already installed.'); process.exit(); });
service.on('invalidinstallation', function () { console.error('SCP-Remote service installation is incomplete. Run uninstall, then install again.'); process.exit(1); });
service.on('uninstall', function () { console.log('SCP-Remote service removed. The data folder was kept: ' + dataPath); process.exit(); });
service.on('start', function () { console.log('SCP-Remote service started.'); process.exit(); });
service.on('stop', function () {
    console.log('SCP-Remote service stopped.');
    if (command === 'stop') { process.exit(); }
    if (command === 'restart') { console.log('Starting again in 5 seconds...'); setTimeout(function () { service.start(); }, 5000); }
});
service.on('error', function (error) { console.error(error); process.exitCode = 1; });
if (command === 'install') { service.install(); }
if (command === 'uninstall') { service.uninstall(); }
if (command === 'start') { service.start(); }
if (command === 'stop' || command === 'restart') { service.stop(); }
