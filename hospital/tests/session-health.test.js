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
