/* Shared by the renderer and the protocol tests. No filesystem access here. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.scpTransfer=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // The transfer used to read a 128 KB chunk, send it, and wait for the far side to acknowledge
 // before reading the next -- one full round trip per chunk, so a file crawled at the speed of
 // the relay's latency. The far helper already accepts several requests at once (it caps at four)
 // and processes them in order, one at a time, so we keep a few writes in flight instead of
 // waiting for each. Same bytes, same order, same acknowledgements checked in order -- just the
 // relay's waiting time overlapped instead of paid chunk by chunk.
 const WINDOW=3; // stay safely under the far helper's four-request limit
 async function transfer(source,destination,snapshot,sequence,progress,signal){
  const entries=snapshot.entries;
  if(!Array.isArray(entries)||entries.length===0)throw Error('EMPTY_CLIPBOARD');
  const total=entries.reduce((n,e)=>n+e.size,0);let done=0,job;
  const inflight=[]; // writes issued but not yet acknowledged, in the order they were sent
  function check(){if(signal.cancelled)throw Error('CANCELLED');}
  async function drainOne(){
   const w=inflight.shift();
   const ack=await w.promise;
   if(ack.offset!==w.offset+w.length)throw Error('INVALID_ACK');
   done+=w.length;
   progress({done,total,index:w.index+1,count:entries.length,name:w.path,percent:total?Math.floor(done*100/total):100});
  }
  try{
   check();job=(await destination({op:'prepare',entries,sequence})).job;
   for(let index=0;index<entries.length;index++){
    const e=entries[index];if(e.directory)continue;
    let offset=0;
    while(offset<e.size){
     check();const block=await source({op:'read',job:snapshot.job,index,offset});
     if(!Number.isSafeInteger(block.length)||block.length<1||block.length>131072||block.length>e.size-offset)throw Error('INVALID_CHUNK');
     check(); // a cancel during the read must stop us before this write is sent
     const promise=destination({op:'write',job,index,offset,data:block.data,sha256:block.sha256});
     promise.catch(function(){}); // drainOne still sees the rejection; this only keeps a queued failure from looking unhandled
     inflight.push({promise,offset,length:block.length,index,path:e.path});
     offset+=block.length;
     while(inflight.length>=WINDOW)await drainOne();
    }
   }
   while(inflight.length)await drainOne();
   check();progress({done,total,percent:100,verifying:true});
   const result=await destination({op:'commit',job});
   if(!result.ready)throw Error('COMMIT_FAILED');return result;
  }catch(e){
   if(inflight.length)await Promise.allSettled(inflight.map(function(w){return w.promise;})); // let queued writes settle before undoing
   if(job)await destination({op:'abort',job}).catch(()=>{});
   throw e;
  }
 }
 return {transfer};
});
