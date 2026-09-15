// Runs inside the SCP-Remote Windows service. node-windows starts this file with no
// arguments, so the data path that npm run start:hospital passes on the command line
// is set here instead. Without it the server would fall back to its default folder and
// come up as a separate, empty installation with none of the hospital configuration.
'use strict';
const path = require('path');
const root = path.resolve(__dirname, '..');
const server = path.join(root, 'meshcentral.js');
process.chdir(root);
process.argv = [process.argv[0], server, '--datapath', path.join(root, '.local', 'scp-remote')];
require(server).mainStart();
