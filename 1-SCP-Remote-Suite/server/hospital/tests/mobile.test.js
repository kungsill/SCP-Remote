'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mobile = require('../mobile');
const landing = require('../../public/scripts/scp-mobile-landing');

test('first-login legacy pages return to the app while device links and full-site links keep their target', () => {
    assert.equal(landing.landingUrl('https://hospital.example/', '/'), 'https://hospital.example/m');
    assert.equal(landing.landingUrl('https://hospital.example/?mobile=1&hide=16', '/'), 'https://hospital.example/m');
    assert.equal(landing.landingUrl('https://hospital.example/sub/?m=1', '/sub/'), 'https://hospital.example/sub/m');
    const remote = new URL(landing.landingUrl('https://hospital.example/?node=abc&viewmode=11&mobile=1', '/'));
    assert.equal(remote.searchParams.get('node'), 'abc');
    assert.equal(remote.searchParams.get('viewmode'), '11');
    assert.equal(remote.searchParams.get('mobile'), '0');
    assert.equal(new URL(landing.landingUrl('https://hospital.example/?m=0&mobile=1', '/')).searchParams.get('m'), '0');
    assert.equal(landing.landingUrl('https://hospital.example/', 'https://other.example/'), null);
});

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
    assert.ok(!/deviceshare|publicid/.test(client), 'it must not mint device shares of its own');
    assert.ok(/node\.link/.test(client), 'the link is worked out on the server, where the browser is known');
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

const cssFile = path.join(__dirname, '../../public/styles/scp-mobile.css');

test('the Thai font is loaded, not merely named', () => {
    // Naming Sarabun without an @font-face is what made the page fall back to whatever the
    // phone had and look unfinished beside the rest of the site. The files ship with the server.
    const css = fs.readFileSync(cssFile, 'utf8');
    const faces = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
    assert.ok(faces.length >= 3, 'regular, semibold and bold');
    for (const ref of faces) {
        const file = path.resolve(path.dirname(cssFile), ref);
        assert.ok(fs.existsSync(file), ref + ' is referenced by the stylesheet but not on disk');
    }
    assert.ok(/font-display:\s*swap/.test(css), 'text should show before the font arrives, not after');
});

test('colours come from variables so the dark scheme can replace them', () => {
    const css = fs.readFileSync(cssFile, 'utf8');
    assert.ok(/@media \(prefers-color-scheme: dark\)/.test(css), 'wards are dark at night');
    // A literal colour outside :root would survive into dark mode and glare.
    const body = css.split('@media (prefers-color-scheme: dark)')[1] || '';
    assert.ok(body.includes('--surface'), 'the dark scheme should redefine the same names');
    assert.ok(/color-scheme: light dark/.test(css), 'so form controls and scrollbars follow too');
});

test('a first load that fails clears the placeholders instead of pretending to load forever', () => {
    const client = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-mobile.js'), 'utf8');
    assert.ok(/if \(!loaded\)/.test(client), 'the failure path has to know it is the first one');
    assert.ok(/skeleton\(\)/.test(client), 'and there has to be something to clear');
});

test('the page and its stylesheet agree on the version, so a phone picks changes up', () => {
    const page = fs.readFileSync(mobile.pageFile, 'utf8');
    const versions = [...page.matchAll(/scp-mobile\.(?:js|css)\?v=([\w-]+)/g)].map(m => m[1]);
    assert.equal(versions.length, 2, 'both assets carry a version');
    assert.equal(versions[0], versions[1], 'and the same one, or half the change lands');
});

test('pink leads, and it is the hospital\'s own pink', () => {
    // #b02a72 is the logo, and the consent box a ward computer puts on screen. Using it as the
    // primary makes the page and the thing it asks permission for look like each other.
    const css = fs.readFileSync(cssFile, 'utf8');
    const light = css.split('@media (prefers-color-scheme: dark)')[0];
    assert.ok(/--brand:\s*#b02a72/i.test(light), 'the primary should be the hospital pink');
    assert.ok(/--teal:/.test(light) && /--green:/.test(light), 'with turquoise and green behind it');
    for (const name of ['--brand', '--teal', '--green', '--surface', '--ink', '--on-brand']) {
        const dark = css.split('@media (prefers-color-scheme: dark)')[1] || '';
        assert.ok(dark.includes(name + ':'), name + ' must be restated for the dark scheme');
    }
});

test('the dark scheme lifts the pink rather than dimming it', () => {
    // Draining the colour out is what made an earlier dark theme look lifeless.
    const css = fs.readFileSync(cssFile, 'utf8');
    const value = s => { const m = /--brand:\s*#([0-9a-f]{6})/i.exec(s); return m ? parseInt(m[1], 16) : 0; };
    const light = value(css.split('@media (prefers-color-scheme: dark)')[0]);
    const dark = value(css.split('@media (prefers-color-scheme: dark)')[1] || '');
    assert.ok(dark > light, 'the dark scheme\'s pink should be the brighter of the two');
});

test('every colour is a variable, so the dark scheme can actually replace them', () => {
    // A literal left in a rule survives into dark mode and glares.
    const css = fs.readFileSync(cssFile, 'utf8');
    const body = css.slice(css.indexOf('* { box-sizing'));
    const literals = [...body.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(m => m[0]);
    assert.deepEqual(literals, [], 'these belong in :root: ' + literals.join(', '));
});

test('the three fleet numbers are told apart by colour', () => {
    const css = fs.readFileSync(cssFile, 'utf8');
    for (const n of [1, 2, 3]) {
        assert.ok(css.includes('.fleet-summary article:nth-child(' + n + ')'), 'stat ' + n + ' needs its own colour');
    }
});

test('the header carries the hospital logo', () => {
    const page = fs.readFileSync(mobile.pageFile, 'utf8');
    assert.ok(/<img src="images\/scp-logo\.png"/.test(page));
    assert.ok(fs.existsSync(path.join(__dirname, '../../public/images/scp-logo.png')));
    assert.ok(/alt=""/.test(page), 'decorative beside the name, so screen readers should skip it');
});


// Every signed-in visitor lands on /m now, whatever they are using. The hospital wanted one
// front door that behaves like the app, not a page that guesses at the device.
const withAdmin = () => web({ users: { 'user//admin': admin } });
const session = () => ({ userid: 'user//admin' });
const agents = {
    'a phone': 'Mozilla/5.0 (Linux; Android 14; SM-S911B) Chrome/140 Mobile Safari/537.36',
    'a Tab S9 FE': 'Mozilla/5.0 (Linux; Android 14; SM-X510) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    'an iPad': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15',
    'a Windows PC': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36',
    'no user agent at all': undefined
};

test('every signed-in device is taken to the remote page', () => {
    for (const [what, ua] of Object.entries(agents)) {
        const r = reply();
        let through = false;
        mobile.root(withAdmin(), { query: {}, headers: ua ? { 'user-agent': ua } : {}, session: session() }, r, () => { through = true; }, '/');
        assert.equal(r.redirected, '/m', what + ' should land on the remote page');
        assert.equal(through, false);
    }
});

test('which page a visitor lands on is never guessed from the user agent', () => {
    // An iPad reads exactly like a MacBook, so a rule built on the agent was going to be wrong
    // for one of them. Everyone goes to /m instead, and nothing about that decision reads the
    // agent. (Building the link to open a device does read it, but that is a different
    // question: which URL scheme the page MeshCentral serves will understand.)
    const source = fs.readFileSync(path.join(__dirname, '../mobile.js'), 'utf8');
    const code = withoutComments(source);
    const root = code.slice(code.indexOf('exports.root'), code.indexOf('exports.data'));
    assert.ok(root.length > 0, 'the root handler should still be there');
    assert.ok(!/user-agent/i.test(root), 'the front-door decision must not read the agent');
});

test('signing in is not disturbed: the login page is reached without a redirect', () => {
    const r = reply();
    let through = false;
    mobile.root(web({}), { query: {}, headers: {}, session: null }, r, () => { through = true; }, '/');
    assert.equal(through, true);
    assert.equal(r.redirected, null);
});

test('?m=0 still reaches the full site, which is now the only way to it', () => {
    // The link is gone from the page, so device groups, moving a computer between wards and
    // adding an account are reachable only through this. If it breaks, they are unreachable.
    const s = session();
    const r = reply();
    let through = false;
    mobile.root(withAdmin(), { query: { m: '0' }, headers: {}, session: s }, r, () => { through = true; }, '/');
    assert.equal(through, true, 'the full site must load');
    assert.equal(r.redirected, null);
    assert.equal(s.scpView, 'full', 'and be remembered, or a reload would bounce straight back');

    const r2 = reply();
    let through2 = false;
    mobile.root(withAdmin(), { query: {}, headers: {}, session: s }, r2, () => { through2 = true; }, '/');
    assert.equal(through2, true, 'a later plain visit stays on the full site');
});

test('going to /m again puts the device back on the remote page', () => {
    const s = { userid: 'user//admin', scpView: 'full' };
    const r = reply();
    mobile.page(withAdmin(), { session: s, headers: {} }, r, '/');
    assert.equal(r.sent, mobile.pageFile);
    assert.equal(s.scpView, 'm');
});

test('the page no longer offers a full-site link', () => {
    const page = fs.readFileSync(mobile.pageFile, 'utf8');
    assert.ok(!/id="full"/.test(page), 'it should look like the app, with nothing else on it');
});

test('a link aimed at a particular device is let through, not sent to the list', () => {
    // /m opens the remote desktop as /?node=..&viewmode=10. Redirecting that to /m put the
    // technician back on the device list, so pressing a computer appeared to do nothing.
    for (const query of [
        { node: 'abc', viewmode: '11', hide: '31' },
        { gotonode: '8HPel8S1J2lXl7' },
        { key: 'something' },
        { gotomesh: 'er' },
        { node: 'abc', m: '1' }
    ]) {
        const r = reply();
        let through = false;
        mobile.root(withAdmin(), { query: query, headers: {}, session: session() }, r, () => { through = true; }, '/');
        assert.equal(through, true, JSON.stringify(query) + ' should reach the full site');
        assert.equal(r.redirected, null);
    }
});

test('the leftovers of a closed screen do not pin anyone to the full site', () => {
    // Reported from a tablet: open a computer, close it, and the root is now
    // /?hide=16&mobile=0 - MeshCentral's display flags, left behind when the view closed. The
    // rule used to be "any query at all goes through", so from then on the front door led to
    // the full site and there was no way back to /m short of typing it.
    //
    // None of these names anything. A viewmode with no device beside it opens nothing either.
    for (const query of [
        { hide: '16', mobile: '0' },
        { hide: '31' },
        { mobile: '0' },
        { viewmode: '11' },
        { viewmode: '11', hide: '16', mobile: '0' }
    ]) {
        const r = reply();
        let through = false;
        mobile.root(withAdmin(), { query: query, headers: {}, session: session() }, r, () => { through = true; }, '/');
        assert.equal(through, false, JSON.stringify(query) + ' is debris, not a destination');
        assert.equal(r.redirected, '/m', 'it should land on the page people actually use');
    }
});

test('asking for the full site still outranks all of that', () => {
    // The gear passes m=0, and the choice is remembered. Debris in the URL must not undo it.
    const s = session();
    const first = reply();
    let through = false;
    mobile.root(withAdmin(), { query: { m: '0' }, headers: {}, session: s }, first, () => { through = true; }, '/');
    assert.equal(through, true, 'm=0 is the way to the full site');
    assert.equal(s.scpView, 'full', 'and it is remembered');

    const later = reply();
    through = false;
    mobile.root(withAdmin(), { query: { hide: '16', mobile: '0' }, headers: {}, session: s }, later, () => { through = true; }, '/');
    assert.equal(through, true, 'someone working on the full site stays there');
    assert.equal(later.redirected, null);
});

test('a bare visit to the root is still the front door', () => {
    for (const query of [{}, { m: '1' }]) {
        const r = reply();
        mobile.root(withAdmin(), { query: query, headers: {}, session: session() }, r, () => { }, '/');
        assert.equal(r.redirected, '/m', JSON.stringify(query) + ' is a plain visit');
    }
});

test('the button opens the desktop panel, not the page of facts about the computer', () => {
    // views/default.handlebars keeps the map: 10 is MainDev, 11 is MainDevDesktop. Opening 10
    // showed the group, hostname and a power chart - correct, and not what was asked for.
    const page = fs.readFileSync(path.join(__dirname, '../../views/default.handlebars'), 'utf8');
    const map = /var panels = \{([^}]*)\}/.exec(page);
    assert.ok(map, 'the panel map should still be in default.handlebars');
    assert.ok(/11:\s*'MainDevDesktop'/.test(map[1]), 'panel 11 is the remote desktop');

    const source = fs.readFileSync(path.join(__dirname, '../mobile.js'), 'utf8');
    assert.ok(/node=.*viewmode=11/.test(source), 'the desktop page is opened on panel 11');
});

test('every device is sent to the full page, which is the only one carrying this work', () => {
    // MeshCentral's mobile page loads none of the hospital's scripts - no canvas fitting, no
    // quality ladder, no session health, no direct LAN. A phone sent there gets a bare remote
    // desktop and loses all of it. mobile=0 is MeshCentral's own override for that.
    const mobilePage = fs.readFileSync(path.join(__dirname, '../../views/default-mobile.handlebars'), 'utf8');
    for (const script of ['scp-remote-ui.js', 'scp-session.js', 'scp-lan.js']) {
        assert.ok(!mobilePage.includes(script), 'the mobile page still does not load ' + script);
    }
    const server = fs.readFileSync(path.join(__dirname, '../../webserver.js'), 'utf8');
    assert.ok(/req.query.mobile == '0'/.test(server), 'the override must still exist upstream');

    const o = {
        users: { 'user//admin': admin },
        meshes: { 'mesh//er': { _id: 'mesh//er', name: 'ER', domain: '' } },
        rights: () => ['mesh//er'],
        nodes: [{ _id: 'node//abc', name: 'ER 1', meshid: 'mesh//er' }]
    };
    for (const ua of ['Chrome/140 Mobile Safari/537.36', 'Chrome/140 Safari/537.36']) {
        const r = reply();
        mobile.data(web(o), { session: { userid: 'user//admin' }, headers: { 'user-agent': ua } }, r);
        assert.equal(r.body.nodes[0].link, '?node=abc&viewmode=11&hide=31&mobile=0&scpapp=1', ua);
    }
});

test('there is one door to the full site, and it is a link', () => {
    // Device groups, moving a computer between wards and adding an account all live on the
    // full site. The old "full site" button was removed on purpose; this replaces it, and it
    // has to be a real link so it can be opened in a new tab and shows where it goes.
    const page = fs.readFileSync(mobile.pageFile, 'utf8');
    const gear = /<a id="settings"[^>]*>/.exec(page);
    assert.ok(gear, 'the settings link is gone, and nothing else reaches the full site');
    assert.ok(/href="\?m=0&amp;mobile=0"/.test(gear[0]), 'm=0 is what the server reads as "the full site", mobile=0 keeps a phone off the old mobile page');
    assert.ok(/aria-label=/.test(gear[0]), 'an icon on its own has no accessible name');
});

test('the gear is aimed at the site root, not at this page', () => {
    // /m is served at <root>m, so a bare "?m=0" reloads this page with the query ignored -
    // the same trap the device buttons fell into. The script rewrites it.
    const client = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-mobile.js'), 'utf8');
    assert.ok(/settings\.href = siteRoot\(\) \+ '\?m=0&mobile=0'/.test(client));
});

// Built rather than grepped. The first version of this test read the script for the right
// words and passed, while on the real site the link was nowhere: it was being added to the
// left bar, and the page the gear actually lands on has no left bar. Only building the page
// and looking for the link catches that.
const { JSDOM } = require('jsdom');
async function fullSite(body) {
    const dom = new JSDOM('<html lang="th"><body>' + body + '</body></html>', { runScripts: 'outside-only' });
    const w = dom.window;
    w.requestAnimationFrame = f => f();
    if (w.document.readyState === 'loading') { await new Promise(r => w.addEventListener('DOMContentLoaded', r)); }
    w.eval(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-ui.js'), 'utf8'));
    return w.document;
}

test('the full site offers a way back, whatever else the page is missing', async () => {
    // Visiting the full site pins the session to it, so without this the gear is a one-way
    // door. The left bar looks like the place for it, but hide=16 takes the left bar away and
    // so does a narrow window - and a way out that is sometimes missing is not a way out.
    const MASTHEAD = '<div id=masthead><div class=title>SCP-Remote</div><div class=title2>Hospital IT</div></div>';
    const shapes = [
        ['masthead only, which is what the gear lands on', MASTHEAD + '<div id=p1></div>'],
        ['masthead and left bar', MASTHEAD + '<div id=page_leftbar></div><div id=p1></div>'],
        ['no masthead at all', '<div id=page_leftbar></div><div id=p1></div>']
    ];
    for (const [what, body] of shapes) {
        const d = await fullSite(body);
        const back = d.getElementById('scp-back-to-devices');
        assert.ok(back, 'no way back to /m when the page is ' + what);
        assert.equal(back.getAttribute('href'), 'm', 'it should point at /m (' + what + ')');
        assert.ok(back.textContent.trim().length > 0, 'an arrow alone does not say where it goes');
    }
});

test('the way back is styled where it actually lands', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../public/styles/scp-ui.css'), 'utf8');
    assert.ok(/#masthead #scp-back-to-devices \{/.test(css), 'unstyled it is a bare link in the header');
    // The title and subtitle beside it float left and the logout controls float right, so it
    // has to float too or it drops below them and pushes the bar open.
    const rule = /#masthead #scp-back-to-devices \{[^}]*\}/.exec(css)[0];
    assert.ok(/float: left/.test(rule), 'it sits among floated siblings, so it has to float');
});

test('every control in the header can be hit with a thumb', () => {
    const css = fs.readFileSync(cssFile, 'utf8');
    const icon = /\.icon-button \{[^}]*\}/.exec(css);
    assert.ok(icon, 'the gear needs its own rule');
    const size = /width: (\d+)px; height: (\d+)px/.exec(icon[0]);
    assert.ok(size && Number(size[1]) >= 44 && Number(size[2]) >= 44,
        'a 24px icon is a miss on a phone however neat it looks');
});

test('a device opens on the screen alone, with the page around it dropped', () => {
    // By the time someone presses a card they have already chosen a machine. The masthead,
    // the tab strip, the footer and the panel titles are all for choosing and managing
    // devices, so the page is asked to drop them: hide is 1+2+4+8+16.
    const o = {
        users: { 'user//admin': admin },
        meshes: { 'mesh//er': { _id: 'mesh//er', name: 'ER', domain: '' } },
        rights: () => ['mesh//er'],
        nodes: [{ _id: 'node//abc', name: 'ER 1', meshid: 'mesh//er' }]
    };
    const r = reply();
    mobile.data(web(o), { session: { userid: 'user//admin' }, headers: {} }, r);
    const hide = Number(/hide=(\d+)/.exec(r.body.nodes[0].link)[1]);
    for (const [bit, what] of [[1, 'masthead'], [2, 'tab strip'], [4, 'footer'], [8, 'panel titles'], [16, 'left bar']]) {
        assert.ok(hide & bit, what + ' should be hidden on a screen opened from /m');
    }
});

test('dropping the page chrome puts back the machine name and the way out', () => {
    // hide=31 also removes the only place the page said which computer this is, and the only
    // way back to the list. Leaving it there would be a screen you cannot leave on a phone.
    const link = (() => {
        const o = {
            users: { 'user//admin': admin },
            meshes: { 'mesh//er': { _id: 'mesh//er', name: 'ER', domain: '' } },
            rights: () => ['mesh//er'],
            nodes: [{ _id: 'node//abc', name: 'ER 1', meshid: 'mesh//er' }]
        };
        const r = reply();
        mobile.data(web(o), { session: { userid: 'user//admin' }, headers: {} }, r);
        return r.body.nodes[0].link;
    })();
    assert.ok(/scpapp=1/.test(link), 'the flag the remote page reads');

    const ui = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-remote-ui.js'), 'utf8');
    assert.ok(/scpapp=1/.test(ui), 'scp-remote-ui.js has to act on it');
    assert.ok(ui.includes('scp-app-bar'), 'there should be a bar');
    assert.ok(/back\.href='m'/.test(ui), 'with a way back to the device list');
    assert.ok(/currentNode/.test(ui), 'and the machine\'s own name on it');

    const css = fs.readFileSync(path.join(__dirname, '../../public/styles/scp-remote.css'), 'utf8');
    assert.ok(css.includes('#scp-app-bar'), 'unstyled it is three stray elements above the picture');
    const back = /\.scp-app-back\{[^}]*\}/.exec(css);
    assert.ok(back && /width:44px;height:44px/.test(back[0]),
        'this is the only way out of the screen on a phone, so it has to be hittable');
});

test('connected is green here too', () => {
    // The same question - can I reach this machine - is answered in green everywhere else.
    const css = fs.readFileSync(path.join(__dirname, '../../public/styles/scp-remote.css'), 'utf8');
    const live = /#scp-app-state\.is-live\{[^}]*\}/.exec(css);
    assert.ok(live, 'the connected state needs its own colour');
    assert.ok(/#0b8f6f/.test(live[0]), 'and it should be the green /m and the app already use');
});

test('the way to the full site gives a phone the styled site, not MeshCentral\'s old mobile page', () => {
    const r = { redirect() { throw new Error('should pass on'); } };
    const req = { query: { m: '0' }, session: {} };
    let passedOn = false;
    mobile.root(web({}), req, r, () => { passedOn = true; }, '/');
    assert.ok(passedOn);
    assert.equal(req.query.mobile, '0');
    assert.equal(req.session.scpView, 'full');
    // and it is remembered: a plain reload of the root stays on the full site
    const again = { query: {}, session: { userid: 'user//admin', scpView: 'full' } };
    mobile.root(web({ users: { 'user//admin': { _id: 'user//admin' } } }), again, r, () => { }, '/');
    assert.equal(again.query.mobile, '0');
    // someone asking for the mobile page outright still gets it
    const asked = { query: { m: '0', mobile: '1' }, session: {} };
    mobile.root(web({}), asked, r, () => { }, '/');
    assert.equal(asked.query.mobile, '1');
    assert.match(fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-mobile.js'), 'utf8'), /\?m=0&mobile=0/);
});
