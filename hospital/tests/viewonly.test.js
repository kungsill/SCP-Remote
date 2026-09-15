'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Skipping the permission box for picture-only connections is only safe while two
// things stay true: the agent is told to refuse input on exactly the connections that
// skip it, and the box is only skipped when this domain has asked for that. These run
// against the real source in meshuser.js rather than a copy, so a change that pulls
// the two halves apart fails here.
const source = fs.readFileSync(path.join(__dirname, '../../meshuser.js'), 'utf8');

function loadApplyViewOnlyConsent(domain) {
    const start = source.indexOf('function applyViewOnlyConsent');
    assert.ok(start > 0, 'applyViewOnlyConsent should still exist in meshuser.js');
    const end = source.indexOf('\n    }', start);
    assert.ok(end > start, 'could not find the end of applyViewOnlyConsent');
    const body = source.substring(start, end + 6);
    return new Function('domain', 'parent', body + '\nreturn applyViewOnlyConsent;')(domain, { parent: { config: { settings: {} } } });
}

const DESKTOP_PROMPT = 8;
const EVERYTHING = 1 | 8 | 16 | 32 | 64; // notify, desktop prompt, terminal, files, privacy bar

test('an ordinary connection is left exactly as it was', (t) => {
    const apply = loadApplyViewOnlyConsent({ desktopviewonlynoprompt: true });
    const command = { consent: EVERYTHING };
    apply(command, null);
    assert.equal(command.consent, EVERYTHING);
    assert.equal(command.desktopviewonly, undefined);

    apply(command, { removeViewOnlyLimitation: true });
    assert.equal(command.consent, EVERYTHING, 'another routing option must not trigger this');
    assert.equal(command.desktopviewonly, undefined);
});

test('a picture-only connection is always marked for the agent to enforce', (t) => {
    const apply = loadApplyViewOnlyConsent({});
    const command = { consent: EVERYTHING };
    apply(command, { desktopViewOnly: true });
    assert.equal(command.desktopviewonly, true, 'the agent has to be told, or nothing stops input');
    assert.equal(command.consent, EVERYTHING, 'without the domain setting, the box still appears');
});

test('the box is skipped only for picture-only connections, and only that box', (t) => {
    const apply = loadApplyViewOnlyConsent({ desktopviewonlynoprompt: true });
    const command = { consent: EVERYTHING };
    apply(command, { desktopViewOnly: true });

    assert.equal(command.desktopviewonly, true, 'input must be refused by the agent in return');
    assert.equal(command.consent & DESKTOP_PROMPT, 0, 'the desktop box is skipped');
    assert.equal(command.consent & 1, 1, 'the person is still told it started');
    assert.equal(command.consent & 64, 64, 'the bar stays on their screen while it lasts');
    assert.equal(command.consent & 16, 16, 'a terminal still asks');
    assert.equal(command.consent & 32, 32, 'file access still asks');
});

test('nothing can lower the consent without also being marked view-only', (t) => {
    // Both effects are written inside one guard, so there is no ordering in which a
    // caller gets the quieter consent while still being able to type on the machine.
    const start = source.indexOf('function applyViewOnlyConsent');
    const body = source.substring(start, source.indexOf('\n    }', start));
    const marks = body.indexOf('command.desktopviewonly = true');
    const lowers = body.indexOf('command.consent &=');
    assert.ok(marks > 0 && lowers > marks, 'the consent is lowered only after input is given up');
});

test('shared desktop streams retain the permission prompt', () => {
    const command = { consent: EVERYTHING };
    loadApplyViewOnlyConsent({ desktopviewonlynoprompt: true, desktopmultiplex: true })(command, { desktopViewOnly: true });
    assert.equal(command.consent, EVERYTHING);
    assert.equal(command.desktopviewonly, undefined, 'a shared stream must not disable control for other viewers');
});

test('the browser asks for a picture-only tunnel by name, and only then', (t) => {
    const redir = fs.readFileSync(path.join(__dirname, '../../public/scripts/agent-redir-ws-0.1.1.js'), 'utf8');
    assert.ok(redir.indexOf('obj.viewonly = false;') > 0, 'a connection is not view-only unless it says so');
    assert.ok(redir.indexOf('if (obj.viewonly === true) { tunnelRequest.viewonly = true; }') > 0);

    // The two places that show a picture and never send input.
    const dashboard = fs.readFileSync(path.join(__dirname, '../../public/scripts/scp-dashboard.js'), 'utf8');
    assert.ok(dashboard.indexOf('desk.viewonly = true;') > 0, 'dashboard tiles are picture-only');
    ['default.handlebars', 'default3.handlebars'].forEach(function (page) {
        const text = fs.readFileSync(path.join(__dirname, '../../views/', page), 'utf8');
        assert.ok(text.indexOf('desk.viewonly = true;') > 0, page + ' tiles are picture-only');
    });
});

test('the full remote desktop page never asks for a picture-only tunnel', (t) => {
    // The device page's own desktop connection must keep the permission box, so it must
    // not carry this flag. It is built by a different call than the tiles.
    const page = fs.readFileSync(path.join(__dirname, '../../views/default.handlebars'), 'utf8');
    const start = page.indexOf("desktop = CreateAgentRedirect(meshserver, CreateAgentRemoteDesktop('Desk')");
    assert.ok(start > 0, 'could not find the full desktop connection');
    const near = page.substring(start, start + 1400);
    assert.equal(near.indexOf('viewonly = true'), -1, 'taking a machine over must still ask');
});
