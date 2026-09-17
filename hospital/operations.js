'use strict';
const crypto = require('crypto');
const backup = require('./backup-health');
const queues = new Map();
function text(value, max, required) { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error('INVALID_INPUT'); return value.trim(); }
exports.handle = async function (ctx, cmd) {
 if (typeof cmd.op==='string' && cmd.op.startsWith('driverLibrary')) return require('./driver-library').handle(ctx,cmd);
 const {db,parent,user,domain}=ctx;
 const get = id => new Promise((resolve,reject)=>db.Get(id,(e,r)=>e?reject(e):resolve(r[0])));
 const save = row => new Promise((resolve,reject)=>db.Set(row,e=>e?reject(e):resolve()));
 const access = id => new Promise(resolve=>parent.GetNodeWithRights(domain,user,id,(node,rights,visible)=>resolve(!!(node&&visible&&rights))));
 const admin = user.siteadmin === 4294967295;
 if (cmd.op==='backups' || cmd.op==='verifyBackup') {
  if (!admin || domain.id!=='') throw Error('ACCESS_DENIED');
  return cmd.op==='backups' ? backup.status(parent.parent) : backup.verify(parent.parent);
 }
 if (cmd.op==='driverStatus' || cmd.op==='cleanupStatus') {
  const rows=await new Promise((resolve,reject)=>db.GetAllTypeNoTypeField(cmd.op==='driverStatus'?'scpdriver':'scpcleanup',domain.id,(e,r)=>e?reject(e):resolve(r)));
  const allowed=[];for(const row of rows)if(await access(row.nodeid))allowed.push(row);return allowed;
 }
 if (cmd.op==='tickets') {
  const rows=await new Promise((resolve,reject)=>db.GetAllTypeNoTypeField('scpticket',domain.id,(e,r)=>e?reject(e):resolve(r)));
  const out=[]; for(const row of rows) if(await access(row.nodeid)) out.push(row);
  return out.sort((a,b)=>b.updated-a.updated);
 }
 if(cmd.op==='createTicket') {
  if(!await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  const now=Date.now(); const row={_id:'scpticket/'+domain.id+'/'+crypto.randomUUID(),type:'scpticket',domain:domain.id,nodeid:cmd.nodeid,title:text(cmd.title,160,true),description:text(cmd.description,4000,true),contact:text(cmd.contact||'',200),department:text(cmd.department||'',160),status:'open',assignee:'',created:now,updated:now,revision:1,createdBy:user._id,history:[{at:now,by:user._id,status:'open',note:'Created'}]};
  await save(row);return row;
 }
 if(cmd.op==='updateTicket') {
  const id=text(cmd.id,180,true); if(!id.startsWith('scpticket/'+domain.id+'/')) throw Error('ACCESS_DENIED');
  const previous=queues.get(id)||Promise.resolve();
  const job=previous.catch(()=>{}).then(async()=>{
   const row=await get(id);if(!row||row.domain!==domain.id||!await access(row.nodeid))throw Error('ACCESS_DENIED');
   if(row.revision!==cmd.revision)throw Error('CONFLICT');
   if(!['open','working','waiting','closed'].includes(cmd.status))throw Error('INVALID_INPUT');
   const note=text(cmd.note||'',4000,cmd.status==='closed');
   const assignee=text(cmd.assignee||'',200);if(assignee){const account=parent.users[assignee];if(!account||account.domain!==domain.id)throw Error('INVALID_ASSIGNEE');}
   if(row.history.length>=500)throw Error('HISTORY_LIMIT');
   row.type='scpticket';row.status=cmd.status;row.assignee=assignee;row.updated=Date.now();row.revision++;
   row.history.push({at:row.updated,by:user._id,status:row.status,assignee,note});await save(row);return row;
  });queues.set(id,job);try{return await job;}finally{if(queues.get(id)===job)queues.delete(id);}
 }
 throw Error('UNKNOWN_OPERATION');
};
