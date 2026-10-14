'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const esprima = require('esprima');
const source = fs.readFileSync(path.join(__dirname, '../../agents/modules_meshcore/win-scp-dialog.js'), 'utf8');
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
    assert.equal(sent[0].command, 'ok'); assert.equal(exited, 0);
    ipc.emit('message', { command: 'dialog-result-received' });
    assert.equal(exited, 1); assert.equal(clock.active.size, 0);
});
function service() {
    const ipc = new EventEmitter(), sent = [], decisions = [], clock = timers();
    ipc.message = msg => sent.push(msg); ipc.exit = () => ipc.emit('exit');
    function PromiseStub() { this.resolve = value => decisions.push(['allow', value]); this.reject = value => decisions.push(['deny', value]); }
    const context = { console: { info1() {}, log() {} }, process: { pid: 1 }, promise: PromiseStub, getJSModule: () => 'source', defaultImage: 'image', ...clock,
        require: name => name === 'user-sessions' ? { consoleUid: () => 1, getProcessOwnerName: () => ({ tsid: 0 }) } : { create: () => ipc } };
    const create = vm.runInNewContext(fn('create') + '\ncreate;', context);
    const result = create('title', 'caption', 'admin', { timeout: 1000 });
    return { ipc, sent, decisions, clock, result };
}
test('service completes message once, acknowledges it, and ignores subsequent child exit', () => {
    const s = service(); s.ipc.emit('ready'); s.ipc.emit('message', { command: 'ok' }); s.ipc.emit('exit');
    assert.deepEqual(s.decisions, [['allow', undefined]]);
    assert.equal(s.sent[1].command, 'dialog-result-received'); assert.equal(s.clock.active.size, 0);
});
test('child crash and missing result complete the message instead of leaving it pending', () => {
    const s = service(); s.ipc.emit('exit'); assert.equal(s.decisions[0][0], 'allow');
    const timed = service(); Array.from(timed.clock.active.values())[0]();
    assert.deepEqual(timed.decisions, [['allow', undefined]]);
});

for (const [label, message, wparam] of [['OK', 0x111, 0xFFF3], ['close button', 0x111, 0xFFE0], ['Alt+F4', 0x10, 0]]) {
    test(label + ' closes the native window before completing the promise', () => {
        const order = [];
        const context = { WM_MOUSEMOVE: 0x200, WM_COMMAND: 0x111, clearTimeout() { order.push('timer'); } };
        const handler = vm.runInNewContext(fn('pump_onMessage') + '\npump_onMessage;', context);
        const pump = { timeout: 1, close() { order.push('close'); }, stop() { order.push('close'); }, promise: { resolve() { order.push('resolve'); } } };
        handler.call(pump, { message, wparam });
        assert.deepEqual(order, ['timer', 'close', 'resolve']);
    });
}
