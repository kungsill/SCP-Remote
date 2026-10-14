'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const alerts = require('../alerts');

const HOUR = 3600000;
function snap(over) {
    return Object.assign({
        nodes: [{ _id: 'node//a', name: 'OPD 4' }, { _id: 'node//b', name: 'OPD 1' }],
        online: ['node//b'],
        watched: ['node//a'],
        lastSeen: { 'node//a': Date.now() - 2 * HOUR, 'node//b': Date.now() },
        now: Date.now()
    }, over || {});
}

test('a watched computer that has been offline past the grace period alerts', () => {
    const out = alerts.detect(snap());
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'offline');
    assert.equal(out[0].nodeid, 'node//a');
});

test('a watched computer that is online does not alert', () => {
    const out = alerts.detect(snap({ online: ['node//a', 'node//b'] }));
    assert.equal(out.length, 0);
});

test('a computer that is not watched never alerts, however long it is down', () => {
    const out = alerts.detect(snap({ watched: [], lastSeen: { 'node//a': Date.now() - 100 * HOUR } }));
    assert.equal(out.length, 0);
});

test('a watched computer only just offline is still within grace and does not alert', () => {
    const out = alerts.detect(snap({ lastSeen: { 'node//a': Date.now() - 60000 } })); // one minute
    assert.equal(out.length, 0);
});

test('a watched computer that has never connected does not alert on a fresh watch', () => {
    const out = alerts.detect(snap({ lastSeen: {} }));
    assert.equal(out.length, 0);
});

test('deliver is dormant with no webhook -- it sends nothing and says so', async () => {
    const r = await alerts.deliver('', { type: 'offline', name: 'OPD 4', downMs: 2 * HOUR });
    assert.equal(r.sent, false);
    assert.equal(r.reason, 'DORMANT');
});

test('deliver posts the alert as JSON once a webhook is set', async () => {
    let posted = null;
    const fakeReq = { on() { }, end(body) { posted = body; this._done(); } };
    const fakeHttps = { request(url, opts, cb) { fakeReq._done = () => cb({ statusCode: 200, resume() { } }); return fakeReq; } };
    const r = await alerts.deliver('https://example.test/hook', { type: 'offline', name: 'OPD 4', downMs: 2 * HOUR }, { https: fakeHttps });
    assert.equal(r.sent, true);
    const sent = JSON.parse(posted);
    assert.equal(sent.source, 'SCP-Remote');
    assert.equal(sent.type, 'offline');
    assert.equal(sent.computer, 'OPD 4');
});

test('the monitor is idle while unconnected: no webhook means it reads nothing', async () => {
    let touched = false;
    const parent = { config: { settings: {} }, db: { GetAllTypeNoTypeField() { touched = true; } } };
    const mon = alerts.CreateScpAlerts(parent);
    const out = await mon.check();
    assert.deepEqual(out, []);
    assert.equal(touched, false, 'it did not even read the database while dormant');
});
