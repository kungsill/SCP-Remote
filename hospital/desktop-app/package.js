'use strict';
const path=require('path'),fs=require('fs');
(async()=>{
 const {packager}=await import('@electron/packager');
 const version=require('./package.json').version;
 fs.copyFileSync(path.resolve(__dirname,'../../public/scripts/scp-session.js'),path.join(__dirname,'session-health.js'));
 const standard=path.join(__dirname,'release',version);
 const out=fs.existsSync(standard)?standard+'-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14):standard;
 const output=await packager({dir:__dirname,name:'SCP-Remote',platform:'win32',arch:'x64',out,overwrite:false,icon:path.join(__dirname,'scp-logo.ico'),asar:{unpack:'**/ClipboardHost.exe'},ignore:[/^\/release(?:\/|$)/,/^\/dist(?:\/|$)/,/^\/tests(?:\/|$)/,/ClipboardHostTests\.cs$/,/test-agent-host\.js$/,/^\/_icon_/],appVersion:version,win32metadata:{CompanyName:'โรงพยาบาลสีชมพู',FileDescription:'SCP-Remote Viewer',OriginalFilename:'SCP-Remote.exe',ProductName:'SCP-Remote',InternalName:'SCP-Remote'}});
 console.log(output.join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1;});
