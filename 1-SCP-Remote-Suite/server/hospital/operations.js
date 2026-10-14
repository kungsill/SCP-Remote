'use strict';
const crypto = require('crypto');
const backup = require('./backup-health');
const queues = new Map();
function text(value, max, required) { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error('INVALID_INPUT'); return value.trim(); }
exports.handle = async function (ctx, cmd) {
 if(typeof cmd.op==='string'&&cmd.op.startsWith('power'))return require('./power-safety').handle(ctx,cmd);
 if(typeof cmd.op==='string'&&cmd.op.startsWith('desktop'))return require('./desktop-clients').handle(ctx,cmd);
 if (typeof cmd.op==='string' && cmd.op.startsWith('driverLibrary')) return require('./driver-library').handle(ctx,cmd);
 const {db,parent,user,domain}=ctx;
 const get = id => new Promise((resolve,reject)=>db.Get(id,(e,r)=>e?reject(e):resolve(r[0])));
 const save = row => new Promise((resolve,reject)=>db.Set(row,e=>e?reject(e):resolve()));
 const access = id => new Promise(resolve=>parent.GetNodeWithRights(domain,user,id,(node,rights,visible)=>resolve(!!(node&&visible&&rights))));
 const admin = user.siteadmin === 4294967295;
 if (cmd.op === 'getTicketEstimate' || cmd.op === 'saveTicketEstimate') return require('./ticket-estimates').handle(ctx, cmd, {get, save, access, queues});
 if (cmd.op==='backups' || cmd.op==='verifyBackup') {
  if (!admin || domain.id!=='') throw Error('ACCESS_DENIED');
  return cmd.op==='backups' ? backup.status(parent.parent) : backup.verify(parent.parent);
 }
 if (cmd.op==='driverStatus' || cmd.op==='cleanupStatus') {
  const rows=await new Promise((resolve,reject)=>db.GetAllTypeNoTypeField(cmd.op==='driverStatus'?'scpdriver':'scpcleanup',domain.id,(e,r)=>e?reject(e):resolve(r)));
  const allowed=[];for(const row of rows)if(await access(row.nodeid))allowed.push(row);return allowed;
 }
 if (cmd.op==='driverClear') {
  // Clears the stored result so a finished-or-stuck job stops reappearing on reload. It
  // does not reach the computer -- a command already running there runs to its own end or
  // times out; this only takes the card off the panel. The device fault, if it is real,
  // stays until the driver is actually installed.
  if (typeof cmd.nodeid!=='string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  await new Promise((resolve,reject)=>db.Remove('scpdriver/'+cmd.nodeid,e=>e?reject(e):resolve()));
  return {cleared:true};
 }
 if (cmd.op==='alertWatch') {
  // The computers marked to be watched for going offline. The proactive-alert connector reads
  // the same records; this only lists the ones this user is allowed to see, for the toggle.
  const rows=await new Promise((resolve,reject)=>db.GetAllTypeNoTypeField('scpwatch',domain.id,(e,r)=>e?reject(e):resolve(r)));
  const out=[]; for(const row of rows){ if(row.watch===true && await access(row.nodeid)) out.push(row.nodeid); } return out;
 }
 if (cmd.op==='alertWatchSet') {
  if (typeof cmd.nodeid!=='string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  const id='scpwatch/'+cmd.nodeid;
  if (cmd.watch===true) { await save({_id:id,type:'scpwatch',domain:domain.id,nodeid:cmd.nodeid,watch:true}); }
  else { await new Promise((resolve,reject)=>db.Remove(id,e=>e?reject(e):resolve())); }
  return {watch:cmd.watch===true};
 }
 if (cmd.op==='tickets') {
  const rows=await new Promise((resolve,reject)=>db.GetAllTypeNoTypeField('scpticket',domain.id,(e,r)=>e?reject(e):resolve(r)));
  const out=[]; for(const row of rows) if(await access(row.nodeid)) out.push(row);
  return out.sort((a,b)=>b.updated-a.updated);
 }
 if(cmd.op==='createTicket') {
  if(!await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  const now=Date.now(); const row={_id:'scpticket/'+domain.id+'/'+crypto.randomUUID(),type:'scpticket',domain:domain.id,nodeid:cmd.nodeid,title:text(cmd.title,160,true),description:text(cmd.description,4000,true),contact:text(cmd.contact||'',200),department:text(cmd.department||'',160),status:'open',assignee:'',created:now,updated:now,revision:1,createdBy:user._id,history:[{at:now,by:user._id,status:'open',note:'Created'}]};
  await save(row);return row;
 }
 if(cmd.op==='updateTicket') {
  const id=text(cmd.id,180,true); if(!id.startsWith('scpticket/'+domain.id+'/')) throw Error('ACCESS_DENIED');
  const previous=queues.get(id)||Promise.resolve();
  const job=previous.catch(()=>{}).then(async()=>{
   const row=await get(id);if(!row||row.domain!==domain.id||!await access(row.nodeid))throw Error('ACCESS_DENIED');
   if(row.revision!==cmd.revision)throw Error('CONFLICT');
   if(!['open','working','waiting','closed'].includes(cmd.status))throw Error('INVALID_INPUT');
   const note=text(cmd.note||'',4000,cmd.status==='closed');
   const assignee=text(cmd.assignee||'',200);if(assignee){const account=parent.users[assignee];if(!account||account.domain!==domain.id)throw Error('INVALID_ASSIGNEE');}
   if(row.history.length>=500)throw Error('HISTORY_LIMIT');
   row.type='scpticket';row.status=cmd.status;row.assignee=assignee;row.updated=Date.now();row.revision++;
   row.history.push({at:row.updated,by:user._id,status:row.status,assignee,note});await save(row);return row;
  });queues.set(id,job);try{return await job;}finally{if(queues.get(id)===job)queues.delete(id);}
 }
 if (cmd.op === 'fleetAssessment') {
  try { delete require.cache[require.resolve('./fleet-assess')]; } catch (e) {}
  const assessEngine = require('./fleet-assess');
  const nodes = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('node', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const allowedNodes = [];
  for (const n of nodes) {
   if (await access(n._id)) allowedNodes.push(n);
  }
  const sysinfos = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('sysinfo', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const criteriaDoc = await get('scpcriteria/' + domain.id).catch(() => null);
  const criteria = criteriaDoc && criteriaDoc.criteria ? criteriaDoc.criteria : assessEngine.DEFAULT_CRITERIA;
  const meshes = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('mesh', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const meshMap = {};
  for (const m of (meshes || [])) {
   if (m && m._id && m.name) meshMap[m._id] = m.name;
  }
  const assetRows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scpasset', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const assetMap = {};
  for (const a of (assetRows || [])) {
   if (a && a.nodeid) assetMap[a.nodeid] = a;
  }
  const chassisRows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scpchassis', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const chassisMap = {};
  for (const c of chassisRows) { if (c && c.nodeid) chassisMap[c.nodeid] = c; }
  return assessEngine.assessFleet(allowedNodes, sysinfos, criteria, meshMap, assetMap, chassisMap);
 }
 if (cmd.op === 'getCriteria') {
  const assessEngine = require('./fleet-assess');
  const criteriaDoc = await get('scpcriteria/' + domain.id).catch(() => null);
  return criteriaDoc && criteriaDoc.criteria ? criteriaDoc.criteria : assessEngine.DEFAULT_CRITERIA;
 }
 if (cmd.op === 'saveCriteria') {
  if (!admin && !(user.siteadmin & 2)) throw Error('ACCESS_DENIED');
  const assessEngine = require('./fleet-assess');
  const newCriteria = Object.assign({}, assessEngine.DEFAULT_CRITERIA, cmd.criteria);
  // Unit prices (new PC, RAM, SSD, CPU, UPS, fan, BIOS battery): plain baht amounts only.
  const costs = {};
  for (const [key, value] of Object.entries((cmd.criteria && cmd.criteria.costs) || {})) {
   const v = Number(value);
   if (/^[a-zA-Z]{2,30}$/.test(key) && v >= 0 && v <= 1000000) costs[key] = Math.round(v);
  }
  newCriteria.costs = Object.assign({}, assessEngine.DEFAULT_CRITERIA.costs, costs);
  // Book-value settings: a useful life the Comptroller General allows for computers (3-5
  // years), and reference prices kept to sane Buddhist-era years and baht amounts.
  const life = Number(newCriteria.usefulLifeYears);
  newCriteria.usefulLifeYears = (life >= 3 && life <= 5) ? Math.round(life) : assessEngine.DEFAULT_CRITERIA.usefulLifeYears;
  const prices = { desktop: {}, notebook: {}, aio: {} };
  for (const cls of ['desktop', 'notebook', 'aio']) {
   const table = (newCriteria.referencePrices && newCriteria.referencePrices[cls]) || {};
   for (const year of Object.keys(table)) {
    const y = Number(year), v = Number(table[year]);
    if (Number.isInteger(y) && y >= 2540 && y <= 2700 && v > 0 && v <= 1000000) prices[cls][y] = Math.round(v);
   }
  }
  newCriteria.referencePrices = prices;
  const row = {
   _id: 'scpcriteria/' + domain.id,
   type: 'scpcriteria',
   domain: domain.id,
   criteria: newCriteria,
   updated: Date.now(),
   updatedBy: user._id
  };
  await save(row);
  return row.criteria;
 }
 if (cmd.op === 'getAssetInfo') {
  if (cmd.nodeid) {
   if (!await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
   const row = await get('scpasset/' + domain.id + '/' + cmd.nodeid).catch(() => null);
   return row || { nodeid: cmd.nodeid, assetNumber: '', fiscalYear: null, price: null, note: '' };
  }
  const rows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scpasset', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const map = {};
  for (const row of rows) {
   if (row && row.nodeid && await access(row.nodeid)) {
    map[row.nodeid] = row;
   }
  }
  return map;
 }
 if (cmd.op === 'saveAssetInfo') {
  if (typeof cmd.nodeid !== 'string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  const assetNumber = text(cmd.assetNumber || '', 100);
  let fiscalYear = null;
  if (cmd.fiscalYear !== null && cmd.fiscalYear !== undefined && cmd.fiscalYear !== '') {
   fiscalYear = parseInt(cmd.fiscalYear, 10);
   if (isNaN(fiscalYear) || fiscalYear < 2000 || (fiscalYear > 2100 && fiscalYear < 2500) || fiscalYear > 2650) {
    throw Error('INVALID_FISCAL_YEAR');
   }
  }
  let price = null;
  if (cmd.price !== null && cmd.price !== undefined && cmd.price !== '') {
   price = parseFloat(cmd.price);
   if (isNaN(price) || price < 0 || price > 100000000) throw Error('INVALID_PRICE');
  }
  const note = text(cmd.note || '', 1000);
  const row = {
   _id: 'scpasset/' + domain.id + '/' + cmd.nodeid,
   type: 'scpasset',
   domain: domain.id,
   nodeid: cmd.nodeid,
   assetNumber: assetNumber,
   fiscalYear: fiscalYear,
   price: price,
   note: note,
   updated: Date.now(),
   updatedBy: user._id
  };
  await save(row);
  return row;
 }
 if (cmd.op === 'chassisSave') {
  // What each computer said about its own case when asked (read-only query): chassis
  // types, model name, whether it has a built-in screen. Used to tell PC / All-in-One /
  // notebook apart.
  if (!Array.isArray(cmd.items) || cmd.items.length > 1000) throw Error('INVALID_INPUT');
  let saved = 0;
  for (const it of cmd.items) {
   if (!it || typeof it.nodeid !== 'string' || !await access(it.nodeid)) continue;
   const chassis = Array.isArray(it.chassis) ? it.chassis.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 100).slice(0, 8) : [];
   const str = v => typeof v === 'string' ? v.slice(0, 120) : '';
   await save({ _id: 'scpchassis/' + it.nodeid, type: 'scpchassis', domain: domain.id, nodeid: it.nodeid, chassis, model: str(it.model), name: str(it.name), system: str(it.system),
    pcType: Number(it.pcType) || 0, internal: Math.max(0, Math.min(9, Number(it.internal) || 0)),
    // parts: disk type/health, a USB UPS, BIOS clock resets, heat throttling -- short facts only
    disks: (Array.isArray(it.disks) ? it.disks : []).filter(d => d && typeof d === 'object').slice(0, 8).map(d => ({
     model: str(d.model), media: str(d.media).slice(0, 20), bus: str(d.bus).slice(0, 20), health: str(d.health).slice(0, 20),
     sizeGb: Math.max(0, Math.min(100000, Number(d.sizeGb) || 0)), system: d.system === true })),
    batteries: (Array.isArray(it.batteries) ? it.batteries : []).filter(b => b && typeof b === 'object').slice(0, 3).map(b => ({
     name: str(b.name), charge: Math.max(0, Math.min(100, Number(b.charge) || 0)), status: Math.max(0, Math.min(99, Number(b.status) || 0)) })),
    cmosResets: Math.max(0, Math.min(1000, Number(it.cmosResets) || 0)),
    throttle: Math.max(0, Math.min(100000, Number(it.throttle) || 0)),
    updated: Date.now(), by: user._id });
   saved++;
  }
  return { saved };
 }
 if (cmd.op === 'licenseSave') {
  // Windows activation as each computer reported it (read-only query). No product key is
  // ever stored: only the licence status, channel, KMS host and whether an OEM key exists.
  if (!Array.isArray(cmd.items) || cmd.items.length > 1000) throw Error('INVALID_INPUT');
  const str = v => typeof v === 'string' ? v.slice(0, 120) : '';
  let saved = 0;
  for (const it of cmd.items) {
   if (!it || typeof it.nodeid !== 'string' || !await access(it.nodeid)) continue;
   await save({ _id: 'scplicense/' + it.nodeid, type: 'scplicense', domain: domain.id, nodeid: it.nodeid, found: it.found === true,
    status: Math.max(0, Math.min(9, Number(it.status) || 0)), channel: str(it.channel), desc: str(it.desc), name: str(it.name),
    kms: str(it.kms), kmsFound: str(it.kmsFound), grace: Math.max(0, Math.min(1e8, Number(it.grace) || 0)), oemKey: it.oemKey === true,
    crack: (function (k) {
     // traces of activation cracks found on the computer: short lists of names only
     const list = v => (Array.isArray(v) ? v : (typeof v === 'string' && v ? [v] : [])).filter(x => typeof x === 'string').slice(0, 10).map(x => x.slice(0, 160));
     k = (k && typeof k === 'object') ? k : {};
     return { tasks: list(k.tasks), services: list(k.services), files: list(k.files), hook: k.hook === true, threats: list(k.threats), exclusions: list(k.exclusions) };
    })(it.crack),
    // the last five characters of the key only (what Windows Settings shows), to spot generic keys
    partial: (typeof it.partial === 'string' && /^[A-Z0-9]{5}$/i.test(it.partial)) ? it.partial.toUpperCase() : '',
    office: (function (o) {
     o = (o && typeof o === 'object') ? o : {};
     const prods = (Array.isArray(o.products) ? o.products : []).filter(p => p && typeof p === 'object').slice(0, 10).map(p => ({
      name: str(p.name), desc: str(p.desc), status: Math.max(0, Math.min(9, Number(p.status) || 0)), kms: str(p.kms), grace: Math.max(0, Math.min(1e8, Number(p.grace) || 0)) }));
     return { products: prods, ohook: o.ohook === true, c2r: typeof o.c2r === 'string' ? o.c2r.slice(0, 200) : '' };
    })(it.office),
    updated: Date.now(), by: user._id });
   saved++;
  }
  return { saved };
 }
 if (cmd.op === 'licenseList') {
  const rows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scplicense', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const map = {}; for (const row of rows) if (row && row.nodeid && await access(row.nodeid)) map[row.nodeid] = row;
  return map;
 }
 if (cmd.op === 'chassisList') {
  const rows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scpchassis', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const map = {}; for (const row of rows) if (row && row.nodeid && await access(row.nodeid)) map[row.nodeid] = row;
  return map;
 }
 if (cmd.op === 'healthSave') {
  // The SCPclear-style health check (read-only) as each computer answered it. Kept whole but
  // bounded, so the dashboard can show the last result while the computer is off.
  if (!Array.isArray(cmd.items) || cmd.items.length > 1000) throw Error('INVALID_INPUT');
  let saved = 0;
  for (const it of cmd.items) {
   if (!it || typeof it.nodeid !== 'string' || !it.data || typeof it.data !== 'object' || Array.isArray(it.data)) continue;
   if (!await access(it.nodeid)) continue;
   const text = JSON.stringify(it.data);
   if (text.length > 30000) continue;
   await save({ _id: 'scphealth/' + it.nodeid, type: 'scphealth', domain: domain.id, nodeid: it.nodeid, data: JSON.parse(text), updated: Date.now(), by: user._id });
   saved++;
  }
  return { saved };
 }
 if (cmd.op === 'healthList') {
  const rows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scphealth', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const map = {}; for (const row of rows) if (row && row.nodeid && await access(row.nodeid)) map[row.nodeid] = { data: row.data, updated: row.updated };
  return map;
 }
 if (cmd.op === 'healthLog') {
  // Who pressed which fix on which computer, and what it reported. The last 30 per computer.
  const ACTIONS = ['printer_fix', 'spooler_restart', 'printer_test', 'printer_resume', 'dns_flush', 'svc_start', 'trim', 'power_balanced', 'synapse_hosts', 'startup', 'fonts'];
  if (typeof cmd.nodeid !== 'string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  // The fix is in cmd.fix: cmd.action is the message's own channel name (scpops).
  if (ACTIONS.indexOf(cmd.fix) < 0) throw Error('INVALID_INPUT');
  const key = 'scphealthlog/' + cmd.nodeid;
  const before = await get(key).catch(() => null);
  const resultText = cmd.result && typeof cmd.result === 'object' ? JSON.stringify(cmd.result) : '';
  const result = resultText && resultText.length <= 2000 ? JSON.parse(resultText) : (resultText ? { truncated: true } : null);
  const entries = ((before && before.entries) || []).concat([{ at: Date.now(), action: cmd.fix, ok: cmd.ok === true, result, by: user._id }]).slice(-30);
  await save({ _id: key, type: 'scphealthlog', domain: domain.id, nodeid: cmd.nodeid, entries, updated: Date.now() });
  return { saved: 1 };
 }
 if (cmd.op === 'healthHistory') {
  // A few numbers from each morning check, for trend lines (disk filling up, crashes rising).
  if (typeof cmd.nodeid !== 'string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  const row = await get('scphealthhist/' + cmd.nodeid).catch(() => null);
  return (row && row.entries) || [];
 }
 if (cmd.op === 'morningSummary') {
  // The last morning check: how many were checked and which computers had something red.
  const row = await get('scpmorning/' + domain.id).catch(() => null);
  if (!row) return null;
  const problems = [];
  for (const p of (row.problems || [])) if (p && await access(p.nodeid)) problems.push(p);
  const m = parent.parent && parent.parent.scpMorning;
  const s = (parent.parent && parent.parent.config && parent.parent.config.settings) || {};
  return { at: row.at, checked: row.checked, ok: row.ok, warn: row.warn, slow: row.slow || 0, noAnswer: row.noAnswer || 0, problems, running: !!(m && m.running),
   schedule: s.scpmorningcheck === 'off' || s.scpmorningcheck === false ? 'off' : (typeof s.scpmorningcheck === 'string' ? s.scpmorningcheck : '07:30'),
   delivery: { webhook: !!s.scpalertwebhook, telegram: !!(s.scptelegram && s.scptelegram.token) } };
 }
 if (cmd.op === 'morningRun') {
  // Run the morning check now (administrators): read only, on every Windows computer that is on.
  if (!admin) throw Error('ACCESS_DENIED');
  const m = parent.parent && parent.parent.scpMorning;
  if (!m) throw Error('NOT_AVAILABLE');
  const running = !!m.running;
  m.run('manual');
  return { started: !running, running: true };
 }
 if (cmd.op === 'careStart') {
  // Safe auto-care was sent to these computers. Kept so the result survives a reload and
  // shows who started it; the agent's reply (meshagent.js) fills in the result.
  if (!Array.isArray(cmd.nodeids) || cmd.nodeids.length > 1000) throw Error('INVALID_INPUT');
  if (typeof cmd.ticket !== 'string' || !/^scpcare[0-9]+_[0-9]+$/.test(cmd.ticket)) throw Error('INVALID_INPUT');
  let saved = 0;
  for (const nodeid of cmd.nodeids) {
   if (typeof nodeid !== 'string' || !await access(nodeid)) continue;
   await save({ _id: 'scpcare/' + nodeid, type: 'scpcare', domain: domain.id, nodeid, ticket: cmd.ticket, state: 'working', started: Date.now(), by: user._id, result: null, updated: Date.now() });
   saved++;
  }
  return { saved };
 }
 if (cmd.op === 'careStatus') {
  const rows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scpcare', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const out = []; for (const row of rows) if (row && row.nodeid && await access(row.nodeid)) out.push(row);
  return out;
 }
 if (cmd.op === 'deviceHistory') {
  // One computer's story from the records SCP-Remote keeps: repairs, driver and clean-up
  // jobs, safe auto-care, where it was moved on the map, and its asset record.
  if (typeof cmd.nodeid !== 'string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  const id = cmd.nodeid;
  const who = uid => { const u = uid && parent.users && parent.users[uid]; return u ? (u.realname || u.name || uid) : (uid ? String(uid).split('/').pop() : ''); };
  const one = key => get(key).catch(() => null);
  const out = [];
  const tickets = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scpticket', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  for (const t of tickets) {
   if (!t || t.nodeid !== id) continue;
   for (const h of (t.history || [])) out.push({ at: h.at, kind: 'ticket', title: t.title, status: h.status, note: h.note || '', by: who(h.by) });
  }
  const driver = await one('scpdriver/' + id);
  if (driver && driver.updated) out.push({ at: driver.updated, kind: 'driver', note: String(driver.result || '').replace(/SCP_DRIVER_[A-Z]+:\S*/g, '').trim().slice(-200), progress: driver.progress === true });
  const cleanup = await one('scpcleanup/' + id);
  if (cleanup && cleanup.updated) out.push({ at: cleanup.updated, kind: 'cleanup', note: String(cleanup.result || '').replace(/SCP_CLEANUP_PROGRESS:\{[^\r\n]*\}/g, '').trim().slice(-200), progress: cleanup.progress === true });
  const care = await one('scpcare/' + id);
  if (care && care.updated) out.push({ at: care.updated, kind: 'care', state: care.state, result: care.result, by: who(care.by) });
  const healthLog = await one('scphealthlog/' + id);
  for (const h of ((healthLog && healthLog.entries) || [])) out.push({ at: h.at, kind: 'health', action: h.action, ok: h.ok, result: h.result, by: who(h.by) });
  const place = await one('scpmappos/' + domain.id + '/' + id);
  if (place && place.updated) out.push({ at: place.updated, kind: 'moved', floor: place.floor, by: who(place.updatedBy) });
  const asset = await one('scpasset/' + domain.id + '/' + id);
  if (asset && asset.updated) out.push({ at: asset.updated, kind: 'asset', note: [asset.assetNumber, asset.fiscalYear].filter(Boolean).join(' · '), by: who(asset.updatedBy) });
  return out.filter(e => typeof e.at === 'number').sort((a, b) => b.at - a.at).slice(0, 200);
 }
 if (cmd.op === 'mapPlacements') {
  // Where each computer was dragged to on the hospital map. Shared by everyone, so the map
  // looks the same on every screen; only computers this user may see are returned.
  const rows = await new Promise((resolve, reject) => db.GetAllTypeNoTypeField('scpmappos', domain.id, (e, r) => e ? reject(e) : resolve(r || [])));
  const map = {};
  for (const row of rows) { if (row && row.nodeid && await access(row.nodeid)) map[row.nodeid] = { floor: row.floor, x: row.x, y: row.y }; }
  return map;
 }
 if (cmd.op === 'mapPlacementSet') {
  if (typeof cmd.nodeid !== 'string' || !await access(cmd.nodeid)) throw Error('ACCESS_DENIED');
  const id = 'scpmappos/' + domain.id + '/' + cmd.nodeid;
  if (cmd.clear === true) {
   await new Promise((resolve, reject) => db.Remove(id, e => e ? reject(e) : resolve()));
   return { cleared: true };
  }
  if (typeof cmd.floor !== 'string' || !/^flr_[a-z0-9_]{1,40}$/.test(cmd.floor)) throw Error('INVALID_INPUT');
  // x/y null means "somewhere in that building", placed automatically.
  const coord = v => { if (v === null || v === undefined) return null; if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 5000) throw Error('INVALID_INPUT'); return Math.round(v * 100) / 100; };
  const x = coord(cmd.x), y = coord(cmd.y);
  if ((x === null) !== (y === null)) throw Error('INVALID_INPUT');
  const row = { _id: id, type: 'scpmappos', domain: domain.id, nodeid: cmd.nodeid, floor: cmd.floor, x: x, y: y, updated: Date.now(), updatedBy: user._id };
  await save(row);
  return { floor: row.floor, x: row.x, y: row.y };
 }
 throw Error('UNKNOWN_OPERATION');
};
