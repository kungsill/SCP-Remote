'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const ops = require('../operations'), catalog = require('../../public/data/reference-prices/catalog.json');
const fs = require('node:fs'), path = require('node:path'), {JSDOM} = require('jsdom');
function setup() {
 const rows = new Map();
 const db = {Get:(id, cb)=>cb(null, rows.has(id)?[structuredClone(rows.get(id))]:[]), Set:(row, cb)=>{rows.set(row._id,structuredClone(row));cb();}, GetAllTypeNoTypeField:(type,domain,cb)=>cb(null,[...rows.values()].filter(r=>r.type===type&&r.domain===domain))};
 const ctx = {db, domain:{id:''}, user:{_id:'user//tech',siteadmin:0}, parent:{GetNodeWithRights:(domain,user,id,cb)=>cb(id==='node//allowed'?{}:null,8,true)}};
 return {ctx, rows};
}
const draft = {subject:'ER PC', memo:'Quotation A', lines:[{name:'SSD replacement',quantity:2,unitPrice:1200},{name:'Labour',quantity:1,unitPrice:250}]};
async function ticket(ctx) { return ops.handle(ctx,{op:'createTicket',nodeid:'node//allowed',title:'Disk faulty',description:'Replace SSD'}); }
test('estimates persist with their ticket, history and author and reopen for another user', async()=>{
 const {ctx,rows}=setup(), row=await ticket(ctx);
 const saved=await ops.handle(ctx,{op:'saveTicketEstimate',id:row._id,revision:1,estimate:draft});
 assert.equal(saved.estimate.total,2650);assert.equal(saved.revision,2);assert.equal(saved.estimate.updatedBy,'user//tech');assert.equal(saved.history.at(-1).kind,'estimate');
 const other={...ctx,user:{_id:'user//other',siteadmin:0}};
 const reopened=await ops.handle(other,{op:'getTicketEstimate',id:row._id});
 assert.deepEqual(reopened.estimate,saved.estimate);
 assert.equal(rows.size,1,'ticket and estimate share one atomic database record');
 const edited=await ops.handle(other,{op:'saveTicketEstimate',id:row._id,revision:2,estimate:{...draft,lines:[{name:'SSD',quantity:1.5,unitPrice:0.1}]}});
 assert.equal(edited.estimate.total,0.15);assert.equal(edited.estimate.revision,2);assert.equal(edited.estimate.updatedBy,'user//other');
});
test('ticket estimates reject cross-domain IDs and devices the user cannot see',async()=>{
 const {ctx,rows}=setup(),row=await ticket(ctx);
 rows.set('scpticket//hidden',{...row,_id:'scpticket//hidden',nodeid:'node//hidden'});
 for(const id of ['scpticket/other/x','scpticket//missing','scpticket//hidden','node//allowed']) {
  await assert.rejects(ops.handle(ctx,{op:'getTicketEstimate',id}),/ACCESS_DENIED/);
  await assert.rejects(ops.handle(ctx,{op:'saveTicketEstimate',id,revision:1,estimate:draft}),/ACCESS_DENIED/);
 }
});
test('repair updates and estimate saves use one revision queue and cannot overwrite each other',async()=>{
 const {ctx}=setup(),row=await ticket(ctx);
 const results=await Promise.allSettled([ops.handle(ctx,{op:'saveTicketEstimate',id:row._id,revision:1,estimate:draft}),ops.handle(ctx,{op:'updateTicket',id:row._id,revision:1,status:'working',note:'Starting'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/CONFLICT/);
 const latest=await ops.handle(ctx,{op:'getTicketEstimate',id:row._id});
 const update=await ops.handle(ctx,{op:'updateTicket',id:row._id,revision:latest.revision,status:'closed',note:'Done'});
 assert.equal(update.estimate.total,2650);
});
test('estimate validation preserves all 201 lines and derives government citations on the server',async()=>{
 const {ctx}=setup(),row=await ticket(ctx), item=catalog.items[0];
 const estimate={...draft,lines:Array.from({length:201},(_,i)=>({name:'Part '+i,quantity:1,unitPrice:100}))};
 estimate.lines[0].referenceId=item.id;estimate.lines[0].reference={price:1,title:'Forged'};
 const saved=await ops.handle(ctx,{op:'saveTicketEstimate',id:row._id,revision:1,estimate});
 assert.equal(saved.estimate.lines.length,201);assert.equal(saved.estimate.total,20100);assert.equal(saved.estimate.lines[0].reference.price,item.price);assert.notEqual(saved.estimate.lines[0].reference.title,'Forged');
 for(const lines of [[],[{name:'',quantity:1,unitPrice:10}],[{name:'A',quantity:-1,unitPrice:10}],[{name:'A',quantity:1,unitPrice:Infinity}],[{name:'A',quantity:1,unitPrice:10,referenceId:'missing'}]]) {
  await assert.rejects(ops.handle(ctx,{op:'saveTicketEstimate',id:row._id,revision:2,estimate:{...draft,lines}}),/INVALID_INPUT|INVALID_REFERENCE/);
 }
 assert.equal((await ops.handle(ctx,{op:'getTicketEstimate',id:row._id})).revision,2);
});
function browser(ctx) {
 const dom=new JSDOM('<!doctype html><html lang="th"><body></body></html>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;
 w.nodes=[{_id:'node//allowed',name:'ER PC'}];w.ScpOperations={request:(op,args)=>ops.handle(ctx,{op,...args})};
 w.fetch=async()=>({ok:true,json:async()=>catalog});w.confirm=()=>true;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(fs.readFileSync(path.join(__dirname,'../../public/scripts/scp-price-archive.js'),'utf8'));
 return {dom,w};
}
async function click(w,label) {
 const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);assert.equal(b.disabled,false,label);
 b.click();for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
}
test('a browser saves a ticket estimate that a fresh browser opens, and stale edits preserve the draft',async()=>{
 const {ctx}=setup(), row=await ticket(ctx),a=browser(ctx),b=browser({...ctx,user:{_id:'user//other',siteadmin:0}});
 try {
  await a.w.ScpPriceArchive.open({ticketId:row._id});
  await click(a.w,'เพิ่มอะไหล่ / ค่าซ่อมเอง');
  for(const [i,value]of [[0,'SSD'],[1,'2'],[2,'1500']]) {
   const input=a.w.document.querySelector('.scp-pa-estimate-row').querySelectorAll('input')[i];input.value=value;input.dispatchEvent(new a.w.Event('change'));
  }
  await click(a.w,'บันทึกกลาง / ผูกใบแจ้งซ่อม');
  assert.match(a.w.document.querySelector('.scp-pa-estimate-status').textContent,/บันทึกกลางแล้ว/);
  await b.w.ScpPriceArchive.open({ticketId:row._id});
  assert.equal(b.w.document.querySelector('.scp-pa-estimate-row input').value,'SSD');
  assert.match(b.w.document.querySelector('.scp-pa-total').textContent,/3,000/);
  const input=b.w.document.querySelector('.scp-pa-estimate-row input');input.value='SSD B';input.dispatchEvent(new b.w.Event('change'));
  const ai=a.w.document.querySelector('.scp-pa-estimate-row input');ai.value='SSD A';ai.dispatchEvent(new a.w.Event('change'));
  await click(a.w,'บันทึกกลาง / ผูกใบแจ้งซ่อม');
  await click(b.w,'บันทึกกลาง / ผูกใบแจ้งซ่อม');
  assert.match(b.w.document.querySelector('.scp-pa-estimate-status').textContent,/มีผู้อื่นแก้ไข/);
  assert.equal(b.w.document.querySelector('.scp-pa-estimate-row input').value,'SSD B');
  assert.equal((await ops.handle(ctx,{op:'getTicketEstimate',id:row._id})).estimate.lines[0].name,'SSD A');
  await click(b.w,'เปิดข้อมูลกลางล่าสุด');
  assert.equal(b.w.document.querySelector('.scp-pa-estimate-row input').value,'SSD A');
 }finally{a.dom.window.close();b.dom.window.close();}
});
