'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// A computer whose address range was never allowed does not appear, and upstream says
// nothing anywhere about why — that is what makes it expensive to find. These run against
// the real source in webserver.js, so the message cannot quietly disappear again.
const source = fs.readFileSync(path.join(__dirname, '../../webserver.js'), 'utf8');

// A clock can be passed in to step past the quiet hour without waiting for one.
function loadReporter(clock) {
    const start = source.indexOf('const refusedAgentRanges = {};');
    assert.ok(start > 0, 'reportRefusedAgent should still exist in webserver.js');
    const end = source.indexOf('\n    }', source.indexOf('function reportRefusedAgent', start));
    assert.ok(end > start, 'could not find the end of reportRefusedAgent');
    const body = source.substring(start, end + 6);
    const lines = [], events = [];
    const sandbox = new Function('cleanRemoteAddr', 'console', 'obj', 'Date', body + '\nreturn reportRefusedAgent;');
    const reporter = sandbox(
        function (addr) { return (typeof addr != 'string') ? null : (addr.indexOf('::ffff:') === 0 ? addr.substring(7) : addr); },
        { log: line => lines.push(line) },
        { parent: { DispatchEvent: function (targets, source, event) { events.push({ targets: targets, event: event }); } } },
        clock ? { now: function () { return clock.at; } } : Date
    );
    return { report: reporter, lines: lines, events: events };
}

test('a refused agent is named, with the range and the command that allows it', () => {
    const r = loadReporter();
    r.report({ ip: '192.168.18.111' }, null);
    const all = r.lines.join('\n');
    assert.ok(all.indexOf('192.168.18.111') >= 0, 'it must name the computer that was refused');
    assert.ok(all.indexOf('192.168.18.0/24') >= 0, 'and the range that needs allowing');
    assert.ok(all.indexOf('allow-subnet.js add 192.168.18.0/24') >= 0, 'and the exact command to fix it');
    assert.ok(all.indexOf('service:restart') >= 0, 'including the restart it needs afterwards');
});

test('an address arriving in IPv6 form is reported as the plain address', () => {
    const r = loadReporter();
    r.report({ ip: '::ffff:192.168.30.7' }, null);
    assert.ok(r.lines.join('\n').indexOf('192.168.30.0/24') >= 0);
});

test('one computer retrying does not fill the log', () => {
    const r = loadReporter();
    for (let i = 0; i < 50; i++) { r.report({ ip: '192.168.18.' + (100 + i) }, null); }
    assert.equal(r.lines.length, 2, 'the whole range should be reported once, not once per computer');
});

test('different ranges are each reported', () => {
    const r = loadReporter();
    r.report({ ip: '192.168.18.111' }, null);
    r.report({ ip: '192.168.40.5' }, null);
    assert.equal(r.lines.length, 4, 'two ranges, two messages of two lines');
});

test('a refusal with no usable address is ignored rather than throwing', () => {
    const r = loadReporter();
    assert.doesNotThrow(() => r.report({}, null));
    assert.doesNotThrow(() => r.report(null, null));
    assert.equal(r.lines.length, 0);
});

test('both places that refuse an agent by address report it', () => {
    // Count the call sites only; the declaration reads differently. The per-domain check
    // knows which domain refused and says so, the server-wide one runs before that is known.
    const calls = source.split(/reportRefusedAgent\(req, res(?:, domain)?\);/).length - 1;
    assert.equal(calls, 2, 'the server-wide and the per-domain address checks must both report');
    // And the refusal must still happen: reporting is added to it, not instead of it.
    assert.ok(source.indexOf('obj.blockedAgents++; reportRefusedAgent(req, res); return null;') > 0,
        'the server-wide check must still refuse and count the connection');
    assert.ok(source.indexOf('obj.blockedAgents++; reportRefusedAgent(req, res, domain); return null;') > 0,
        'the per-domain check must still refuse and count the connection');
});

// The log was not enough on its own: 192.168.4.0/24 in September, then 192.168.6.0/24 and
// 192.168.60.0/24, each waiting days with the answer sitting in a file nobody opens.
test('a refusal also reaches administrators as a server event, not only the log', () => {
    const r = loadReporter();
    r.report({ ip: '192.168.6.195' }, null);
    assert.equal(r.events.length, 1, 'the refusal must be dispatched as an event');
    assert.deepEqual(r.events[0].targets, ['*', 'server-users'], 'administrators are the audience');
    const e = r.events[0].event;
    assert.equal(e.scpRange, '192.168.6.0/24');
    assert.equal(e.scpAddress, '192.168.6.195');
    assert.ok(e.msg.includes('192.168.6.0/24'), 'the event names the range');
    assert.ok(e.msg.includes('allow-subnet.js add 192.168.6.0/24'), 'the event carries the command that fixes it');
});

test('the per-domain refusal is filed under the domain that refused it', () => {
    const r = loadReporter();
    r.report({ ip: '192.168.6.195' }, null, { id: 'ward' });
    assert.equal(r.events[0].event.domain, 'ward');
    const s = loadReporter();
    s.report({ ip: '192.168.6.195' }, null); // Server-wide check, before any domain is known
    assert.equal(s.events[0].event.domain, '');
});

test('every attempt is counted, even while the hourly message stays quiet', () => {
    const r = loadReporter();
    for (var i = 0; i < 5; i++) { r.report({ ip: '192.168.6.' + (100 + i) }, null); }
    assert.equal(r.lines.length, 2, 'one range still says it once an hour, not five times');
    assert.equal(r.events.length, 1, 'and dispatches once, not five times');
    assert.equal(r.events[0].event.scpCount, 1, 'the first report is the first attempt');
});

test('a range that keeps being refused says how many times when it speaks again', () => {
    const clock = { at: 1000000 };
    const r = loadReporter(clock);
    r.report({ ip: '192.168.6.195' }, null);
    assert.ok(!r.lines[0].includes('พยายามแล้ว'), 'the first message has no repeat count to give');

    // Four more computers try during the quiet hour: counted, nothing said.
    for (var i = 0; i < 4; i++) { clock.at += 60000; r.report({ ip: '192.168.6.' + (196 + i) }, null); }
    assert.equal(r.lines.length, 2, 'the hour is not up yet');

    clock.at += 3600001; // An hour and a moment later
    r.report({ ip: '192.168.6.195' }, null);
    assert.equal(r.events.length, 2, 'the range speaks again once the hour is up');
    assert.equal(r.events[1].event.scpCount, 6, 'and reports every attempt since it started, not just this one');
    assert.ok(r.lines[2].includes('พยายามแล้ว 6 ครั้ง'), 'the log says how many computers have been turned away');
});
