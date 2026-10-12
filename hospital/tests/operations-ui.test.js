'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('criteria editor offers every draft category and saves the selected profiles under the server criteria payload',async t=>{
 const dom=new JSDOM('<html lang="th"><body></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.nodes=[];w.userinfo={siteadmin:4294967295};const sent=[];w.meshserver={send:c=>sent.push(c)};
 for(const file of ['scp-price-reference.js','scp-assess.js','scp-operations.js'])w.eval(fs.readFileSync(path.join(__dirname,'../../public/scripts',file),'utf8'));
 w.ScpOperations.openCriteria();w.ScpOperations.receive({tag:sent[0].tag,result:{maxAgeYears:7,costs:{newDevice:18000},referencePrices:{desktop:{2566:17000}}}});await Promise.resolve();await Promise.resolve();
 assert.match(w.document.body.textContent,/ฉบับร่าง/);assert.equal(w.document.querySelectorAll('[data-replacement-type] option').length,8);
 w.document.querySelector('[data-replacement-type="desktop"]').value='desktop-processing-2';w.document.querySelector('[data-replacement-type="notebook"]').value='notebook-ai';
 assert.equal(w.document.querySelector('[data-cls="aio"][data-year="2570"]').value,'25000');
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='บันทึกเกณฑ์และคำนวณใหม่').click();const save=sent.find(c=>c.op==='saveCriteria');
 assert.equal(save.criteria.budgetYearBE,2570);assert.equal(save.criteria.replacementProfiles.desktop,'desktop-processing-2');assert.equal(save.criteria.replacementProfiles.notebook,'notebook-ai');assert.equal(save.criteria.referencePrices.desktop[2566],17000);
 w.ScpOperations.receive({tag:save.tag,result:save.criteria});await Promise.resolve();await Promise.resolve();
});
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
