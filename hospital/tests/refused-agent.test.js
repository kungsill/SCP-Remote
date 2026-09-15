'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// A computer whose address range was never allowed does not appear, and upstream says
// nothing anywhere about why — that is what makes it expensive to find. These run against
// the real source in webserver.js, so the message cannot quietly disappear again.
const source = fs.readFileSync(path.join(__dirname, '../../webserver.js'), 'utf8');

function loadReporter() {
    const start = source.indexOf('const refusedAgentRanges = {};');
    assert.ok(start > 0, 'reportRefusedAgent should still exist in webserver.js');
    const end = source.indexOf('\n    }', source.indexOf('function reportRefusedAgent', start));
    assert.ok(end > start, 'could not find the end of reportRefusedAgent');
    const body = source.substring(start, end + 6);
    const lines = [];
    const sandbox = new Function('cleanRemoteAddr', 'console', body + '\nreturn reportRefusedAgent;');
    const reporter = sandbox(
        function (addr) { return (typeof addr != 'string') ? null : (addr.indexOf('::ffff:') === 0 ? addr.substring(7) : addr); },
        { log: line => lines.push(line) }
    );
    return { report: reporter, lines: lines };
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
    // Count the call sites only; the declaration reads the same way.
    const calls = source.split('reportRefusedAgent(req, res);').length - 1;
    assert.equal(calls, 2, 'the server-wide and the per-domain address checks must both report');
    // And the refusal must still happen: reporting is added to it, not instead of it.
    assert.ok(source.indexOf('obj.blockedAgents++; reportRefusedAgent(req, res); return null;') > 0,
        'the connection must still be refused and counted');
});
