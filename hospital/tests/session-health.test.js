'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),health=require('../../public/scripts/scp-session');
test('session diagnosis separates offline, server, agent, permission and image failures',()=>{
 assert.equal(health.diagnose({online:false,state:3}),'offline');
 assert.equal(health.diagnose({state:1,age:21000}),'serverTimeout');
 assert.equal(health.diagnose({state:2,age:31000}),'agentTimeout');
 assert.equal(health.diagnose({state:3,messageId:1,age:1000}),'consent');
 assert.equal(health.diagnose({state:3,messageId:1,age:91000}),'consentTimeout');
 assert.equal(health.diagnose({state:3,messageId:2,message:'User denied access'}),'denied');
 assert.equal(health.diagnose({state:3,messageId:2,message:'Unknown error'}),'refused');
 assert.equal(health.diagnose({state:3,age:31000,tiles:0}),'imageTimeout');
 assert.equal(health.diagnose({state:3,age:60000,tiles:1}),'ready');
});
test('adaptive quality uses latency or decoder backlog, never treats an idle screen as slow',()=>{assert.equal(health.quality({rtt:450,backlog:0},0),2);assert.equal(health.quality({rtt:200,backlog:0},0),1);assert.equal(health.quality({rtt:40,backlog:25},0),2);assert.equal(health.quality({rtt:20,backlog:0},2),1);assert.equal(health.quality({rtt:null,backlog:0},0),0);});

// The quality ladder is applied on every session, so what it holds is what a technician
// actually sees. It lives in module scope and is not exported, so read it from the source.
const fs=require('fs'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../../public/scripts/scp-session.js'),'utf8');
function ladder(){
 const m=/const profiles=(\[\[[^;]*\]\]);/.exec(source);
 assert.ok(m,'the quality ladder should still be a literal in scp-session.js');
 return JSON.parse(m[1]);
}
// SendCompressionLevel(agentencoding, quality, scaling, framerate); 1 JPEG, 2 PNG, 3 TIFF, 4 WEBP.
const WEBP=4,PNG=2;

test('every rung of the quality ladder stays on WEBP, the encoding the hospital chose',()=>{
 // A previous ladder opened every session on PNG, undoing the deliberate WEBP decision
 // recorded beside scpDesktopQuality3 in views/default.handlebars a few tiles into the
 // session, where nobody would connect the two.
 for(const [encoding,,,] of ladder()){
  assert.notEqual(encoding,PNG,'PNG is the traffic the WEBP decision was made to avoid');
  assert.equal(encoding,WEBP,'the ladder trades quality and size, not the encoding');
 }
});

test('the ladder gives up quality first and size only at the bottom',()=>{
 const rungs=ladder();
 assert.equal(rungs.length,3,'Sharp, Balanced, Low bandwidth');
 const quality=rungs.map(r=>r[1]),scaling=rungs.map(r=>r[2]),framerate=rungs.map(r=>r[3]);
 for(let i=1;i<rungs.length;i++){
  assert.ok(quality[i]<quality[i-1],'each rung asks for less quality than the one above');
  assert.ok(scaling[i]<=scaling[i-1],'and never a larger image');
  assert.ok(framerate[i]>framerate[i-1],'and a longer gap between frames');
 }
 assert.equal(scaling[0],1024,'Sharp is full size');
 assert.equal(quality[0],100,'Sharp matches the quality the hospital settled on');
});

test('Sharp agrees with the desktop defaults the page sets, rather than silently overriding them',()=>{
 // scp-session.js applies Sharp as soon as the first tile arrives, so if the two disagree the
 // page's own default is the one that loses, without anything saying so.
 const page=fs.readFileSync(path.join(__dirname,'../../views/default.handlebars'),'utf8');
 const m=/var desktopsettings = \{([^}]*)\}/.exec(page);
 assert.ok(m,'desktopsettings should still be a literal in default.handlebars');
 const settings={};
 for(const pair of m[1].split(',')){const kv=/^\s*([a-z]+)\s*:\s*(\d+)\s*$/.exec(pair);if(kv)settings[kv[1]]=Number(kv[2]);}
 const read=key=>{assert.ok(key in settings,'desktopsettings.'+key+' should still be a number');return settings[key];};
 const [encoding,quality,scaling,framerate]=ladder()[0];
 assert.equal(encoding,read('agentencoding'));
 assert.equal(quality,read('quality'));
 assert.equal(scaling,read('scaling'));
 assert.equal(framerate,read('framerate'));
});
