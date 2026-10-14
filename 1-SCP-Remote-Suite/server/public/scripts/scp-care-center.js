(function(root){
 'use strict';
 function csv(rows){return '\ufeff'+rows.map(row=>row.map(value=>{let s=String(value==null?'':value);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
 function select(rows,query){const q=String(query||'').trim().toLowerCase();return rows.filter(r=>!q||r.join(' ').toLowerCase().includes(q));}
 function backupHealth(data,now){const latest=data.source&&data.source.files&&data.source.files[0];return {missing:!latest,stale:!!latest&&now-latest.modified>36*3600000,copy:data.copyMatches===true,verified:!!(latest&&data.verification&&data.verification.archive===latest.name&&data.verification.state==='passed'&&data.verification.boot&&data.verification.boot.state==='passed')};}
 if(typeof module!=='undefined'&&module.exports){module.exports={csv,select,backupHealth};return;}
 const th=document.documentElement.lang==='th',t=(en,thai)=>th?thai:en;
 function el(tag,text){const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
 function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
 function open(){
  const existing=document.getElementById('scp-care-center');if(existing){existing.focus();return;}
  const d=el('dialog');d.id='scp-care-center';d.style.cssText='width:min(1080px,92vw);max-height:88vh;border:1px solid #ead4df;border-radius:18px;padding:24px;background:#fcf7fa;color:#46162e;font:14px Sarabun,Segoe UI,sans-serif;box-shadow:0 24px 80px #45172e40';
  const style=el('style');style.textContent='#scp-care-center::backdrop{background:#46162e66;backdrop-filter:blur(3px)}#scp-care-center button,#scp-care-center input{font:inherit;padding:9px 14px;border:1px solid #e3cad6;border-radius:9px;background:white;color:#4b1631;margin:4px}#scp-care-center button{cursor:pointer}#scp-care-center button[aria-pressed=true]{background:#b02a72;color:white}#scp-care-center table{width:100%;border-collapse:collapse;background:white}#scp-care-center th,#scp-care-center td{text-align:left;padding:12px;border-bottom:1px solid #efe1e8;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}#scp-care-center th{background:#f5eaf0;position:sticky;top:0}#scp-care-center .care-table{max-height:48vh;overflow:auto;border:1px solid #eddce5;border-radius:12px}#scp-care-center nav{display:flex;flex-wrap:wrap}#scp-care-center input{min-width:240px;max-width:85%}';d.append(style);
  const title=el('h2',t('IT care center','ศูนย์ติดตามงาน IT'));title.style.margin='0 0 12px';d.append(title);
  const nav=el('nav'),query=el('input');query.type='search';query.placeholder=t('Search computer, room or details','ค้นหาเครื่อง ห้อง หรือรายละเอียด');query.setAttribute('aria-label',query.placeholder);
  const message=el('p');message.setAttribute('role','status');const content=el('section');let view='alerts',epoch=0,timer,rows=[],headers=[],loading=false;
  const tabs=[['alerts',t('Alerts','แจ้งเตือน')],['jobs',t('Task status','สถานะงาน')],['repairs',t('Repair history','ประวัติซ่อม')],['report',t('Fleet / CSV','รายงาน / CSV')]];
  if(root.userinfo&&root.userinfo.siteadmin===4294967295)tabs.push(['backups',t('Backup health','สุขภาพสำรอง')]);
  tabs.forEach(([key,label])=>{const b=button(label,()=>{view=key;epoch++;loading=false;query.value='';rows=[];headers=[];content.textContent='';refresh();});b.dataset.view=key;nav.append(b);});
  function draw(){content.textContent='';const filtered=select(rows,query.value);const wrap=el('div');wrap.className='care-table';const table=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);table.append(head);const body=el('tbody');filtered.forEach(row=>{const r=el('tr');row.forEach(value=>r.append(el('td',String(value==null?'':value))));body.append(r);});table.append(body);wrap.append(table);content.append(el('p',t('Matching rows: ','รายการที่พบ: ')+filtered.length),wrap);if(!filtered.length)content.append(el('p',t('No matching records','ไม่พบรายการตามเงื่อนไข')));}
  query.oninput=draw;
  const date=n=>n?new Date(n).toLocaleString(th?'th-TH':'en-GB'):t('Unknown','ไม่ทราบ');
  const states={open:t('Open','เปิดงาน'),working:t('Working','กำลังซ่อม'),waiting:t('Waiting','รอ'),closed:t('Closed','ปิดงาน')};
  async function refresh(){
   if(loading||!d.open)return;loading=true;const token=++epoch,current=view;message.textContent=t('Updating…','กำลังอัปเดต…');nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));exportButton.disabled=true;
   try{
    if(!root.ScpDashboard||!root.ScpOperations)throw Error(t('Dashboard is not ready','แดชบอร์ดยังไม่พร้อม'));
    const snapshot=root.ScpDashboard.snapshot(),nodes=snapshot.nodes||[],byId=new Map(nodes.map(n=>[n.id,n]));let next=[],cols=[];
    const named=id=>byId.get(id)||{name:id,room:''};
    if(current==='alerts'||current==='report'){
     let watched=[];if(current==='alerts')watched=await root.ScpOperations.request('alertWatch');
     cols=[t('Computer','เครื่อง'),t('Room','ห้อง'),t('Connection','การเชื่อมต่อ'),t('Findings','สิ่งที่พบ')];
     next=nodes.filter(n=>current==='report'||(n.risks||[]).length||(!n.online&&watched.includes(n.id))).sort((a,b)=>(b.high||0)-(a.high||0)).map(n=>[n.name,n.room,n.online?t('Online','ออนไลน์'):t('Offline','ออฟไลน์'),(n.risks||[]).map(r=>r.text).join('\n')||(!n.online&&watched.includes(n.id)?t('Watched device offline','เครื่องเฝ้าระวังออฟไลน์'):'—')]);
    }else if(current==='jobs'){
     const results=await Promise.allSettled(['driverStatus','cleanupStatus'].map(op=>root.ScpOperations.request(op)));const failed=results.filter(r=>r.status==='rejected');if(failed.length)throw Error(t('Some task data could not be loaded; previous view retained.','โหลดสถานะงานบางส่วนไม่ได้ แสดงข้อมูลเดิมไว้ก่อน'));
     cols=[t('Computer','เครื่อง'),t('Task','งาน'),t('Status','สถานะ'),t('Updated','อัปเดต'),t('Agent result','ผลจากเอเจนต์')];
     results.forEach((r,i)=>r.value.forEach(job=>next.push([named(job.nodeid).name,i?t('Cleanup','ล้างไฟล์'):t('Drivers','ไดรเวอร์'),job.progress?(Date.now()-job.updated>15*60000?t('No recent update; outcome unknown','ไม่มีความคืบหน้าล่าสุด ยังไม่ทราบผล'):t('In progress','กำลังทำงาน')):t('Result received — see details','ได้รับผลแล้ว — ดูรายละเอียด'),date(job.updated),job.result||'—'])));
    }else if(current==='repairs'){
     const tickets=await root.ScpOperations.request('tickets');cols=[t('Computer / room','เครื่อง / ห้อง'),t('Title','หัวข้อ'),t('Status','สถานะ'),t('Updated','อัปเดต'),t('Repair notes','บันทึกซ่อม')];
     next=tickets.map(r=>[named(r.nodeid).name+' / '+named(r.nodeid).room,r.title,states[r.status]||r.status,date(r.updated),(r.history||[]).map(h=>date(h.at)+' · '+(states[h.status]||h.status)+' · '+(h.note||'')).join('\n')]);
    }else if(current==='backups'){
     const data=await root.ScpOperations.request('backups'),health=backupHealth(data,Date.now()),latest=data.source.files[0];cols=[t('Check','รายการตรวจ'),t('Result','ผล')];next=[
      [t('Latest backup','สำรองล่าสุด'),latest?latest.name+' · '+date(latest.modified):t('No backup found','ไม่พบไฟล์สำรอง')],
      [t('Freshness','ความใหม่'),health.missing?t('Unknown','ไม่ทราบ'):health.stale?t('Older than 36 hours','เกิน 36 ชั่วโมง'):t('Within 36 hours','ไม่เกิน 36 ชั่วโมง')],
      [t('Second copy SHA-256','SHA-256 สำเนาอีกชุด'),health.copy?t('Matches','ตรงกัน'):data.copyMatches===false?t('Mismatch','ไม่ตรงกัน'):t('Not confirmed','ยังยืนยันไม่ได้')],
      [t('Latest archive restore check','ทดสอบกู้คืนไฟล์ล่าสุด'),health.verified?t('Extraction and test-server boot passed','แตกไฟล์และเปิดเซิร์ฟเวอร์ทดสอบผ่าน'):t('Not confirmed for the latest archive','ยังยืนยันไฟล์ล่าสุดไม่ได้')]
     ];
    }
    if(token!==epoch||!d.open)return;rows=next;headers=cols;draw();exportButton.disabled=false;message.textContent=t('Updated ','อัปเดตเมื่อ ')+date(Date.now())+t(' · refreshes every 15 seconds while open',' · อัปเดตทุก 15 วินาทีขณะเปิด');
   }catch(e){if(token===epoch){message.textContent=t('Update failed: ','อัปเดตไม่สำเร็จ: ')+e.message;exportButton.disabled=true;}}finally{if(token===epoch)loading=false;}
  }
  const exportButton=button(t('Export filtered CSV','ส่งออก CSV ตามตัวกรอง'),()=>{const blob=new Blob([csv([headers,...select(rows,query.value)])],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='SCP-Remote-'+view+'-'+new Date().toISOString().slice(0,10)+'.csv';d.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  d.append(nav,query,button(t('Refresh','อัปเดตตอนนี้'),refresh),exportButton,message,content,button(t('Close','ปิด'),()=>d.close()));document.body.append(d);d.showModal();refresh();timer=setInterval(refresh,15000);d.addEventListener('close',()=>{epoch++;clearInterval(timer);d.remove();});
 }
 root.ScpCareCenter={open,csv,select,backupHealth};
})(typeof window==='undefined'?globalThis:window);
