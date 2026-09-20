'use strict';
const {app,BrowserWindow,ipcMain,safeStorage,session}=require('electron');
const fs=require('fs'),path=require('path'),https=require('https'),crypto=require('crypto'),os=require('os');
const config=require('./server.json');let home,remote,token;
const origin=new URL(config.url).origin,pin=config.certificateSha256.replace(/:/g,'').toUpperCase();
function certMatches(cert){try{return new crypto.X509Certificate(cert).fingerprint256.replace(/:/g,'')===pin;}catch{return false;}}
function request(input){return new Promise((resolve,reject)=>{
 const req=https.request(origin+'/scp-client-api',{method:'POST',agent:false,rejectUnauthorized:false,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}},res=>{let body='';res.on('data',c=>{body+=c;if(body.length>2*1024*1024)req.destroy(Error('RESPONSE_TOO_LARGE'));});res.on('end',()=>{try{const data=JSON.parse(body);data.error?reject(Error(data.error)):resolve(data);}catch(e){reject(e);}});});
 // Do not send the device credential before verifying the pinned hospital certificate.
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
 // The certificate-error event above is never raised for WebSocket connections, so the remote
 // desktop tunnel to meshrelay.ashx died on ERR_CERT_AUTHORITY_INVALID while the page around it
 // loaded fine -- a dead end that showed the operator nothing at all. Session verification does
 // cover the tunnel. It accepts nothing beyond the certificate already pinned in server.json, on
 // that host alone; everything else keeps the verdict Chromium reached on its own.
 const pinnedHost=new URL(config.url).hostname;
 session.defaultSession.setCertificateVerifyProc((verify,callback)=>{
  if((verify.hostname===pinnedHost)&&certMatches(verify.certificate.data)){callback(0);}else{callback(-3);}
 });
 home=new BrowserWindow({width:1180,height:820,minWidth:820,minHeight:600,title:'SCP-Remote',autoHideMenuBar:true,backgroundColor:'#f3f7fa',webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 secureWindow(home);home.loadFile('index.html');
 function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{if(event.sender!==home.webContents||!event.senderFrame.url.startsWith('file://'))throw Error('ACCESS_DENIED');try{return {ok:true,result:await fn(...args)};}catch(e){return {ok:false,error:e.message};}});}
 handle('scp:init',()=>request({op:'register',name:os.hostname()}));
 handle('scp:devices',()=>request({op:'devices'}));
 handle('scp:connect',async(nodeid,language)=>{
  if(typeof nodeid!=='string'||nodeid.length>180)throw Error('INVALID_NODE');
  if(remote&&!remote.isDestroyed()){const previous=remote;remote=null;previous.close();}
  const data=await request({op:'connect',nodeid,language});
  const url=new URL(data.path,origin);if(url.origin!==origin||url.pathname!=='/sharing')throw Error('INVALID_SESSION');
  remote=new BrowserWindow({width:1440,height:950,title:'SCP-Remote — '+(language==='en'?'Remote desktop':'หน้าจอรีโมต'),autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const current=remote;secureWindow(current);
  current.on('closed',()=>{if(remote===current){remote=null;request({op:'disconnect'}).catch(()=>{});}});
  await current.loadURL(url.href);
  await current.webContents.executeJavaScript(`(() => {
   // Staff see the screen they came for, not the controls the sharing page carries for an
   // administrator. The bar holds Connect, Disconnect, Settings and the share expiry; the
   // window close button already ends the session, so nothing here is the only way out.
   // The picture area is sized against that bar, so it has to reclaim the height as well.
   var hide=document.createElement('style');
   hide.textContent='#deskarea1{display:none!important}#deskarea3x{max-height:100vh!important;height:100vh!important}';
   document.head.appendChild(hide);
   desktopsettings.quality=90;desktopsettings.scaling=1024;desktopsettings.framerate=50;
   var original=CreateAgentRemoteDesktop;CreateAgentRemoteDesktop=function(){var m=original.apply(this,arguments);m.ImageType=2;return m;};
   var tries=0,timer=setInterval(function(){var b=document.getElementById('connectbutton1');if(b&&!b.disabled){clearInterval(timer);connectDesktop(null,3);}else if(++tries>=60){clearInterval(timer);}},500);
  })()`);
  return {opened:true};
 });
 home.on('closed',()=>{if(remote&&!remote.isDestroyed())remote.close();home=null;});
}).catch(e=>{require('electron').dialog.showErrorBox('SCP-Remote',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
