'use strict';
const crypto = require('crypto');
const backup = require('./backup-health');
const queues = new Map();
function text(value, max, required) { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error('INVALID_INPUT'); return value.trim(); }
exports.handle = async function (ctx, cmd) {
 if(typeof cmd.op==='string'&&cmd.op.startsWith('power'))return require('./power-safety').handle(ctx,cmd);
 if(typeof cmd.op==='string'&&cmd.op.startsWith('desktop'))return require('./desktop-clients').handle(ctx,cmd);
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
 if (cmd.op==='driverClear') {
  // Clears the stored result so a finished-or-stuck job stops reappearing on reload. It
  // does not reach the computer -- a command already running there runs to its own end or
  // times out; this only takes the card off the panel. The device fault, if it is real,
  // stays until the driver is actually installed.
  if (typeof cmd.nodeid!=='string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  await new Promise((resolve,reject)=>db.Remove('scpdriver/'+cmd.nodeid,e=>e?reject(e):resolve()));
  return {cleared:true};
 }
 if (cmd.op==='alertWatch') {
  // The computers marked to be watched for going offline. The proactive-alert connector reads
  // the same records; this only lists the ones this user is allowed to see, for the toggle.
  const rows=await new Promise((resolve,reject)=>db.GetAllTypeNoTypeField('scpwatch',domain.id,(e,r)=>e?reject(e):resolve(r)));
  const out=[]; for(const row of rows){ if(row.watch===true && await access(row.nodeid)) out.push(row.nodeid); } return out;
 }
 if (cmd.op==='alertWatchSet') {
  if (typeof cmd.nodeid!=='string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  const id='scpwatch/'+cmd.nodeid;
  if (cmd.watch===true) { await save({_id:id,type:'scpwatch',domain:domain.id,nodeid:cmd.nodeid,watch:true}); }
  else { await new Promise((resolve,reject)=>db.Remove(id,e=>e?reject(e):resolve())); }
  return {watch:cmd.watch===true};
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
 if (cmd.op === 'fleetAssessment') {
  const assessEngine = require('./fleet-assess');
  const nodes = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('node', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const allowedNodes = [];
  for (const n of nodes) {
   if (await access(n._id)) allowedNodes.push(n);
  }
  const sysinfos = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('sysinfo', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const criteriaDoc = await get('scpcriteria/' + domain.id).catch(() => null);
  const criteria = criteriaDoc && criteriaDoc.criteria ? criteriaDoc.criteria : assessEngine.DEFAULT_CRITERIA;
  const meshes = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('mesh', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const meshMap = {};
  for (const m of (meshes || [])) {
   if (m && m._id && m.name) meshMap[m._id] = m.name;
  }
  const assetRows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scpasset', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const assetMap = {};
  for (const a of (assetRows || [])) {
   if (a && a.nodeid) assetMap[a.nodeid] = a;
  }
  return assessEngine.assessFleet(allowedNodes, sysinfos, criteria, meshMap, assetMap);
 }
 if (cmd.op === 'getCriteria') {
  const assessEngine = require('./fleet-assess');
  const criteriaDoc = await get('scpcriteria/' + domain.id).catch(() => null);
  return criteriaDoc && criteriaDoc.criteria ? criteriaDoc.criteria : assessEngine.DEFAULT_CRITERIA;
 }
 if (cmd.op === 'saveCriteria') {
  if (!admin && !(user.siteadmin & 2)) throw Error('ACCESS_DENIED');
  const assessEngine = require('./fleet-assess');
  const newCriteria = Object.assign({}, assessEngine.DEFAULT_CRITERIA, cmd.criteria);
  const row = {
   _id: 'scpcriteria/' + domain.id,
   type: 'scpcriteria',
   domain: domain.id,
   criteria: newCriteria,
   updated: Date.now(),
   updatedBy: user._id
  };
  await save(row);
  return row.criteria;
 }
 if (cmd.op === 'getAssetInfo') {
  if (cmd.nodeid) {
   if (!await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
   const row = await get('scpasset/' + domain.id + '/' + cmd.nodeid).catch(() => null);
   return row || { nodeid: cmd.nodeid, assetNumber: '', fiscalYear: null, price: null, note: '' };
  }
  const rows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scpasset', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const map = {};
  for (const row of rows) {
   if (row && row.nodeid && await access(row.nodeid)) {
    map[row.nodeid] = row;
   }
  }
  return map;
 }
 if (cmd.op === 'saveAssetInfo') {
  if (typeof cmd.nodeid !== 'string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  const assetNumber = text(cmd.assetNumber || '', 100);
  let fiscalYear = null;
  if (cmd.fiscalYear !== null && cmd.fiscalYear !== undefined && cmd.fiscalYear !== '') {
   fiscalYear = parseInt(cmd.fiscalYear, 10);
   if (isNaN(fiscalYear) || fiscalYear < 2000 || (fiscalYear > 2100 && fiscalYear < 2500) || fiscalYear > 2650) {
    throw Error('INVALID_FISCAL_YEAR');
   }
  }
  let price = null;
  if (cmd.price !== null && cmd.price !== undefined && cmd.price !== '') {
   price = parseFloat(cmd.price);
   if (isNaN(price) || price < 0 || price > 100000000) throw Error('INVALID_PRICE');
  }
  const note = text(cmd.note || '', 1000);
  const row = {
   _id: 'scpasset/' + domain.id + '/' + cmd.nodeid,
   type: 'scpasset',
   domain: domain.id,
   nodeid: cmd.nodeid,
   assetNumber: assetNumber,
   fiscalYear: fiscalYear,
   price: price,
   note: note,
   updated: Date.now(),
   updatedBy: user._id
  };
  await save(row);
  return row;
 }
 throw Error('UNKNOWN_OPERATION');
};
