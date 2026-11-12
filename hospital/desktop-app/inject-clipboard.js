/* Injected only in the native SCP-Remote window, after the signed sharing page. */
(function(){
 'use strict';
 if(!window.scpClipboard||window.scpFileClipboardInstalled)return;
 window.scpFileClipboardInstalled=true;
 const en=document.documentElement.lang==='en'||window.scpClipboardLanguage==='en';
 const tr=(th,eng)=>en?eng:th;
 let channel,connecting,serial=0,busy=false,signal;
 const pending=new Map();
 if(!document.getElementById('scp-ui-style')){const st=document.createElement('style');st.id='scp-ui-style';st.textContent=`
.scp-ui-btn{position:fixed;z-index:2147483000;left:18px;bottom:18px;display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border:0;border-radius:24px;background:linear-gradient(180deg,#0e8ba0,#0b7285);color:#fff;font:600 13px/1 Sarabun,"Segoe UI",system-ui,sans-serif;letter-spacing:.2px;cursor:pointer;box-shadow:0 6px 18px rgba(11,114,133,.38);transition:transform .14s ease,box-shadow .14s ease,filter .14s ease}
.scp-ui-btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(11,114,133,.46);filter:brightness(1.06)}
.scp-ui-btn:active{transform:translateY(0);box-shadow:0 4px 12px rgba(11,114,133,.4)}
.scp-ui-status{position:fixed;z-index:2147483000;bottom:20px;left:50%;transform:translateX(-50%);max-width:82vw;display:flex;align-items:center;gap:11px;padding:12px 18px;border:1px solid #cfe8ea;border-radius:14px;background:rgba(255,255,255,.97);color:#14434c;font:13px/1.4 Sarabun,"Segoe UI",system-ui,sans-serif;box-shadow:0 12px 30px rgba(21,60,73,.20);backdrop-filter:blur(6px)}
.scp-ui-dot{width:9px;height:9px;border-radius:50%;background:#0e8ba0;flex:0 0 auto;animation:scpPulse 1.4s ease-in-out infinite}
.scp-ui-cancel{margin-left:2px;border:1px solid #bcd9dc;border-radius:9px;background:#fff;color:#0b7285;font:600 12px Sarabun,"Segoe UI",sans-serif;padding:6px 13px;cursor:pointer;transition:background .12s}
.scp-ui-cancel:hover{background:#eef8f9}
@keyframes scpPulse{0%,100%{box-shadow:0 0 0 3px rgba(14,139,160,.22)}50%{box-shadow:0 0 0 7px rgba(14,139,160,.06)}}
`;document.head.appendChild(st);}
 const box=document.createElement('div');box.id='scp-clipboard-status';box.className='scp-ui-status';box.style.display='none';
 const label=document.createElement('span'),cancel=document.createElement('button');
 const dot=document.createElement('span');dot.className='scp-ui-dot';
 cancel.textContent=tr('ยกเลิก','Cancel');cancel.className='scp-ui-cancel';
 cancel.onclick=()=>{if(signal)signal.cancelled=true;closeChannel('CANCELLED');};box.append(dot,label,cancel);document.body.appendChild(box);
 let hideTimer;
 // The bar is for what takes time or went wrong. Text pasted or copied in an instant shows nothing.
 function status(text,active,ms){clearTimeout(hideTimer);label.textContent=text;box.style.display='flex';cancel.style.display=active?'inline-block':'none';if(!active)hideTimer=setTimeout(()=>box.style.display='none',ms||9000);}
 function quiet(){clearTimeout(hideTimer);box.style.display='none';}
 let startedAt=0;
 if(window.scpClipboardReady!==true){status(tr('คลิปบอร์ดไฟล์ต้องอัปเดตเอเจนต์ปลายทางเป็น 2026.09.21.1 ขึ้นไป','File clipboard requires remote agent 2026.09.21.1 or later'),false);return;}
 function rejectAll(reason){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(reason));}pending.clear();}
 function closeChannel(reason){const old=channel;channel=null;connecting=null;rejectAll(reason||'DISCONNECTED');if(old)old.Stop();}
 function connect(){
  if(channel&&channel.State===3)return Promise.resolve();if(connecting)return connecting;
  connecting=new Promise((resolve,reject)=>{
   const m={protocol:5,xxStateChange:()=>{},ProcessData:data=>{
    try{let r;try{r=JSON.parse(decode_utf8(data));}catch{r=JSON.parse(data);}if(r.action!=='scpclip')return;const p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);r.ok?p.resolve(r.result):p.reject(Error(r.error));}}catch{closeChannel('INVALID_RESPONSE');}
   }};
   const c=CreateAgentRedirect(null,m,serverPublicNamePort,authCookie,null,domainUrl);channel=c;c.attemptWebRTC=false;
   const timer=setTimeout(()=>{reject(Error('CONNECTION_TIMEOUT'));closeChannel('CONNECTION_TIMEOUT');},90000);
   c.onStateChanged=(sender,state)=>{if(state===3){clearTimeout(timer);resolve();}else if(state===0){clearTimeout(timer);if(channel===c){channel=null;connecting=null;}rejectAll('DISCONNECTED');reject(Error('DISCONNECTED'));}};
   c.onConsoleMessageChange=()=>{if(c.consoleMessage)status(tr('ขั้นตอน 1/4 · รอเครื่องปลายทางอนุญาตรับ–ส่งไฟล์','Step 1/4 · Waiting for file-access approval'),true);};c.Start(null);
  });return connecting;
 }
 async function far(command){if(command.op==='abort'&&(!channel||channel.State!==3))throw Error('DISCONNECTED');await connect();return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('HELPER_TIMEOUT_OR_OLD_AGENT'));closeChannel('HELPER_TIMEOUT_OR_OLD_AGENT');},90000);pending.set(id,{resolve,reject,timer});channel.sendText({...command,action:'scpclip',id});});}
 async function local(command){const r=await window.scpClipboard.request(command);if(!r.ok)throw Error(r.error);return r.result;}
 function keys(code){if(!desktop||desktop.State!==3)throw Error('DESKTOP_DISCONNECTED');const m=desktop.m;m.SendKeyMsgKC([[m.KeyAction.DOWN,17],[m.KeyAction.DOWN,code],[m.KeyAction.UP,code],[m.KeyAction.UP,17]]);}
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 function progress(p){if(Date.now()-startedAt<700&&!p.verifying&&p.percent<100)return;status(p.verifying?tr('ขั้นตอน 3/4 · ตรวจสอบไฟล์ก่อนเตรียมวาง','Step 3/4 · Verifying files before paste'):tr('ขั้นตอน 2/4 · โอนไฟล์ ','Step 2/4 · Transferring ')+p.percent+'% · '+p.name,true);}
 const errors={CLIPBOARD_CHANGED:tr('คลิปบอร์ดเปลี่ยนระหว่างโอน กรุณาคัดลอกใหม่','Clipboard changed during transfer. Copy again.'),CANCELLED:tr('ยกเลิกแล้ว','Cancelled'),NOT_ENOUGH_SPACE:tr('พื้นที่ปลายทางไม่พอ','Not enough destination space'),HELPER_TIMEOUT_OR_OLD_AGENT:tr('เครื่องปลายทางไม่ตอบกลับหรือยังใช้เอเจนต์เก่า','Remote helper did not respond. Check the agent update.'),NO_COPY_CHANGE:tr('ยังไม่พบข้อมูลที่คัดลอก กรุณาเลือกไฟล์หรือข้อความแล้วกด Ctrl+C ใหม่','No new clipboard content. Select files or text and press Ctrl+C again.'),EMPTY_CLIPBOARD:tr('คลิปบอร์ดไม่มีไฟล์หรือข้อความ','No files or text on the clipboard')};
 async function run(direction){
  if(busy){status(tr('กำลังโอนอยู่ กรุณารอหรือยกเลิกก่อน','A transfer is running. Wait or cancel first.'),true);return;}
  busy=true;signal={cancelled:false};startedAt=Date.now();let files=false;
  // only said when it is actually taking a while (first use opens the channel and may wait for approval)
  const slow=setTimeout(()=>{if(busy&&box.style.display!=='flex')status(tr('กำลังเตรียมคลิปบอร์ด…','Preparing the clipboard…'),true);},1500);
  try{
   let snapshot,sequence,src,dst;
   if(direction==='out'){
    snapshot=await local({op:'snapshot'});src=local;dst=far;
    if(!snapshot.entries.length&&snapshot.text===null){keys(86);quiet();return;}
    sequence=(await far({op:'state'})).sequence;
   }else{
    sequence=(await local({op:'state'})).sequence;const before=await far({op:'state'});if(signal.cancelled)throw Error('CANCELLED');keys(67);
    let changed=false;for(let i=0;i<20;i++){await delay(150);if(signal.cancelled)throw Error('CANCELLED');const state=await far({op:'state'});if(state.sequence!==before.sequence){changed=true;break;}}
    if(!changed)throw Error('NO_COPY_CHANGE');snapshot=await far({op:'snapshot'});src=far;dst=local;
   }
   if(signal.cancelled)throw Error('CANCELLED');
   if(snapshot.entries.length){files=true;await scpTransfer.transfer(src,dst,snapshot,sequence,progress,signal);}else if(snapshot.text!==null){await dst({op:'text',text:snapshot.text,sequence});}else{throw Error('EMPTY_CLIPBOARD');}
   if(direction==='out'){keys(86);if(files)status(tr('ส่งไฟล์ครบ 100% และวางที่เครื่องปลายทางแล้ว','Files sent (100%) and pasted on the remote computer'),false,3000);else quiet();}
   else if(files)status(tr('ไฟล์พร้อมแล้ว 100% · กด Ctrl+V ที่เครื่องนี้เพื่อวาง','Files ready (100%). Press Ctrl+V on this computer to paste.'),false,6000);else quiet();
  }catch(e){status(errors[e.message]||tr('คัดลอกไม่สำเร็จ: ','Copy failed: ')+e.message,false);}
  finally{clearTimeout(slow);busy=false;signal=null;try{autoLocal=(await local({op:'state'})).sequence;if(channel&&channel.State===3)autoFar=(await far({op:'state'})).sequence;}catch(e){}}
 }
 // Text follows the session by itself, the way a VNC viewer does it: whatever is copied on
 // either computer, by keyboard, right-click or a menu, is on the other's clipboard a moment
 // later, so Paste works however it is chosen. It runs only while this window is the one in
 // use and the remote picture has arrived (the person there has allowed the session), and it
 // never moves files: those go only when asked for with Ctrl+C / Ctrl+V, because a copied file
 // can be gigabytes. If the remote computer cannot do it, it is tried once and then left alone.
 let autoLocal=null,autoFar=null,autoBusy=false,autoOff=false;
 async function sync(force){
  if(autoBusy||busy||autoOff)return;
  if(typeof desktop==='undefined'||!desktop||desktop.State!==3||!(desktop.m&&desktop.m.scpStats&&desktop.m.scpStats.tiles>0))return;
  if(!force&&document.hasFocus&&!document.hasFocus())return;
  autoBusy=true;
  try{
   const here=await local({op:'state'});
   let there;
   try{there=await far({op:'state'});}catch(e){autoOff=true;quiet();return;}
   const first=autoLocal===null;
   if(first||here.sequence!==autoLocal){
    // copied on this computer (or the session has just started): send text to the remote
    if(!here.files){const snap=await local({op:'snapshot'});
     if(!snap.entries.length&&typeof snap.text==='string'&&snap.text.length&&snap.text.length<=1048576){await far({op:'text',text:snap.text,sequence:there.sequence});there=await far({op:'state'});}}
    autoLocal=here.sequence;autoFar=there.sequence;
   }else if(there.sequence!==autoFar){
    // copied on the remote computer: bring text here
    if(!there.files){const snap=await far({op:'snapshot'});
     if(!snap.entries.length&&typeof snap.text==='string'&&snap.text.length&&snap.text.length<=1048576){await local({op:'text',text:snap.text,sequence:here.sequence});autoLocal=(await local({op:'state'})).sequence;}}
    autoFar=there.sequence;
   }
  }catch(e){ /* the clipboard changed under us, or the channel dropped: the next pass sorts it out */ }
  finally{autoBusy=false;}
 }
 window.scpClipboardSync=sync;
 if(typeof setInterval==='function')setInterval(function(){sync();},1000);
 // leaving the window right after copying in the remote screen: fetch it before it is wanted
 window.addEventListener('blur',function(){sync(true);});
 function isDesktop(e){const t=e.target;return desktop&&desktop.State===3&&!(t&&t.closest&&t.closest('input,textarea,select,[contenteditable="true"],#dialog'))&&document.getElementById('deskarea0')?.offsetParent!==null;}
 // The mouse paste button was removed at the operator's request: Ctrl+V already does the same
 // local->remote paste, so the on-screen button was redundant. The keyboard handler below is the
 // paste path now. (To bring the button back, recreate a button that calls run('out').)
 const held=new Set();
 document.addEventListener('keydown',e=>{if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&['KeyC','KeyV'].includes(e.code)&&isDesktop(e)){e.preventDefault();e.stopImmediatePropagation();held.add(e.code);if(!e.repeat)run(e.code==='KeyC'?'in':'out');}},true);
 document.addEventListener('keyup',e=>{if(held.delete(e.code)){e.preventDefault();e.stopImmediatePropagation();}},true);
 window.addEventListener('beforeunload',()=>{if(signal)signal.cancelled=true;closeChannel('DISCONNECTED');});
})();
