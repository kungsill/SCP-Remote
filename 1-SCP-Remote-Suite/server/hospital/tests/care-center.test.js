'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {csv,select,backupHealth}=require('../../public/scripts/scp-care-center');
test('CSV preserves Thai, multiline fields and escapes spreadsheet formula input',()=>{
 const value=csv([['เครื่อง','ชื่อ "ทดสอบ"','a\nb','=HYPERLINK("x")','  +1']]);
 assert.ok(value.startsWith('\ufeff'));assert.ok(value.includes('"ชื่อ ""ทดสอบ"""'));assert.ok(value.includes('"a\nb"'));assert.ok(value.includes('"\'=HYPERLINK'));assert.ok(value.includes('"\'  +1"'));
});
test('search includes repair notes and rooms without changing source records',()=>{
 const rows=[['A','OPD','เปลี่ยน RAM'],['B','ER','ปกติ']];assert.deepEqual(select(rows,'ram'),[rows[0]]);assert.deepEqual(select(rows,'er'),[rows[1]]);assert.equal(rows.length,2);
});
test('an old successful restore check never certifies a newer backup',()=>{
 const data={source:{files:[{name:'new.zip',modified:100}]},copyMatches:true,verification:{archive:'old.zip',state:'passed',boot:{state:'passed'}}};
 assert.equal(backupHealth(data,101).verified,false);data.verification.archive='new.zip';assert.equal(backupHealth(data,101).verified,true);data.verification.boot.state='failed';assert.equal(backupHealth(data,101).verified,false);assert.equal(backupHealth(data,37*3600000).stale,true);
});
function page(t,request){const {JSDOM}=require('jsdom');const dom=new JSDOM('<html lang="th"><body></body></html>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.ScpDashboard={snapshot:()=>({nodes:[{id:'n',name:'test01',room:'OPD',online:false,risks:[]}]})};w.ScpOperations={request};w.eval(fs.readFileSync(require.resolve('../../public/scripts/scp-care-center'),'utf8'));return w;}
const settle=()=>new Promise(r=>setImmediate(r));
test('view changes discard delayed responses and closing removes the dialog',async t=>{
 let release;const w=page(t,op=>op==='alertWatch'?new Promise(r=>release=r):Promise.resolve([{nodeid:'n',title:'Repair note',status:'open',history:[]}]));w.ScpCareCenter.open();w.document.querySelector('[data-view=repairs]').click();await settle();assert.match(w.document.querySelector('section').textContent,/Repair note/);release(['n']);await settle();assert.match(w.document.querySelector('section').textContent,/Repair note/);w.document.querySelector('dialog').close();assert.equal(w.document.querySelector('dialog'),null);
});
test('failed status loads show an error rather than empty success and backup tab is admin only',async t=>{
 const w=page(t,()=>Promise.reject(Error('ACCESS_DENIED')));w.ScpCareCenter.open();await settle();assert.match(w.document.querySelector('[role=status]').textContent,/ACCESS_DENIED/);assert.equal(w.document.querySelector('[data-view=backups]'),null);
});
