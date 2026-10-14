'use strict';
const fs=require('fs/promises'),path=require('path'),https=require('https'),net=require('net'),{spawn}=require('child_process');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
exports.run=async function(folder){
 const find=async dir=>{for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()){const found=await find(file);if(found)return found;}else if(item.name==='meshcentral.db')return dir;}};
 const data=await find(folder);if(!data)throw Error('RESTORE_DATABASE_MISSING');
 const reserve=net.createServer();await new Promise((resolve,reject)=>{reserve.once('error',reject);reserve.listen(0,'127.0.0.1',resolve);});const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const config={settings:{cert:'localhost',port,portBind:'127.0.0.1',exactPorts:true,redirPort:0,mpsPort:0,wanOnly:true,amtScanner:false,selfUpdate:false,plugins:{enabled:false},autoBackup:{backupIntervalHours:0}},domains:{'':{title:'SCP-Remote recovery verification',newAccounts:false}}};
 // Change only the disposable restored copy; preserve the original restored settings alongside it.
 try{await fs.copyFile(path.join(data,'config.json'),path.join(data,'config.restored-original.json'));}catch{}
 await fs.writeFile(path.join(data,'config.json'),JSON.stringify(config));
 const child=spawn(process.execPath,[path.resolve(__dirname,'../meshcentral.js'),'--datapath',data,'--launch',String(process.pid)],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:'ignore'});
 let exited=false,spawnError;child.once('exit',()=>exited=true);child.once('error',e=>{spawnError=e;exited=true;});
 const probe=()=>new Promise(resolve=>{const req=https.get({hostname:'127.0.0.1',port,path:'/',rejectUnauthorized:false,timeout:1500},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve(res.statusCode===200&&body.includes('SCP-Remote recovery verification')));});req.on('error',()=>resolve(false));req.on('timeout',()=>{req.destroy();resolve(false);});});
 try{for(let i=0;i<60;i++){if(exited)throw Error('RESTORE_SERVER_EXITED');if(await probe())return {state:'passed',checkedAt:Date.now(),scope:'loopback-login-page',port};await pause(500);}throw Error(spawnError?'RESTORE_START_FAILED':'RESTORE_START_TIMEOUT');}
 finally{if(!exited){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),pause(3000)]);}}
};
