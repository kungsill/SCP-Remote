'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../consent-policy');
const domain = { id: '', unattendedadmins: ['user//admin'] };
const admin = { _id: 'user//admin', domain: '', siteadmin: 0xFFFFFFFF };
test('only the explicitly listed full administrator bypasses desktop, terminal and files prompts', () => {
    const command = { type: 'tunnel', consent: 127, rights: 256, desktopviewonly: true };
    policy.apply(command, domain, admin);
    assert.equal(command.consent, 71); // notification bits and privacy flag preserved
    assert.equal(command.rights, 256); assert.equal(command.desktopviewonly, true);
    assert.equal(command.soptions.scpUnattended, true);
});
test('other administrators, downgraded accounts, other domains and guest links do not bypass consent', () => {
    for (const actor of [null, { ...admin, _id: 'user//another' }, { ...admin, siteadmin: 8 }, { ...admin, domain: 'other' }]) {
        const command = { type: 'tunnel', consent: 127, soptions: { scpUnattended: true } };
        policy.apply(command, domain, actor);
        assert.equal(command.consent, 127); assert.equal(command.soptions.scpUnattended, undefined);
    }
    const shared = { type: 'tunnel', consent: 127, guestname: 'Visitor' };
    policy.apply(shared, domain, admin); assert.equal(shared.consent, 127);
});
