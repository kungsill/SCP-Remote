'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const esprima = require('esprima');
const source = fs.readFileSync(path.join(__dirname, '../../agents/modules_meshcore/win-scp-userconsent.js'), 'utf8');
const functions = esprima.parseScript(source, { range: true }).body.filter(item => item.type === 'FunctionDeclaration');
function fn(name) { const item = functions.find(item => item.id.name === name); return source.slice(...item.range); }
function timers() { const active = new Map(); let id = 0; return { active, setTimeout(f) { active.set(++id, f); return id; }, clearTimeout(i) { active.delete(i); } }; }
test('child sends one result and stays alive until the service acknowledges it', () => {
    const ipc = new EventEmitter(), sent = [], clock = timers(); let exited = 0, allow;
    ipc.message = msg => sent.push(msg);
    const context = { global: {}, require: () => ipc, process: { _exit() { exited++; } }, ...clock,
        createLocal: () => ({ then(success) { allow = success; } }) };
    vm.runInNewContext(fn('_child') + '\n_child();', context);
    ipc.emit('message', { command: 'dialog', options: {} }); allow(false);
    assert.equal(sent[0].command, 'allow'); assert.equal(exited, 0);
    ipc.emit('message', { command: 'dialog-result-received' });
    assert.equal(exited, 1); assert.equal(clock.active.size, 0);
});
function service() {
    const ipc = new EventEmitter(), sent = [], decisions = [], clock = timers();
    ipc.message = msg => sent.push(msg); ipc.exit = () => ipc.emit('exit');
    function PromiseStub() { this.resolve = value => decisions.push(['allow', value]); this.reject = value => decisions.push(['deny', value]); }
    const context = { console: { info1() {}, log() {} }, process: { pid: 1 }, promise: PromiseStub, getJSModule: () => 'source', ...clock,
        require: name => name === 'user-sessions' ? { consoleUid: () => 1, getProcessOwnerName: () => ({ tsid: 0 }) } : { create: () => ipc } };
    const create = vm.runInNewContext(fn('create') + '\ncreate;', context);
    const result = create('title', 'caption', 'admin', { timeout: 1000 });
    return { ipc, sent, decisions, clock, result };
}
test('service resolves allow once, acknowledges it, and ignores subsequent child exit', () => {
    const s = service(); s.ipc.emit('ready'); s.ipc.emit('message', { command: 'allow', always: false }); s.ipc.emit('exit');
    assert.deepEqual(s.decisions, [['allow', false]]);
    assert.equal(s.sent[1].command, 'dialog-result-received'); assert.equal(s.clock.active.size, 0);
});
test('child crash and missing result reject the request instead of leaving it pending', () => {
    const s = service(); s.ipc.emit('exit'); assert.equal(s.decisions[0][0], 'deny');
    const timed = service(); Array.from(timed.clock.active.values())[0]();
    assert.deepEqual(timed.decisions, [['deny', 'CONSENT_RESPONSE_TIMEOUT']]);
});
