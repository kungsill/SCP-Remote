'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..');
const model=require('../../public/scripts/scp-connection');
function fixture(){
 const dom=new JSDOM('<html lang="th"><body><div><span id="deskstatus"></span></div></body></html>',{runScripts:'outside-only'});
 const w=dom.window;const timers=new Map();let i=0;
 w.setTimeout=f=>{timers.set(++i,f);return i;};w.clearTimeout=id=>timers.delete(id);
 w.currentNode={_id:'node/test'};w.eval(fs.readFileSync(path.join(root,'public/scripts/scp-connection.js'),'utf8'));
 return {dom,w,timers,text:()=>w.document.getElementById('scpConnectionText').textContent};
}
test('offline and missing release reports never claim a current release',()=>{
 assert.equal(model.releaseState({},'1',true),'unknown');
 assert.equal(model.releaseState({scpRelease:'1'},'1',false),'offline');
 assert.equal(model.releaseState({scpRelease:'0'},'1',true),'different');
 assert.equal(model.releaseState({scpRelease:'1'},'1',true),'current');
 const core=fs.readFileSync(path.join(root,'agents/meshcore.js'),'utf8');
 assert.ok(core.includes("scpRelease: '"+require('../release.json').version+"'"));
});
test('permission failure survives disconnect and remote text is never HTML',()=>{
 const f=fixture(),s={State:2,contype:1};f.w.ScpConnection.state(s,2);
 s.consoleMessageId=1;f.w.ScpConnection.message(s);assert.match(f.text(),/รอผู้ใช้/);
 s.consoleMessageId=2;s.consoleMessage='<img src=x onerror=alert(1)>';f.w.ScpConnection.message(s);
 f.w.ScpConnection.state(s,0);assert.match(f.text(),/ปฏิเสธ/);assert.equal(f.w.document.querySelector('img'),null);
 assert.equal(f.timers.size,0);f.dom.window.close();
});
test('slow connection offers manual retry only for the same device',()=>{
 const f=fixture(),s={State:2,contype:1};f.w.desktop=s;const calls=[];
 f.w.connectDesktop=(e,mode)=>calls.push(mode);f.w.ScpConnection.state(s,2);
 [...f.timers.values()][0]();assert.match(f.text(),/90/);assert.deepEqual(calls,[]);
 f.w.document.getElementById('scpConnectionRetry').click();assert.deepEqual(calls,[0,3]);
 f.w.currentNode={_id:'different'};f.w.document.getElementById('scpConnectionRetry').click();assert.equal(calls.length,2);
 f.dom.window.close();
});
test('successful connection cancels waiting timer and stale messages are ignored',()=>{
 const f=fixture(),s={State:2,contype:1,m:{}};f.w.ScpConnection.state(s,2);
 s.State=3;f.w.ScpConnection.state(s,3);assert.equal(f.timers.size,1);s.m.onScpFrameDrawn();assert.equal(f.timers.size,0);
 f.w.ScpConnection.message({consoleMessageId:2});assert.match(f.text(),/ได้รับภาพ/);
 f.dom.window.close();
});

// On the dashboard a version line appeared on every row to report that the version was
// fine, which is the one thing the reader already assumes.
test('the dashboard is told nothing when the release is current or the computer is offline',()=>{
 const {w}=fixture();
 w.serverinfo={scpRelease:'2026.09.16.6'};
 const current={agent:{scpRelease:'2026.09.16.6'},conn:1};
 const behind={agent:{scpRelease:'2026.09.16.1'},conn:1};
 const offline={agent:{scpRelease:'2026.09.16.6'},conn:0};
 const never={agent:{},conn:1};
 assert.equal(w.ScpConnection.releaseBadge(current,true),null,'up to date needs no line');
 assert.equal(w.ScpConnection.releaseBadge(offline,true),null,'the status column already says offline');
 assert.ok(w.ScpConnection.releaseBadge(behind,true),'a mismatch is worth saying');
 assert.ok(w.ScpConnection.releaseBadge(never,true),'never having reported is worth saying');
 // The devices tab asks without quiet, because there the version is the whole point.
 assert.ok(w.ScpConnection.releaseBadge(current),'the devices tab still shows every release');
 assert.ok(w.ScpConnection.releaseBadge(offline));
});
