'use strict';
// The hospital's pages (dashboard, remote page, menus) are built on MeshCentral's classic UI.
// Picking "Modern" (the "Try the new UI" link) saved a preference that opened MeshCentral's
// other UI on every visit, with none of them and white-on-white menu icons, and no obvious
// way back. Now: the link is hidden, the modern page sends you to the classic one, and the
// classic page puts the saved choice back to Classic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { JSDOM } = require('jsdom');

test('"Try the new UI" and the Modern button are hidden', () => {
    const css = fs.readFileSync('public/styles/scp-ui.css', 'utf8');
    assert.match(css, /#textnewui,\s*#uiViewButton7\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});

for (const file of ['views/default3.handlebars', 'views/translations/default3_th.handlebars', 'views/translations/default3-min_th.handlebars']) {
    test(file + ' sends you to the classic page unless the address asks for the modern one', () => {
        const src = fs.readFileSync(file, 'utf8');
        const i = src.indexOf('<!-- SCP-Remote: classic UI only -->');
        assert.ok(i > 0 && i < src.indexOf('<meta'), 'the redirect comes first, before anything else on the page');
        const script = src.slice(src.indexOf('<script>', i) + 8, src.indexOf('</script>', i));
        const run = url => {
            const dom = new JSDOM('', { url, runScripts: 'outside-only' });
            let went = null;
            dom.window.eval(script.replace('location.replace(', 'window.__went=('));
            went = dom.window.__went || null;
            dom.window.close();
            return went;
        };
        assert.equal(run('https://remote.example/?viewmode=11&gotonode=abc#x'), '/?viewmode=11&gotonode=abc&sitestyle=1#x');
        assert.equal(run('https://remote.example/'), '/?sitestyle=1');
        assert.equal(run('https://remote.example/?sitestyle=3'), null, 'asked for by name: left alone');
    });
}

test('the classic page puts a saved "Modern" back to Classic once connected', async () => {
    const dom = new JSDOM('<html lang="th"><body></body></html>', { runScripts: 'outside-only' });
    const w = dom.window, saved = [];
    let store = { uiViewMode: '3' };
    w.getstore = (k, d) => (k in store ? store[k] : d);
    w.putstore = (k, v) => { store[k] = String(v); saved.push([k, v]); };
    w.meshserver = { connectstate: 0, State: 1 };
    w.eval(fs.readFileSync('public/scripts/scp-ui.js', 'utf8'));
    await new Promise(r => setTimeout(r, 30));
    assert.deepEqual(saved, [], 'not before the server is connected (the choice is saved there)');
    w.meshserver.State = 2;
    await new Promise(r => setTimeout(r, 1200));
    assert.deepEqual(saved, [['uiViewMode', 2]]);
    dom.window.close();
});
