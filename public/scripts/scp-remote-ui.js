(function(root){
 'use strict';if(root.ScpRemoteUI)return;
 let dock,body,toggle;

 // Turning a phone sideways is the difference between a remote screen you can read and a strip
 // across the top, so the picture has to be re-fitted when it happens. A plain resize listener
 // is not enough: mobile browsers fire it while the viewport is still reporting the old size,
 // and the canvas is then sized for an orientation the phone has already left. Re-run a few
 // times over the following moment, and prefer visualViewport, which settles later and more
 // honestly than window does.
 function watchViewport(){
  // A resize is acted on at once, as it always was.
  root.addEventListener('resize',layout);
  if(root.visualViewport){root.visualViewport.addEventListener('resize',layout);}
  // A rotation is not: the browser reports the old size for a moment afterwards, so fitting
  // once would size the picture for the orientation the phone has already left. Fit again as
  // the new size arrives.
  const settle=()=>{[0,120,320,600].forEach(ms=>setTimeout(layout,ms));};
  root.addEventListener('orientationchange',settle);
  if(root.screen&&root.screen.orientation&&root.screen.orientation.addEventListener){
   try{root.screen.orientation.addEventListener('change',settle);}catch(e){}
  }
 }

 function layout(){const canvas=document.getElementById('deskarea3x');if(!canvas||canvas.offsetParent===null)return;const height=id=>{const n=document.getElementById(id);return n&&n.offsetParent!==null?n.getBoundingClientRect().height:0;};const bottom=height('deskarea4')+(document.body.classList.contains('fulldesk')?0:height('footer'))+12;const value=Math.max(120,root.innerHeight-canvas.getBoundingClientRect().top-bottom)+'px';if(canvas.style.getPropertyValue('--scp-canvas-height')!==value)canvas.style.setProperty('--scp-canvas-height',value);if(typeof root.deskAdjust==='function')root.deskAdjust();}

 function ensure(){if(dock)return;const th=document.documentElement.lang==='th';dock=document.createElement('aside');dock.id='scp-remote-dock';dock.hidden=true;
  const head=document.createElement('header'),brand=document.createElement('span');brand.className='scp-dock-brand';brand.textContent='SCP';const title=document.createElement('div');const name=document.createElement('strong');name.textContent=th?'เครื่องมือรีโมต':'Remote tools';const hint=document.createElement('small');hint.textContent='SCP-Remote · Hospital IT';title.append(name,hint);
  toggle=document.createElement('button');toggle.type='button';toggle.textContent='−';toggle.setAttribute('aria-label',th?'ย่อหรือขยายเครื่องมือรีโมต':'Collapse or expand remote tools');toggle.setAttribute('aria-expanded','true');toggle.onclick=()=>{body.hidden=!body.hidden;toggle.textContent=body.hidden?'+':'−';toggle.setAttribute('aria-expanded',String(!body.hidden));};head.append(brand,title,toggle);
  body=document.createElement('div');body.className='scp-dock-content';dock.append(head,body);const host=document.getElementById('deskarea1');(host||document.body).append(dock);if(host){dock.classList.add('scp-inline');document.body.classList.add('scp-inline-tools');if(root.ResizeObserver){const resize=new ResizeObserver(layout);resize.observe(host);const viewport=document.getElementById('deskarea3x');if(viewport)resize.observe(viewport);}watchViewport();}
  const observer=new MutationObserver(()=>{const visible=Array.from(body.children).some(n=>!n.hidden);if(dock.hidden===visible)dock.hidden=!visible;document.body.classList.toggle('scp-dock-visible',visible);layout();});observer.observe(body,{attributes:true,attributeFilter:['hidden'],subtree:true,childList:true});
 }
 // /m sends someone straight to one computer's screen. Everything the site puts around that -
 // the masthead, the tab strip, the footer, the panel titles - is for choosing and managing
 // devices, which they have already done, so the page is asked to drop all of it (hide=31).
 // What that also drops is the only place the page said which machine you are looking at and
 // the only way back, so this puts those two back and nothing else. It is the shape the
 // Desktop App's window already has, which is the point.
 function appView(){
  if(!/[?&]scpapp=1(&|$)/.test(location.search))return;
  if(document.getElementById('scp-app-bar'))return;
  const th=document.documentElement.lang==='th';
  document.body.classList.add('scp-app-view');
  const bar=document.createElement('header');bar.id='scp-app-bar';
  const back=document.createElement('a');back.href='m';back.className='scp-app-back';
  back.setAttribute('aria-label',th?'กลับไปหน้าเลือกเครื่อง':'Back to the device list');
  const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');
  arrow.setAttribute('viewBox','0 0 24 24');arrow.setAttribute('aria-hidden','true');
  const path=document.createElementNS(arrow.namespaceURI,'path');
  path.setAttribute('d','M19 12H5 M12 19l-7-7 7-7');arrow.appendChild(path);back.appendChild(arrow);
  const name=document.createElement('strong');name.id='scp-app-device';
  name.textContent=th?'กำลังเปิด…':'Opening…';
  const state=document.createElement('span');state.id='scp-app-state';state.setAttribute('role','status');
  bar.append(back,name,state);
  document.body.insertBefore(bar,document.body.firstChild);
  // The name and the connection both arrive after this runs, and the connection keeps
  // changing, so this reads them rather than being told once.
  let shown='',live=null;
  setInterval(function(){
   const node=root.currentNode;
   if(node&&node.name&&node.name!==shown){shown=node.name;name.textContent=node.name;}
   // 3 is connected, the same test the page makes on itself.
   const connected=!!(root.desktop&&root.desktop.State===3);
   if(connected!==live){
    live=connected;
    state.textContent=connected?(th?'เชื่อมต่อแล้ว':'Connected'):(th?'ยังไม่เชื่อมต่อ':'Not connected');
    state.classList.toggle('is-live',connected);
    layout();
   }
  },1000);
 }

 root.ScpRemoteUI={mount(node){ensure();node.hidden=true;body.append(node);}};
 appView();
})(window);
