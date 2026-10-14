'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');
test('cleanup removes only old test files and never follows junctions or touches recent files',()=>{
 const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'SCP-Cleanup-Test-'));const outside=fs.mkdtempSync(path.join(os.tmpdir(),'SCP-Cleanup-Outside-'));
 const script=`$testDir = '${sandbox.replaceAll("'","''")}'; $outsideDir = '${outside.replaceAll("'","''")}';
 Set-Content -LiteralPath (Join-Path $testDir 'old.tmp') -Value 'old'; Set-Content -LiteralPath (Join-Path $testDir 'recent.tmp') -Value 'recent'; Set-Content -LiteralPath (Join-Path $outsideDir 'keep.tmp') -Value 'keep';
 $file=Get-Item -LiteralPath (Join-Path $testDir 'old.tmp'); $file.CreationTime=(Get-Date).AddDays(-10); $file.LastWriteTime=(Get-Date).AddDays(-10);
 New-Item -ItemType Junction -Path (Join-Path $testDir 'linked') -Target $outsideDir | Out-Null;
 & '${path.join(root,'public/scripts/scp-cleanup.ps1').replaceAll("'","''")}' -TestRoot $testDir`;
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(r.status,0,r.stderr);const match=r.stdout.match(/SCP_CLEANUP_RESULT:(.*)/);assert.ok(match,r.stdout);const report=JSON.parse(match[1]);assert.equal(report.state,'completed');assert.equal(report.deletedFiles,1);assert.equal(fs.existsSync(path.join(sandbox,'old.tmp')),false);assert.ok(fs.existsSync(path.join(sandbox,'recent.tmp')));assert.ok(fs.existsSync(path.join(outside,'keep.tmp')));
});
test('cleanup UI requires confirmation and matches both job and node before showing success',async t=>{
 const dom=new JSDOM('<html lang="th"><body></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;const sent=[];w.confirm=()=>false;w.meshserver={send:m=>sent.push(m)};w.fetch=async()=>({ok:true,text:async()=>"'SCP_CLEANUP_RESULT:'"});w.eval(fs.readFileSync(path.join(root,'public/scripts/scp-cleanup.js'),'utf8'));const n={_id:'node//one',name:'test',conn:1,agent:{id:4}};
 await w.ScpCleanup.run(n);assert.equal(sent.length,0);w.confirm=()=>true;await w.ScpCleanup.run(n);assert.equal(sent.length,1);
 const response={action:'msg',type:'runcommands',nodeid:'node//wrong',responseid:sent[0].responseid,result:'SCP_CLEANUP_RESULT:'+JSON.stringify({version:1,state:'completed',deletedFiles:2,deletedBytes:1024,beforeFree:1024,afterFree:2048,skipped:1,errors:0})};w.ScpCleanup.receive(response);assert.match(w.ScpCleanup.control(n).textContent,/กำลังล้าง/);response.nodeid=n._id;w.ScpCleanup.receive(response);assert.match(w.ScpCleanup.control(n).textContent,/ลบแล้ว 2/);
});
test('cleanup progress updates the phase and counters without reporting completion',async t=>{
 const dom=new JSDOM('<html lang="th"><body></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,sent=[];w.confirm=()=>true;w.meshserver={send:m=>sent.push(m)};w.fetch=async()=>({ok:true,text:async()=>"'SCP_CLEANUP_RESULT:'"});w.eval(fs.readFileSync(path.join(root,'public/scripts/scp-cleanup.js'),'utf8'));const node={_id:'node//test',name:'Test',conn:1,agent:{id:4}};await w.ScpCleanup.run(node);
 w.ScpCleanup.receive({action:'msg',type:'runcommands',nodeid:node._id,responseid:sent[0].responseid,progress:true,result:'SCP_CLEANUP_PROGRESS:'+JSON.stringify({stage:'user-temp',scanned:120,deletedFiles:7,deletedBytes:4096})});const control=w.ScpCleanup.control(node);assert.match(control.textContent,/Temp ของผู้ใช้/);assert.match(control.textContent,/120/);assert.equal(control.querySelector('button').disabled,true);assert.equal(w.ScpCleanup.snapshot()[0].state,'working');
});
