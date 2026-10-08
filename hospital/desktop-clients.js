'use strict';
const crypto=require('crypto');
const locks=new Map(),rates=new Map();
function consentReady(node){const v=String(node.agent&&node.agent.scpRelease||'').split('.').map(Number),min=[2026,9,20,2];if(v.length!==4||v.some(n=>!Number.isFinite(n)))return false;for(let i=0;i<4;i++){if(v[i]!==min[i])return v[i]>min[i];}return true;}
function compareLan(value){const a=String(value).split('.').map(Number),b=[2026,9,21,5];if(a.length!==4||a.some(n=>!Number.isFinite(n)))return false;for(let i=0;i<4;i++)if(a[i]!==b[i])return a[i]>b[i];return true;}
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const get=(db,id)=>new Promise((resolve,reject)=>db.Get(id,(e,r)=>e?reject(e):resolve(r&&r[0])));
const all=(db,type)=>new Promise((resolve,reject)=>db.GetAllTypeNoTypeField(type,'',(e,r)=>e?reject(e):resolve(r||[])));
const set=(db,row)=>new Promise((resolve,reject)=>db.Set(row,e=>e?reject(e):resolve()));
function admin(ctx){if(ctx.domain.id!==''||ctx.user.siteadmin!==0xFFFFFFFF)throw Error('ACCESS_DENIED');}
function serial(key,fn){const job=(locks.get(key)||Promise.resolve()).catch(()=>{}).then(fn);locks.set(key,job);return job.finally(()=>{if(locks.get(key)===job)locks.delete(key);});}
async function endShares(web,clientId){
 for(const share of await all(web.db,'deviceshare')){if(share.scpClient!==clientId)continue;await new Promise(resolve=>web.db.Remove(share._id,resolve));web.parent.DispatchEvent([share.nodeid],null,{action:'removedDeviceShare',domain:'',publicid:share.publicid,nolog:1});}
}
exports.handle=async function(ctx,cmd){
 admin(ctx);const web=ctx.parent,db=ctx.db;
 if(cmd.op==='desktopClients')return (await all(db,'scpclient')).map(c=>({id:c._id,name:c.name,code:c.code,state:c.state,created:c.created,lastSeen:c.lastSeen,rooms:c.rooms||[],label:c.label||''}));
 if(cmd.op==='desktopClientApprove'||cmd.op==='desktopClientRevoke')return serial(cmd.id,async()=>{
  const c=await get(db,cmd.id);if(!c||c.type!=='scpclient'||c.domain!=='')throw Error('INVALID_CLIENT');
  if(cmd.op==='desktopClientApprove'){
   if(c.state==='revoked')throw Error('CLIENT_REVOKED');
   const allRooms=cmd.rooms==='*';
   if(!allRooms&&(!Array.isArray(cmd.rooms)||!cmd.rooms.length||cmd.rooms.some(id=>!web.meshes[id]||web.meshes[id].domain!=='')))throw Error('SELECT_ROOMS');
   if(cmd.label!==undefined){const l=(typeof cmd.label==='string')?cmd.label.trim():'';if(l.length>60)throw Error('LABEL_TOO_LONG');c.label=l;}
   c.rooms=allRooms?'*':[...new Set(cmd.rooms)];c.state='approved';c.owner=ctx.user._id;
  }else c.state='revoked';
  c.type='scpclient';c.updated=Date.now();await set(db,c);await endShares(web,c._id);return {state:c.state};
 });
 if(cmd.op==='desktopLayout')return all(db,'scplayout');
 if(cmd.op==='desktopLayoutSave'){
  const node=await get(db,cmd.nodeid);if(!node||node.type!=='node'||node.domain!=='')throw Error('INVALID_NODE');
  if(!Number.isInteger(cmd.x)||!Number.isInteger(cmd.y)||cmd.x<0||cmd.x>9||cmd.y<0||cmd.y>9)throw Error('INVALID_POSITION');
  const row={_id:'scplayout/'+node._id,type:'scplayout',domain:'',nodeid:node._id,x:cmd.x,y:cmd.y};await set(db,row);return row;
 }
 throw Error('UNKNOWN_OPERATION');
};
exports.api=async function(web,input,token){
 if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))throw Error('INVALID_TOKEN');
 const id='scpclient/'+digest(token),db=web.db;
 return serial(id,async()=>{
  let client=await get(db,id);
  const defaultOwner = (web.users && web.users['user//admin']) ? 'user//admin' : (Object.keys(web.users||{}).find(u => web.users[u] && web.users[u].siteadmin === 0xFFFFFFFF) || 'user//admin');
  if(input.op==='register'){
   const auto = input.autoApprove === true || (input.name && input.name.includes('RealVNC'));
   if(!client){
    client={_id:id,type:'scpclient',domain:'',name:input.name||'SCP-Client',code:crypto.randomBytes(4).toString('hex').toUpperCase(),state:auto?'approved':'pending',owner:auto?defaultOwner:undefined,rooms:auto?'*':undefined,created:Date.now()};
    await set(db,client);
   } else if (auto && client.state !== 'approved') {
    client.state = 'approved';
    client.owner = client.owner || defaultOwner;
    client.rooms = client.rooms || '*';
    await set(db,client);
   }
   return {state:client.state,code:client.code,name:client.name};
  }
  if(!client)throw Error('APPROVAL_REQUIRED');
  if(client.state==='revoked')throw Error('CLIENT_REVOKED');
  if(client.state!=='approved')throw Error('APPROVAL_REQUIRED');
  const owner=web.users[client.owner] || Object.values(web.users||{}).find(u=>u&&u.siteadmin===0xFFFFFFFF);
  if(!owner)throw Error('APPROVAL_REQUIRED');
  if(!client.lastSeen||Date.now()-client.lastSeen>60000){client.lastSeen=Date.now();client.type='scpclient';await set(db,client);}
  const grantsAll=client.rooms==='*';
  const inRooms=id=>grantsAll||(Array.isArray(client.rooms)&&client.rooms.includes(id));
  const scope=node=>node&&node.domain===''&&inRooms(node.meshid)&&web.meshes[node.meshid];
  if(input.op==='connectionStatus'){const n=await get(db,input.nodeid);if(!scope(n))throw Error('ACCESS_DENIED');return {online:!!(web.wsagents[n._id]&&web.wsagents[n._id].authenticated===2),ready:consentReady(n)};}
  if(input.op==='devices'){
   const positions=await all(db,'scplayout');
   const roomIds=grantsAll?Object.keys(web.meshes).filter(id=>web.meshes[id]&&web.meshes[id].domain===''):client.rooms.filter(id=>web.meshes[id]);
   return {rooms:roomIds.map(id=>({id,name:web.meshes[id].name})),nodes:(await all(db,'node')).filter(scope).map(n=>({id:n._id,name:n.name,room:n.meshid,ip:n.host||'',online:!!(web.wsagents[n._id]&&web.wsagents[n._id].authenticated===2),ready:consentReady(n),position:positions.find(p=>p.nodeid===n._id)||null}))};
  }
  if(input.op==='disconnect'){await endShares(web,id);return {ok:true};}
  if(input.op==='connect'){
   const node=await get(db,input.nodeid);if(!scope(node))throw Error('ACCESS_DENIED');if(!web.wsagents[node._id]||web.wsagents[node._id].authenticated!==2)throw Error('OFFLINE');
   if(!consentReady(node))throw Error('AGENT_UPDATE_REQUIRED');
   await endShares(web,id);
   const publicid=crypto.randomBytes(24).toString('hex'),expires=Date.now()+2*60*60*1000;
   const cookie=web.parent.encodeCookie({a:6,pid:publicid,e:expires},web.parent.invitationLinkEncryptionKey);
   if(!cookie)throw Error('SESSION_FAILED');
   const share={_id:'deviceshare-'+publicid,type:'deviceshare',domain:'',xmeshid:node.meshid,nodeid:node._id,p:6,publicid,userid:client.owner,guestName:'SCP-App: '+(client.label||client.name)+' ['+publicid.slice(0,6)+']',consent:1|4|64,startTime:Date.now(),expireTime:expires,scpClient:id};
   await set(db,share);
   web.parent.DispatchEvent(web.CreateNodeDispatchTargets(node.meshid,node._id,['server-users',owner._id]),null,{etype:'node',action:'addedDeviceShare',domain:'',nodeid:node._id,meshid:node.meshid,userid:owner._id,msg:'SCP-Remote app requested consent: '+client.name});
   const release=String(node.agent&&node.agent.scpRelease||'').split('.').map(Number),clipboardMin=[2026,9,21,1];
   let clipboard=release.length===4&&release.every(Number.isFinite);
   if(clipboard){for(let i=0;i<4;i++){if(release[i]!==clipboardMin[i]){clipboard=release[i]>clipboardMin[i];break;}}}
   return {path:'/sharing?c='+encodeURIComponent(cookie)+'&lang='+(input.language==='en'?'en':'th'),expires,clipboard,lan:node.agent.scpLanNative===true&&compareLan(node.agent.scpRelease)};
  }
  throw Error('UNKNOWN_OPERATION');
 });
};
exports.route=function(web,req,res){
 if(req.headers.origin){res.status(403).json({error:'ORIGIN_DENIED'});return;}
 const key=req.socket.remoteAddress||'unknown',now=Date.now();for(const [k,r]of rates)if(now-r.start>60000)rates.delete(k);
 const rate=rates.get(key)||{start:now,count:0};rates.set(key,rate);if(++rate.count>120){res.status(429).json({error:'RATE_LIMIT'});return;}
 let body='',done=false;req.on('data',c=>{if(done)return;body+=c;if(Buffer.byteLength(body)>8192){done=true;res.status(413).end();}});
 req.on('end',async()=>{if(done)return;try{const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const result=await exports.api(web,JSON.parse(body),token);res.setHeader('Cache-Control','no-store');res.json(result);}catch(e){res.status(400).json({error:String(e.message).slice(0,100)});}});
};
