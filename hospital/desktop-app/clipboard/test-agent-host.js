'use strict';
// Local transport acceptance test. Does not open a remote session or alter the
// clipboard: tests the actual MeshAgent win-dispatcher pipe and helper framing.
const cp=require('child_process'),path=require('path');
const root=path.resolve(__dirname,'../../..').replace(/\\/g,'/');
const script=`
var fs=require('fs');
addModule('win-scp-clipboard-payload',fs.readFileSync(${JSON.stringify(root+'/agents/modules_meshcore/win-scp-clipboard-payload.js')}).toString());
addModule('win-scp-clipboard',fs.readFileSync(${JSON.stringify(root+'/agents/modules_meshcore/win-scp-clipboard.js')}).toString());
var timer=setTimeout(function(){console.log('FAIL: dispatcher timeout');process.exit(1);},35000);
var transferJob,offset=0;
function nextChunk(){var b=Buffer.alloc(Math.min(131072,300123-offset));host.send({id:3+Math.floor(offset/131072),op:'write',job:transferJob,index:0,offset:offset,data:b.toString('base64'),sha256:require('SHA256Stream').create().syncHash(b).toString('hex').toLowerCase()});}
var host=require('win-scp-clipboard').create({write:function(data){
 var r=JSON.parse(data); if(!r.ok){console.log('FAIL: '+r.error);host.close();process.exit(1);return;}
 if(r.id===1){console.log('PASS: native MeshAgent dispatcher returns clipboard state');host.send({id:2,op:'prepare',entries:[{path:'transport-test.bin',directory:false,size:300123}]});}
 else if(r.id===2){console.log('PASS: native pipe creates isolated staging');transferJob=r.result.job;nextChunk();}
 else if(r.id<6){offset=r.result.offset;if(offset<300123){nextChunk();}else{console.log('PASS: native pipe transfers and verifies 300123 bytes in 3 chunks');host.send({id:6,op:'abort'});}}
 else{console.log('PASS: native pipe aborts staging');clearTimeout(timer);host.close();process.exit();}
}});
host.send({id:1,op:'state'});
`;
const child=cp.spawn('C:/Program Files/Mesh Agent/MeshAgent.exe',['-b64exec',Buffer.from(script).toString('base64')],{windowsHide:true,timeout:45000,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code||0;});
