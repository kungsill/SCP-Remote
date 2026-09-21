'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{transfer}=require('../desktop-app/clipboard-transfer');
test('file clipboard waits for every acknowledged chunk, then commits (including zero-byte files)',async()=>{
 const calls=[],progress=[];const entries=[{path:'folder',directory:true,size:0},{path:'folder/empty',directory:false,size:0},{path:'folder/data',directory:false,size:5}];
 let bytes=0;const src=async c=>{assert.equal(c.job,'source');return {data:'YWE=',sha256:'hash',length:Math.min(2,5-c.offset)};};
 const dst=async c=>{calls.push(c.op);if(c.op==='prepare'){assert.deepEqual(c.entries,entries);return {job:'destination'};}if(c.op==='write'){assert.equal(c.index,2);assert.equal(c.offset,bytes);bytes+=Math.min(2,5-c.offset);return {offset:bytes};}if(c.op==='commit'){assert.equal(bytes,5);return {ready:true};}throw Error(c.op);};
 await transfer(src,dst,{job:'source',entries},42,p=>progress.push(p),{});
 assert.deepEqual(calls,['prepare','write','write','write','commit']);assert.equal(progress.at(-1).percent,100);assert.equal(progress.at(-1).verifying,true);
});
test('file clipboard aborts staging and never commits after corrupted acknowledgements',async()=>{
 const calls=[];await assert.rejects(transfer(async()=>({length:1,data:'AA==',sha256:'hash'}),async c=>{calls.push(c.op);return c.op==='prepare'?{job:'x'}:{offset:10};},{job:'s',entries:[{path:'x',size:1}]},0,()=>{},{}),/INVALID_ACK/);assert.deepEqual(calls,['prepare','write','abort']);
});
test('file clipboard cancellation between chunks leaves no ready clipboard',async()=>{
 const signal={},calls=[];await assert.rejects(transfer(async()=>{signal.cancelled=true;return {length:1};},async c=>{calls.push(c.op);return {job:'x'};},{job:'s',entries:[{path:'x',size:1}]},0,()=>{},signal),/CANCELLED/);assert.deepEqual(calls,['prepare','abort']);
});
test('file clipboard preserves commit errors and cleans partial transfer',async()=>{
 const calls=[];await assert.rejects(transfer(async()=>{},async c=>{calls.push(c.op);if(c.op==='commit')throw Error('CLIPBOARD_CHANGED');return {job:'x'};},{job:'s',entries:[{path:'zero',size:0}]},0,()=>{},{}),/CLIPBOARD_CHANGED/);assert.deepEqual(calls,['prepare','commit','abort']);
});
