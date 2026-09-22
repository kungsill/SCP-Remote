(function(root){
 'use strict';if(root.ScpLan||typeof root.CreateAgentRedirect!=='function')return;
 const original=root.CreateAgentRedirect;
 function capable(node){if(!node||!node.agent||node.agent.scpLanNative!==true)return false;const v=String(node&&node.agent&&node.agent.scpRelease||'').split('.').map(Number),min=[2026,9,21,5];if(v.length!==4||v.some(n=>!Number.isFinite(n)))return false;for(let i=0;i<4;i++)if(v[i]!==min[i])return v[i]>min[i];return true;}
 root.CreateAgentRedirect=function(){
  const obj=original.apply(this,arguments);if(obj.protocol!==2)return obj;
  const control=obj.xxOnControlCommand,send=obj.send,stop=obj.Stop;let pc=null,ch=null,timer=null,watch=null,ready=false,opened=false,switching=false,waiting=false,done=false,attempted=false;
  function signal(type,extra){obj.sendCtrlMsg(JSON.stringify(Object.assign({ctrlChannel:'102938',type},extra||{})));}
  function close(){const p=pc,c=ch;pc=ch=null;obj.webRtcActive=false;obj.webchannel=null;obj.webrtc=null;if(c){c.onclose=c.onerror=c.onmessage=null;try{c.close();}catch{}}if(p){p.oniceconnectionstatechange=p.onconnectionstatechange=null;try{p.close();}catch{}}}
  function fallback(){if(done||waiting)return;waiting=true;obj.scpLanState='returning';clearTimeout(timer);signal('scp-lan-relay');if(!switching&&!obj.webRtcActive){waiting=false;done=true;close();obj.scpLanState='relay';return;}timer=setTimeout(()=>{if(waiting){obj.scpLanState='failed';obj.Stop();}},5000);}
  function activate(){if(ready&&opened&&!switching&&!waiting&&!done){switching=true;signal('scp-lan-switch');}}
  obj.xxOnControlCommand=function(raw){let m;try{m=JSON.parse(raw);}catch{return control.call(obj,raw);}if(m.ctrlChannel!='102938'||!String(m.type).startsWith('scp-lan-'))return control(raw);
   if(m.type==='scp-lan-relay-ready'){clearTimeout(timer);waiting=false;done=true;close();obj.scpLanState='relay';if(obj.m.SendRefresh)obj.m.SendRefresh();return;}
   if(done||waiting)return;
   if(m.type==='scp-lan-answer'&&pc)pc.setRemoteDescription({type:'answer',sdp:m.sdp}).catch(fallback);
   if(m.type==='scp-lan-ready'){ready=true;activate();}
   if(m.type==='scp-lan-active'&&switching&&ch&&ch.readyState==='open'){clearTimeout(timer);obj.webRtcActive=true;obj.scpLanState='direct';if(obj.m.SendRefresh)obj.m.SendRefresh();}
  };
  obj.send=function(data){if(!waiting)return send.call(obj,data);};
  obj.Stop=function(){clearTimeout(timer);clearInterval(watch);done=true;waiting=false;close();return stop.apply(obj,arguments);};
  function begin(){attempted=true;obj.scpLanState='negotiating';obj.attemptWebRTC=false;
   try{pc=new root.RTCPeerConnection({iceServers:[]});obj.webrtc=pc;ch=pc.createDataChannel('SCP-LAN');obj.webchannel=ch;ch.binaryType='arraybuffer';ch.onmessage=obj.xxOnMessage;
    ch.onopen=()=>{opened=true;activate();};ch.onclose=ch.onerror=fallback;
    pc.oniceconnectionstatechange=()=>{if(pc&&['failed','disconnected','closed'].includes(pc.iceConnectionState))fallback();};
    pc.onconnectionstatechange=()=>{if(pc&&pc.connectionState==='failed')fallback();};
    let offered=false;pc.onicecandidate=e=>{if(!e.candidate&&!offered&&pc&&!done&&!waiting){offered=true;signal('scp-lan-offer',{sdp:pc.localDescription.sdp});}};
    pc.createOffer().then(offer=>pc&&!done&&!waiting?pc.setLocalDescription(offer):null).catch(fallback);
    timer=setTimeout(fallback,12000);
   }catch{fallback();}
  }
  const start=obj.Start;obj.Start=function(){
   const enabled=root.scpLanReady===true||(root.scpLanEnabled===true&&capable(root.currentNode));if(enabled){obj.attemptWebRTC=false;watch=setInterval(()=>{if(obj.State===0){clearInterval(watch);return;}if(obj.State===3&&!attempted&&!obj.viewonly&&!obj.serverIsRecording&&obj.m.scpStats&&obj.m.scpStats.tiles>0&&root.RTCPeerConnection){clearInterval(watch);begin();}},500);}return start.apply(obj,arguments);
  };
  return obj;
 };
 root.ScpLan={capable};
})(window);
