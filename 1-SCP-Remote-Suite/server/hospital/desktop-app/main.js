'use strict';
const {app,BrowserWindow,ipcMain,safeStorage,session}=require('electron');
const fs=require('fs'),path=require('path'),https=require('https'),crypto=require('crypto'),os=require('os');
const config=require('./server.json');let home,remote,token;
const ClipboardHost=require('./clipboard/local-host');
const origin=new URL(config.url).origin,pin=config.certificateSha256.replace(/:/g,'').toUpperCase();
function certMatches(cert){try{return new crypto.X509Certificate(cert).fingerprint256.replace(/:/g,'')===pin;}catch{return false;}}
function request(input){return new Promise((resolve,reject)=>{
 const req=https.request(origin+'/scp-client-api',{method:'POST',agent:false,rejectUnauthorized:false,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}},res=>{let body='';res.on('data',c=>{body+=c;if(body.length>2*1024*1024)req.destroy(Error('RESPONSE_TOO_LARGE'));});res.on('end',()=>{try{const data=JSON.parse(body);data.error?reject(Error(data.error)):resolve(data);}catch(e){reject(e);}});});
 req.on('socket',socket=>socket.once('secureConnect',()=>{const cert=socket.getPeerCertificate();if(!cert.raw||!certMatches(cert.raw)){req.destroy(Error('SERVER_CERTIFICATE_CHANGED'));return;}req.end(JSON.stringify(input));}));
 req.setTimeout(15000,()=>req.destroy(Error('SERVER_TIMEOUT')));req.on('error',reject);
 });}
function secureWindow(win){win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(win===home||new URL(url).origin!==origin)e.preventDefault();});}
app.on('certificate-error',(event,contents,url,error,certificate,callback)=>{if(new URL(url).origin===origin&&certMatches(certificate.data)){event.preventDefault();callback(true);}else callback(false);});
if(!app.requestSingleInstanceLock())app.quit();else app.on('second-instance',()=>{if(home){home.show();home.focus();}});
app.whenReady().then(()=>{
 if(!safeStorage.isEncryptionAvailable())throw Error('WINDOWS_CREDENTIAL_ENCRYPTION_UNAVAILABLE');
 const file=path.join(app.getPath('userData'),'device.key');
 if(fs.existsSync(file))token=safeStorage.decryptString(fs.readFileSync(file));else{token=crypto.randomBytes(32).toString('hex');fs.writeFileSync(file,safeStorage.encryptString(token));}
 session.defaultSession.setPermissionRequestHandler((wc,permission,callback)=>callback(false));
 const pinnedHost=new URL(config.url).hostname;
 session.defaultSession.setCertificateVerifyProc((verify,callback)=>{
  if((verify.hostname===pinnedHost)&&certMatches(verify.certificate.data)){callback(0);}else{callback(-3);}
 });
 home=new BrowserWindow({width:1180,height:820,minWidth:820,minHeight:600,title:'SCP-Remote',autoHideMenuBar:true,icon:path.join(__dirname,'scp-logo.ico'),backgroundColor:'#faf3f6',webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 secureWindow(home);home.loadFile('index.html');
 function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{if(event.sender!==home.webContents||!event.senderFrame.url.startsWith('file://'))throw Error('ACCESS_DENIED');try{return {ok:true,result:await fn(...args)};}catch(e){return {ok:false,error:e.message};}});}
 handle('scp:init',()=>request({op:'register',name:os.hostname(),autoApprove:true}));
 handle('scp:devices',()=>request({op:'devices'}));
 ipcMain.handle('scp:session-status',async(event)=>{const current=remote;if(!current||current.isDestroyed()||event.sender!==current.webContents||event.senderFrame!==current.webContents.mainFrame)throw Error('ACCESS_DENIED');const u=new URL(event.senderFrame.url);if(u.origin!==origin||u.pathname!=='/sharing')throw Error('ACCESS_DENIED');try{return {ok:true,result:await request({op:'connectionStatus',nodeid:current.scpNodeId})};}catch(e){return {ok:false,error:e.message};}});
 ipcMain.handle('scp:clipboard',async(event,command)=>{
  const current=remote;
  if(!current||current.isDestroyed()||event.sender!==current.webContents||event.senderFrame!==current.webContents.mainFrame)throw Error('ACCESS_DENIED');
  const frameUrl=new URL(event.senderFrame.url);if(frameUrl.origin!==origin||frameUrl.pathname!=='/sharing')throw Error('ACCESS_DENIED');
  try{if(!current.clipboardHost||current.clipboardHost.closed)current.clipboardHost=new ClipboardHost();return {ok:true,result:await current.clipboardHost.request(command)};}catch(e){return {ok:false,error:e.message};}
 });
 handle('scp:connect',async(nodeid,language,name,ip)=>{
  if(typeof nodeid!=='string'||nodeid.length>180)throw Error('INVALID_NODE');
  if(remote&&!remote.isDestroyed()){const previous=remote;remote=null;previous.close();}
  const data=await request({op:'connect',nodeid,language});
  const url=new URL(data.path,origin);if(url.origin!==origin||url.pathname!=='/sharing')throw Error('INVALID_SESSION');
  const winTitle = ip ? `[R] ${ip} (${name || ''}) - SCP-Remote` : (name ? `[R] ${name} - SCP-Remote` : 'SCP-Remote');
  remote=new BrowserWindow({width:1440,height:950,title:winTitle,autoHideMenuBar:true,icon:path.join(__dirname,'scp-logo.ico'),webPreferences:{preload:path.join(__dirname,'remote-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const current=remote;secureWindow(current);current.maximize();
  current.scpNodeId=nodeid;
  current.on('page-title-updated',(e)=>{e.preventDefault();current.setTitle(winTitle);});
  current.on('closed',()=>{if(current.clipboardHost)current.clipboardHost.close();if(remote===current){remote=null;request({op:'disconnect'}).catch(()=>{});}});
  await current.loadURL(url.href);
  current.setTitle(winTitle);
  await current.webContents.executeJavaScript(`(() => {
   document.body.classList.remove('scp-inline-tools');
   var hide=document.createElement('style');
   hide.textContent='#LeftSideToolBar,#deskarea1,#deskarea4,#scp-remote-dock,#scpConnection,.areaHead,.areaFoot{display:none!important;width:0!important;height:0!important;min-height:0!important;padding:0!important;margin:0!important;border:none!important} html,body{margin:0!important;padding:0!important;width:100vw!important;height:100vh!important;overflow:hidden!important;background:#000000!important} #p11{position:absolute!important;left:0!important;top:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;display:block!important} #deskarea0{position:absolute!important;left:0!important;top:0!important;padding:0!important;margin:0!important;width:100vw!important;height:100vh!important;display:block!important} #deskarea3x{position:absolute!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;max-height:100vh!important;margin:0!important;padding:0!important} #DeskParent{width:100%!important;height:100%!important;display:flex!important;align-items:center!important;justify-content:center!important} #Desk{image-rendering:auto!important} .vnc-float-toolbar{position:fixed;top:0;left:50%;transform:translateX(-50%) translateY(-100%);background:rgba(24,24,27,0.94);backdrop-filter:blur(8px);border-bottom-left-radius:8px;border-bottom-right-radius:8px;border:1px solid rgba(255,255,255,0.12);border-top:none;padding:4px 10px;display:flex;align-items:center;gap:8px;z-index:999999;box-shadow:0 8px 24px rgba(0,0,0,0.45);opacity:0;pointer-events:none;transition:transform 0.25s cubic-bezier(0.16,1,0.3,1),opacity 0.2s ease;} .vnc-float-toolbar.visible{transform:translateX(-50%) translateY(0);opacity:1;pointer-events:auto;} .vnc-toolbar-tab{position:fixed;top:0;left:50%;transform:translateX(-50%);background:rgba(24,24,27,0.7);color:rgba(255,255,255,0.75);border-bottom-left-radius:6px;border-bottom-right-radius:6px;padding:1px 18px 3px;font-size:10px;line-height:1;cursor:pointer;z-index:999998;transition:opacity 0.2s,background 0.2s;opacity:0.35;} .vnc-toolbar-tab:hover{opacity:1;background:rgba(24,24,27,0.95);} .vnc-toolbar-tab.hidden{opacity:0;pointer-events:none;} .vnc-tool-btn{background:transparent;border:none;color:#f4f4f5;cursor:pointer;padding:4px 8px;border-radius:4px;font-size:12px;display:flex;align-items:center;justify-content:center;} .vnc-tool-btn:hover{background:rgba(255,255,255,0.15);} .vnc-tool-btn.active{background:#1f40e6;color:#ffffff;} .vnc-tool-btn.danger:hover{background:#dc2626;} .vnc-tool-sep{width:1px;height:14px;background:rgba(255,255,255,0.15);margin:0 2px;}';
   document.head.appendChild(hide);

   var tb=document.createElement('div');
   tb.className='vnc-float-toolbar';
   tb.id='vncToolbar';
   tb.innerHTML='<button class="vnc-tool-btn" id="vncFs" title="เต็มหน้าจอ (Fullscreen)">⛶</button><button class="vnc-tool-btn" id="vncFit" title="ขนาดจริง / พอดีหน้าต่าง (1:1 / Fit)">1:1</button><button class="vnc-tool-btn" id="vncMaxQ" title="ความคมชัดสูงสุด (HQ 100% WebP)" style="color:#34d399;font-weight:600">HQ 100%</button><button class="vnc-tool-btn" id="vncCad" title="ส่งคำสั่ง Ctrl+Alt+Del">CAD</button><div class="vnc-tool-sep"></div><button class="vnc-tool-btn" id="vncPin" title="ตรึงแถบเครื่องมือ">📌</button><button class="vnc-tool-btn" id="vncHide" title="ซ่อนแถบเครื่องมือ">▲</button><button class="vnc-tool-btn danger" id="vncClose" title="ปิดหน้าต่างรีโมท">✕</button>';
   document.body.appendChild(tb);

   var tab=document.createElement('div');
   tab.className='vnc-toolbar-tab';
   tab.id='vncTab';
   tab.title='เลื่อนเมาส์มาที่นี่เพื่อแสดงแถบเครื่องมือ';
   tab.textContent='▾';
   document.body.appendChild(tab);

   var pinned=false;
   var hideTimeout=null;

   function showBar(){
     clearTimeout(hideTimeout);
     tb.classList.add('visible');
     tab.classList.add('hidden');
   }

   function hideBar(){
     if(pinned)return;
     clearTimeout(hideTimeout);
     tb.classList.remove('visible');
     tab.classList.remove('hidden');
   }

   function scheduleHide(){
     if(pinned)return;
     clearTimeout(hideTimeout);
     hideTimeout=setTimeout(hideBar,600);
   }

   tab.onclick=showBar;
   tab.onmouseenter=showBar;
   tb.onmouseenter=function(){clearTimeout(hideTimeout);};
   tb.onmouseleave=scheduleHide;

   document.addEventListener('mousemove',function(e){
     if(e.clientY<=10){
       showBar();
     }else if(e.clientY>60&&!tb.contains(e.target)&&!tab.contains(e.target)){
       scheduleHide();
     }
   });

   document.getElementById('vncHide').onclick=function(){
     pinned=false;
     document.getElementById('vncPin').classList.remove('active');
     hideBar();
   };

   document.getElementById('vncPin').onclick=function(){
     pinned=!pinned;
     this.classList.toggle('active',pinned);
     if(pinned){showBar();}else{scheduleHide();}
   };

   document.getElementById('vncFs').onclick=function(){ if(!document.fullscreenElement){document.documentElement.requestFullscreen();}else{document.exitFullscreen();} };
   document.getElementById('vncFit').onclick=function(){ window.deskAspectRatio = (window.deskAspectRatio === 1 ? 0 : 1); this.textContent = (window.deskAspectRatio === 1 ? 'Fit' : '1:1'); if(window.deskAdjust) deskAdjust(); };
   document.getElementById('vncMaxQ').onclick=function(){ if(window.desktop && window.desktop.m && window.desktop.m.SendCompressionLevel){ window.desktop.m.SendCompressionLevel(4, 100, 1024, 50); if(window.desktop.m.SendRefresh) window.desktop.m.SendRefresh(); } };
   document.getElementById('vncCad').onclick=function(){ if(window.sendCAD) sendCAD(); else if(window.meshserver) meshserver.send({action:'msg',type:'cad'}); };
   document.getElementById('vncClose').onclick=function(){ window.close(); };

   window.scpLanReady=${config.directLan!==false&&data.lan===true};
   desktopsettings.agentencoding=4;desktopsettings.quality=100;desktopsettings.scaling=1024;desktopsettings.framerate=50;
   try{localStorage.setItem('desktopsettings',JSON.stringify(desktopsettings));}catch(e){}
   var original=CreateAgentRemoteDesktop;CreateAgentRemoteDesktop=function(){
    var m=original.apply(this,arguments);
    m.ImageType=4;m.CompressionLevel=100;m.ScalingLevel=1024;m.FrameRateTimer=50;
    var origSendComp=m.SendCompressionLevel;
    m.SendCompressionLevel=function(type,level,scaling,frametimer){return origSendComp.call(m,4,100,1024,50);};
    return m;
   };
   var tries=0,timer=setInterval(function(){var b=document.getElementById('connectbutton1');if(b&&!b.disabled){clearInterval(timer);connectDesktop(null,3);if(window.deskAdjust)setTimeout(deskAdjust,200);setTimeout(function(){if(window.desktop&&window.desktop.m&&window.desktop.m.SendCompressionLevel){window.desktop.m.SendCompressionLevel(4,100,1024,50);if(window.desktop.m.SendRefresh)window.desktop.m.SendRefresh();}},600);setTimeout(function(){if(window.desktop&&window.desktop.m&&window.desktop.m.SendCompressionLevel){window.desktop.m.SendCompressionLevel(4,100,1024,50);if(window.desktop.m.SendRefresh)window.desktop.m.SendRefresh();}},1800);}else if(++tries>=60){clearInterval(timer);}},500);
   window.addEventListener('resize',function(){if(window.deskAdjust)deskAdjust();});
  })()`);
  try { await current.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'inject-filedrop.js'),'utf8')); } catch (e) { }
  await current.webContents.executeJavaScript('window.scpClipboardLanguage='+JSON.stringify(language==='en'?'en':'th')+';window.scpClipboardReady='+(data.clipboard===true)+';'+fs.readFileSync(path.join(__dirname,'clipboard-transfer.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'inject-clipboard.js'),'utf8'));
  await current.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'session-health.js'),'utf8'));
  await current.webContents.executeJavaScript('try{var sel=document.querySelector("#scp-session-health select");if(sel){sel.value="0";}}catch(e){}');
  return {opened:true};
 });
 home.on('closed',()=>{if(remote&&!remote.isDestroyed())remote.close();home=null;});
}).catch(e=>{require('electron').dialog.showErrorBox('SCP-Remote',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
