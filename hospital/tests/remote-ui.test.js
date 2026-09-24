'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom');
const settle=()=>new Promise(r=>setImmediate(r));
test('toolbar resize recomputes both canvas dimensions using the real sharing aspect-ratio logic',async t=>{
 const dom=new JSDOM('<html><body><div id="deskarea1"></div><div id="deskarea3x"><div id="DeskParent"><canvas id="Desk" width="1366" height="768"></canvas></div></div><div id="deskarea4"></div><div id="fileArea2"></div><div id="fileArea4"></div></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,viewport=d.getElementById('deskarea3x'),parent=d.getElementById('DeskParent');
 Object.defineProperty(viewport,'offsetParent',{get:()=>d.body});viewport.getBoundingClientRect=()=>({top:124});Object.defineProperty(parent,'clientHeight',{get:()=>parseFloat(viewport.style.getPropertyValue('--scp-canvas-height'))||900});Object.defineProperty(parent,'clientWidth',{get:()=>1800});w.Q=id=>d.getElementById(id);w.QS=id=>w.Q(id).style;w.xxcurrentView=11;w.deskAspectRatio=0;
 const source=fs.readFileSync('views/sharing.handlebars','utf8');w.eval(source.slice(source.indexOf('function deskAdjust()'),source.indexOf('function setupDesktop()')));
 w.eval(fs.readFileSync('public/scripts/scp-remote-ui.js','utf8'));const panel=d.createElement('section');w.ScpRemoteUI.mount(panel);panel.hidden=false;await settle();const canvas=d.getElementById('Desk');
 const first=parseFloat(canvas.style.width);assert.ok(Math.abs(first/parent.clientHeight-1366/768)<0.001);
 w.innerHeight=650;w.dispatchEvent(new w.Event('resize'));assert.ok(parseFloat(canvas.style.width)<first);assert.ok(Math.abs(parseFloat(canvas.style.width)/parent.clientHeight-1366/768)<0.001);
});
test('remote dock follows visible sections and supports collapse',async t=>{
 const dom=new JSDOM('<html lang="th"><body></body></html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.eval(fs.readFileSync('public/scripts/scp-remote-ui.js','utf8'));
 const section=w.document.createElement('section');w.ScpRemoteUI.mount(section);await settle();const dock=w.document.getElementById('scp-remote-dock');assert.equal(dock.hidden,true);
 section.hidden=false;await settle();assert.equal(dock.hidden,false);assert.equal(w.document.body.classList.contains('scp-dock-visible'),true);
 dock.querySelector('button').click();assert.equal(dock.querySelector('button').getAttribute('aria-expanded'),'false');
 section.hidden=true;await settle();assert.equal(dock.hidden,true);
});
async function app(t){const dom=new JSDOM(fs.readFileSync('hospital/desktop-app/index.html','utf8'),{url:'https://app.test/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.setInterval=()=>1;w.scp={init:async()=>({ok:true,result:{state:'approved',code:'test',name:'IT'}}),devices:async()=>({ok:true,result:{rooms:[{id:'opd',name:'OPD'}],nodes:[{id:'one',name:'test01',ip:'192.168.1.2',room:'opd',online:true,ready:true}]}}),connect:async()=>({ok:true})};w.eval(fs.readFileSync('hospital/desktop-app/renderer.js','utf8'));await settle();return w;}
test('app keeps stale device status unknown on refresh failure and recovers',async t=>{const w=await app(t),d=w.document;assert.equal(d.getElementById('onlineCount').textContent,'1');const original=w.scp.devices;w.scp.devices=async()=>{throw Error('SERVER_TIMEOUT');};d.getElementById('refresh').click();await settle();assert.match(d.querySelector('.device span').textContent,/ยังยืนยันไม่ได้/);assert.equal(d.querySelector('.device button').disabled,true);w.scp.devices=original;d.getElementById('refresh').click();await settle();assert.equal(d.querySelector('.device button').disabled,false);});
test('app prevents duplicate connection requests and recovers from IPC rejection',async t=>{const w=await app(t),d=w.document;let reject,calls=0;w.scp.connect=()=>{calls++;return new Promise((r,j)=>reject=j);};d.querySelector('.device button').click();d.querySelector('.device button').click();assert.equal(calls,1);assert.equal(d.querySelector('.device button').disabled,true);reject(Error('SERVER_TIMEOUT'));await settle();assert.equal(d.querySelector('.device button').disabled,false);assert.match(d.getElementById('status').textContent,/ติดต่อเซิร์ฟเวอร์/);d.getElementById('language').value='en';d.getElementById('language').dispatchEvent(new w.Event('change'));assert.equal(d.getElementById('totalLabel').textContent,'Total devices');});

test('rotating a phone re-fits the picture after the browser reports its new size',async t=>{
 // A rotation is not a resize the browser gets right immediately: for a moment it still
 // reports the old dimensions, so fitting once leaves the picture sized for the orientation
 // the phone has already left - a strip across a landscape screen, or the reverse.
 const dom=new JSDOM('<html><body><div id="deskarea1"></div><div id="deskarea3x"><div id="DeskParent"><canvas id="Desk" width="1366" height="768"></canvas></div></div><div id="deskarea4"></div><div id="fileArea2"></div><div id="fileArea4"></div></body></html>',{runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window,d=w.document,viewport=d.getElementById('deskarea3x'),parent=d.getElementById('DeskParent');
 Object.defineProperty(viewport,'offsetParent',{get:()=>d.body});viewport.getBoundingClientRect=()=>({top:60});
 Object.defineProperty(parent,'clientHeight',{get:()=>parseFloat(viewport.style.getPropertyValue('--scp-canvas-height'))||400});
 Object.defineProperty(parent,'clientWidth',{get:()=>w.innerWidth});
 w.Q=id=>d.getElementById(id);w.QS=id=>w.Q(id).style;w.xxcurrentView=11;w.deskAspectRatio=0;
 const source=fs.readFileSync('views/sharing.handlebars','utf8');
 w.eval(source.slice(source.indexOf('function deskAdjust()'),source.indexOf('function setupDesktop()')));
 w.eval(fs.readFileSync('public/scripts/scp-remote-ui.js','utf8'));
 const panel=d.createElement('section');w.ScpRemoteUI.mount(panel);panel.hidden=false;await settle();

 // Portrait, then turned sideways. The event arrives while the old size is still reported.
 w.innerWidth=400;w.innerHeight=800;w.dispatchEvent(new w.Event('resize'));await settle();
 const portrait=parseFloat(d.getElementById('Desk').style.width);
 w.dispatchEvent(new w.Event('orientationchange'));
 w.innerWidth=800;w.innerHeight=400; // the new size only lands now
 await new Promise(r=>setTimeout(r,400));
 assert.notEqual(parseFloat(d.getElementById('Desk').style.width),portrait,'the picture should have been re-fitted');
});

test('the picture is re-fitted from more than a plain window resize',()=>{
 const source=fs.readFileSync('public/scripts/scp-remote-ui.js','utf8');
 assert.ok(/orientationchange/.test(source),'a rotation has to be watched for on its own');
 assert.ok(/visualViewport/.test(source),'which settles later and more honestly than window on a phone');
});

// ---- The remote screen, reached either way ----
// There are two roads to the same screen: pressed on a card in /m, and pressed on Desktop
// after opening a device on the full site. They used to end in completely different-looking
// pages - the hospital's words were "it looks nothing like the app" - because the app chrome
// keyed off the query string that only /m puts there. It now watches the view instead.
async function screen(t, search, view) {
    const dom = new JSDOM('<html lang="th"><body>' +
        '<div id=masthead></div><div id=topbar></div><div id=page_leftbar></div>' +
        '<h1 id=p11title>Desktop - test01</h1><div id=footer></div>' +
        '<div id=deskarea1></div><div id=deskarea3x></div><div id=deskarea4></div>' +
        '</body></html>', { url: 'https://remote.test/' + search, runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window;
    w.currentNode = { _id: 'node//abc', name: 'test01' };
    w.desktop = { State: 3 };
    w.xxcurrentView = view;
    w.gotoDevice = (id, v) => { w.xxcurrentView = v; };
    w.eval(fs.readFileSync('public/scripts/scp-remote-ui.js', 'utf8'));
    return w;
}
const beat = () => new Promise(r => setTimeout(r, 400));   // the watcher runs every 250ms

test('pressing a card in /m lands straight on the screen, with the page around it gone', async t => {
    const w = await screen(t, '?node=abc&viewmode=11&hide=31&mobile=0&scpapp=1', 11);
    await beat();
    const d = w.document;
    assert.equal(d.body.classList.contains('scp-app-view'), true, 'the screen should take the page');
    assert.equal(d.getElementById('scp-app-bar').hidden, false, 'and say which machine it is');
    assert.equal(d.getElementById('scp-app-device').textContent, 'test01');
    const back = d.querySelector('.scp-app-back');
    assert.equal(back.tagName, 'A', 'coming from the list, back is a link to the list');
    assert.equal(back.getAttribute('href'), 'm');
});

test('pressing Desktop on the full site gets the same screen', async t => {
    // This is the one that was wrong: no scpapp in the URL, because MeshCentral put the URL
    // there itself, so nothing turned the app view on.
    const w = await screen(t, '?viewmode=11&gotonode=8HPel8S1J2lXl7', 10);
    await beat();
    const d = w.document;
    assert.equal(d.body.classList.contains('scp-app-view'), false, 'on the device, not the screen');
    assert.equal(d.getElementById('scp-app-bar').hidden, true, 'so no bar yet');

    w.xxcurrentView = 11;                    // pressing Desktop
    await beat();
    assert.equal(d.body.classList.contains('scp-app-view'), true, 'the screen should look the same either way');
    assert.equal(d.getElementById('scp-app-bar').hidden, false);
    assert.equal(d.getElementById('scp-app-device').textContent, 'test01');
});

test('leaving the screen gives the tabs back', async t => {
    // Terminal, Files, Registry and Console are hidden while the screen is showing. That is
    // the cost of asking for the screen and nothing else, so the way out has to work.
    const w = await screen(t, '?viewmode=11&gotonode=8HPel8S1J2lXl7', 11);
    await beat();
    const d = w.document;
    assert.equal(d.body.classList.contains('scp-app-view'), true);
    const back = d.querySelector('.scp-app-back');
    assert.equal(back.tagName, 'BUTTON', 'reached from the device, back returns to the device');
    back.click();
    await beat();
    assert.equal(w.xxcurrentView, 10, 'back should leave the screen, not the machine');
    assert.equal(d.body.classList.contains('scp-app-view'), false, 'and the page should return');
    assert.equal(d.getElementById('scp-app-bar').hidden, true);
});

test('the chrome is hidden by the stylesheet, not by the link that opened it', () => {
    // hide=31 only reaches the screen opened from /m; on the full site there is no query at
    // all. Naming the elements in CSS is what makes both roads end the same.
    const css = fs.readFileSync('public/styles/scp-remote.css', 'utf8');
    const rule = /body\.scp-app-view :is\(([^)]*)\)\{display:none!important\}/.exec(css);
    assert.ok(rule, 'the app view has to hide the page chrome itself');
    for (const id of ['#masthead', '#topbar', '#footer', '#page_leftbar', '#p11title']) {
        assert.ok(rule[1].includes(id), id + ' should go with the rest of the chrome');
    }
});

test('the Desktop App is left exactly as it was', async t => {
    // The app loads the sharing page, which loads this same file for the dock and also calls
    // its own Desktop view 11. Watching the view alone put the site's bar inside the app's
    // window: a back arrow that would have led out of the session, and a machine name that
    // never arrives because the sharing page has no currentNode. The app was to be untouched.
    const dom = new JSDOM('<html lang="th"><body>' +
        '<div id=LeftMenuDesktop></div><div id=LeftMenuTerminal></div><div id=LeftMenuFiles></div>' +
        '<div id=deskarea1></div><div id=deskarea3x></div><div id=deskarea4></div>' +
        '</body></html>', { url: 'https://remote.test/sharing', runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window;
    w.xxcurrentView = 11;
    w.desktop = { State: 3 };
    w.eval(fs.readFileSync('public/scripts/scp-remote-ui.js', 'utf8'));
    await new Promise(r => setTimeout(r, 400));
    assert.equal(w.document.getElementById('scp-app-bar'), null, 'nothing of the site belongs in the app');
    assert.equal(w.document.body.classList.contains('scp-app-view'), false, 'and it must not restyle the app either');
    // The one thing this file is on that page for has to keep working.
    assert.equal(typeof w.ScpRemoteUI.mount, 'function', 'the dock is why the app loads this at all');
});

test('a page with no site chrome is left alone', async t => {
    // Belt and braces beside the test above, and a different statement: there is nothing to
    // strip on a page that never had a masthead or a left bar.
    const dom = new JSDOM('<html lang="th"><body><div id=deskarea3x></div></body></html>',
        { url: 'https://remote.test/somewhere?scpapp=1', runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const w = dom.window;
    w.xxcurrentView = 11;
    w.eval(fs.readFileSync('public/scripts/scp-remote-ui.js', 'utf8'));
    await new Promise(r => setTimeout(r, 400));
    assert.equal(w.document.getElementById('scp-app-bar'), null);
});
