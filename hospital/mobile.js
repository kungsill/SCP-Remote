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
exports.page = function (web, req, res) {
    if (signedInUser(web, req) == null) { res.redirect('/'); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(pageFile);
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

// Wired from webserver.js so that file gains two lines rather than this whole module.
exports.attach = function (web, app, url) {
    app.get(url + 'm', function (req, res) { exports.page(web, req, res); });
    app.get(url + 'm-data', function (req, res) { exports.data(web, req, res); });
};

// Exposed for the tests, which check the shape without standing a server up.
exports.signedInUser = signedInUser;
exports.pageFile = pageFile;
