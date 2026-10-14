'use strict';
// A phone and tablet view of the fleet, at /m.
//
// The Desktop App already has a device picker that reads far better on a small screen than
// MeshCentral's own mobile page: cards, a search box, and one large button per computer. This
// serves the same shape of page to a browser, so an administrator on a phone gets it too.
//
// It deliberately does NOT reuse the app's /scp-client-api. That endpoint authenticates with a
// per-installation token and refuses any request carrying an Origin header, precisely so a web
// page can never be made to call it. Nothing here weakens that: this reads the fleet through
// the signed-in user's own session and their own device-group rights, and it only reads.
//
// Starting a session is not implemented here either. The button hands over to the remote
// desktop page MeshCentral already serves, which carries the whole tested path including the
// consent prompt on the ward computer.
const fs = require('fs');
const path = require('path');

const pageFile = path.join(__dirname, 'mobile.html');

// Query keys that name a thing to open: a computer, a group, an account, or a login key.
// These are MeshCentral's own, read in default.handlebars, and a URL carrying one of them was
// meant for the full site. Anything else on the root - hide=, mobile=, viewmode= with no
// device beside it - is what MeshCentral leaves behind when a view closes, and must not be
// mistaken for someone asking to go somewhere.
// scpnode: a QR sticker on a computer, which opens that computer's card on the dashboard.
const AIMED_AT_SOMETHING = ['node', 'gotonode', 'gotodevicename', 'gotodevicername',
    'gotodeviceip', 'gotomesh', 'gotouser', 'gotougrp', 'key', 'scpnode'];

function signedInUser(web, req) {
    if ((req.session == null) || (typeof req.session.userid != 'string')) { return null; }
    return web.users[req.session.userid] || null;
}

// The page itself carries no fleet data, but sending a browser to a working page it cannot use
// is worse than sending it to the login screen.
//
// Sending a signed-out visitor plainly to the root is not enough: they log in there and stay
// there, on MeshCentral's own mobile page, wondering where this one went. MeshCentral returns a
// user to the root plus whatever query they arrived with - the login form carries it through in
// a hidden urlargs field - so the marker below survives the login and root() sends them on.
exports.page = function (web, req, res, url) {
    const root = url || '/';
    if (signedInUser(web, req) == null) { res.redirect(root + '?m=1'); return; }
    // Arriving here is the device saying it wants this page. Remembering that is what lets an
    // iPad - which the user agent cannot tell apart from a MacBook - open here from now on.
    if (req.session) { req.session.scpView = 'm'; }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(pageFile);
};

// There is deliberately no device sniffing here any more. Every signed-in visitor gets this
// page, on a phone, a tablet or a desktop, because the hospital wanted one thing that behaves
// like the app rather than two front doors. The user agent could never place an iPad anyway -
// since iPadOS 13 it reports itself as macOS Safari, identical to a MacBook.

// Watches the root for that marker. Anything else is none of its business and is passed on
// untouched, so the ordinary site is unaffected by this sitting in front of it.
//
// It only sends them on once they are actually signed in. Bouncing a signed-out visitor to /m
// would put them straight back here - /m redirects them out again - and the two would trade the
// request until the browser gave up. While signed out the marker simply rides along in the URL,
// through the login form's hidden urlargs field, and is acted on when they come back signed in.
exports.root = function (web, req, res, next, url) {
    const root = url || '/';
    const q = (req && req.query) || {};
    const signedIn = signedInUser(web, req) != null;

    // The way to the full MeshCentral site, which is otherwise unreachable now that the link is
    // gone from the page. Device groups, moving a computer between wards and adding an account
    // all live there, so this has to keep working:  https://remote.kpsnana.com/?m=0
    // The choice is remembered, so the full site survives a reload and normal navigation.
    // On a phone MeshCentral would serve its own old mobile page for the full site, which has
    // none of the hospital's styling; mobile=0 is its override for that, read in getRenderPage.
    // Set here, so a reload or a plain link back to the root keeps the full site too.
    const fullSite = function () { if (q.mobile == null) { try { req.query.mobile = '0'; } catch (e) { } } next(); };
    if (q.m === '0') { if (req.session) { req.session.scpView = 'full'; } fullSite(); return; }

    if (!signedIn) { next(); return; } // Before that the login page is the same either way.
    if (req.session && (req.session.scpView === 'full')) { fullSite(); return; }

    // A query that names something goes through untouched - above all a link to a computer,
    // which /m opens as /?node=..&viewmode=11. Redirecting those sent the technician straight
    // back to the device list, so the button looked like it did nothing.
    //
    // Naming the keys matters. "Any query at all" was the rule before, and it meant the front
    // door stopped working the moment someone opened a computer and closed it again: MeshCentral
    // leaves its display flags behind in the URL, so the root became /?hide=16&mobile=0 and
    // stayed that way. Nothing in that is aimed anywhere - it is debris from a page that has
    // already closed - but it was enough to pin someone to the full site for good.
    //
    // Checked before the m=1 marker below, so a link to a computer wins over it either way.
    for (const key of AIMED_AT_SOMETHING) { if (q[key] != null) { next(); return; } }

    // A bare root, the marker that carries someone back here after logging in, or a URL
    // carrying nothing but the leftovers of a screen they have already left.
    res.redirect(root + 'm');
};

exports.data = function (web, req, res) {
    const user = signedInUser(web, req);
    if (user == null) { res.status(401).json({ error: 'NOT_SIGNED_IN' }); return; }
    const domainid = (user._id.split('/')[1]) || '';

    // Only the device groups this account may see. Rights come from the same place the rest of
    // the server reads them, so a user never sees more here than on the full site.
    let rooms = [];
    try {
        rooms = web.GetAllMeshIdWithRights(user)
            .map(id => web.meshes[id])
            .filter(m => m && m.domain === domainid)
            .map(m => ({ id: m._id, name: m.name }));
    } catch (ex) { res.status(500).json({ error: 'RIGHTS_UNAVAILABLE' }); return; }
    if (rooms.length === 0) { res.setHeader('Cache-Control', 'no-store'); res.json({ rooms: [], nodes: [] }); return; }

    const roomIds = rooms.map(r => r.id);
    web.db.GetAllTypeNoTypeFieldMeshFiltered(roomIds, null, domainid, 'node', null, 0, 0, function (err, docs) {
        if ((err != null) || (docs == null)) { res.status(500).json({ error: 'DEVICES_UNAVAILABLE' }); return; }
        web.db.GetAllTypeNoTypeField('scplayout', domainid, function (layoutErr, layout) {
            const positions = (layoutErr == null && Array.isArray(layout)) ? layout : [];
            // One link for every device, and it asks for the full desktop page even on a phone.
            //
            // MeshCentral's own mobile page loads none of this hospital's work - not the canvas
            // fitting, the quality ladder that keeps the picture on WEBP, the session health
            // panel, nor direct LAN. A phone sent there gets a bare remote desktop and loses all
            // of it, which is what the blank screen turned out to be.
            //
            // mobile=0 is MeshCentral's own override, read in getRenderPage, so no upstream code
            // has to change. hide=31 drops the masthead, the tab strip, the footer, the panel
            // titles and the left bar: all of it is for choosing and managing devices, and by
            // this point a device has been chosen. scpapp=1 is read by scp-remote-ui.js, which
            // puts back the two things that removes - which machine, and the way back - so the
            // screen reads the way the Desktop App's window does.
            const openLink = id =>
                '?node=' + encodeURIComponent(String(id).split('/').pop()) + '&viewmode=11&hide=31&mobile=0&scpapp=1';
            const nodes = docs.map(n => ({
                id: n._id,
                name: n.name || n._id,
                room: n.meshid,
                ip: n.host || '',
                link: openLink(n._id),
                // Same reading of "online" the app uses: an agent websocket that finished
                // authenticating, not merely a record that once connected.
                online: !!(web.wsagents[n._id] && web.wsagents[n._id].authenticated === 2),
                // Windows and on: the printing fix can be offered (it still checks rights when pressed)
                canFix: isWindowsAgent(web.wsagents[n._id]),
                position: positions.find(p => p.nodeid === n._id) || null
            }));
            res.setHeader('Cache-Control', 'no-store');
            res.json({ rooms: rooms, nodes: nodes });
        });
    });
};

// "Printing does not work" from the phone: clears stuck print jobs and restarts the print
// spooler on one computer, the same command as the dashboard's button (scp-health.js), and
// waits for the computer's answer. It needs the same right MeshCentral's own Run Commands
// needs on that computer. The custom header keeps another site from making a signed-in
// browser press it (a cross-site form cannot set it). Who pressed it is kept in the
// computer's history next to the dashboard's fixes.
const MESHRIGHT_REMOTECOMMAND = 0x00020000;
const pendingFix = new Map();
let fixScript = null;
function isWindowsAgent(agent) {
    const id = agent && agent.authenticated === 2 && agent.agentInfo && agent.agentInfo.agentId;
    return !!id && ((id > 0 && id < 5) || (id > 41 && id < 44));
}
function readJson(req, max) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => { body += chunk; if (body.length > max) { reject(Error('TOO_LARGE')); req.destroy(); } });
        req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(Error('INVALID_INPUT')); } });
        req.on('error', reject);
    });
}
exports.fix = function (web, req, res) {
    const user = signedInUser(web, req);
    if (user == null) { res.status(401).json({ error: 'NOT_SIGNED_IN' }); return; }
    if (req.get('X-SCP-Request') !== '1') { res.status(403).json({ error: 'BAD_REQUEST' }); return; }
    readJson(req, 2048).then(body => {
        if (typeof body.nodeid !== 'string' || body.action !== 'printer') { res.status(400).json({ error: 'INVALID_INPUT' }); return; }
        const domainid = (user._id.split('/')[1]) || '';
        const domain = (web.parent && web.parent.config && web.parent.config.domains && web.parent.config.domains[domainid]) || { id: domainid };
        web.GetNodeWithRights(domain, user, body.nodeid, function (node, rights, visible) {
            if (!node || !visible || ((rights & MESHRIGHT_REMOTECOMMAND) === 0)) { res.status(403).json({ error: 'ACCESS_DENIED' }); return; }
            const agent = web.wsagents[body.nodeid];
            if (!isWindowsAgent(agent)) { res.status(409).json({ error: 'NOT_ONLINE' }); return; }
            if (!fixScript) { fixScript = require('./morning-check').loadHealth().FIX.printer_fix(); }
            const ticket = 'scpmfix' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
            const timer = setTimeout(() => { if (pendingFix.delete(ticket)) res.status(504).json({ error: 'NO_ANSWER' }); }, 90000);
            pendingFix.set(ticket, { res, timer, web, nodeid: body.nodeid, domain: domainid, user: user._id });
            try { agent.send(JSON.stringify({ action: 'runcommands', type: 2, cmds: fixScript, runAsUser: 0, reply: true, responseid: ticket })); }
            catch (e) { clearTimeout(timer); pendingFix.delete(ticket); res.status(500).json({ error: 'SEND_FAILED' }); }
        });
    }).catch(e => { res.status(400).json({ error: e.message || 'INVALID_INPUT' }); });
};
// Called from meshagent.js with the computer's answer.
exports.receive = function (nodeid, command) {
    const job = command && pendingFix.get(command.responseid);
    if (!job || job.nodeid !== nodeid || command.progress === true) return false;
    pendingFix.delete(command.responseid);
    clearTimeout(job.timer);
    const m = String(command.result || '').match(/SCP_FIX:(\{[^\r\n]*\})/);
    let r = null;
    try { r = m ? JSON.parse(m[1]) : null; } catch (e) { r = null; }
    const busy = /COMMAND_BUSY/.test(String(command.result || ''));
    const key = 'scphealthlog/' + nodeid;
    job.web.db.Get(key, function (err, rows) {
        const before = (!err && rows && rows[0]) || null;
        const entries = ((before && before.entries) || []).concat([{ at: Date.now(), action: 'printer_fix', ok: !!(r && r.ok), result: r, by: job.user, from: 'mobile' }]).slice(-30);
        job.web.db.Set({ _id: key, type: 'scphealthlog', domain: job.domain, nodeid, entries, updated: Date.now() }, function () { });
    });
    job.res.setHeader('Cache-Control', 'no-store');
    if (r) job.res.json({ ok: !!r.ok, before: r.before, after: r.after, spooler: r.spooler });
    else job.res.status(busy ? 409 : 502).json({ error: busy ? 'COMMAND_BUSY' : 'NO_RESULT' });
    return true;
};

// Wired from webserver.js so that file gains one line rather than this whole module. It has to
// be called before the root route is registered, or Express hands the root to that one first
// and the marker is never seen.
exports.attach = function (web, app, url) {
    app.get(url, function (req, res, next) { exports.root(web, req, res, next, url); });
    app.get(url + 'm', function (req, res) { exports.page(web, req, res, url); });
    app.get(url + 'm-data', function (req, res) { exports.data(web, req, res); });
    app.post(url + 'm-fix', function (req, res) { exports.fix(web, req, res); });
};

// Exposed for the tests, which check the shape without standing a server up.
exports.signedInUser = signedInUser;
exports.pageFile = pageFile;
