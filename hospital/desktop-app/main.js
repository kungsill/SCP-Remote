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
  const current=remote;secureWindow(current);
  current.scpNodeId=nodeid;
  current.on('page-title-updated',(e)=>{e.preventDefault();current.setTitle(winTitle);});
  current.on('closed',()=>{if(current.clipboardHost)current.clipboardHost.close();if(remote===current){remote=null;request({op:'disconnect'}).catch(()=>{});}});
  await current.loadURL(url.href);
  current.setTitle(winTitle);
  await current.webContents.executeJavaScript(`(() => {
   document.body.classList.remove('scp-inline-tools');
   var hide=document.createElement('style');
   hide.textContent='#LeftSideToolBar,#deskarea1,#deskarea4,#scp-remote-dock,#scpConnection,.areaHead,.areaFoot{display:none!important;width:0!important;height:0!important;min-height:0!important;padding:0!important;margin:0!important;border:none!important} html,body{margin:0!important;padding:0!important;width:100vw!important;height:100vh!important;overflow:hidden!important;background:#000000!important} #p11{position:absolute!important;left:0!important;top:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;display:block!important} #deskarea0{position:absolute!important;left:0!important;top:0!important;padding:0!important;margin:0!important;width:100vw!important;height:100vh!important;display:block!important} #deskarea3x{position:absolute!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;max-height:100vh!important;margin:0!important;padding:0!important} #DeskParent{width:100%!important;height:100%!important;display:flex!important;align-items:center!important;justify-content:center!important} #Desk{image-rendering:-webkit-optimize-contrast!important;image-rendering:crisp-edges!important} .vnc-float-toolbar{position:fixed;top:0;left:50%;transform:translateX(-50%);background:rgba(30,30,30,0.88);backdrop-filter:blur(6px);border-bottom-left-radius:8px;border-bottom-right-radius:8px;padding:4px 12px;display:flex;gap:10px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);opacity:0.35;transition:opacity 0.2s;} .vnc-float-toolbar:hover{opacity:1;} .vnc-tool-btn{background:transparent;border:none;color:#ffffff;cursor:pointer;padding:4px 8px;border-radius:4px;font-size:12px;display:flex;align-items:center;justify-content:center;} .vnc-tool-btn:hover{background:rgba(255,255,255,0.2);} .vnc-tool-btn.danger:hover{background:#dc2626;}';
   document.head.appendChild(hide);

   var tb=document.createElement('div');
   tb.className='vnc-float-toolbar';
   tb.innerHTML='<button class="vnc-tool-btn" id="vncFs" title="Fullscreen">⛶</button><button class="vnc-tool-btn" id="vncFit" title="1:1 Actual Size / Fit Window">1:1</button><button class="vnc-tool-btn" id="vncMaxQ" title="Maximum Quality (100% WebP)" style="color:#34d399;font-weight:600">HQ 100%</button><button class="vnc-tool-btn" id="vncCad" title="Send Ctrl+Alt+Del">CAD</button><button class="vnc-tool-btn danger" id="vncClose" title="End Session">✕</button>';
   document.body.appendChild(tb);

   document.getElementById('vncFs').onclick=function(){ if(!document.fullscreenElement){document.documentElement.requestFullscreen();}else{document.exitFullscreen();} };
   document.getElementById('vncFit').onclick=function(){ window.deskAspectRatio = (window.deskAspectRatio === 1 ? 0 : 1); this.textContent = (window.deskAspectRatio === 1 ? 'Fit' : '1:1'); if(window.deskAdjust) deskAdjust(); };
   document.getElementById('vncMaxQ').onclick=function(){ if(window.desktop && window.desktop.m && window.desktop.m.SendCompressionLevel){ window.desktop.m.SendCompressionLevel(4, 100, 1024, 50); if(window.desktop.m.SendRefresh) window.desktop.m.SendRefresh(); } };
   document.getElementById('vncCad').onclick=function(){ if(window.sendCAD) sendCAD(); else if(window.meshserver) meshserver.send({action:'msg',type:'cad'}); };
   document.getElementById('vncClose').onclick=function(){ window.close(); };

   window.scpLanReady=${config.directLan!==false&&data.lan===true};
   desktopsettings.agentencoding=4;desktopsettings.quality=100;desktopsettings.scaling=1024;desktopsettings.framerate=50;
   var original=CreateAgentRemoteDesktop;CreateAgentRemoteDesktop=function(){
    var m=original.apply(this,arguments);
    m.ImageType=4;m.CompressionLevel=100;m.ScalingLevel=1024;m.FrameRateTimer=50;
    var origSendComp=m.SendCompressionLevel;
    m.SendCompressionLevel=function(type,level,scaling,frametimer){return origSendComp.call(m,4,100,1024,50);};
    return m;
   };
   var tries=0,timer=setInterval(function(){var b=document.getElementById('connectbutton1');if(b&&!b.disabled){clearInterval(timer);connectDesktop(null,3);if(window.deskAdjust)setTimeout(deskAdjust,200);}else if(++tries>=60){clearInterval(timer);}},500);
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
