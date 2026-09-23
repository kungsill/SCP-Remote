'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
test('ending one of two desktop viewers twice preserves the other viewer and only ends KVM once',()=>{
 const source=fs.readFileSync('agents/meshcore.js','utf8');const body=source.slice(source.indexOf('function tunnel_kvm_end()'),source.indexOf('function kvm_tunnel_consentpromise_closehandler()'));
 let ended=0,disposed=0;const kvm={connectionCount:2,tunnels:[],users:[],unpipe(){},end(){ended++;}};
 const make=()=>({desktop:{kvm},httprequest:{desktop:{kvm}},unpipe(){},write(){}});const a=make(),b=make();kvm.tunnels=[a,b];
 const end=vm.runInNewContext(body+';tunnel_kvm_end;',{require:()=>({dispose(){disposed++;}}),getUserIdAndGuestNameFromHttpRequest:()=> 'admin',tunnelUserCount:{},mesh:{SendCommand(){}},broadcastSessionsToRegisteredApps(){},sendConsoleText(){}});
 end.call(a);assert.equal(kvm.connectionCount,1);assert.equal(ended,0);end.call(a);assert.equal(kvm.connectionCount,1);assert.equal(kvm.tunnels[0],b);end.call(b);end.call(b);assert.equal(ended,1);assert.equal(disposed,2);
});
