'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('a busy agent returns a correlated failure instead of silently dropping a job',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../agents/meshcore.js'),'utf8');const start=source.indexOf("case 'runcommands': {");const end=source.indexOf('// data.runAsUser:',start);const body=source.slice(start,end);const sent=[];vm.runInNewContext("switch('runcommands'){"+body+'}}',{mesh:{cmdchild:{},SendCommand:m=>sent.push(m)},data:{reply:true,sessionid:'session',responseid:'scpfix1_123'},sendConsoleText:()=>{throw Error('Unexpected console-only response');}});assert.equal(sent.length,1);assert.equal(sent[0].responseid,'scpfix1_123');assert.match(sent[0].result,/COMMAND_BUSY/);
});
