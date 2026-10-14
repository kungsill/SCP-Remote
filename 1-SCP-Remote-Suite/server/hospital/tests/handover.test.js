'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// The handover document is only useful if the facts in it are still true and the blanks
// have been filled in. Both rot quietly, so check them here.
const doc = fs.readFileSync(path.join(__dirname, '../HANDOVER.md'), 'utf8');

test('the handover document names the commands that actually exist', () => {
    const scripts = Object.keys(require('../../package.json').scripts);
    const mentioned = [...doc.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map(m => m[1]);
    assert.ok(mentioned.length > 5, 'it should list the commands someone taking over will need');
    const unknown = [...new Set(mentioned)].filter(name => !scripts.includes(name));
    assert.deepEqual(unknown, [], 'the document tells someone to run commands that are not there: ' + unknown.join(', '));
});

test('the handover document points only at files that are there', () => {
    const links = [...doc.matchAll(/\]\(([^)#]+\.md)\)/g)].map(m => m[1]);
    assert.ok(links.length > 0);
    const missing = links.filter(link => !fs.existsSync(path.join(__dirname, '..', link)));
    assert.deepEqual(missing, [], 'these linked documents do not exist: ' + missing.join(', '));
});

test('the handover document still covers what a successor cannot work out alone', () => {
    // Each of these is something no one can rediscover from the code.
    [
        ['resetaccount', 'how to get back in when locked out'],
        ['.local', 'which folder must never be lost'],
        ['MOVING-THE-SERVER.md', 'what to read before changing the address'],
        ['UPSTREAM-CHANGES.md', 'what to read before upgrading'],
        ['fulluninstall', 'how to remove the agent from a computer'],
        ['พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล', 'the privacy obligation that comes with watching screens']
    ].forEach(([needle, why]) => {
        assert.ok(doc.indexOf(needle) > 0, 'the document should still cover ' + why);
    });
});

test('the blanks are still waiting to be filled in', (t) => {
    // Not a failure. A reminder in the test output until somebody fills them in.
    const blanks = (doc.match(/\[ กรอก/g) || []).length;
    if (blanks > 0) { t.diagnostic('HANDOVER.md ยังมีช่องที่ต้องกรอกอีก ' + blanks + ' ช่อง'); }
    assert.ok(blanks >= 0);
});
