'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('scpClipboard',Object.freeze({request:command=>ipcRenderer.invoke('scp:clipboard',command)}));
