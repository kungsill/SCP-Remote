'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// A computer left switched on overnight and a computer somebody is working at look the
// same to a power log. These tests pin down the arithmetic that tells them apart, and
// more importantly the cases where it must refuse to guess.
const usage = require('../../scp-usage.js').CreateScpUsage({});

const minutes = 60000;
const noon = Date.parse('2026-09-16T12:00:00');
const fiveMinutes = 5 * minutes;

test('somebody typing the whole time counts as the whole interval', (t) => {
    const device = {};
    usage.sample(device, 300, noon);                   // first report, no predecessor
    usage.sample(device, 0, noon + fiveMinutes);       // last input just now
    assert.equal(device.scpuse.days['20260916'], 300, 'five minutes, all of it worked');
});

test('a computer left switched on all night counts as nothing', (t) => {
    const device = {};
    let at = noon;
    // Idle for longer than the interval, every time: nobody has touched it.
    for (let i = 0; i < 12; i++) { usage.sample(device, 3600 + (i * 300), at); at += fiveMinutes; }
    assert.equal(device.scpuse.days['20260916'], 0, 'an hour of being on, none of it used');
});

test('a part-used interval is credited up to the last thing the person did', (t) => {
    const device = {};
    usage.sample(device, 300, noon);
    usage.sample(device, 120, noon + fiveMinutes);     // last input two minutes ago
    assert.equal(device.scpuse.days['20260916'], 180, 'three of the five minutes');
});

test('a computer switched off for days cannot claim the gap as work', (t) => {
    const device = {};
    usage.sample(device, 0, noon);
    // Off all weekend, then reports again on Monday saying the person is at it right now.
    usage.sample(device, 0, noon + (3 * 24 * 60 * minutes));
    const total = Object.values(device.scpuse.days).reduce((sum, n) => sum + n, 0);
    assert.equal(total, 300 + 900, 'at most one interval and a half is credited for the gap');
    assert.ok(total < 24 * 3600, 'nowhere near three days');
});

test('the tally adds up across a working day and stays on its own day', (t) => {
    const device = {};
    let at = Date.parse('2026-09-16T08:00:00');
    // Eight hours at the machine, then sixteen hours of it sitting switched on.
    for (let i = 0; i < 96; i++) { usage.sample(device, 0, at); at += fiveMinutes; }
    for (let i = 0; i < 100; i++) { usage.sample(device, 3600, at); at += fiveMinutes; }
    assert.equal(Object.keys(device.scpuse.days).sort().join(','), '20260916,20260917');
    assert.equal(Math.round(device.scpuse.days['20260916'] / 3600), 8, 'eight hours of use');
    assert.equal(device.scpuse.days['20260917'], 0, 'and nothing after midnight');
});

test('only a fortnight is kept, and it is the most recent fortnight', (t) => {
    const device = {};
    let at = Date.parse('2026-09-01T09:00:00');
    for (let day = 0; day < 20; day++) { usage.sample(device, 0, at); at += 24 * 60 * minutes; }
    const kept = Object.keys(device.scpuse.days).sort();
    assert.equal(kept.length, 14, 'fourteen days, no more');
    assert.equal(kept[kept.length - 1], '20260920', 'ending at the newest');
    assert.equal(kept[0], '20260907', 'and the oldest have gone');
});

test('nonsense from an agent is refused rather than recorded', (t) => {
    const device = {};
    assert.equal(usage.sample(device, -5, noon), false, 'a negative idle time');
    assert.equal(usage.sample(device, NaN, noon), false, 'not a number');
    assert.equal(usage.sample(device, 'lots', noon), false, 'not even numeric');
    assert.equal(usage.sample(null, 0, noon), false, 'no device at all');
    assert.equal(device.scpuse, undefined, 'nothing was written');

    // A clock that moved backwards must not produce a negative or wild tally.
    usage.sample(device, 0, noon);
    const before = device.scpuse.days['20260916'];
    assert.equal(usage.sample(device, 0, noon - minutes), false, 'a report from before the last one');
    assert.equal(device.scpuse.days['20260916'], before, 'left exactly as it was');
});

test('a device record damaged by hand is rebuilt rather than crashed on', (t) => {
    const device = { scpuse: 'this is not a record' };
    assert.equal(usage.sample(device, 0, noon), true);
    assert.equal(typeof device.scpuse.days, 'object', 'a fresh record took its place');
});

test('hours are read back over the days asked for, and nothing older', (t) => {
    const device = {};
    let at = noon;
    for (let day = 0; day < 10; day++) {
        // Arriving after the night with an idle time at least as long as the gap the
        // recorder will credit, so the new day starts from a clean nothing.
        usage.sample(device, 900, at);
        for (let i = 0; i < 12; i++) { at += fiveMinutes; usage.sample(device, 0, at); }
        at = noon + ((day + 1) * 24 * 60 * minutes);
    }
    const week = usage.activeHours(device, 7, noon + (9 * 24 * 60 * minutes));
    assert.equal(Math.round(week), 7, 'one hour a day over seven days');
    const all = usage.activeHours(device, 14, noon + (9 * 24 * 60 * minutes));
    assert.equal(Math.round(all), 10, 'and ten over the fortnight');
});

test('never measured reads differently from never used', (t) => {
    assert.equal(usage.activeHours({}, 7, noon), null, 'nothing recorded is not a zero');
    const unused = {};
    usage.sample(unused, 99999, noon);
    assert.equal(usage.activeHours(unused, 7, noon), 0, 'measured and untouched is a zero');
});

// The recorder is only worth anything if the server actually calls it, and only safe if a
// server built without it still runs. Both are read from the source rather than assumed.
test('the server folds every idle-time report into the tally', (t) => {
    const source = fs.readFileSync(path.join(__dirname, '../../meshagent.js'), 'utf8');
    const at = source.indexOf('if (command.idletime != null)');
    assert.ok(at > 0, 'the idle time handler is still there');
    const block = source.substring(at, at + 900);
    assert.ok(/scpUsage\s*!=\s*null/.test(block), 'guarded, so a server without the recorder still runs');
    assert.ok(/scpUsage\.sample\(device,\s*parseInt\(command\.idletime\)\)/.test(block), 'and it is actually called');
    assert.ok(/change = 1/.test(block), 'marking the device changed, so the tally is saved');
});

test('the recorder is started before any agent can connect', (t) => {
    const source = fs.readFileSync(path.join(__dirname, '../../meshcentral.js'), 'utf8');
    const started = source.indexOf("obj.scpUsage = require('./scp-usage.js')");
    const webserver = source.indexOf("obj.webserver = require('./webserver.js')");
    assert.ok(started > 0, 'the recorder is created');
    assert.ok(webserver > 0, 'the web server is created');
    assert.ok(started < webserver, 'and the recorder comes first, or early reports land nowhere');
});
