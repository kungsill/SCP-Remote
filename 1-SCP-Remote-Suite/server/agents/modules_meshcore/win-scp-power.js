// Two phase power action: countdown is cancellable locally; only a live server
// can commit it after rechecking rights and the maintenance window.
var current=null;
function stop(reason,send){if(!current)return;var job=current;current=null;clearInterval(job.timer);clearTimeout(job.expiry);if(job.dialog){try{job.dialog.close();}catch(e){}}if(send)job.report('cancelled',reason);}
module.exports={cancel:function(){stop('Connection ended',true);},handle:function(data,send,execute){
 if(data.op==='cancel'){if(current&&current.id===data.job)stop('Cancelled',true);return;}
 if(data.op==='commit'){
  if(!current||current.id!==data.job||current.phase!=='ready'||Date.now()>current.deadline+15000)return;
  var job=current;current=null;clearTimeout(job.expiry);job.report('executing');try{execute(job.mode==='restart'?8:2,0);}catch(e){job.report('failed',String(e));}return;
 }
 if(data.op!=='prepare'||current||typeof data.job!=='string'||['restart','shutdown'].indexOf(data.mode)<0||typeof data.seconds!=='number'||data.seconds<30||data.seconds>600)return;
 var job={id:data.job,mode:data.mode,phase:'countdown',deadline:Date.now()+data.seconds*1000};current=job;
 job.report=function(state,detail){send({action:'scpPower',job:job.id,state:state,detail:detail||''});};
 var th=data.language!=='en',action=th?(data.mode==='restart'?'รีสตาร์ต':'ปิดเครื่อง'):data.mode;
 function caption(seconds){return th?'ฝ่าย IT กำหนด'+action+'ใน '+seconds+' วินาที\nกรุณาบันทึกงาน หากยังใช้งานอยู่ กด “ยกเลิก” หรือปิดหน้าต่างนี้\nเหตุผล: '+data.reason:'IT scheduled '+action+' in '+seconds+' seconds.\nSave your work. Click Cancel or close this window to stop it.\nReason: '+data.reason;}
 try{
  var sessions=require('user-sessions'),uid=sessions.consoleUid(),username=(uid===0||uid===4294967295||uid==null)?null:sessions.getUsername(uid);
  if(username){job.dialog=require('win-scp-dialog').create('SCP-Remote',caption(data.seconds),data.username||'IT',{uid:uid,timeout:(data.seconds+60)*1000,translations:{Title:'SCP-Remote',Caption:caption(data.seconds),OK:th?'ยกเลิก':'Cancel'}});job.dialog.then(function(){if(current===job&&job.phase==='countdown')stop('Cancelled at remote computer',true);},function(){if(current===job)stop('Could not show warning',true);});}
 }catch(e){stop('Could not show warning',true);return;}
 job.report('countdown');
 job.timer=setInterval(function(){
  if(current!==job)return;var seconds=Math.max(0,Math.ceil((job.deadline-Date.now())/1000));
  if(seconds===0){
   clearInterval(job.timer);job.phase='ready';if(job.dialog){try{job.dialog.close();}catch(e){stop('Could not close warning',true);return;}}
   job.expiry=setTimeout(function(){if(current===job)stop('Server did not confirm',true);},15000);job.report('ready');
  }else if(seconds%15===0){if(job.dialog)job.dialog.addMessage((th?'เหลือ ':'Remaining: ')+seconds+(th?' วินาที':' seconds'));job.report('countdown');}
 },1000);
}};
