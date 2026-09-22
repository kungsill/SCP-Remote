'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),api=require('../desktop-clients'),policy=require('../consent-policy');
function setup(){const rows=new Map(),events=[];const db={Get:(id,cb)=>cb(null,rows.has(id)?[structuredClone(rows.get(id))]:[]),Set:(r,cb)=>{rows.set(r._id,structuredClone(r));if(cb)cb();},Remove:(id,cb)=>{rows.delete(id);cb();},GetAllTypeNoTypeField:(type,domain,cb)=>cb(null,[...rows.values()].filter(r=>r.type===type&&r.domain===domain).map(r=>{const copy=structuredClone(r);delete copy.type;return copy;}))};const user={_id:'user//admin',siteadmin:0xFFFFFFFF,domain:''},web={db,users:{[user._id]:user},meshes:{'mesh//a':{_id:'mesh//a',name:'Room A',domain:''},'mesh//b':{_id:'mesh//b',name:'Room B',domain:''}},wsagents:{'node//a':{authenticated:2}},CreateNodeDispatchTargets:(m,n)=>[m,n],parent:{encodeCookie:()=> 'signed-cookie',DispatchEvent:(targets,source,event)=>events.push({targets,event})}};for(const x of ['a','b'])rows.set('node//'+x,{_id:'node//'+x,type:'node',domain:'',meshid:'mesh//'+x,name:'PC '+x,agent:{scpRelease:'2026.09.20.2'},host:'192.168.1.'+(x==='a'?1:2)});return {web,ctx:{db,parent:web,user,domain:{id:''}},rows,events,token:'a'.repeat(64)};}
async function registered(s){await api.api(s.web,{op:'register',name:'IT-TEST'},s.token);return [...s.rows.values()].find(r=>r.type==='scpclient');}
async function approved(s){const c=await registered(s);await api.handle(s.ctx,{op:'desktopClientApprove',id:c._id,rooms:['mesh//a']});return c;}
test('file clipboard is enabled only after the agent reports a supporting core release',async()=>{const s=setup();await approved(s);assert.equal((await api.api(s.web,{op:'connect',nodeid:'node//a'},s.token)).clipboard,false);s.rows.get('node//a').agent.scpRelease='2026.09.21.1';assert.equal((await api.api(s.web,{op:'connect',nodeid:'node//a'},s.token)).clipboard,true);});
test('direct transport requires both the supporting core and native ECDSA capability',async()=>{const s=setup();await approved(s);const n=s.rows.get('node//a');n.agent.scpRelease='2026.09.21.5';assert.equal((await api.api(s.web,{op:'connect',nodeid:'node//a'},s.token)).lan,false);n.agent.scpLanNative=true;assert.equal((await api.api(s.web,{op:'connect',nodeid:'node//a'},s.token)).lan,true);n.agent.scpRelease='2026.09.21.4';assert.equal((await api.api(s.web,{op:'connect',nodeid:'node//a'},s.token)).lan,false);});
test('registration stores only credential hash and cannot list or connect until approved',async()=>{const s=setup(),c=await registered(s);assert.equal(c.state,'pending');assert.ok(!JSON.stringify(c).includes(s.token));await assert.rejects(api.api(s.web,{op:'devices'},s.token),/APPROVAL_REQUIRED/);await assert.rejects(api.api(s.web,{op:'connect',nodeid:'node//a'},s.token),/APPROVAL_REQUIRED/);});
test('only main-domain superadmin may approve registered apps',async()=>{const s=setup(),c=await registered(s);await assert.rejects(api.handle({...s.ctx,user:{siteadmin:0}},{op:'desktopClientApprove',id:c._id,rooms:['mesh//a']}),/ACCESS_DENIED/);await assert.rejects(api.handle(s.ctx,{op:'desktopClientApprove',id:c._id,rooms:[]}),/SELECT_ROOMS/);});
test('registered app gets only rooms and devices explicitly approved',async()=>{const s=setup();await approved(s);const list=await api.api(s.web,{op:'devices'},s.token);assert.deepEqual(list.nodes.map(n=>n.id),['node//a']);assert.equal(list.nodes[0].online,true);await assert.rejects(api.api(s.web,{op:'connect',nodeid:'node//b'},s.token),/ACCESS_DENIED/);});
// The session still asks the person to approve the remote desktop (bit 8) and keeps the
// disconnect bar (bit 64). Files no longer raise a second approval of their own (no bit 32) --
// once the person has consented to a full-control desktop they can already reach any file, so
// the extra prompt was friction -- but files still NOTIFY (bit 4), so the person is told that
// files are being accessed, not just the screen watched. This was the operator's explicit call.
// The administrator can opt an installation into every room with '*', so a room made after
// the approval -- and an empty one waiting for its first computer -- shows up without another
// approval. It is a deliberate widening; the remote session still needs consent at the machine.
test("approving all rooms with '*' shows every room, including empty or later-made ones",async()=>{
  const s=setup();
  s.web.meshes['mesh//c']={_id:'mesh//c',name:'Room C',domain:''}; // a new, still-empty department
  const c=await registered(s);
  await api.handle(s.ctx,{op:'desktopClientApprove',id:c._id,rooms:'*'});
  assert.equal(s.rows.get(c._id).rooms,'*','the grant is stored as the wildcard, not a fixed list');
  const list=await api.api(s.web,{op:'devices'},s.token);
  assert.deepEqual(list.rooms.map(r=>r.id).sort(),['mesh//a','mesh//b','mesh//c'],'all rooms show, empty one included');
  assert.deepEqual(list.nodes.map(n=>n.id).sort(),['node//a','node//b'],'devices from every room are visible');
});
test("a '*' grant can connect into a room it was never explicitly listed for",async()=>{
  const s=setup();s.web.wsagents['node//b']={authenticated:2};const c=await registered(s);
  await api.handle(s.ctx,{op:'desktopClientApprove',id:c._id,rooms:'*'});
  const r=await api.api(s.web,{op:'connect',nodeid:'node//b'},s.token);
  assert.match(r.path,/^\/sharing\?c=/,'the wildcard reaches node//b, which no explicit list here named');
});
test('the session still needs desktop consent and keeps the bar; files notify but no longer prompt',async()=>{const s=setup();await approved(s);const result=await api.api(s.web,{op:'connect',nodeid:'node//a'},s.token);assert.match(result.path,/^\/sharing\?c=/);const share=[...s.rows.values()].find(r=>r.type==='deviceshare');assert.equal(share.p,6);assert.equal(share.consent&8,8);assert.equal(share.consent&64,64);assert.equal(share.consent&4,4);assert.equal(share.consent&32,0);assert.match(share.guestName,/^SCP-App: IT-TEST/);assert.ok(share.expireTime>Date.now());});
test('revocation removes active shares, signals the node relay and denies reuse',async()=>{const s=setup(),c=await approved(s);await api.api(s.web,{op:'connect',nodeid:'node//a'},s.token);await api.handle(s.ctx,{op:'desktopClientRevoke',id:c._id});assert.equal([...s.rows.values()].filter(r=>r.type==='deviceshare').length,0);assert.ok(s.events.some(e=>e.event.action==='removedDeviceShare'&&e.targets.includes('node//a')));await assert.rejects(api.api(s.web,{op:'devices'},s.token),/CLIENT_REVOKED/);});
test('app shares cannot inherit unattended or auto-accept even for the administrator',()=>{const c={type:'tunnel',guestname:'SCP-App: IT [123456]',value:'*/meshrelay.ashx?p=2',soptions:{scpUnattended:true,consentAutoAccept:true,consentAutoAcceptIfNoUser:true,consentAutoAcceptIfLocked:true}};policy.apply(c,{id:'',unattendedadmins:['user//admin']},{_id:'user//admin',domain:'',siteadmin:0xFFFFFFFF});assert.equal(c.consent&8,8);assert.equal(c.soptions.scpUnattended,undefined);assert.equal(c.soptions.consentAutoAccept,false);assert.equal(c.soptions.consentAutoAcceptIfNoUser,false);assert.equal(c.soptions.consentAutoAcceptIfLocked,false);assert.match(c.value,/scpnomux=1/);});
test('device positions require an existing device and bounded integer coordinates',async()=>{const s=setup();await assert.rejects(api.handle(s.ctx,{op:'desktopLayoutSave',nodeid:'node//a',x:10,y:0}),/INVALID_POSITION/);await api.handle(s.ctx,{op:'desktopLayoutSave',nodeid:'node//a',x:2,y:3});await approved(s);const list=await api.api(s.web,{op:'devices'},s.token);assert.equal(list.nodes[0].position.x,2);});

test('clients cannot remote into agents that may reuse old consent cache',async()=>{const s=setup();await approved(s);const n=s.rows.get('node//a');n.agent.scpRelease='2026.09.16.6';await assert.rejects(api.api(s.web,{op:'connect',nodeid:'node//a'},s.token),/AGENT_UPDATE_REQUIRED/);assert.equal([...s.rows.values()].filter(r=>r.type==='deviceshare').length,0);});

// The share borrows the approving administrator's account to exist, but the person working
// the app is whoever that installation was handed to. The computer must name that person.
test('the name the computer shows is the one the administrator gave that installation',async()=>{
  const s=setup(),c=await registered(s);
  await api.handle(s.ctx,{op:'desktopClientApprove',id:c._id,rooms:['mesh//a'],label:'IT - หัวหน้า'});
  await api.api(s.web,{op:'connect',nodeid:'node//a'},s.token);
  const share=[...s.rows.values()].find(r=>r.type==='deviceshare');
  assert.ok(share.guestName.indexOf('IT - หัวหน้า')>=0,'the label is what the computer shows');
  assert.ok(share.guestName.indexOf('IT-TEST')<0,'the computer name it registered under is not shown instead');
});

test('a blank name falls back to the computer the app registered from',async()=>{
  const s=setup(),c=await registered(s);
  await api.handle(s.ctx,{op:'desktopClientApprove',id:c._id,rooms:['mesh//a'],label:'   '});
  await api.api(s.web,{op:'connect',nodeid:'node//a'},s.token);
  const share=[...s.rows.values()].find(r=>r.type==='deviceshare');
  assert.ok(share.guestName.indexOf('IT-TEST')>=0);
});

test('a name too long for the consent box is refused rather than truncated',async()=>{
  const s=setup(),c=await registered(s);
  await assert.rejects(api.handle(s.ctx,{op:'desktopClientApprove',id:c._id,rooms:['mesh//a'],label:'x'.repeat(61)}),/LABEL_TOO_LONG/);
  assert.notEqual(s.rows.get(c._id).state,'approved','a refused name leaves the app unapproved');
});

// Without this the box on the watched computer reads the account owner, so a supervisor
// running the app would appear to that person as the administrator who approved it.
test('an app session is named by itself in the agent, never by the account it borrows',()=>{
  const source=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../agents/meshcore.js'),'utf8');
  assert.ok(source.indexOf("var scpAppSession = (typeof data.guestname === 'string')")>=0,'app sessions are recognised');
  assert.ok(source.indexOf('tunnel.realname = scpAppSession ? data.guestname :')>=0,'their real name is the guest name alone');
  assert.ok(source.indexOf('tunnel.username = scpAppSession ? data.guestname :')>=0,'and so is the user name');
});
