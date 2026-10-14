'use strict';
const fs=require('fs/promises'),path=require('path'),crypto=require('crypto');
const {ZipReader,Uint8ArrayReader,Uint8ArrayWriter}=require('@zip.js/zip.js');
const busy=new Set();
const reportPath=s=>path.join(s.datapath,'scp-backup-verification.json');
async function inventory(dir){
 if(!dir)return {available:false,files:[]};
 try { const names=(await fs.readdir(dir)).filter(n=>/^meshcentral-autobackup-.*\.zip$/.test(n));const files=[];
 for(const name of names){const st=await fs.stat(path.join(dir,name));if(st.isFile())files.push({name,size:st.size,modified:st.mtimeMs});}
 return {available:true,files:files.sort((a,b)=>b.modified-a.modified).slice(0,30)};
 }catch{return {available:false,files:[]};}
}
exports.status=async function(s){const auto=s.config.settings.autobackup||{};let verification=null;try{verification=JSON.parse(await fs.readFile(reportPath(s),'utf8'));}catch{}
 const source=await inventory(s.backuppath),copy=await inventory(auto.scpbackupcopypath);let copyMatches=null;
 const newest=source.files[0];if(newest&&newest.size<=256*1024*1024&&copy.files.some(f=>f.name===newest.name&&f.size===newest.size)) {
  const hashes=await Promise.all([s.backuppath,auto.scpbackupcopypath].map(async dir=>crypto.createHash('sha256').update(await fs.readFile(path.join(dir,newest.name))).digest('hex')));copyMatches=hashes[0]===hashes[1];
 }
 return {source,copy,copyMatches,verification,busy:busy.has(s.datapath)};};
exports.verify=async function(s, options){
 if(busy.has(s.datapath))throw Error('VERIFICATION_BUSY');busy.add(s.datapath);
 let reader;const report={at:Date.now(),state:'failed',scope:'isolated-extraction',entries:0,records:0};
 try{
 const list=await inventory(s.backuppath);const latest=list.files[0];if(!latest)throw Error('NO_BACKUP');if(latest.size>256*1024*1024)throw Error('ARCHIVE_TOO_LARGE');
 report.archive=latest.name;const raw=await fs.readFile(path.join(s.backuppath,latest.name));report.sha256=crypto.createHash('sha256').update(raw).digest('hex');
 reader=new ZipReader(new Uint8ArrayReader(raw),{password:(s.config.settings.autobackup||{}).zippassword,useWebWorkers:false});
 const entries=await reader.getEntries();if(entries.length>10000)throw Error('TOO_MANY_FILES');
 let total=0;const validated=[];
 for(const entry of entries){const name=entry.filename.replace(/\\/g,'/');if(name.startsWith('/')||name.includes(':')||name.split('/').includes('..'))throw Error('UNSAFE_PATH');total+=entry.uncompressedSize;if(total>512*1024*1024)throw Error('EXPANDED_TOO_LARGE');validated.push([entry,name]);}
 const reviewRoot=path.join(path.dirname(s.datapath),'scp-restore-checks');await fs.mkdir(reviewRoot,{recursive:true});const folder=await fs.mkdtemp(path.join(reviewRoot,'check-'));report.folder=path.basename(folder);let database=false,config=false;
 for(const [entry,name] of validated){if(entry.directory)continue;const content=await entry.getData(new Uint8ArrayWriter(),{checkSignature:true});const target=path.resolve(folder,name);if(!target.startsWith(folder+path.sep))throw Error('UNSAFE_PATH');await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content,{flag:'wx'});report.entries++;
 if(path.basename(name)==='config.json'){JSON.parse(Buffer.from(content).toString());config=true;}
 if(path.basename(name)==='meshcentral.db'){for(const line of Buffer.from(content).toString().split('\n'))if(line.trim()){JSON.parse(line);report.records++;}database=true;}
 }
 if(!database||!config)throw Error('REQUIRED_FILES_MISSING');report.state='passed';
 if (!options || options.boot !== false) { report.boot=await require('./restore-smoke').run(folder); }
 }catch(e){report.state='failed';report.error=String(e.message).slice(0,200);}finally{if(reader)await reader.close();busy.delete(s.datapath);}
 await fs.writeFile(reportPath(s),JSON.stringify(report,null,2));return report;
};
exports.inventory=inventory;
