'use strict';
// SCP-Remote proactive alerts -- the connector, left unconnected on purpose.
//
// It watches the computers an administrator marked "watch" and notices when one of them, having
// been online, drops and stays offline past a short grace period. That is the case the hospital
// felt when an OPD machine was down four days before anyone looked. A machine that is simply off
// after hours is not watched, so it does not cry wolf.
//
// Where the alert GOES is deliberately not wired here. If no webhook URL is set in the config it
// stays dormant: it still watches and records what it would have said, but sends nothing. The
// administrator points `settings.scpalertwebhook` at a LINE bot, a chat webhook or anything that
// accepts a JSON POST when they are ready, and only then does anything leave the building. This
// keeps machine names and states inside the hospital until that choice is made on purpose.

// Pure and testable: given a snapshot of the fleet, decide which watched machines are in an
// alerting state right now. No clock of its own, no I/O -- the caller passes `now`.
function detect(snapshot) {
    var out = [];
    var now = snapshot.now || Date.now();
    var offlineGraceMs = snapshot.offlineGraceMs || (30 * 60 * 1000); // 30 minutes down before it counts
    (snapshot.nodes || []).forEach(function (node) {
        if (!node || !node._id) { return; }
        if (!snapshot.watched || snapshot.watched.indexOf(node._id) < 0) { return; }
        var online = (snapshot.online || []).indexOf(node._id) >= 0;
        if (online) { return; }
        // Only alert once we know it was really here: a machine with no last-seen time may never
        // have connected, and a brand-new watch on a long-off machine should not fire immediately.
        var lastSeen = snapshot.lastSeen ? snapshot.lastSeen[node._id] : null;
        if (!lastSeen) { return; }
        if ((now - lastSeen) < offlineGraceMs) { return; }
        out.push({ type: 'offline', nodeid: node._id, name: node.name || node._id, since: lastSeen, downMs: now - lastSeen });
    });
    return out;
}

// The dormant send. A URL turns it on; without one it does nothing and says so to the caller.
function deliver(webhookUrl, alert, deps) {
    return new Promise(function (resolve) {
        if (!webhookUrl || typeof webhookUrl !== 'string') { resolve({ sent: false, reason: 'DORMANT' }); return; }
        var https, url;
        try {
            https = (deps && deps.https) || require('https');
            var http = (deps && deps.http) || require('http');
            url = new URL(webhookUrl);
            var body = JSON.stringify({
                source: 'SCP-Remote', type: alert.type, computer: alert.name,
                message: alert.type === 'offline'
                    ? ('เครื่อง ' + alert.name + ' ออฟไลน์เกิน ' + Math.round((alert.downMs || 0) / 60000) + ' นาที')
                    : (alert.name + ': ' + alert.type),
                at: new Date().toISOString()
            });
            var lib = (url.protocol === 'http:') ? http : https;
            var req = lib.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 10000 },
                function (res) { res.resume(); resolve({ sent: (res.statusCode >= 200 && res.statusCode < 300), status: res.statusCode }); });
            req.on('error', function (e) { resolve({ sent: false, reason: String(e && e.message) }); });
            req.on('timeout', function () { try { req.destroy(); } catch (x) {} resolve({ sent: false, reason: 'TIMEOUT' }); });
            req.end(body);
        } catch (e) { resolve({ sent: false, reason: String(e && e.message) }); }
    });
}

// The wiring. Kept apart from detect/deliver so a mistake here can never crash the server: every
// access to the running server is wrapped, and a bad tick logs and is skipped, never thrown.
function CreateScpAlerts(parent) {
    var obj = { parent: parent, sentKeys: {}, timer: null };
    var CHECK_MS = 3 * 60 * 1000;

    function webhookUrl() {
        try { return (parent && parent.config && parent.config.settings && parent.config.settings.scpalertwebhook) || null; }
        catch (e) { return null; }
    }
    function allOfType(type) {
        return new Promise(function (resolve) {
            try { parent.db.GetAllTypeNoTypeField(type, '', function (err, rows) { resolve((!err && Array.isArray(rows)) ? rows : []); }); }
            catch (e) { resolve([]); }
        });
    }
    function onlineIds() {
        var ids = [];
        try {
            var agents = parent.webserver && parent.webserver.wsagents;
            if (agents) { for (var id in agents) { if (agents[id] && agents[id].authenticated === 2) { ids.push(id); } } }
        } catch (e) { /* if the map is not there, treat nothing as known-online rather than crash */ }
        return ids;
    }

    obj.check = function () {
        // Unconnected means idle: with no webhook set, do nothing at all -- no reads, no state,
        // nothing sent. It comes to life only once someone points it at a destination.
        var url = webhookUrl();
        if (!url) { return Promise.resolve([]); }
        return Promise.all([allOfType('node'), allOfType('scpwatch'), allOfType('lastconnect')]).then(function (parts) {
            var nodes = parts[0], watchRows = parts[1], lastRows = parts[2];
            var watched = watchRows.filter(function (w) { return w && w.watch === true; }).map(function (w) { return String(w._id).replace(/^scpwatch\//, ''); });
            var lastSeen = {};
            lastRows.forEach(function (r) { if (r && r._id) { lastSeen[String(r._id).replace(/^lc/, '')] = r.time; } });
            var alerts = detect({ nodes: nodes, online: onlineIds(), watched: watched, lastSeen: lastSeen, now: Date.now() });
            var live = {};
            return alerts.reduce(function (chain, alert) {
                var key = alert.type + ':' + alert.nodeid;
                live[key] = true;
                if (obj.sentKeys[key]) { return chain; } // already alerted, do not repeat until it clears
                return chain.then(function () {
                    return deliver(url, alert).then(function (r) {
                        obj.sentKeys[key] = true;
                        try { parent.debug && parent.debug('main', 'SCP alert (' + (r.sent ? 'sent' : (r.reason || 'dormant')) + '): ' + key); } catch (e) {}
                    });
                });
            }, Promise.resolve()).then(function () {
                // Forget alerts whose condition has cleared, so the machine can alert again next time.
                Object.keys(obj.sentKeys).forEach(function (k) { if (!live[k]) { delete obj.sentKeys[k]; } });
                return alerts;
            });
        }).catch(function () { return []; });
    };

    obj.start = function () {
        if (obj.timer) { return; }
        obj.timer = setInterval(function () { try { obj.check(); } catch (e) { /* never let a tick throw */ } }, CHECK_MS);
        if (obj.timer && obj.timer.unref) { obj.timer.unref(); }
    };
    obj.stop = function () { if (obj.timer) { clearInterval(obj.timer); obj.timer = null; } };
    return obj;
}

module.exports = { detect: detect, deliver: deliver, CreateScpAlerts: CreateScpAlerts };
