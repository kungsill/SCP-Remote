// Isolated server dashboard fixture: no login, remote connections, or server mutations.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const WebSocket = require('ws');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.local/ui-review/server');
const pause = ms => new Promise(r => setTimeout(r, ms));
const sample = { totalmem: 32 * 1073741824, freemem: 7.6 * 1073741824, cpuavg: [0, 0, 0], values: { ServerState: { AgentSessions: 80, ConnectedUsers: 1, DeviceGroups: 29, RelaySessions: 0 }, AgentErrorCounters: { InvalidPKCSsignature: 1, BadSignature: 1 } } };
async function main() {
    fs.mkdirSync(out, { recursive: true });
    const source = fs.readFileSync(path.join(root, 'views/translations/default_th.handlebars'), 'utf8');
    const panel = source.slice(source.indexOf('<div id="p6" '), source.indexOf('<div id="p10" ')).replace('id="p6" style="display:none"', 'id="p6"');
    const css = fs.readFileSync(path.join(root, 'public/styles/scp-server.css'), 'utf8');
    const js = fs.readFileSync(path.join(root, 'public/scripts/scp-server.js'), 'utf8');
    const html = '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#faf7fa;font-family:Tahoma,sans-serif}.night{background:#211820;--scp-ink:#f6eaf2;--scp-muted:#cfb8c7;--scp-surface:#30232d;--scp-line:#624658;--scp-accent:#f39acb}#p6{max-width:1400px;margin:auto}#serverStats{display:block}'+css+'</style><body>'+panel+'<script>window.meshserver={State:2};window.updateGeneralServerStats=function(){};window.lastServerStats='+JSON.stringify(sample)+';</script><script>'+js+'</script></body></html>';
    fs.writeFileSync(path.join(out, 'fixture.html'), html);
    const profile = path.join(out, 'chrome-' + Date.now());
    const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let socket;
    try {
        let port;
        for (let i = 0; i < 80; i++) { try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch {} await pause(100); }
        assert.ok(port, 'Chrome started');
        const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
        socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
        await new Promise(r => socket.once('open', r));
        let seq = 0; const pending = new Map();
        socket.on('message', b => { const m = JSON.parse(b); if (pending.has(m.id)) { const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
        const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timeout: ' + method)); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
        const evaluate = expression => send('Runtime.evaluate', { expression, returnByValue: true });
        await send('Page.enable');
        for (const [name, width, dark] of [['desktop', 1440, false], ['phone', 390, false], ['dark', 1280, true]]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
            await send('Page.navigate', { url: pathToFileURL(path.join(out, 'fixture.html')).href }); await pause(500);
            if (dark) await evaluate('document.body.classList.add("night")');
            const result = (await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,cards:document.querySelectorAll(".scp-srv-grid .scp-srv-card").length,actions:document.querySelectorAll("#p2ServerActions a").length})')).result.value;
            assert.equal(result.cards, 4); assert.equal(result.actions, 6); assert.ok(result.scroll <= width, 'No overflow: ' + name);
            const metrics = await send('Page.getLayoutMetrics');
            const shot = await send('Page.captureScreenshot', { captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } });
            fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(shot.data, 'base64'));
            console.log(name + ': ' + JSON.stringify(result));
        }
        await send('Browser.close');
    } finally { if (socket) socket.close(); child.kill(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
