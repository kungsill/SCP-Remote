/* Shared by the renderer and the protocol tests. No filesystem access here. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.scpTransfer=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 async function transfer(source,destination,snapshot,sequence,progress,signal){
  const entries=snapshot.entries;
  if(!Array.isArray(entries)||entries.length===0)throw Error('EMPTY_CLIPBOARD');
  const total=entries.reduce((n,e)=>n+e.size,0);let done=0,job;
  function check(){if(signal.cancelled)throw Error('CANCELLED');}
  try{
   check();job=(await destination({op:'prepare',entries,sequence})).job;
   for(let index=0;index<entries.length;index++){
    const e=entries[index];if(e.directory)continue;
    let offset=0;
    while(offset<e.size){
     check();const block=await source({op:'read',job:snapshot.job,index,offset});
     if(!Number.isSafeInteger(block.length)||block.length<1||block.length>131072||block.length>e.size-offset)throw Error('INVALID_CHUNK');
     check();const ack=await destination({op:'write',job,index,offset,data:block.data,sha256:block.sha256});
     if(ack.offset!==offset+block.length)throw Error('INVALID_ACK');
     offset=ack.offset;done+=block.length;progress({done,total,index:index+1,count:entries.length,name:e.path,percent:total?Math.floor(done*100/total):100});
    }
   }
   check();progress({done,total,percent:100,verifying:true});
   const result=await destination({op:'commit',job});
   if(!result.ready)throw Error('COMMIT_FAILED');return result;
  }catch(e){if(job)await destination({op:'abort',job}).catch(()=>{});throw e;}
 }
 return {transfer};
});
