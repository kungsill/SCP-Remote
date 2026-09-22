/* Authenticated desktop transport upgrade. Consent must already have opened KVM. */
function allowed(ws) {
 var r=ws&&ws.httprequest;
 return !!(r&&r.protocol===2&&r.desktop&&r.desktop.kvm&&!r.desktopviewonly&&!r.scpServerRecording&&
  (r.rights===0xFFFFFFFF||((r.rights&8)!==0&&(r.rights&256)===0)));
}
function send(ws,type){ws.write(JSON.stringify({ctrlChannel:'102938',type:type}));}
function closePeer(s){var ch=s.channel,pc=s.pc;s.channel=null;s.pc=null;try{if(ch)ch.close();}catch(e){}try{if(pc)pc.close();}catch(e){}}
function relay(ws,s,notify){
 if(s.closed)return;s.closed=true;
 var r=ws.httprequest,kvm=r&&r.desktop&&r.desktop.kvm;
 if(kvm&&s.switched){
  try{if(s.channel){s.channel.unpipe(kvm);kvm.unpipe(s.channel);}ws.unpipe(kvm);kvm.unpipe(ws);
   kvm.pipe(ws,{dataTypeSkip:1,end:false});if(allowed(ws))ws.pipe(kvm,{dataTypeSkip:1,end:false});ws.resume();
  }catch(e){closePeer(s);try{ws.close();}catch(x){}return;}
 }
 closePeer(s);if(notify)send(ws,'scp-lan-relay-ready');
}
exports.handle=function(ws,command,rtc){
 if(!allowed(ws))return false;var s=ws.scpLan;
 if(command.type==='scp-lan-offer'){
  if(s||typeof command.sdp!=='string'||command.sdp.length>65536)return false;
  s=ws.scpLan={closed:false,switched:false,channel:null,pc:null};
  ws.once('end',function(){s.closed=true;closePeer(s);});ws.once('close',function(){s.closed=true;closePeer(s);});
  try{
   s.pc=rtc.createConnection();s.pc.on('dataChannel',function(channel){
    if(s.closed){channel.close();return;}s.channel=channel;
    channel.on('end',function(){relay(ws,s,true);});send(ws,'scp-lan-ready');
   });
   s.pc.on('disconnected',function(){relay(ws,s,true);});
   var answer=s.pc.setOffer(command.sdp);if(!answer)throw Error('NO_ANSWER');
   ws.write(JSON.stringify({ctrlChannel:'102938',type:'scp-lan-answer',sdp:answer}));
  }catch(e){relay(ws,s,true);}return true;
 }
 if(command.type==='scp-lan-relay'){if(s)relay(ws,s,true);send(ws,'scp-lan-relay-ready');return true;}
 if(command.type==='scp-lan-switch'){
  if(!s||s.closed||s.switched||!s.channel)return false;
  var kvm=ws.httprequest.desktop.kvm;s.switched=true;
  try{ws.unpipe(kvm);kvm.unpipe(ws);s.channel.pipe(kvm,{dataTypeSkip:1,end:false});kvm.pipe(s.channel,{dataTypeSkip:1,end:false});ws.resume();send(ws,'scp-lan-active');}
  catch(e){relay(ws,s,true);}return true;
 }
 return false;
};
exports.allowed=allowed;
