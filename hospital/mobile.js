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
    if (q.m === '0') { if (req.session) { req.session.scpView = 'full'; } next(); return; }

    if (!signedIn) { next(); return; } // Before that the login page is the same either way.
    if (req.session && (req.session.scpView === 'full')) { next(); return; }

    // Only a bare visit to the root is a request for the front door. Anything carrying a query
    // was aimed somewhere specific and goes through untouched - above all the remote desktop
    // itself, which /m opens as /?node=..&viewmode=10. Redirecting that sent the technician
    // straight back to the device list, so the button looked like it did nothing.
    //
    // Checked before the m=1 marker below, so a link to a computer wins over it either way.
    for (const key in q) { if (key !== 'm') { next(); return; } }

    // A bare root, or the marker that carries someone back here after logging in.
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
                position: positions.find(p => p.nodeid === n._id) || null
            }));
            res.setHeader('Cache-Control', 'no-store');
            res.json({ rooms: rooms, nodes: nodes });
        });
    });
};

// Wired from webserver.js so that file gains one line rather than this whole module. It has to
// be called before the root route is registered, or Express hands the root to that one first
// and the marker is never seen.
exports.attach = function (web, app, url) {
    app.get(url, function (req, res, next) { exports.root(web, req, res, next, url); });
    app.get(url + 'm', function (req, res) { exports.page(web, req, res, url); });
    app.get(url + 'm-data', function (req, res) { exports.data(web, req, res); });
};

// Exposed for the tests, which check the shape without standing a server up.
exports.signedInUser = signedInUser;
exports.pageFile = pageFile;
