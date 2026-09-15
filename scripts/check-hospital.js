// Read-only smoke check against the local development server. No accounts or agents created.
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const base = 'https://127.0.0.1:8443';
const languageScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'scp-language.js'), 'utf8');
const phoneAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
function get(route, headers = {}) {
    return new Promise((resolve, reject) => {
        // Only this loopback test accepts the development self-signed certificate.
        // This does not change the server's TLS settings or the operating-system trust store.
        const request = https.get(base + route, { rejectUnauthorized: false, headers }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
        });
        request.on('error', reject);
        request.setTimeout(10000, () => request.destroy(new Error('Local server request timed out')));
    });
}
(async () => {
    for (const [route, headers, expected] of [
        ['/?lang=th', {}, 'th'], ['/?lang=en', {}, 'en'], ['/?lang=fr', {}, 'th'],
        ['/?lang=th-TH', {}, 'th'], ['/?lang=en-GB', {}, 'en'],
        ['/', { 'accept-language': 'en-US,en;q=0.9' }, 'en'],
        ['/', { 'accept-language': 'ja-JP,th;q=0.9' }, 'th']
    ]) {
        const response = await get(route, headers);
        assert.equal(response.status, 200);
        const dom = new JSDOM(response.body.toString());
        assert.equal(dom.window.document.documentElement.lang, expected, route);
        assert.ok(dom.window.document.title.includes('SCP-Remote'));
        for (const script of dom.window.document.querySelectorAll('script:not([src])')) new vm.Script(script.textContent);
        assert.ok(dom.window.document.body.textContent.includes(expected === 'th' ? 'ชื่อผู้ใช้' : 'Username'));
        dom.window.close();
    }
    // A phone gets a different login page with no top bar, so check the page the
    // server actually renders for one instead of assuming it matches the desktop.
    for (const language of ['th', 'en']) {
        const route = '/?lang=' + language;
        const response = await get(route, { 'user-agent': phoneAgent });
        assert.equal(response.status, 200, route);
        const dom = new JSDOM(response.body.toString(), { url: base + route, runScripts: 'outside-only' });
        assert.equal(dom.window.document.documentElement.lang, language, route);
        assert.ok(dom.window.document.getElementById('column_l'), 'mobile login page served to a phone');
        for (const script of dom.window.document.querySelectorAll('script:not([src])')) new vm.Script(script.textContent);
        dom.window.eval(languageScript);
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
        const nav = dom.window.document.querySelector('nav.scp-language');
        assert.ok(nav, 'language links on the mobile login page: ' + route);
        assert.equal(nav.parentElement.id, 'column_l', 'language links stay inside the mobile login column');
        assert.ok(dom.window.document.body.textContent.includes(language === 'th' ? 'ชื่อผู้ใช้' : 'Username'), route);
        dom.window.close();
    }
    const selected = await get('/?lang=en');
    const cookie = (selected.headers['set-cookie'] || []).map(value => value.split(';')[0]).join('; ');
    assert.ok(cookie, 'Language selection creates a session preference');
    const next = await get('/', { cookie, 'accept-language': 'th-TH' });
    assert.ok(next.body.toString().includes('<html lang="en"'), 'Language choice survives navigation');
    for (const route of ['/styles/scp-remote.css', '/styles/scp-ui.css', '/scripts/scp-ui.js', '/scripts/scp-language.js', '/scripts/scp-files.js', '/images/scp-logo.png', '/fonts/sarabun/Sarabun-Regular.ttf', '/fonts/sarabun/Sarabun-SemiBold.ttf', '/fonts/sarabun/Sarabun-Bold.ttf']) {
        const response = await get(route);
        assert.equal(response.status, 200, route);
        assert.ok(response.body.length > 100, route);
    }
    console.log('SCP-Remote HTTP checks passed: language routing, desktop and mobile login pages, session preference, inline scripts, and local assets.');
})().catch(error => { console.error(error); process.exitCode = 1; });
