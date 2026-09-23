'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mobile = require('../mobile');

// /m reads the fleet through the signed-in user's own session. The danger it has to stay away
// from is the Desktop App's /scp-client-api, which authenticates with a per-installation token
// and refuses anything carrying an Origin header so that a web page can never call it. These
// check that the page shows only what the account may see, and that nothing here reaches for
// that endpoint or changes the app the hospital is already using.

function web(options) {
    const o = options || {};
    return {
        users: o.users || {},
        meshes: o.meshes || {},
        wsagents: o.wsagents || {},
        GetAllMeshIdWithRights: o.rights || (() => []),
        db: {
            GetAllTypeNoTypeFieldMeshFiltered: (meshes, extras, domain, type, id, skip, limit, cb) => {
                o.asked = { meshes: meshes, domain: domain, type: type, skip: skip, limit: limit };
                cb(o.nodesError || null, o.nodesError ? null : (o.nodes || []));
            },
            GetAllTypeNoTypeField: (type, domain, cb) => cb(null, o.layout || [])
        }
    };
}

function reply() {
    const r = { code: 200, body: null, headers: {}, redirected: null, sent: null };
    r.status = c => { r.code = c; return r; };
    r.json = b => { r.body = b; return r; };
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
    r.redirect = to => { r.redirected = to; };
    r.sendFile = f => { r.sent = f; };
    return r;
}

const admin = { _id: 'user//admin', name: 'admin' };
const signedIn = { session: { userid: 'user//admin' } };

test('a request with no session is refused rather than answered with an empty fleet', () => {
    const w = web({ users: { 'user//admin': admin } });
    const r = reply();
    mobile.data(w, { session: null }, r);
    assert.equal(r.code, 401);
    assert.equal(r.body.error, 'NOT_SIGNED_IN');
});

test('a session naming an account the server does not know is refused too', () => {
    const r = reply();
    mobile.data(web({ users: {} }), { session: { userid: 'user//ghost' } }, r);
    assert.equal(r.code, 401);
});

test('a signed-out browser goes to the login page carrying a marker to come back with', () => {
    // Plain '/' would strand them on MeshCentral's own mobile page after they log in, which is
    // exactly what happened the first time this was tried on a phone.
    const r = reply();
    mobile.page(web({ users: {} }), { session: null }, r);
    assert.equal(r.redirected, '/?m=1');
    assert.equal(r.sent, null, 'nothing should be served to a signed-out browser');
});

test('the marker sends them on to /m once the login has returned them to the root', () => {
    const r = reply();
    let passedOn = false;
    mobile.root(web({ users: { 'user//admin': admin } }), { query: { m: '1' }, session: { userid: 'user//admin' } }, r, () => { passedOn = true; }, '/');
    assert.equal(r.redirected, '/m');
    assert.equal(passedOn, false);
});

test('an ordinary visit to the root is passed straight through', () => {
    // This sits in front of the busiest route on the server; everything else must be untouched.
    for (const query of [{}, { m: '0' }, { m: 'yes' }, { node: 'abc', viewmode: '10' }]) {
        const r = reply();
        let passedOn = false;
        mobile.root(web({}), { query: query, session: null }, r, () => { passedOn = true; }, '/');
        assert.equal(passedOn, true, JSON.stringify(query) + ' should reach the normal site');
        assert.equal(r.redirected, null);
    }
    const r = reply();
    let passedOn = false;
    mobile.root(web({}), { session: null }, r, () => { passedOn = true; }, '/');
    assert.equal(passedOn, true, 'a request with no query at all must not throw');
});

test('a domain served under a sub-path keeps its prefix on both legs', () => {
    const r = reply();
    mobile.page(web({ users: {} }), { session: null }, r, '/sub/');
    assert.equal(r.redirected, '/sub/?m=1');
    const r2 = reply();
    mobile.root(web({ users: { 'user//admin': admin } }), { query: { m: '1' }, session: { userid: 'user//admin' } }, r2, () => { }, '/sub/');
    assert.equal(r2.redirected, '/sub/m');
});

test('the page is served from a file outside the publicly served folders', () => {
    // If it sat in public/ it would be reachable without the session check above.
    assert.ok(fs.existsSync(mobile.pageFile), 'the page file should exist');
    assert.ok(!mobile.pageFile.split(path.sep).includes('public'), 'the page must not live under public/');
});

test('only the device groups the account may see are returned', () => {
    const o = {
        users: { 'user//admin': admin },
        meshes: {
            'mesh//er': { _id: 'mesh//er', name: 'ER', domain: '' },
            'mesh//lab': { _id: 'mesh//lab', name: 'Lab', domain: '' },
            'mesh//other': { _id: 'mesh//other', name: 'Not mine', domain: '' }
        },
        rights: () => ['mesh//er', 'mesh//lab'],
        nodes: []
    };
    const w = web(o);
    const r = reply();
    mobile.data(w, signedIn, r);
    assert.deepEqual(r.body.rooms.map(x => x.name), ['ER', 'Lab']);
    assert.deepEqual(o.asked.meshes, ['mesh//er', 'mesh//lab'], 'the device query is limited to those groups');
});

test('an account with no device groups gets an empty fleet without a database query', () => {
    const o = { users: { 'user//admin': admin }, rights: () => [], nodes: [{ _id: 'node//x' }] };
    const r = reply();
    mobile.data(web(o), signedIn, r);
    assert.deepEqual(r.body, { rooms: [], nodes: [] });
    assert.equal(o.asked, undefined, 'nothing to ask about');
});

test('online means an agent websocket that finished authenticating', () => {
    // A device record that once connected is not the same as a device that is there now.
    const o = {
        users: { 'user//admin': admin },
        meshes: { 'mesh//er': { _id: 'mesh//er', name: 'ER', domain: '' } },
        rights: () => ['mesh//er'],
        nodes: [
            { _id: 'node//a', name: 'ER 1', meshid: 'mesh//er', host: '192.168.6.1' },
            { _id: 'node//b', name: 'ER 2', meshid: 'mesh//er', host: '192.168.6.2' },
            { _id: 'node//c', name: 'ER 3', meshid: 'mesh//er' }
        ],
        wsagents: { 'node//a': { authenticated: 2 }, 'node//b': { authenticated: 1 } }
    };
    const r = reply();
    mobile.data(web(o), signedIn, r);
    const byName = Object.fromEntries(r.body.nodes.map(n => [n.name, n]));
    assert.equal(byName['ER 1'].online, true);
    assert.equal(byName['ER 2'].online, false, 'half-authenticated is not online');
    assert.equal(byName['ER 3'].online, false, 'no agent socket at all is not online');
    assert.equal(byName['ER 3'].ip, '', 'a device with no host reports an empty address, not undefined');
});

test('a database failure says so instead of reporting an empty hospital', () => {
    const o = {
        users: { 'user//admin': admin },
        meshes: { 'mesh//er': { _id: 'mesh//er', name: 'ER', domain: '' } },
        rights: () => ['mesh//er'],
        nodesError: new Error('database is busy')
    };
    const r = reply();
    mobile.data(web(o), signedIn, r);
    assert.equal(r.code, 500);
    assert.equal(r.body.error, 'DEVICES_UNAVAILABLE');
});

test('answers are never cached, so a stale device list cannot be shown as current', () => {
    const o = { users: { 'user//admin': admin }, rights: () => [] };
    const r = reply();
    mobile.data(web(o), signedIn, r);
    assert.equal(r.headers['cache-control'], 'no-store');
});

// Both files explain in comments why they stay away from the app API, so look at the code.
function withoutComments(text) {
    return text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

test('nothing here reaches for the Desktop App API or its token', () => {
    const source = fs.readFileSync(path.join(__dirname, '../mobile.js'), 'utf8');
    const client = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-mobile.js'), 'utf8');
    for (const [name, text] of [['hospital/mobile.js', source], ['public/scripts/scp-mobile.js', client]]) {
        const code = withoutComments(text);
        assert.ok(!code.includes('scp-client-api'), name + ' must not call the app API');
        assert.ok(!/desktop-clients/.test(code), name + ' must not borrow the app credential path');
        assert.ok(/scp-client-api/.test(text), name + ' should still explain why it does not');
    }
});

test('starting a session hands over to the page MeshCentral already serves', () => {
    // Reusing that page keeps the consent prompt on the ward computer, and everything else
    // about the session, on the path that is already tested rather than a second one.
    const client = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-mobile.js'), 'utf8');
    assert.ok(client.includes('viewmode=10'), 'should open the remote desktop view');
    assert.ok(!/deviceshare|publicid/.test(client), 'it must not mint device shares of its own');
});

test('the mobile client is served from the same origin and sends the session cookie', () => {
    const client = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-mobile.js'), 'utf8');
    assert.ok(client.includes("credentials: 'same-origin'"), 'the fetch has to carry the session');
    assert.ok(!/https?:\/\//.test(client.replace(/\/\/[^\n]*/g, '')), 'no absolute origins belong in this file');
});

test('the page and its assets are wired to each other', () => {
    const page = fs.readFileSync(mobile.pageFile, 'utf8');
    assert.ok(page.includes('scripts/scp-mobile.js'));
    assert.ok(page.includes('styles/scp-mobile.css'));
    assert.ok(fs.existsSync(path.join(__dirname, '../../public/scripts/scp-mobile.js')));
    assert.ok(fs.existsSync(path.join(__dirname, '../../public/styles/scp-mobile.css')));
    // Relative, so the page works whether or not the domain is served from a sub-path.
    assert.ok(!page.includes('"/scripts/'), 'asset paths should be relative');
});

test('webserver wires /m without disturbing the app route beside it', () => {
    const server = fs.readFileSync(path.join(__dirname, '../../webserver.js'), 'utf8');
    assert.ok(server.includes("require('./hospital/mobile').attach"), '/m should be attached');
    // It must run before the root route, or Express gives the root away first.
    assert.ok(server.indexOf("hospital/mobile').attach") < server.indexOf('obj.app.get(url, handleRootRequest)'), 'attach must come before the root route');
    assert.ok(server.includes("obj.app.post(url + 'scp-client-api'"), 'the app API must still be registered');
});

test('the device button leaves /m for the site root instead of reloading /m', () => {
    // A bare '?node=..' is relative to /m, so it reloads this page with the query ignored -
    // which on a phone looks exactly like the button doing nothing at all.
    const client = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-mobile.js'), 'utf8');
    assert.ok(!/=\s*'\?node=/.test(client), 'the target must not be relative to /m');

    // Run the rule from the file rather than restating it here.
    const m = /const siteRoot = ([^;]+);/.exec(client);
    assert.ok(m, 'scp-mobile.js should still work the site root out for itself');
    const siteRoot = new Function('location', 'return (' + m[1] + ')');
    assert.equal(siteRoot({ pathname: '/m' })(), '/', 'the default domain');
    assert.equal(siteRoot({ pathname: '/sub/m' })(), '/sub/', 'a domain served under a sub-path');
});

test('the full-site link is relative, so a sub-path domain is not sent to the wrong place', () => {
    const page = fs.readFileSync(mobile.pageFile, 'utf8');
    assert.ok(/id="full" href="\."/.test(page), 'href="." resolves to the site root from /m');
});

// Added to a phone's home screen, /m should open as its own window with the hospital logo.
// The parts have to agree or it silently falls back to a browser tab with a blank icon.
const manifestFile = path.join(__dirname, '../../public/scp-mobile.webmanifest');

test('the home-screen manifest is valid and points back at the mobile page', () => {
    const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    assert.equal(m.start_url, 'm', 'relative to the manifest at the site root, this is /m');
    assert.equal(m.display, 'standalone');
    assert.ok(m.name && m.short_name, 'a launcher needs both names');
});

test('the manifest scope covers the remote desktop page, not just /m', () => {
    // The device button navigates to the site root. With a scope of /m that leaves the
    // installed window and opens a browser tab instead, which defeats the point.
    const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    assert.equal(m.scope, '/');
});

test('every icon the manifest names is actually there', () => {
    const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    assert.ok(m.icons.length > 0, 'without an icon the home screen shows a screenshot');
    for (const icon of m.icons) {
        const file = path.join(__dirname, '../../public', icon.src);
        assert.ok(fs.existsSync(file), icon.src + ' is named by the manifest but missing');
        // The declared size has to match the file, or a launcher may reject or blur it.
        const b = fs.readFileSync(file);
        assert.equal(b.readUInt32BE(16) + 'x' + b.readUInt32BE(20), icon.sizes, icon.src + ' declares the wrong size');
    }
});

test('the page links the manifest and an icon for iPhone and iPad', () => {
    const page = fs.readFileSync(mobile.pageFile, 'utf8');
    assert.ok(/rel="manifest" href="scp-mobile.webmanifest"/.test(page), 'relative, like the other assets');
    assert.ok(/rel="apple-touch-icon"/.test(page), 'iOS ignores the manifest icons');
    assert.ok(/name="theme-color"/.test(page));
});

test('a signed-out visit to the root with the marker does not bounce back to /m', () => {
    // The loop this prevents: /m sends a signed-out browser to /?m=1, and if the root sent it
    // straight back to /m the two would trade the request until the browser gave up. Caught in
    // production the first time, so it has a test of its own.
    const r = reply();
    let passedOn = false;
    mobile.root(web({ users: {} }), { query: { m: '1' }, session: null }, r, () => { passedOn = true; }, '/');
    assert.equal(r.redirected, null, 'a signed-out visitor must reach the login page');
    assert.equal(passedOn, true);
});

test('the whole round trip ends on the mobile page', () => {
    const signedOut = web({ users: {} });
    const signedIn = web({ users: { 'user//admin': admin } });
    const session = { userid: 'user//admin' };

    // 1. Tap /m while signed out: sent to the root, marker in hand.
    let r = reply();
    mobile.page(signedOut, { session: null }, r, '/');
    assert.equal(r.redirected, '/?m=1');

    // 2. The root lets them through to the login page rather than sending them back.
    r = reply();
    let reachedLogin = false;
    mobile.root(signedOut, { query: { m: '1' }, session: null }, r, () => { reachedLogin = true; }, '/');
    assert.equal(reachedLogin, true);
    assert.equal(r.redirected, null);

    // 3. MeshCentral returns them to the root after login, marker carried in urlargs.
    r = reply();
    mobile.root(signedIn, { query: { m: '1' }, session: session }, r, () => { }, '/');
    assert.equal(r.redirected, '/m');

    // 4. And this time /m serves the page.
    r = reply();
    mobile.page(signedIn, { session: session }, r, '/');
    assert.equal(r.sent, mobile.pageFile);
    assert.equal(r.redirected, null);
});
