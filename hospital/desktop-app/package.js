'use strict';
const path=require('path');
(async()=>{
 const {packager}=await import('@electron/packager');
 const version=require('./package.json').version;
 const output=await packager({dir:__dirname,name:'SCP-Remote',platform:'win32',arch:'x64',out:path.join(__dirname,'release',version),overwrite:true,asar:{unpack:'**/ClipboardHost.exe'},ignore:[/^\/release(?:\/|$)/,/^\/dist(?:\/|$)/,/^\/tests(?:\/|$)/,/ClipboardHostTests\.cs$/,/test-agent-host\.js$/],appVersion:version});
 console.log(output.join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1;});
