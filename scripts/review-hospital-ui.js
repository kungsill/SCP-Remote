// Visual review in an isolated headless Chrome profile; never uses a staff account.
'use strict';
const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const WebSocket = require('ws');
const { JSDOM } = require('jsdom');
const handlebars = require('handlebars');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.local/ui-review');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture() {
    const source = await fs.readFile(path.join(root, 'views/translations/default_th.handlebars'), 'utf8');
    const args = {};
    for (const match of source.matchAll(/\{\{\{?\s*(\w+)\s*\}?\}\}/g)) args[match[1]] = '0';
    Object.assign(args, { title: 'SCP-Remote', title1: 'SCP-Remote', title2: 'Hospital IT', domainurl: 'https://127.0.0.1:8443/', footer: 'UI REVIEW — isolated layout fixture', lang: 'th' });
    Object.assign(args, { customCSSTags: '', customJSTags: '', titlehtml: '' });
    const dom = new JSDOM(handlebars.compile(source)(args));
    const doc = dom.window.document;
    doc.querySelectorAll('script').forEach(node => node.remove());
    doc.querySelectorAll('*').forEach(node => { for (const attr of Array.from(node.attributes)) if (attr.name.startsWith('on')) node.removeAttribute(attr.name); });
    const base = doc.createElement('base'); base.href = 'https://127.0.0.1:8443/'; doc.head.prepend(base);
    doc.body.style.display = 'block'; doc.body.className = 'fullscreen';
    ['p1', 'devListToolbar', 'xdevices', 'LeftMenuMyFiles'].forEach(id => { const node = doc.getElementById(id); if (node) node.style.display = 'block'; });
    const devices = doc.getElementById('xdevices');
    devices.textContent = 'ตัวอย่างการจัดวางหน้าจอ • ไม่มีการเชื่อมต่อบัญชีหรืออุปกรณ์จริง';
    devices.style.padding = '32px 16px';
    ['scp-files.js', 'scp-ui.js'].forEach(name => { const script = doc.createElement('script'); script.src = 'https://127.0.0.1:8443/scripts/' + name; script.defer = true; doc.head.appendChild(script); });
    await fs.writeFile(path.join(output, 'workspace-fixture.html'), dom.serialize());
    dom.window.close();
}
(async () => {
    await fs.mkdir(output, { recursive: true }); await fixture();
    const profile = await fs.mkdtemp(path.join(output, 'review-profile-'));
    const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--ignore-certificate-errors', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    child.on('error', error => { console.error(error); process.exitCode = 1; });
    let socket;
    try {
        let port;
        for (let i = 0; i < 60; i++) { try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); } }
        assert.ok(port, 'Chrome started');
        const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
        socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
        await new Promise(resolve => socket.once('open', resolve));
        let sequence = 0; const waiting = new Map();
        socket.on('message', raw => { const result = JSON.parse(raw); if (waiting.has(result.id)) { const { resolve, reject } = waiting.get(result.id); waiting.delete(result.id); result.error ? reject(result.error) : resolve(result.result); } });
        function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; waiting.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
        const evaluate = expression => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        await send('Page.enable');
        for (const [name, language, width, height, mobile] of [['login-desktop', 'th', 1440, 1000, false], ['login-en', 'en', 1280, 900, false], ['login-phone', 'th', 390, 844, true]]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
            await send('Emulation.setUserAgentOverride', { userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' });
            await send('Page.navigate', { url: 'https://127.0.0.1:8443/?lang=' + language });
            await pause(1200); await evaluate('document.fonts.ready.then(() => true)');
            const check = (await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,ui:document.body.classList.contains("scp-signin"),languages:document.querySelectorAll(".scp-language a").length,form:!!document.getElementById("username")})')).result.value;
            assert.ok(check.ui && check.form && check.languages === 2, name);
            assert.ok(check.scroll <= check.width + 1, name + ' has no horizontal overflow: ' + JSON.stringify(check));
            const shot = await send('Page.captureScreenshot'); await fs.writeFile(path.join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
            console.log(name + ': layout and language links OK');
        }
        await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url: pathToFileURL(path.join(output, 'workspace-fixture.html')).href });
        await pause(1200); await evaluate('document.fonts.ready.then(() => true)');
        assert.equal((await evaluate('document.querySelectorAll(".scp-nav-label").length')).result.value, 6);
        for (const view of ['devices', 'files']) {
            if (view === 'files') await evaluate('document.getElementById("p1").style.display="none";document.getElementById("p5").style.display="block";document.getElementById("p5UploadButton").disabled=false;ScpFiles.afterRender();');
            const shot = await send('Page.captureScreenshot'); await fs.writeFile(path.join(output, 'workspace-' + view + '.png'), Buffer.from(shot.data, 'base64'));
        }
        await evaluate('document.body.classList.add("night")');
        const dark = await send('Page.captureScreenshot'); await fs.writeFile(path.join(output, 'workspace-dark.png'), Buffer.from(dark.data, 'base64'));
        console.log('Workspace fixture: navigation labels and both page layouts rendered. No account used.');
        await send('Browser.close');
    } finally { if (socket) socket.close(); child.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
