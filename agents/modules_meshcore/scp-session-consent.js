// A grant lives only as long as its explicitly approved desktop tunnel.
var grants = {};
function key(ws) {
 var r=ws&&ws.httprequest, id=r&&r.soptions&&r.soptions.scpSessionConsent;
 return r&&typeof r.guestname==='string'&&r.guestname.indexOf('SCP-App: ')===0&&typeof id==='string'&&/^[a-f0-9]{48}$/.test(id)?id:null;
}
exports.scoped=function(ws){return key(ws)!==null;};
exports.grant=function(ws){
 var id=key(ws);if(!id||ws.httprequest.protocol!==2)return false;
 var old=grants[id];if(old)return old.owner===ws;
 grants[id]={owner:ws,files:[]};var revoke=function(){exports.revoke(ws);};ws.once('end',revoke);ws.once('close',revoke);return true;
};
exports.join=function(ws){
 var id=key(ws),g=id&&grants[id];if(!g||!g.owner.httprequest||g.owner.scpKvmEnded||ws.httprequest.protocol!==5)return false;
 if(g.files.indexOf(ws)<0){g.files.push(ws);var remove=function(){var i=g.files.indexOf(ws);if(i>=0)g.files.splice(i,1);};ws.once('end',remove);ws.once('close',remove);}
 return true;
};
exports.revoke=function(ws){var id=key(ws),g=id&&grants[id];if(!g||g.owner!==ws)return;delete grants[id];var files=g.files.slice();g.files=[];for(var i=0;i<files.length;i++){try{files[i].close();}catch(e){}}};
