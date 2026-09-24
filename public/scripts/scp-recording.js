/* Local video recording of the authorized remote canvas. No microphone or upload. */
(function(root){
 'use strict';if(root.ScpRecording)return;
 const th=(root.scpClipboardLanguage||document.documentElement.lang)==='th',t=(en,thai)=>th?thai:en;
 const limit=128*1024*1024,maxTime=30*60*1000;let active=null,saved=null,panel,body,head,open=false,status,startButton,stopButton,download,discard;
 function element(tag,text){const n=document.createElement(tag);if(text)n.textContent=text;return n;}
 // Recording details open from the shared desktop toolbar.
 function applyOpen(){if(!head)return;head.setAttribute('aria-expanded',String(open));head.textContent=(active?'● ':'')+(open?t('Recording ▾','บันทึกวิดีโอ ▾'):t('Record video ▸','บันทึกวิดีโอ ▸'));if(body)body.hidden=!open;}
 function setOpen(v){open=v;applyOpen();}
 function init(){if(panel)return;panel=element('aside');panel.id='scp-recording';panel.style.cssText='position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:10006;max-width:min(300px,86vw);border:1px solid #e3c7d5;border-left:0;border-radius:0 12px 12px 0;background:#fff8fc;color:#4b1631;box-shadow:0 8px 30px #46162e30;font:13px Sarabun,Segoe UI,sans-serif;overflow:hidden';
  head=element('button');head.type='button';head.style.cssText='display:block;width:100%;text-align:left;font:inherit;font-weight:600;padding:8px 12px;border:0;background:transparent;color:#b02a72;cursor:pointer';head.onclick=()=>setOpen(!open);
  body=element('div');body.style.cssText='padding:0 12px 12px';
  status=element('div');status.setAttribute('role','status');startButton=element('button',t('Record video','บันทึกวิดีโอ'));stopButton=element('button',t('Stop recording','หยุดบันทึก'));download=element('a',t('Download video','ดาวน์โหลดวิดีโอ'));discard=element('button',t('Discard','ทิ้งวิดีโอ'));
  [startButton,stopButton,discard,download].forEach(n=>{n.style.cssText='font:inherit;padding:7px 10px;margin:6px 5px 0 0;border:1px solid #ddbfce;border-radius:8px;background:white;color:#b02a72;cursor:pointer';if(n.tagName==='BUTTON')n.type='button';});
  startButton.onclick=start;stopButton.onclick=()=>stop(t('Stopped','หยุดบันทึกแล้ว'));discard.onclick=()=>{if(!root.confirm(t('Discard this video?','ทิ้งวิดีโอนี้หรือไม่?')))return;if(saved)URL.revokeObjectURL(saved.url);saved=null;render();};
  const help=element('small',t('Remote image only · up to 30 min / 128 MB · download before closing','เฉพาะภาพรีโมต · ไม่เกิน 30 นาที / 128 MB · ดาวน์โหลดก่อนปิดหน้าต่าง'));help.style.display='block';body.append(status,startButton,stopButton,download,discard,help);panel.append(head,body);if(root.ScpRemoteUI)root.ScpRemoteUI.mount(panel);else document.body.append(panel);applyOpen();
 }
 function connected(){const d=root.desktop;return d&&d.contype===1&&d.State===3&&d.m&&d.m.CanvasId&&typeof d.m.CanvasId.captureStream==='function'?d:null;}
 function render(){init();if(active&&!open)open=true;applyOpen();const d=connected();panel.hidden=(!d||(typeof root.xxcurrentView==='number'&&root.xxcurrentView!==11))&&!active&&!saved;startButton.hidden=!!active||!!saved;startButton.disabled=!d||typeof root.MediaRecorder!=='function';stopButton.hidden=!active;stopButton.disabled=!!(active&&active.stopping);download.hidden=discard.hidden=!saved;
  if(active){status.textContent=(active.stopping?t('Preparing video…','กำลังเตรียมไฟล์…'):t('● Recording ','● กำลังบันทึก '))+Math.floor((Date.now()-active.started)/1000)+t(' sec',' วินาที')+' · '+(active.bytes/1048576).toFixed(1)+' MB';}
  else if(saved){status.textContent=saved.note+' · '+(saved.blob.size/1048576).toFixed(1)+' MB';download.href=saved.url;download.download=saved.name;}
  else status.textContent=typeof root.MediaRecorder==='function'?t('Local session video','วิดีโอเซสชันเก็บที่เครื่องนี้'):t('Video recording is not supported','เบราว์เซอร์นี้ไม่รองรับการบันทึกวิดีโอ');
 }
 function stop(note){if(!active||active.stopping)return;active.note=note;active.stopping=true;if(active.recorder.state!=='inactive')active.recorder.stop();render();}
 function start(){if(active||saved)return;const d=connected();if(!d)return;let stream;
  try{
   const mime=['video/webm;codecs=vp8','video/webm'].find(v=>root.MediaRecorder.isTypeSupported(v));if(!mime)throw Error(t('WebM is not supported','ไม่รองรับ WebM'));
   stream=d.m.CanvasId.captureStream(20);const recorder=new root.MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});
   const job={recorder,stream,desktop:d,canvas:d.m.CanvasId,chunks:[],bytes:0,started:Date.now(),stopping:false,note:t('Ready to download','พร้อมดาวน์โหลด')};active=job;
   recorder.ondataavailable=e=>{if(!e.data||!e.data.size)return;job.chunks.push(e.data);job.bytes+=e.data.size;if(job.bytes>=limit&&active===job)stop(t('Size limit reached','ถึงขนาดที่กำหนดแล้ว'));};
   recorder.onerror=()=>{job.note=t('Recording error — partial video','การบันทึกมีข้อผิดพลาด — ไฟล์อาจไม่ครบ');if(active===job)stop(job.note);};
   recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());const blob=new Blob(job.chunks,{type:mime});job.chunks=[];if(active===job)active=null;if(blob.size){saved={blob,url:URL.createObjectURL(blob),name:'SCP-Remote-'+new Date(job.started).toISOString().replace(/[:.]/g,'-')+'.webm',note:job.note};}render();if(!blob.size)status.textContent=t('No video data was received.','ไม่ได้รับข้อมูลวิดีโอ');};
   recorder.start(1000);render();
  }catch(e){if(stream)stream.getTracks().forEach(track=>track.stop());active=null;render();status.textContent=t('Could not record: ','บันทึกไม่ได้: ')+e.message;}
 }
 const timer=setInterval(()=>{if(active&&!active.stopping){if(root.desktop!==active.desktop||active.desktop.State!==3||active.desktop.m.CanvasId!==active.canvas)stop(t('Remote session ended','เซสชันรีโมตสิ้นสุด'));else if(Date.now()-active.started>=maxTime)stop(t('Time limit reached','ครบเวลาที่กำหนดแล้ว'));}render();},1000);
 root.addEventListener('beforeunload',e=>{if(active||saved){e.preventDefault();e.returnValue='';}});
 root.addEventListener('unload',()=>{clearInterval(timer);if(active)active.stream.getTracks().forEach(track=>track.stop());if(saved)URL.revokeObjectURL(saved.url);});
 root.ScpRecording={start,stop:()=>stop(t('Stopped','หยุดบันทึกแล้ว'))};
})(window);
