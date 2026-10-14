'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const handlebars = require('handlebars');
const root = path.resolve(__dirname, '../..');
test('all generated Thai pages have executable inline JavaScript and local styling', () => {
    const dir = path.join(root, 'views/translations');
    const files = fs.readdirSync(dir).filter(file => file.endsWith('_th.handlebars'));
    assert.equal(files.length, 48);
    for (const file of files) {
        const source = fs.readFileSync(path.join(dir, file), 'utf8');
        const args = {};
        for (const match of source.matchAll(/\{\{\{?\s*(\w+)\s*\}?\}\}/g)) args[match[1]] = '0';
        Object.assign(args, { title: 'SCP-Remote', domainurl: '/', pluginHandler: 'null', lang: 'th' });
        const html = handlebars.compile(source)(args);
        const dom = new JSDOM(html);
        assert.equal(dom.window.document.documentElement.lang, 'th', file);
        assert.ok([...dom.window.document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.getAttribute('href').split('?')[0] === '/styles/scp-remote.css'), file);
        for (const script of dom.window.document.querySelectorAll('script:not([src])')) {
            if (script.type && !['text/javascript', 'application/javascript'].includes(script.type)) continue;
            assert.doesNotThrow(() => new vm.Script(script.textContent, { filename: file }));
        }
        dom.window.close();
    }
});
test('critical Thai actions retain their original meaning', () => {
    const th = require('../th.json');
    assert.equal(th['Cancel'], 'ยกเลิก');
    assert.equal(th['Uninstall Agent'], 'ถอนการติดตั้งเอเจนต์');
    assert.equal(th['Desktop View Only'], 'ดูหน้าจออย่างเดียว');
    assert.equal(th['Delete {0} selected items?'], 'ลบรายการที่เลือก {0} รายการหรือไม่?');
    assert.ok(th['This will not remove this device from the server, but the device will not longer be able to connect to the server. All remote access to the device will be lost. The device must be connect for this command to work.'].includes('สูญเสียการเข้าถึงระยะไกลทั้งหมด'));
});
test('every Thai page is newer than the template it comes from', () => {
    // An edited template with an older Thai page means the build was not re-run and
    // Thai visitors would still be served the previous version of that page.
    assert.deepEqual(require('../templates').stale(), [], 'run npm run build:hospital');
});
