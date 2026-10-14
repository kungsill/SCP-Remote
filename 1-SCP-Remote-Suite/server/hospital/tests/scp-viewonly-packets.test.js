'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isDisplayPacket } = require('../../agents/modules_meshcore/scp-viewonly');
function packet(command, size) { const data = Buffer.alloc(size); data.writeUInt16BE(command); data.writeUInt16BE(size, 2); return data; }
test('picture-only allows display settings and rejects input including concatenated commands', () => {
    assert.equal(isDisplayPacket(packet(5, 10)), true);
    assert.equal(isDisplayPacket(packet(6, 4)), true);
    for (const [command, size] of [[1, 6], [2, 10], [10, 4], [85, 7], [87, 5], [999, 4]]) {
        assert.equal(isDisplayPacket(packet(command, size)), false);
        assert.equal(isDisplayPacket(Buffer.concat([packet(6, 4), packet(command, size)])), false);
    }
    assert.equal(isDisplayPacket(Buffer.concat([packet(6, 4), packet(5, 10)])), true);
    assert.equal(isDisplayPacket(packet(5, 9)), false);
    assert.equal(isDisplayPacket(Buffer.from([0, 6, 0])), false);
});
test('the real agent rejects lock and auto-lock on a view-only tunnel', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../agents/meshcore.js'), 'utf8');
    const start = source.indexOf('function onTunnelControlData(');
    const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
    let locks = 0, writes = 0;
    const fn = new Function('require', 'lockDesktop', 'MeshServerLogEx', body + '\nreturn onTunnelControlData;')(
        name => { assert.equal(name, 'scp-viewonly'); return { isDisplayPacket }; }, () => { locks++; }, () => {});
    const ws = { httprequest: { desktopviewonly: true, protocol: 2, desktop: { kvm: { write() { writes++; } } } } };
    fn({ type: 'lock' }, ws); fn({ type: 'autolock', value: true }, ws);
    fn({ type: 'options', autolock: true }, ws);
    assert.equal(locks, 0); assert.equal(ws.httprequest.autolock, undefined);
    fn(packet(1, 6), ws); assert.equal(writes, 0);
    fn(packet(5, 10), ws); assert.equal(writes, 1);
    ws.httprequest.desktopviewonly = false;
    fn({ type: 'lock' }, ws); assert.equal(locks, 1, 'ordinary remote-control behavior is preserved');
});
