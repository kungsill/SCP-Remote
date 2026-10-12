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
 // It applies to the remote screen itself, not to the URL that opened it. /m sends people
 // here with hide=31 so the chrome never flashes before this runs, but the same screen is also
 // one click away on the full site - open a device, press Desktop - and arriving that way used
 // to give a completely different-looking page. Watching the view instead of the query means
 // both roads end in the same place, which is what was asked for.
 //
 // While the screen is showing, the tabs beside Desktop - Terminal, Files, Registry, Console -
 // are out of sight with everything else. They come back on the way out, which is a real cost
 // and a deliberate one: the hospital asked for the screen and nothing else.
 function appView(){
  if(document.getElementById('scp-app-bar'))return;
  // Only on the full site. The Desktop App loads the sharing page, which also loads this file
  // (for the dock) and also calls its Desktop view 11 - so watching the view alone put this bar
  // inside the app's own window, where the back arrow would have led out of the session and the
  // machine's name never arrives at all. The app was to be left exactly as it was.
  //
  // Two tests rather than one, because they say different things: the sharing page is the app's
  // and is never ours to restyle, and there is nothing to strip on a page with no chrome.
  if(document.getElementById('LeftMenuDesktop'))return;
  if(!document.getElementById('page_leftbar')&&!document.getElementById('masthead'))return;
  const th=document.documentElement.lang==='th';
  // Sent here from /m rather than reached from the full site. It decides where "back" goes:
  // to the device list for one, and out of the screen to the device's own tabs for the other.
  const fromList=/[?&]scpapp=1(&|$)/.test(location.search);
  const bar=document.createElement('header');bar.id='scp-app-bar';bar.hidden=true;
  const back=document.createElement(fromList?'a':'button');back.className='scp-app-back';
  if(fromList){back.href='m';}else{back.type='button';back.onclick=function(){
   // Back to the device, not out of it: whoever came this way was already looking at the
   // machine and wants the tabs again, not the list.
   if(typeof root.gotoDevice==='function'&&root.currentNode){root.gotoDevice(root.currentNode._id,10);}
   else{location.href='m';}
  };}
  back.setAttribute('aria-label',th?'ออกจากหน้าจอ':'Leave the screen');
  const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');
  arrow.setAttribute('viewBox','0 0 24 24');arrow.setAttribute('aria-hidden','true');
  const path=document.createElementNS(arrow.namespaceURI,'path');
  path.setAttribute('d','M19 12H5 M12 19l-7-7 7-7');arrow.appendChild(path);back.appendChild(arrow);
  const name=document.createElement('strong');name.id='scp-app-device';
  name.textContent=th?'กำลังเปิด…':'Opening…';
  const state=document.createElement('span');state.id='scp-app-state';state.setAttribute('role','status');
  // shown only while the picture is zoomed in: one tap back to the whole screen
  fitBtn=document.createElement('button');fitBtn.type='button';fitBtn.className='scp-app-fit';fitBtn.hidden=true;
  fitBtn.onclick=function(){zoomTo(1);};
  bar.append(back,name,state,fitBtn);
  document.body.insertBefore(bar,document.body.firstChild);

  // The view, the machine and the connection all change while the page stays put, so all three
  // are read rather than being told once. 11 is the remote screen; the page's own panel map.
  let shown='',live=null,showing=null;
  setInterval(function(){
   const onScreen=root.xxcurrentView===11;
   if(onScreen!==showing){
    showing=onScreen;
    document.body.classList.toggle('scp-app-view',onScreen);
    bar.hidden=!onScreen;
    if(!onScreen&&zoom>1)zoomTo(1);
    layout();
   }
   if(!onScreen)return;
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
  },250);
 }

 // On a phone the whole remote screen is shrunk to fit, so its text is too small to read or
 // tap. Two fingers zoom the picture (up to 4x) round the point between them and move it; one
 // finger then slides the zoomed picture, and a tap is still a click on the remote computer.
 // Only the picture on this phone grows: the remote computer's own screen and resolution are
 // left exactly as they are, so whoever is sitting at it sees nothing change.
 //
 // The remote mouse is placed from where the tap lands on the picture (offsetX against the
 // picture's displayed width), which stays right however large the picture is drawn or far it
 // is scrolled. Two-finger touches never become clicks, so pinching presses nothing remotely.
 let zoom=1,fit=null,fitBtn=null;
 function zoomTo(z){
  const parent=document.getElementById('DeskParent'),desk=document.getElementById('Desk');
  if(!parent||!desk)return;
  zoom=Math.max(1,Math.min(4,z));
  if(zoom<1.04){zoom=1;parent.classList.remove('scp-zoomed');if(typeof root.deskAdjust==='function')root.deskAdjust();}
  else if(fit){desk.style.width=Math.round(fit.w*zoom)+'px';desk.style.height=Math.round(fit.h*zoom)+'px';desk.style.marginTop='0px';parent.style.overflow='auto';parent.classList.add('scp-zoomed');}
  if(fitBtn){fitBtn.hidden=zoom===1;fitBtn.textContent=(document.documentElement.lang==='th'?'พอดีจอ':'Fit')+' · '+Math.round(zoom*100)+'%';}
 }
 function pinchZoom(){
  const parent=document.getElementById('DeskParent');
  if(!parent||parent.dataset.scpPinch)return;
  parent.dataset.scpPinch='1';
  // The page sizes the picture to fit whenever the window changes; remember that size, then
  // put the zoom back on top of it.
  const original=root.deskAdjust;
  if(typeof original==='function'&&!original.scpZoom){
   root.deskAdjust=function(){
    const out=original.apply(this,arguments);
    const desk=document.getElementById('Desk');
    if(desk){const r=desk.getBoundingClientRect();if(r.width>0&&r.height>0)fit={w:r.width,h:r.height};}
    // 1 is the page's own 1:1 mode, which already scrolls; zoom only on top of fitting
    if(zoom>1&&root.deskAspectRatio!==1)zoomTo(zoom);
    return out;
   };
   root.deskAdjust.scpZoom=true;
  }
  let pinch=null;
  const span=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY)||1;
  const mid=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
  parent.addEventListener('touchstart',function(e){
   if(e.touches.length!==2||root.deskAspectRatio===1)return;
   e.preventDefault();
   if(zoom===1){const desk=document.getElementById('Desk');if(desk){const r=desk.getBoundingClientRect();fit={w:r.width,h:r.height};}}
   pinch={d0:span(e.touches),z0:zoom,m0:mid(e.touches),sl:parent.scrollLeft,st:parent.scrollTop};
  },{passive:false,capture:true});
  parent.addEventListener('touchmove',function(e){
   if(!pinch||e.touches.length!==2)return;
   e.preventDefault(); // not the browser's own page zoom
   const box=parent.getBoundingClientRect(),m=mid(e.touches);
   // the point of the picture that was between the fingers stays between them
   const cx=(pinch.sl+pinch.m0.x-box.left)/pinch.z0,cy=(pinch.st+pinch.m0.y-box.top)/pinch.z0;
   zoomTo(pinch.z0*span(e.touches)/pinch.d0);
   parent.scrollLeft=cx*zoom-(m.x-box.left);
   parent.scrollTop=cy*zoom-(m.y-box.top);
  },{passive:false,capture:true});
  const end=function(e){if(pinch&&e.touches.length<2){pinch=null;if(zoom<1.04)zoomTo(1);}};
  parent.addEventListener('touchend',end,{capture:true});
  parent.addEventListener('touchcancel',end,{capture:true});
 }

 root.ScpRemoteUI={mount(node){ensure();node.hidden=true;body.append(node);},zoomTo:zoomTo};
 // DeskParent is part of the page from the start; wait for it rather than assume the order.
 (function waitDesk(n){if(document.getElementById('DeskParent'))pinchZoom();else if(n<120)setTimeout(function(){waitDesk(n+1);},500);})(0);
 appView();
})(window);
