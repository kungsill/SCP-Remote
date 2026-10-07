const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('scp',{
  init:()=>ipcRenderer.invoke('scp:init'),
  devices:()=>ipcRenderer.invoke('scp:devices'),
  connect:(nodeid,language,name,ip)=>ipcRenderer.invoke('scp:connect',nodeid,language,name,ip)
});
