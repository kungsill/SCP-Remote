// SCP-Remote local entrypoint. Does not replace existing runtime configuration.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const data = path.join(root, '.local', 'scp-remote');
fs.mkdirSync(data, { recursive: true });
const config = path.join(data, 'config.json');
if (!fs.existsSync(config)) fs.copyFileSync(path.join(root, 'hospital', 'config.example.json'), config);
// Refuse to serve Thai pages that are older than the templates they come from,
// so an edited template is never published with its previous Thai text.
const stale = require('../hospital/templates').stale();
if (stale.length > 0) {
    console.error('Run npm run build:hospital before starting SCP-Remote.');
    console.error('Waiting on: ' + stale.join(', '));
    process.exit(1);
}
console.log('SCP-Remote config: ' + config);
const child = spawn(process.execPath, [path.join(root, 'meshcentral.js'), '--datapath', data, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code == null ? 1 : code; });
