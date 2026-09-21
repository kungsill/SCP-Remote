'use strict';
const crypto=require('crypto');
const boot=crypto.randomUUID(),locks=new Map();
const read=(db,id)=>new Promise((resolve,reject)=>db.Get(id,(e,r)=>e?reject(e):resolve(r&&r[0])));
const write=(db,row)=>new Promise((resolve,reject)=>db.Set(row,e=>e?reject(e):resolve()));
function serial(id,fn){const p=(locks.get(id)||Promise.resolve()).catch(()=>{}).then(fn);locks.set(id,p);return p.finally(()=>{if(locks.get(id)===p)locks.delete(id);});}
function minute(s){if(typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('INVALID_WINDOW');return Number(s.slice(0,2))*60+Number(s.slice(3));}
function inWindow(policy,at){if(!policy||!policy.critical)return true;const a=minute(policy.start),b=minute(policy.end),m=(new Date(at).getUTCHours()*60+new Date(at).getUTCMinutes()+420)%1440;if(a===b)return false;return a<b?m>=a&&m<b:m>=a||m<b;}
function capable(node){const v=String(node.agent&&node.agent.scpRelease||'').split('.').map(Number),min=[2026,9,21,4];if(v.length!==4||v.some(x=>!Number.isFinite(x)))return false;for(let i=0;i<4;i++){if(v[i]!==min[i])return v[i]>min[i];}return true;}
function access(ctx,id){return new Promise((resolve,reject)=>ctx.parent.GetNodeWithRights(ctx.domain,ctx.user,id,(node,rights,visible)=>{if(!node||!visible||!(rights&0x40000))reject(Error('ACCESS_DENIED'));else resolve(node);}));}
function audit(web,node,user,message){web.parent.DispatchEvent(web.CreateNodeDispatchTargets(node.meshid,node._id,[user._id]),null,{etype:'node',action:'scppower',domain:node.domain,nodeid:node._id,userid:user._id,username:user.name,msg:message});}
function active(job){return job&&['requested','countdown','ready','committing'].includes(job.state)&&job.boot===boot;}
function view(job){if(!job)return null;const copy={...job};delete copy.boot;if(job.boot!==boot&&['requested','countdown','ready'].includes(job.state))copy.state='interrupted';else if(['requested','countdown','ready'].includes(job.state)&&Date.now()>job.due+120000)copy.state='expired';return copy;}
exports.handle=async function(ctx,cmd){
 if(typeof cmd.nodeid!=='string'||cmd.nodeid.split('/')[1]!==ctx.domain.id)throw Error('ACCESS_DENIED');
 return serial(cmd.nodeid,async()=>{
  await access(ctx,cmd.nodeid);const web=ctx.parent,db=ctx.db,node=await read(db,cmd.nodeid);if(!node)throw Error('OFFLINE');
  const id='scppower/'+node._id;let job=await read(db,id);
  if(cmd.op==='powerStatus')return {policy:node.scpPowerPolicy||{critical:false,start:'02:00',end:'04:00'},job:view(job),canConfigure:ctx.user.siteadmin===0xFFFFFFFF,ready:capable(node)};
  if(cmd.op==='powerPolicy'){
   if(ctx.user.siteadmin!==0xFFFFFFFF)throw Error('ACCESS_DENIED');if(active(job)&&Date.now()<job.due+120000)throw Error('POWER_BUSY');
   if(typeof cmd.critical!=='boolean'||minute(cmd.start)===minute(cmd.end))throw Error('INVALID_WINDOW');
   node.scpPowerPolicy={critical:cmd.critical,start:cmd.start,end:cmd.end,zone:'Asia/Bangkok'};await write(db,node);
   web.parent.DispatchEvent(web.CreateNodeDispatchTargets(node.meshid,node._id,[ctx.user._id]),null,{etype:'node',action:'changenode',domain:ctx.domain.id,nodeid:node._id,node:web.CloneSafeNode(node),userid:ctx.user._id,msg:'Power maintenance policy changed'});
   return {policy:node.scpPowerPolicy};
  }
  if(cmd.op==='powerCancel'){
   if(!job||cmd.job!==job.job)throw Error('JOB_CHANGED');if(job.state==='committing'||job.state==='executing')throw Error('TOO_LATE');
   job.state='cancelled';job.updated=Date.now();await write(db,job);const agent=web.wsagents[node._id];if(agent)agent.send(JSON.stringify({action:'scpPower',op:'cancel',job:job.job}));audit(web,node,ctx.user,'Cancelled scheduled power action');return view(job);
  }
  if(cmd.op!=='powerSchedule')throw Error('UNKNOWN_OPERATION');
  if(!['restart','shutdown'].includes(cmd.mode)||typeof cmd.reason!=='string'||!cmd.reason.trim()||cmd.reason.length>200)throw Error('INVALID_INPUT');
  const seconds=cmd.seconds;if(!Number.isInteger(seconds)||seconds<(node.scpPowerPolicy&&node.scpPowerPolicy.critical?120:30)||seconds>600)throw Error('INVALID_COUNTDOWN');
  if(!capable(node))throw Error('AGENT_UPDATE_REQUIRED');const agent=web.wsagents[node._id];if(!agent||agent.authenticated!==2)throw Error('OFFLINE');
  if(active(job)&&Date.now()<job.due+120000)throw Error('POWER_BUSY');
  const now=Date.now(),due=now+seconds*1000;if(!inWindow(node.scpPowerPolicy,now)||!inWindow(node.scpPowerPolicy,due))throw Error('OUTSIDE_MAINTENANCE');
  job={_id:id,type:'scppower',domain:ctx.domain.id,nodeid:node._id,job:crypto.randomUUID(),boot,mode:cmd.mode,reason:cmd.reason.trim(),seconds,created:now,updated:now,due,state:'requested',userid:ctx.user._id};await write(db,job);
  try{agent.send(JSON.stringify({action:'scpPower',op:'prepare',job:job.job,mode:job.mode,reason:job.reason,seconds,language:cmd.language==='en'?'en':'th',username:ctx.user.name}));}catch(e){job.state='failed';await write(db,job);throw Error('OFFLINE');}
  audit(web,node,ctx.user,'Scheduled '+job.mode+' in '+seconds+' seconds: '+job.reason);return view(job);
 });
};
exports.receive=function(web,agent,command){return serial(agent.dbNodeKey,async()=>{
 const db=web.db,id='scppower/'+agent.dbNodeKey,job=await read(db,id);if(!job||job.job!==command.job)return;
 const allowed=['countdown','ready','cancelled','failed','executing'];if(!allowed.includes(command.state))return;
 if(!active(job)&&!(job.boot===boot&&job.state==='executing'&&command.state==='failed')){try{agent.send(JSON.stringify({action:'scpPower',op:'cancel',job:job.job}));}catch{}return;}
 if(command.state==='ready'){
  const node=await read(db,agent.dbNodeKey),user=web.users[job.userid],domain=web.parent.config.domains[job.domain];
  let permitted=false;if(user&&domain&&node){try{await access({parent:web,user,domain},node._id);permitted=true;}catch{}}
  if(!permitted||job.boot!==boot||Date.now()<job.due||Date.now()>job.due+120000||!inWindow(node&&node.scpPowerPolicy,Date.now())){job.state='cancelled';await write(db,job);agent.send(JSON.stringify({action:'scpPower',op:'cancel',job:job.job}));return;}
  job.state='committing';job.updated=Date.now();await write(db,job);agent.send(JSON.stringify({action:'scpPower',op:'commit',job:job.job}));audit(web,node,user,'Power countdown finished; sending '+job.mode+' command');return;
 }
 if(job.state==='committing'&&command.state==='countdown')return;
 job.state=command.state;job.updated=Date.now();job.detail=typeof command.detail==='string'?command.detail.slice(0,160):'';await write(db,job);
 if(['cancelled','failed','executing'].includes(command.state)){const node=await read(db,agent.dbNodeKey),user=web.users[job.userid];if(node&&user)audit(web,node,user,'Power action '+command.state+(job.detail?': '+job.detail:''));}
 });};
exports.inWindow=inWindow;exports.capable=capable;
