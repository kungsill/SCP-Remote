'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('file retry preserves the original device and destination; completion needs an explicit event',t=>{
 const dom=new JSDOM('<html lang="th"><body><div id="p13filetable"></div></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.currentNode={_id:'node//test',name:'test'};w.files={State:3};w.p13filetreelocation=['C:','test'];w.uploadFile={xpath:'C:/test',xptr:12,xfilePtr:0};let retries=0;w.p13doUploadFiles=()=>retries++;
 w.eval(fs.readFileSync(path.join(__dirname,'../../public/scripts/scp-transfer.js'),'utf8'));
 w.ScpTransfer.transferEvent('uploadBegin',[{name:'<script>file',size:12}]);assert.equal(w.document.querySelector('script'),null);assert.match(w.document.getElementById('scpTransferSummary').textContent,/กำลังโอน/);
 w.ScpTransfer.transferEvent('disconnected');assert.match(w.document.getElementById('scpTransferSummary').textContent,/ไม่สำเร็จ/);
 w.p13filetreelocation=['C:','other'];w.document.querySelector('#scpTransferSummary button').click();assert.equal(retries,0);
 w.p13filetreelocation=['C:','test'];w.document.querySelector('#scpTransferSummary button').click();assert.equal(retries,1);
 w.currentNode={_id:'node//other'};w.document.querySelector('#scpTransferSummary button').click();assert.equal(retries,1);
});
test('operations renders untrusted ticket text as text and includes backup checks for admin',async t=>{
 const dom=new JSDOM('<html lang="th"><body></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.nodes=[{_id:'node//1',name:'Test'}];w.userinfo={siteadmin:4294967295};let sent;w.meshserver={send:c=>sent=c};w.eval(fs.readFileSync(path.join(__dirname,'../../public/scripts/scp-operations.js'),'utf8'));w.ScpOperations.open();assert.equal(sent.op,'tickets');w.ScpOperations.receive({tag:sent.tag,result:[{_id:'t1',title:'<img src=x onerror=alert(1)>',nodeid:'node//1',status:'open',updated:Date.now()}]});await Promise.resolve();await Promise.resolve();assert.equal(w.document.querySelector('img'),null);assert.match(w.document.body.textContent,/สำรองข้อมูล/);assert.match(w.document.body.textContent,/<img/);
});
