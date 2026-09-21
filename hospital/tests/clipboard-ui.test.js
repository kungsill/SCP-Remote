'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function page({direction='out',failCommit=false,input=false}={}){
 const handlers={},calls=[],elements=[];let seq=10,connectionCount=0;
 const element=()=>{const e={style:{},append(){},textContent:'',offsetParent:{}};elements.push(e);return e;};
 const manifest=[{path:'ทดสอบ.txt',directory:false,size:3}];
 const snapshot={job:'source',sequence:10,entries:manifest,text:null};
 async function handle(side,c){calls.push(side+':'+c.op);switch(c.op){case 'state':return {sequence:seq};case 'snapshot':return snapshot;case 'prepare':return {job:'dest'};case 'read':return {data:'YWJj',sha256:'hash',length:3};case 'write':return {offset:3};case 'commit':if(failCommit)throw Error('HASH_MISMATCH');return {ready:true};case 'abort':return {};default:throw Error(c.op);}}
 const context={window:null,document:{documentElement:{lang:'th'},body:{appendChild(){}},createElement:element,getElementById:()=>({offsetParent:{}}),addEventListener:(k,fn)=>handlers[k]=fn},setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},clearTimeout,Map,Set,Promise,console,serverPublicNamePort:'host',authCookie:'test',domainUrl:'/',decode_utf8:s=>s,scpTransfer:require('../desktop-app/clipboard-transfer'),scpClipboardReady:true,
  scpClipboard:{request:async c=>{try{return {ok:true,result:await handle('local',c)};}catch(e){return {ok:false,error:e.message};}}},
  desktop:{State:3,m:{KeyAction:{DOWN:1,UP:2},SendKeyMsgKC:keys=>{const code=keys[1][1];calls.push('key:'+code);if(code===67)seq++;}}},addEventListener(){},
  CreateAgentRedirect:(a,m)=>{connectionCount++;const c={State:0,Start(){this.State=3;this.onStateChanged(this,3);},Stop(){this.State=0;this.onStateChanged(this,0);},sendText:async command=>{try{m.ProcessData(JSON.stringify({action:'scpclip',id:command.id,ok:true,result:await handle('far',command)}));}catch(e){m.ProcessData(JSON.stringify({action:'scpclip',id:command.id,ok:false,error:e.message}));}}};return c;}
 };context.window=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop-app/inject-clipboard.js'),'utf8'),context);
 const event={ctrlKey:true,code:direction==='out'?'KeyV':'KeyC',target:{closest:()=>input},preventDefault(){this.prevented=true;},stopImmediatePropagation(){}};
 return {calls,event,press:()=>handlers.keydown(event),status:()=>elements[1].textContent,connections:()=>connectionCount};
}
async function waitFor(check){for(let i=0;i<60;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('UI operation did not finish');}
test('native Ctrl+V transfers the file and commits before sending remote paste',async()=>{
 const p=page();p.press();await waitFor(()=>p.calls.includes('key:86'));assert.equal(p.event.prevented,true);assert.ok(p.calls.indexOf('far:commit')<p.calls.indexOf('key:86'));assert.match(p.status(),/100%/);
});
test('native Ctrl+C copies remote selection, waits for change, then prepares local paste',async()=>{
 const p=page({direction:'in'});p.press();await waitFor(()=>p.calls.includes('local:commit'));assert.ok(p.calls.indexOf('key:67')<p.calls.indexOf('far:snapshot'));assert.ok(p.calls.includes('far:read'));assert.match(p.status(),/พร้อมแล้ว/);
});
test('native clipboard failure never issues a remote paste',async()=>{
 const p=page({failCommit:true});p.press();await waitFor(()=>p.calls.includes('far:abort'));assert.equal(p.calls.includes('key:86'),false);
});
test('typing into a dialog does not intercept Ctrl+V or open a file channel',()=>{
 const p=page({input:true});p.press();assert.equal(p.event.prevented,undefined);assert.equal(p.connections(),0);
});
