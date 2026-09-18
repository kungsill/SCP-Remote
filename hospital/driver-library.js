'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),https=require('https');
const stores=new Map(), MAX_FILE=2*1024**3, MAX_LIBRARY=20*1024**3;
const discovery=fs.readFileSync(path.join(__dirname,'driver-discovery.ps1'),'utf8');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function safeUrl(raw){
 const u=new URL(raw); const host=u.hostname.toLowerCase();
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.port&&u.port!=='443')||!(host.endsWith('.windowsupdate.com')||host.endsWith('.update.microsoft.com')||host==='download.microsoft.com'||host==='delivery.mp.microsoft.com'||host.endsWith('.delivery.mp.microsoft.com')))throw Error('UNTRUSTED_DOWNLOAD');
 u.protocol='https:';return u.href;
}
function getStore(server){
 const root=path.join(path.dirname(server.datapath),'scp-driver-library');if(stores.has(root))return stores.get(root);
 fs.mkdirSync(root,{recursive:true});let data={packages:{},scans:{},installs:{}};
 const file=path.join(root,'manifest.json');if(fs.existsSync(file))data=JSON.parse(fs.readFileSync(file,'utf8'));
 const s={root,file,data,busy:false,timer:null,web:null,tokens:new Map()};
 // Keep outstanding search tickets across restart: agents may still return results; pump enforces the deadline.
 Object.values(data.installs).forEach(j=>{if(j.state==='installing'){j.state='unknown';j.error='SERVER_RESTARTED';}});
 Object.values(data.packages).forEach(p=>{if(p.state==='downloading')p.state='queued';});
 stores.set(root,s);return s;
}
function persist(s){fs.writeFileSync(s.file+'.tmp',JSON.stringify(s.data));fs.renameSync(s.file+'.tmp',s.file);}
// The manifest is not the disk. An interrupted download leaves a .part behind and a
// removed package leaves its cab, and neither is written down anywhere, so a library
// that reads as half empty can be the reason the server's disk is full. Measure the
// folder and sweep what no package still claims.
function contents(s){const out=[];try{for(const e of fs.readdirSync(s.root,{withFileTypes:true})){if(e.isDirectory()||e.name.startsWith('manifest.json'))continue;try{out.push({name:e.name,bytes:fs.statSync(path.join(s.root,e.name)).size});}catch(err){}}}catch(err){}return out;}
function usage(s){return contents(s).reduce((n,f)=>n+f.bytes,0);}
function prune(s){
 const keep=new Set(),inflight=new Set();let freed=0;
 for(const p of Object.values(s.data.packages))for(const f of p.files){keep.add(f.name);if(p.state==='downloading')inflight.add(f.name+'.part');}
 for(const file of contents(s)){
  if(file.name.endsWith('.part')?inflight.has(file.name):keep.has(file.name))continue;
  try{fs.unlinkSync(path.join(s.root,file.name));freed+=file.bytes;}catch(e){}
 }
 // A ticket for a file that is gone can only hand the agent a 404, so retire it here.
 for(const [token,entry] of s.tokens)if(!fs.existsSync(path.join(s.root,entry.file)))s.tokens.delete(token);
 return freed;
}
// A pack the hospital supplies itself, for wards that cannot reach Windows Update at
// all. Everything is decided here, once, while the file is still on this server: what it
// is, that no entry escapes the folder it extracts into, and that a driver is actually
// inside. The SHA-256 then pins it, so what a ward computer extracts is byte for byte
// what was inspected here. A self-extracting .exe is refused -- running a vendor
// installer as SYSTEM on a clinical machine is exactly what this design avoids.
const PACK_KINDS={cab:{magic:'4d534346',ext:'.cab'},zip:{magic:'504b0304',ext:'.zip'}};
function kindOf(file){const fd=fs.openSync(file,'r'),magic=Buffer.alloc(4);try{fs.readSync(fd,magic,0,4,0);}finally{fs.closeSync(fd);}const hex=magic.toString('hex');return Object.keys(PACK_KINDS).find(k=>PACK_KINDS[k].magic===hex)||null;}
function safeEntry(name){if(typeof name!=='string'||!name||name.length>320)return false;if(/^[\\/]|^[a-zA-Z]:|[\x00-\x1f]/.test(name))return false;return !name.split(/[\\/]/).includes('..');}
function zipNames(file){const zip=require('@zip.js/zip.js');const size=fs.statSync(file).size;
 // Only the central directory is read, so a large pack is never held in memory.
 const reader={size,init(){},readUint8Array(index,length){const fd=fs.openSync(file,'r');try{const buf=Buffer.alloc(length);fs.readSync(fd,buf,0,length,index);return new Uint8Array(buf);}finally{fs.closeSync(fd);}}};
 const zr=new zip.ZipReader(reader);return zr.getEntries().then(entries=>{zr.close().catch(()=>{});return entries.map(e=>e.filename);},e=>{zr.close().catch(()=>{});throw Error('NOT_A_DRIVER_PACKAGE');});}
exports.upload=async function(web,domain,req,res){
 const fail=(status,code)=>{if(!res.headersSent&&!req.aborted)res.status(status).json({ok:false,error:code});};
 let staging=null;
 try{
  const user=req.session&&web.users[req.session.userid];
  if(!user||user.siteadmin!==4294967295||domain.id!==''||user.domain!=='')return fail(403,'ACCESS_DENIED');
  const s=getStore(web.parent);prune(s);
  fs.mkdirSync(path.join(s.root,'tmp'),{recursive:true});
  staging=fs.mkdtempSync(path.join(s.root,'tmp','scp-drv-'));
  const form=new (require('multiparty').Form)({uploadDir:staging,maxFilesSize:MAX_FILE,maxFields:6,maxFieldsSize:8192});
  const parsed=await new Promise((resolve,reject)=>form.parse(req,(e,fields,files)=>e?reject(Object.assign(Error(e.statusCode===413?'FILE_TOO_LARGE':'INVALID_UPLOAD'),{status:e.statusCode===413?413:400})):resolve({fields,files})));
  const list=Object.values(parsed.files||{}).flat();
  if(list.length!==1)return fail(400,'INVALID_UPLOAD');
  const temp=path.resolve(list[0].path);
  if(path.relative(staging,temp).startsWith('..'))return fail(400,'INVALID_UPLOAD');
  const kind=kindOf(temp);
  if(!kind)return fail(400,'NOT_A_DRIVER_PACKAGE');
  if(kind==='zip'){
   const names=await zipNames(temp);
   if(!names.length||names.length>20000)return fail(400,'NOT_A_DRIVER_PACKAGE');
   if(!names.every(safeEntry))return fail(400,'UNSAFE_ARCHIVE');
   if(!names.some(n=>/\.inf$/i.test(n)))return fail(400,'NO_DRIVER_INF');
  }
  const sha256=await fileHash(temp),bytes=fs.statSync(temp).size,id=hash('upload:'+sha256);
  if(s.data.packages[id])return fail(409,'PACKAGE_EXISTS');
  if(usage(s)+bytes>MAX_LIBRARY)return fail(507,'LIBRARY_QUOTA');
  const field=k=>String((parsed.fields[k]||[''])[0]||'').trim();
  const name=sha256+PACK_KINDS[kind].ext;
  fs.renameSync(temp,path.join(s.root,name));
  s.data.packages[id]={id,source:'upload',kind,title:(field('title')||String(list[0].originalFilename||'')||'Driver package').slice(0,400),
   hardwareId:field('model').slice(0,300),manufacturer:field('manufacturer').slice(0,150),driverDate:'',
   created:Date.now(),downloaded:Date.now(),state:'ready',bytes,total:bytes,uploadedBy:user._id,
   files:[{name,bytes,sha256,kind}]};
  persist(s);
  res.status(200).json({ok:true,id,bytes});
 }catch(e){fail(e.status||500,e.message||'STORAGE_ERROR');}
 finally{if(staging)fs.rmSync(staging,{recursive:true,force:true});}
};
function send(web,nodeid,cmds,ticket){const agent=web.wsagents[nodeid];if(!agent||agent.authenticated!==2)throw Error('OFFLINE');agent.send(JSON.stringify({action:'runcommands',type:2,cmds,runAsUser:0,reply:true,responseid:ticket}));}
function start(s,web){s.web=web;if(!s.timer){s.timer=setInterval(()=>pump(s).catch(()=>{}),2000);s.timer.unref();}pump(s).catch(()=>{});}
async function pump(s){
 if(s.busy)return;s.busy=true;
 try{
  let active=Object.values(s.data.scans).filter(j=>j.state==='searching').length;
  for(const j of Object.values(s.data.scans)){
   if(j.state==='searching'&&Date.now()-j.started>20*60*1000){j.state='timeout';j.error='SEARCH_TIMEOUT';persist(s);active--;}
   if(active>=2||!['queued','offline','waiting'].includes(j.state)||(j.retryAt&&j.retryAt>Date.now()))continue;
   if(!s.web.wsagents[j.nodeid]||s.web.wsagents[j.nodeid].authenticated!==2){if(j.state!=='offline'){j.state='offline';persist(s);}continue;}
   j.state='searching';j.started=Date.now();j.ticket='scplib-search-'+crypto.randomUUID();persist(s);
   try{send(s.web,j.nodeid,discovery,j.ticket);active++;}catch(e){j.state='failed';j.error=e.message;persist(s);}
  }
  for(const j of Object.values(s.data.installs)){if(j.state==='installing'&&Date.now()-j.started>30*60*1000){j.state='unknown';j.error='INSTALL_TIMEOUT';persist(s);}}
  const p=Object.values(s.data.packages).find(p=>p.state==='queued');
  if(p&&!s.downloading){s.downloading=true;downloadPackage(s,p).catch(()=>{}).finally(()=>{s.downloading=false;});}
 }finally{s.busy=false;}
}
function downloadFile(raw,dest,progress,redirects=0){return new Promise((resolve,reject)=>{
 let url;try{url=safeUrl(raw);}catch(e){reject(e);return;}
 const req=https.get(url,{headers:{'User-Agent':'SCP-Remote/DriverLibrary'}},res=>{
  if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(redirects>=4)return reject(Error('REDIRECT_LIMIT'));return downloadFile(new URL(res.headers.location,url).href,dest,progress,redirects+1).then(resolve,reject);}
  if(res.statusCode!==200){res.resume();return reject(Error('HTTP_'+res.statusCode));}
  const total=Number(res.headers['content-length'])||0;if(total>MAX_FILE){res.destroy();return reject(Error('FILE_TOO_LARGE'));}
  const out=fs.createWriteStream(dest),digest=crypto.createHash('sha256');let bytes=0;let settled=false;
  const fail=e=>{if(settled)return;settled=true;res.destroy();out.destroy();reject(e);};
  res.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_FILE){fail(Error('FILE_TOO_LARGE'));return;}digest.update(chunk);progress(bytes,total);});
  res.on('error',fail);res.on('aborted',()=>fail(Error('DOWNLOAD_INTERRUPTED')));out.on('error',fail);
  out.on('finish',()=>{if(settled)return;if(!bytes||(total&&bytes!==total))return fail(Error('SIZE_MISMATCH'));settled=true;resolve({bytes,sha256:digest.digest('hex')});});res.pipe(out);
 });req.setTimeout(60000,()=>req.destroy(Error('DOWNLOAD_TIMEOUT')));req.on('error',reject);
 });}
async function downloadPackage(s,p){
 prune(s);p.state='downloading';p.error='';p.bytes=0;p.total=0;persist(s);let done=0,last=0;
 try{
  if(usage(s)+MAX_FILE*p.files.length>MAX_LIBRARY)throw Error('LIBRARY_QUOTA');
  const disk=fs.statfsSync(s.root);if(disk.bavail*disk.bsize<MAX_FILE+1024**3)throw Error('DISK_SPACE_LOW');
  for(const file of p.files){
   const final=path.join(s.root,file.name),temp=final+'.part';
   const cached=Object.values(s.data.packages).filter(x=>x.state==='ready').flatMap(x=>x.files).find(f=>f.name===file.name&&f.sha256);
   if(cached&&fs.existsSync(final)){const digest=await fileHash(final);if(digest===cached.sha256){Object.assign(file,{bytes:cached.bytes,sha256:cached.sha256});done+=cached.bytes;continue;}}
   const result=await downloadFile(file.url,temp,(bytes,total)=>{p.bytes=done+bytes;p.total=total?done+total:0;p.fileIndex=p.files.indexOf(file)+1;if(Date.now()-last>1000){last=Date.now();persist(s);}});
   const fd=fs.openSync(temp,'r'),magic=Buffer.alloc(4);fs.readSync(fd,magic,0,4,0);fs.closeSync(fd);if(magic.toString()!=='MSCF')throw Error('NOT_A_DRIVER_CAB');
   fs.renameSync(temp,final);Object.assign(file,result);done+=result.bytes;
  }
  p.bytes=done;p.total=done;p.state='ready';p.downloaded=Date.now();
 }catch(e){p.state='failed';p.error=String(e.message).slice(0,180);}finally{prune(s);persist(s);}
}
function ingest(s,job,report){
 if(!report||!Array.isArray(report.updates)||report.updates.length>150)throw Error('INVALID_REPORT');
 const ids=[];
 for(const u of report.updates){
  if(typeof u.id!=='string'||! /^[0-9a-f-]{36}$/i.test(u.id)||!Number.isInteger(u.revision)||!Array.isArray(u.urls)||u.urls.length>12)throw Error('INVALID_REPORT');
  const id=hash(u.id+':'+u.revision);
  // A link this server will not follow is dropped on its own. Throwing here would lose
  // every other result the machine reported, which is how one odd URL used to cost a
  // whole ward computer its search.
  const urls=[];let blocked=0;
  for(const raw of new Set(u.urls)){try{urls.push(safeUrl(raw));}catch(e){blocked++;}}
  let p=s.data.packages[id];
  if(!p){p=s.data.packages[id]={id,updateId:u.id,revision:u.revision,title:String(u.title||'').slice(0,400),hardwareId:String(u.hardwareId||'').slice(0,300),manufacturer:String(u.manufacturer||'').slice(0,150),driverDate:String(u.driverDate||'').slice(0,100),created:Date.now(),blocked,state:urls.length?'queued':'unavailable',files:urls.map(url=>({url,name:hash(url)+'.cab'}))};}
  ids.push(id);
 }
 job.packages=ids;job.state='completed';job.updated=Date.now();job.machine={manufacturer:String(report.manufacturer||'').slice(0,120),model:String(report.model||'').slice(0,120),os:String(report.os||'').slice(0,120),architecture:String(report.architecture||'').slice(0,40)};
}
exports.receive=function(web,nodeid,command){
 if(command.type!=='runcommands'||typeof command.responseid!=='string'||!command.responseid.startsWith('scplib-')||command.progress)return;
 const s=getStore(web.parent),text=String(command.result||'');
 const j=s.data.scans[nodeid];
 if(j&&j.ticket===command.responseid&&['searching','timeout'].includes(j.state)){
  try{const match=text.match(/SCP_LIBRARY_RESULT:(\{[^\r\n]*\})/);if(!match)throw Error(text.includes('COMMAND_BUSY')?'COMMAND_BUSY':(text.match(/SCP_LIBRARY_ERROR:([^\r\n]*)/)||[])[1]||'NO_RESULT');ingest(s,j,JSON.parse(match[1]));}
  catch(e){j.error=String(e.message).slice(0,180);j.state='failed';if(j.error==='COMMAND_BUSY'&&(j.retries||0)<5){j.retries=(j.retries||0)+1;j.state='waiting';j.retryAt=Date.now()+60000;}}persist(s);start(s,web);return;
 }
 const install=s.data.installs[nodeid];if(install&&install.ticket===command.responseid&&['installing','unknown'].includes(install.state)){const match=text.match(/SCP_LIBRARY_INSTALL:(\{[^\r\n]*\})/);try{if(!match)throw Error('NO_INSTALL_RESULT');const result=JSON.parse(match[1]);install.state=result.ok?'completed':'failed';install.result=result;}catch(e){install.state='failed';install.error=e.message;}install.updated=Date.now();persist(s);}
};
function allowed(ctx,id){return new Promise(resolve=>ctx.parent.GetNodeWithRights(ctx.domain,ctx.user,id,(node,rights,visible)=>resolve(node&&visible&&rights===0xFFFFFFFF?node:null)));}
exports.handle=async function(ctx,cmd){
 if(ctx.user.siteadmin!==4294967295||ctx.domain.id!=='')throw Error('ACCESS_DENIED');
 const s=getStore(ctx.parent.parent);start(s,ctx.parent);
 if(cmd.op==='driverLibraryStatus')return {folder:s.root,quota:MAX_LIBRARY,used:usage(s),packages:Object.values(s.data.packages).map(p=>({...p,files:p.files.map(f=>({name:f.name,bytes:f.bytes,sha256:f.sha256}))})),scans:Object.values(s.data.scans),installs:Object.values(s.data.installs)};
 if(cmd.op==='driverLibrarySearch'){
  if(!Array.isArray(cmd.nodeids)||!cmd.nodeids.length||cmd.nodeids.length>500)throw Error('INVALID_INPUT');
  const nodes=[];for(const id of new Set(cmd.nodeids)){const node=await allowed(ctx,id);if(!node)throw Error('ACCESS_DENIED');if(node.agent&&[1,2,3,4,42,43].includes(node.agent.id))nodes.push(node);}
  for(const node of nodes){const old=s.data.scans[node._id];if(old&&['searching','queued','offline','waiting'].includes(old.state))continue;s.data.scans[node._id]={nodeid:node._id,name:node.name,state:'queued',requested:Date.now(),by:ctx.user._id,packages:old?old.packages:[]};}
  persist(s);start(s,ctx.parent);return {queued:nodes.length};
 }
 if(cmd.op==='driverLibraryRetry'){const p=s.data.packages[cmd.id];if(!p||p.state!=='failed')throw Error('INVALID_INPUT');p.state='queued';persist(s);return {queued:true};}
 if(cmd.op==='driverLibraryRemove'){
  const p=s.data.packages[cmd.id];if(!p)throw Error('INVALID_INPUT');
  if(p.state==='downloading')throw Error('PACKAGE_BUSY');
  // An install already sent is still reading these files over the package endpoint.
  if(Object.values(s.data.installs).some(j=>j.packageId===p.id&&['installing','unknown'].includes(j.state)))throw Error('INSTALL_PENDING');
  delete s.data.packages[cmd.id];
  for(const j of Object.values(s.data.scans))if(Array.isArray(j.packages))j.packages=j.packages.filter(id=>id!==cmd.id);
  const freed=prune(s);persist(s);return {freed};
 }
 if(cmd.op==='driverLibraryInstall')return install(ctx,s,cmd);
 throw Error('UNKNOWN_OPERATION');
};

function fileHash(file){return new Promise((resolve,reject)=>{const digest=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('data',c=>digest.update(c));stream.on('error',reject);stream.on('end',()=>resolve(digest.digest('hex')));});}
async function install(ctx,s,cmd){
 const node=await allowed(ctx,cmd.nodeid),scan=s.data.scans[cmd.nodeid],p=s.data.packages[cmd.id];
 if(!node)throw Error('ACCESS_DENIED');
 if(!p||p.state!=='ready')throw Error('RESCAN_REQUIRED');
 // A pack the hospital uploaded was chosen deliberately for this computer, so there is no
 // scan to agree with. Every other guard below still applies to it.
 if(p.source!=='upload'&&(!scan||scan.state!=='completed'||!scan.packages.includes(p.id)||Date.now()-scan.updated>7*86400000))throw Error('RESCAN_REQUIRED');
 if(s.data.installs[node._id]&&['installing','unknown'].includes(s.data.installs[node._id].state))throw Error('INSTALL_PENDING');
 if(!ctx.parent.wsagents[node._id]||ctx.parent.wsagents[node._id].authenticated!==2)throw Error('OFFLINE');
 const server=ctx.parent.parent,cert=new crypto.X509Certificate(ctx.parent.certificates.web.cert),pin=cert.fingerprint256.replace(/:/g,'');
 const host=server.args.cert||ctx.parent.certificates.CommonName,port=server.args.aliasport||server.args.port;
 const origin='https://'+host+((port&&port!==443)?':'+port:'');new URL(origin);
 for(const file of p.files){if(!file.sha256||!fs.existsSync(path.join(s.root,file.name)))throw Error('CACHE_MISSING');if(await fileHash(path.join(s.root,file.name))!==file.sha256)throw Error('CACHE_HASH_MISMATCH');}
 for(const [token,entry] of s.tokens)if(entry.expires<Date.now())s.tokens.delete(token);
 const files=p.files.map(f=>{if(!f.sha256||!fs.existsSync(path.join(s.root,f.name)))throw Error('CACHE_MISSING');const token=crypto.randomBytes(32).toString('hex');s.tokens.set(token,{file:f.name,expires:Date.now()+30*60*1000});return {url:origin+'/scp-driver-package.ashx?token='+token,sha256:f.sha256,name:f.name,kind:f.kind||'cab'};});
 const payload=Buffer.from(JSON.stringify(files),'utf8').toString('base64');
 const script=fs.readFileSync(path.join(__dirname,'driver-install.ps1'),'utf8').replace('__PIN__',pin).replace('__FILES__',payload).replace('__PACKAGE__',p.id);
 const job={nodeid:node._id,name:node.name,packageId:p.id,state:'installing',started:Date.now(),by:ctx.user._id,ticket:'scplib-install-'+crypto.randomUUID()};s.data.installs[node._id]=job;persist(s);
 try{send(ctx.parent,node._id,script,job.ticket);}catch(e){job.state='failed';job.error=e.message;persist(s);throw e;}return job;
}
exports.serve=function(web,req,res){
 const s=getStore(web.parent),token=String(req.query.token||''),entry=s.tokens.get(token);
 if(!entry||entry.expires<Date.now()){s.tokens.delete(token);res.status(403).end();return;}
 if(!fs.existsSync(path.join(s.root,entry.file))){s.tokens.delete(token);res.status(404).end();return;}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/octet-stream');res.sendFile(path.join(s.root,entry.file));
};
exports._test={safeUrl,ingest,getStore,persist,discovery,stores,prune,usage,kindOf,safeEntry,zipNames};
