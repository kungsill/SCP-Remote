'use strict';
const fs = require('fs'), path = require('path');
// An estimate belongs to the repair ticket, so its revision and history are saved
// in the same database write as the ticket. All operations share the ticket queue.
exports.handle = async function (ctx, cmd, helpers) {
 const {get, save, access, queues} = helpers;
 const id = cmd.id;
 if (typeof id !== 'string' || id.length > 180 || !id.startsWith('scpticket/' + ctx.domain.id + '/')) throw Error('ACCESS_DENIED');
 async function read() {
  const row = await get(id);
  if (!row || row.type && row.type !== 'scpticket' || row.domain !== ctx.domain.id || !await access(row.nodeid)) throw Error('ACCESS_DENIED');
  return row;
 }
 if (cmd.op === 'getTicketEstimate') return read();
 const previous = queues.get(id) || Promise.resolve();
 const job = previous.catch(() => {}).then(async () => {
  const row = await read();
  if (row.revision !== cmd.revision) throw Error('CONFLICT');
  if (!cmd.estimate || !Array.isArray(cmd.estimate.lines) || !cmd.estimate.lines.length || cmd.estimate.lines.length > 1000) throw Error('INVALID_INPUT');
  function text(v, max, required) {
   if (typeof v !== 'string' || v.length > max || required && !v.trim()) throw Error('INVALID_INPUT');
   return v.trim();
  }
  function number(v, min, max) {
   if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw Error('INVALID_INPUT');
   return v;
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/reference-prices/catalog.json'), 'utf8'));
  const items = new Map(catalog.items.map(r => [r.id, r])), sources = new Map(catalog.sources.map(s => [s.id, s]));
  const lines = cmd.estimate.lines.map(line => {
   if (!line || typeof line !== 'object') throw Error('INVALID_INPUT');
   const result = {name: text(line.name, 1000, true), quantity: number(line.quantity, 0.01, 1000000), unitPrice: number(line.unitPrice, 0, 1000000000)};
   result.amount = Math.round(result.quantity * result.unitPrice * 100) / 100;
   if (result.amount > 1000000000000) throw Error('INVALID_INPUT');
   if (line.referenceId) {
    result.referenceId = text(line.referenceId, 160, true);
    const item = items.get(result.referenceId), source = item && sources.get(item.sourceId);
    if (!source) throw Error('INVALID_REFERENCE');
    result.reference = {name: item.name, price: item.price, page: item.page, item: item.item, sourceId: source.id, title: source.title, status: source.status, publishedAt: source.publishedAt, url: source.url, sha256: source.sha256};
   }
   return result;
  });
  const total = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  if (total > 1000000000000 || row.history.length >= 500) throw Error('INVALID_INPUT');
  const now = Date.now();
  row.estimate = {subject: text(cmd.estimate.subject || '', 300), memo: text(cmd.estimate.memo || '', 4000), lines, total, revision: (row.estimate && row.estimate.revision || 0) + 1, updated: now, updatedBy: ctx.user._id};
  row.type = 'scpticket'; row.updated = now; row.revision++;
  row.history.push({at: now, by: ctx.user._id, status: row.status, kind: 'estimate', estimateRevision: row.estimate.revision, total, note: 'ประมาณการซ่อมฉบับที่ ' + row.estimate.revision + ' รวม ' + total.toLocaleString('th-TH') + ' บาท'});
  await save(row);
  return row;
 });
 queues.set(id, job);
 try { return await job; } finally { if (queues.get(id) === job) queues.delete(id); }
};
