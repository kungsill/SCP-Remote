'use strict';
/* Builds the Windows installer (SCP-Remote-Full-Setup-<version>.exe) with electron-builder.
 *
 *     npm run installer
 *
 * The settings are in installer.json. electron-builder is run through npx, as it was for the
 * 1.1.0 installer; it is not a dependency of this project. The result is written to
 * release/installer/. Installing it over an older copy keeps that copy's registration with the
 * server (the device key lives in the user's data folder, not with the program).
 */
const cp = require('child_process'), path = require('path'), fs = require('fs');
// The program runs the same session script as the website; take the current one.
fs.copyFileSync(path.resolve(__dirname, '../../public/scripts/scp-session.js'), path.join(__dirname, 'session-health.js'));
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE; // set by some editors' terminals; it stops Electron tools working
const result = cp.spawnSync('npx', ['--yes', 'electron-builder@25.1.8', '--win', 'nsis', '--x64', '--config', 'installer.json', '--publish', 'never'], { cwd: __dirname, stdio: 'inherit', shell: true, env });
process.exitCode = result.status === 0 ? 0 : 1;
