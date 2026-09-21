'use strict';
const {spawn}=require('child_process');
const path=require('path');
class ClipboardHost {
 constructor(){this.pending=new Map();this.next=0;this.closed=false;
  const executable=path.join(__dirname,'ClipboardHost.exe').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep);
  this.child=spawn(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let buffer='';this.child.stdout.setEncoding('utf8');
  this.child.stdout.on('data',data=>{buffer+=data;if(buffer.length>4194304){this.close('RESPONSE_TOO_LARGE');return;}let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const r=JSON.parse(line),p=this.pending.get(r.id);if(p){clearTimeout(p.timer);this.pending.delete(r.id);r.ok?p.resolve(r.result):p.reject(Error(r.error));}}catch{this.close('HELPER_INVALID_RESPONSE');return;}}});
  this.child.stderr.resume();this.child.on('error',()=>this.close('HELPER_START_FAILED'));this.child.on('exit',()=>this.close('HELPER_CLOSED'));this.child.stdin.on('error',()=>this.close('HELPER_CLOSED'));
 }
 request(command){return new Promise((resolve,reject)=>{
  if(this.closed)return reject(Error('HELPER_CLOSED'));
  if(!command||!['state','snapshot','read','prepare','write','commit','abort','text'].includes(command.op))return reject(Error('INVALID_OPERATION'));
  if(this.pending.size>=4)return reject(Error('HELPER_BUSY'));
  const id=++this.next,line=JSON.stringify({...command,id});if(line.length>4194304)return reject(Error('REQUEST_TOO_LARGE'));
  const timer=setTimeout(()=>{this.close('HELPER_TIMEOUT');},45000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(line+'\n');
 });}
 close(reason='HELPER_CLOSED'){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error(reason));}this.pending.clear();this.child.stdin.end();const child=this.child;const timer=setTimeout(()=>{if(child.exitCode===null)child.kill();},3000);timer.unref();}
}
module.exports=ClipboardHost;
