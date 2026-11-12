'use strict';
// Copy on one computer, paste on the other, however it was copied or pasted: with the keyboard,
// with the right-click menu, with an Edit menu. The program keeps the two clipboards' text the
// same while its remote window is in use, the way a VNC viewer does, so nothing depends on
// Ctrl+C or Ctrl+V being the keys pressed. Files are not moved by themselves - only when asked
// for with Ctrl+C / Ctrl+V - because a copied file can be gigabytes.
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');

function page(opts = {}) {
    const calls = [], elements = [];
    const side = { local: { seq: 100, text: opts.localText === undefined ? null : opts.localText, files: !!opts.localFiles }, far: { seq: 500, text: opts.farText === undefined ? null : opts.farText, files: !!opts.farFiles } };
    const element = () => { const e = { style: {}, append() { }, textContent: '', offsetParent: {} }; elements.push(e); return e; };
    async function handle(name, c) {
        const s = side[name];
        calls.push(name + ':' + c.op);
        if (opts.farFails && name === 'far') throw Error('HELPER_TIMEOUT_OR_OLD_AGENT');
        switch (c.op) {
            case 'state': return { sequence: s.seq, files: s.files };
            case 'snapshot': return { job: 'j', sequence: s.seq, entries: s.files ? [{ path: 'a.txt', directory: false, size: 3 }] : [], text: s.files ? null : s.text };
            case 'text': if (c.sequence !== undefined && c.sequence !== s.seq) throw Error('CLIPBOARD_CHANGED'); s.text = c.text; s.files = false; s.seq++; return {};
            default: throw Error(c.op);
        }
    }
    let connections = 0;
    const context = {
        window: null, Map, Set, Promise, console, Date,
        document: { documentElement: { lang: 'th' }, body: { appendChild() { } }, createElement: element, getElementById: () => ({ offsetParent: {} }), addEventListener() { }, hasFocus: () => opts.focused !== false },
        setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; }, clearTimeout,
        serverPublicNamePort: 'host', authCookie: 'c', domainUrl: '/', scpClipboardReady: true,
        scpTransfer: { transfer: async () => { calls.push('TRANSFER'); } },
        scpClipboard: { request: async c => { try { return { ok: true, result: await handle('local', c) }; } catch (e) { return { ok: false, error: e.message }; } } },
        desktop: { State: 3, m: { scpStats: { tiles: 5 }, KeyAction: { DOWN: 1, UP: 2 }, SendKeyMsgKC: keys => calls.push('key:' + keys[1][1]) } },
        addEventListener() { },
        CreateAgentRedirect: (a, m) => {
            connections++;
            const c = { State: 0, Start() { this.State = 3; this.onStateChanged(this, 3); }, Stop() { this.State = 0; this.onStateChanged(this, 0); },
                sendText: async command => { try { m.ProcessData(JSON.stringify({ action: 'scpclip', id: command.id, ok: true, result: await handle('far', command) })); } catch (e) { m.ProcessData(JSON.stringify({ action: 'scpclip', id: command.id, ok: false, error: e.message })); } } };
            return c;
        }
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../desktop-app/inject-clipboard.js'), 'utf8'), context);
    return { side, calls, sync: () => context.scpClipboardSync(), shown: () => elements[0].style.display === 'flex', connections: () => connections, context };
}

test('text already copied here is on the remote clipboard as soon as the session is in use', async () => {
    const p = page({ localText: 'รหัสผู้ป่วย 123' });
    await p.sync();
    assert.equal(p.side.far.text, 'รหัสผู้ป่วย 123');
    assert.equal(p.calls.some(c => c.startsWith('key:')), false, 'nothing is typed or pasted for them');
    assert.equal(p.shown(), false, 'and nothing is announced');
});

test('copying here afterwards reaches the remote computer, so right-click Paste there works', async () => {
    const p = page({ localText: 'one' });
    await p.sync();
    p.side.local.text = 'two'; p.side.local.seq++;      // copied by any means on this computer
    await p.sync();
    assert.equal(p.side.far.text, 'two');
});

test('copying on the remote computer by any means reaches this computer', async () => {
    const p = page({ localText: 'one' });
    await p.sync();
    p.side.far.text = 'จากเครื่องลูก'; p.side.far.seq++;   // right-click Copy in the remote screen
    await p.sync();
    assert.equal(p.side.local.text, 'จากเครื่องลูก');
    assert.equal(p.shown(), false);
});

test('what was just sent is not sent back again', async () => {
    const p = page({ localText: 'one' });
    await p.sync();
    const before = p.calls.filter(c => c.endsWith(':text')).length;
    await p.sync(); await p.sync();
    assert.equal(p.calls.filter(c => c.endsWith(':text')).length, before);
    assert.equal(p.side.local.text, 'one');
    assert.equal(p.side.far.text, 'one');
});

test('files are never moved by themselves', async () => {
    const p = page({ localFiles: true });
    await p.sync();
    p.side.far.files = true; p.side.far.seq++;
    await p.sync();
    assert.equal(p.calls.includes('TRANSFER'), false);
    assert.equal(p.calls.some(c => c.endsWith(':snapshot') || c.endsWith(':text')), false, 'not even looked into');
});

test('nothing is exchanged while the remote window is not the one being used', async () => {
    const p = page({ localText: 'private note', focused: false });
    await p.sync();
    assert.equal(p.side.far.text, null);
    assert.equal(p.connections(), 0, 'the channel is not even opened');
});

test('nothing is exchanged before the remote picture has arrived', async () => {
    const p = page({ localText: 'x' });
    p.context.desktop.m.scpStats.tiles = 0;
    await p.sync();
    assert.equal(p.connections(), 0);
    assert.equal(p.side.far.text, null);
});

test('a remote computer that cannot do it is asked once, not every second', async () => {
    const p = page({ localText: 'x', farFails: true });
    await p.sync(); await p.sync(); await p.sync();
    assert.equal(p.connections(), 1);
    assert.equal(p.shown(), false, 'and the technician is not nagged about it');
});
