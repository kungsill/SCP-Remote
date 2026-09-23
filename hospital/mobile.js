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

// Which devices should land on the small-screen page without being asked.
//
// The server only has the user agent to go on, and it does not answer this cleanly:
//   phones             say "Mobile"                                    - caught
//   Android tablets    do not; Chrome leaves "Mobile" off a tablet     - caught by "android"
//   older iPads        say "iPad"                                      - caught
//   iPad since iPadOS 13 reports itself as macOS Safari                - NOT caught, and
//     cannot be, because that agent is identical to a MacBook's.
//
// The remembered choice below is what covers that last case: a visit to /m once is enough, and
// from then on the device opens there whatever it claims to be.
exports.isHandheld = function (req) {
    const ua = req && req.headers && req.headers['user-agent'];
    if (typeof ua !== 'string') { return false; }
    const s = ua.toLowerCase();
    return (s.indexOf('mobile') >= 0) || (s.indexOf('ipad') >= 0) ||
        (s.indexOf('tablet') >= 0) || (s.indexOf('silk') >= 0) || (s.indexOf('android') >= 0);
};

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

    if ((q.m === '1') && signedIn) { res.redirect(root + 'm'); return; }

    // The escape hatch. Without it the "full site" link would be bounced straight back here by
    // the rule below, and there would be no way off the small-screen page at all.
    if (q.m === '0') { if (req.session) { req.session.scpView = 'full'; } next(); return; }

    if (!signedIn) { next(); return; } // Before that the login page is the same either way.

    // What this device asked for last time beats any guess made from the user agent. It is also
    // the only thing that works for an iPad, which is indistinguishable from a MacBook here.
    const asked = req.session && req.session.scpView;
    if (asked === 'full') { next(); return; }
    if ((asked === 'm') || exports.isHandheld(req)) { res.redirect(root + 'm'); return; }

    next();
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
            const nodes = docs.map(n => ({
                id: n._id,
                name: n.name || n._id,
                room: n.meshid,
                ip: n.host || '',
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
