'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {model}=require('../../public/scripts/scp-progress');
test('stage progress is explicitly weighted and item progress uses the reported denominator',()=>{assert.equal(model('download',3,6).percent,37);assert.equal(model('download',3,6).phase,50);assert.equal(model('cleaning',5,10).percent,62);assert.equal(model('scanning').phase,null);});
test('only a confirmed complete result can show 100 percent',()=>{assert.equal(model('install',10,10).percent,75);assert.equal(model('summarizing').percent,75);assert.equal(model('summarizing',null,null,true).percent,100);assert.ok(model('cleaning',10,10,true,true).percent<100);assert.equal(model('download',1,0).phase,null);});
