'use strict';
// SCP-Remote: the morning health check.
//
// Every morning before the clinics open (07:30 unless settings.scpmorningcheck says otherwise,
// "off" turns it off) the server runs the same read-only health check the dashboard has --
// hospital/../public/scripts/scp-health.js, loaded here so the two can never drift apart -- on
// every Windows computer that is on. It keeps each answer (the dashboard shows it while the
// computer is off), adds a few numbers to that computer's history so trends can be drawn
// (disk filling up, crashes becoming more frequent), and writes one summary: which computers
// have something red, and what.
//
// The summary goes nowhere until someone decides where: settings.scpalertwebhook (the same
// JSON webhook the offline alerts use) and/or settings.scptelegram { token, chat }. Until then
// nothing about the hospital's computers leaves this server.
//
// Only reads are sent to the computers. Nothing is fixed automatically: fixing stays a person's
// decision, on the dashboard.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const PUBLIC = path.join(__dirname, '..', 'public');
const HISTORY_KEEP = 120; // about four months of mornings

// The dashboard's health module, run in a sandbox with just enough of a browser around it.
function loadHealth() {
    const window = {};
    const sandbox = {
        window, document: { documentElement: { lang: 'th' } },
        btoa: s => Buffer.from(s, 'binary').toString('base64'), unescape, encodeURIComponent,
        location: { href: 'https://localhost/' }, URL, setTimeout, clearTimeout, console
    };
    vm.runInNewContext(fs.readFileSync(path.join(PUBLIC, 'scripts', 'scp-health.js'), 'utf8'), sandbox, { filename: 'scp-health.js' });
    const health = window.ScpHealth;
    try { health.setManifest(JSON.parse(fs.readFileSync(path.join(PUBLIC, 'fonts', 'thai', 'manifest.json'), 'utf8'))); } catch (e) { /* fonts are optional */ }
    return health;
}

// The few numbers worth drawing over time.
function snapshot(data, at) {
    const n = v => (typeof v === 'number' && isFinite(v)) ? v : null;
    const s = data.slow || {};
    return { at, freeGb: n(data.freeGb), diskGb: n(data.diskGb), ramPct: n(data.ramPct), upDays: n(data.upDays), crashes14d: n(data.crashes14d), errors24h: n(data.errors24h), jobs: n(data.jobs), tempMb: n(data.tempMb),
        hangs7d: n(s.hangs7d), appCrashes7d: n(s.crashes7d), lowMem30d: n(s.lowMem30d), bootSec: n(s.bootSec) };
}

// One line per computer with something red; amber only counted.
// Slow or hanging computers lead the summary: that is what the hospital asked to hear first.
function summarize(results, names, findings, when) {
    const rows = [];
    let warnOnly = 0, ok = 0;
    for (const id of Object.keys(results)) {
        const list = findings(results[id]);
        const bad = list.filter(f => f.level === 'bad'), warn = list.filter(f => f.level === 'warn');
        const slow = list.find(f => f.slow);
        if (bad.length) rows.push({ nodeid: id, name: names[id] || id, bad: bad.map(f => f.title), warn: warn.length, slow: slow ? slow.detail : null });
        else if (warn.length) warnOnly++;
        else ok++;
    }
    rows.sort((a, b) => (b.slow ? 1 : 0) - (a.slow ? 1 : 0) || b.bad.length - a.bad.length || String(a.name).localeCompare(String(b.name)));
    const slowRows = rows.filter(r => r.slow), other = rows.filter(r => !r.slow);
    const day = new Date(when).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    const lines = ['🩺 ตรวจเช้า ' + day + ' · ตรวจ ' + Object.keys(results).length + ' เครื่อง · ปกติ ' + ok + ' · ควรดู ' + warnOnly + ' · มีปัญหา ' + rows.length + (slowRows.length ? ' · ค้าง/ช้า ' + slowRows.length : '')];
    if (slowRows.length) {
        lines.push('🐢 เครื่องค้าง/ช้า:');
        slowRows.slice(0, 10).forEach(r => lines.push('• ' + r.name + ': ' + r.slow));
        if (slowRows.length > 10) lines.push('… และอีก ' + (slowRows.length - 10) + ' เครื่อง');
    }
    other.slice(0, 15).forEach(r => lines.push('🔴 ' + r.name + ': ' + r.bad.slice(0, 3).join(' · ')));
    if (other.length > 15) lines.push('… และอีก ' + (other.length - 15) + ' เครื่อง (ดูในแดชบอร์ด)');
    return { at: when, checked: Object.keys(results).length, ok, warn: warnOnly, slow: slowRows.length, problems: rows, text: lines.join('\n') };
}

function post(url, body, headers) {
    return new Promise(resolve => {
        let u;
        try { u = new URL(url); } catch (e) { resolve(false); return; }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') { resolve(false); return; }
        const data = Buffer.from(JSON.stringify(body));
        const req = (u.protocol === 'https:' ? https : require('http')).request(u, { method: 'POST', timeout: 15000, headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': data.length }, headers || {}) }, res => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300); });
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
        req.end(data);
    });
}

// Where the summary goes, if anywhere.
function deliver(settings, summary) {
    const jobs = [];
    const s = settings || {};
    if (typeof s.scpalertwebhook === 'string' && s.scpalertwebhook) {
        jobs.push(post(s.scpalertwebhook, { source: 'SCP-Remote', type: 'morning', message: summary.text, checked: summary.checked, problems: summary.problems.map(p => ({ computer: p.name, issues: p.bad })), at: new Date(summary.at).toISOString() }));
    }
    const tg = s.scptelegram;
    if (tg && typeof tg.token === 'string' && /^\d+:[\w-]+$/.test(tg.token) && (typeof tg.chat === 'string' || typeof tg.chat === 'number')) {
        jobs.push(post('https://api.telegram.org/bot' + tg.token + '/sendMessage', { chat_id: tg.chat, text: summary.text, disable_web_page_preview: true }));
    }
    return Promise.all(jobs).then(r => ({ sent: r.filter(Boolean).length, tried: r.length }));
}

function CreateScpMorning(parent) {
    const obj = { running: null, lastDay: null, timer: null, health: null };
    const db = () => parent.db;
    const settings = () => (parent.config && parent.config.settings) || {};
    const debug = m => { try { parent.debug && parent.debug('main', 'SCP morning: ' + m); } catch (e) { } };

    function when() {
        const v = settings().scpmorningcheck;
        if (v === false || v === 'off') return null;
        const m = /^(\d{1,2}):(\d{2})$/.exec(typeof v === 'string' ? v : '07:30');
        return m ? { h: Math.min(23, +m[1]), m: Math.min(59, +m[2]) } : { h: 7, m: 30 };
    }
    function getRow(id) { return new Promise(resolve => { try { db().Get(id, (e, r) => resolve((!e && r && r[0]) || null)); } catch (e) { resolve(null); } }); }
    function setRow(row) { return new Promise(resolve => { try { db().Set(row, () => resolve()); } catch (e) { resolve(); } }); }
    function windowsAgents() {
        const out = [];
        const agents = parent.webserver && parent.webserver.wsagents;
        if (!agents) return out;
        for (const id in agents) {
            const a = agents[id];
            const aid = a && a.agentInfo && a.agentInfo.agentId;
            if (a && a.authenticated === 2 && ((aid > 0 && aid < 5) || (aid > 41 && aid < 44))) out.push({ id, agent: a, name: (a.dbNodeKey && a.name) || null, domain: (a.domain && a.domain.id) || '' });
        }
        return out;
    }

    // Run the check now on every Windows computer that is on. Resolves with the summary.
    obj.run = function (reason) {
        if (obj.running) return obj.running.promise;
        if (!obj.health) { try { obj.health = loadHealth(); } catch (e) { debug('cannot load scp-health.js: ' + e.message); return Promise.resolve(null); } }
        const list = windowsAgents();
        const ticket = 'scpmorning' + Date.now() + '_' + list.length;
        const job = { ticket, pending: {}, results: {}, names: {}, domains: {}, started: Date.now(), reason: reason || 'schedule' };
        job.promise = new Promise(resolve => { job.resolve = resolve; });
        obj.running = job;
        const cmds = obj.health.healthScript();
        list.forEach(a => {
            job.pending[a.id] = true; job.domains[a.id] = a.domain;
            try { a.agent.send(JSON.stringify({ action: 'runcommands', type: 2, cmds, runAsUser: 0, reply: true, responseid: ticket })); } catch (e) { delete job.pending[a.id]; }
        });
        debug('sent to ' + Object.keys(job.pending).length + ' computers (' + job.reason + ')');
        job.timer = setTimeout(() => finish(job), 4 * 60 * 1000);
        if (job.timer.unref) job.timer.unref();
        if (!Object.keys(job.pending).length) finish(job);
        return job.promise;
    };

    // Called from meshagent.js with every runcommands answer; takes only its own.
    obj.receive = function (nodeid, domainId, command) {
        const job = obj.running;
        if (!job || !command || command.responseid !== job.ticket || command.progress === true || !job.pending[nodeid]) return false;
        delete job.pending[nodeid];
        const m = String(command.result || '').match(/SCP_HEALTH:(\{[^\r\n]*\})/);
        if (m) {
            try {
                const data = JSON.parse(m[1]);
                if (JSON.stringify(data).length <= 30000) {
                    job.results[nodeid] = data;
                    const at = Date.now(), dom = domainId || job.domains[nodeid] || '';
                    setRow({ _id: 'scphealth/' + nodeid, type: 'scphealth', domain: dom, nodeid, data, updated: at, by: 'scp-morning' });
                    getRow('scphealthhist/' + nodeid).then(before => {
                        const entries = ((before && before.entries) || []).concat([snapshot(data, at)]).slice(-HISTORY_KEEP);
                        return setRow({ _id: 'scphealthhist/' + nodeid, type: 'scphealthhist', domain: dom, nodeid, entries, updated: at });
                    });
                }
            } catch (e) { /* unreadable: counted as no answer */ }
        }
        if (!Object.keys(job.pending).length) finish(job);
        return true;
    };

    function finish(job) {
        if (job.done) return;
        job.done = true;
        clearTimeout(job.timer);
        if (obj.running === job) obj.running = null;
        const ids = Object.keys(job.results);
        Promise.all(ids.map(id => getRow(id))).then(nodes => {
            nodes.forEach((n, i) => { job.names[ids[i]] = (n && n.name) || ids[i].split('/').pop(); });
            const summary = summarize(job.results, job.names, d => obj.health.findings(d), Date.now());
            summary.noAnswer = Object.keys(job.pending).length;
            summary.reason = job.reason;
            const domains = Array.from(new Set(ids.map(id => job.domains[id] || '').concat([''])));
            return Promise.all(domains.map(d => setRow(Object.assign({ _id: 'scpmorning/' + d, type: 'scpmorning', domain: d }, summary)))).then(() =>
                deliver(settings(), summary).then(r => { debug('summary: ' + summary.checked + ' checked, ' + summary.problems.length + ' with problems, sent ' + r.sent + '/' + r.tried); job.resolve(summary); }));
        }).catch(e => { debug('summary failed: ' + e.message); job.resolve(null); });
    }

    // Once a minute: is it time, and has today not run yet?
    obj.tick = function (now) {
        const w = when();
        if (!w) return false;
        now = now || new Date();
        const day = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();
        if (obj.lastDay === day) return false;
        if (now.getHours() * 60 + now.getMinutes() < w.h * 60 + w.m) return false;
        // Started late (the server was off at 07:30)? Still run, but not after the morning is over.
        if (now.getHours() * 60 + now.getMinutes() > w.h * 60 + w.m + 180) { obj.lastDay = day; return false; }
        obj.lastDay = day;
        obj.run('schedule');
        return true;
    };

    obj.start = function () {
        if (obj.timer) return;
        obj.timer = setInterval(() => { try { obj.tick(); } catch (e) { /* never let a tick throw */ } }, 60 * 1000);
        if (obj.timer.unref) obj.timer.unref();
    };
    obj.stop = function () { if (obj.timer) { clearInterval(obj.timer); obj.timer = null; } };
    return obj;
}

module.exports = { CreateScpMorning, summarize, snapshot, deliver, loadHealth };
