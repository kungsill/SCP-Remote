'use strict';
// The /m page ("choose a computer to remote") was retired on 12 Nov 2026 at the administrator's
// request: the Remote page on the full site does the same job and is the one being developed.
// The route is still answered, so old bookmarks, home-screen icons and QR links do not break;
// whoever arrives is sent on to the Remote page. hospital/mobile.js and its page are left in
// place (and tested in mobile.test.js) so this can be undone by removing one script tag.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const off = require('../../public/scripts/scp-mobile-off');

test('the /m page sends everyone on to the Remote page of the full site', () => {
    assert.equal(off.target('https://remote.kpsnana.com/m'), 'https://remote.kpsnana.com/?m=0&scppage=remote');
    assert.equal(off.target('https://192.168.2.25:8443/m?x=1#top'), 'https://192.168.2.25:8443/?m=0&scppage=remote');
    assert.equal(off.target('https://host.example/sub/m'), 'https://host.example/sub/?m=0&scppage=remote');
});

test('m=0 is what keeps the server from sending them straight back', () => {
    const mobile = fs.readFileSync(path.join(__dirname, '../mobile.js'), 'utf8');
    assert.match(mobile, /if \(q\.m === '0'\) \{ if \(req\.session\) \{ req\.session\.scpView = 'full'; \}/);
});

test('the redirect runs in the head, before any of the old page is drawn', () => {
    const page = fs.readFileSync(path.join(__dirname, '../mobile.html'), 'utf8');
    const at = page.indexOf('scripts/scp-mobile-off.js');
    assert.ok(at > 0, 'mobile.html loads scp-mobile-off.js');
    assert.ok(at < page.indexOf('<body'), 'in the head');
    assert.ok(at < page.indexOf('scripts/scp-mobile.js'));
});
