'use strict';
// Copy on one computer, paste on the other, however it was copied or pasted: with the keyboard,
// with the right-click menu, with an Edit menu. The program keeps the two clipboards' text the
// same while its remote window is in use, the way a VNC viewer does, so nothing depends on
// Ctrl+C or Ctrl+V being the keys pressed. Files are not moved by themselves - only when asked
// for with Ctrl+C / Ctrl+V - because a copied file can be gigabytes.
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');

function page(opts = {}) {
    const calls = [], elements = [], clock = { t: 1700000000000 };
    const side = { local: { seq: 100, text: opts.localText === undefined ? null : opts.localText, files: !!opts.localFiles, size: opts.localSize || 3 }, far: { seq: 500, text: opts.farText === undefined ? null : opts.farText, files: !!opts.farFiles, size: opts.farSize || 3 } };
    const element = () => { const e = { style: {}, append() { }, textContent: '', offsetParent: {} }; elements.push(e); return e; };
    async function handle(name, c) {
        const s = side[name];
        calls.push(name + ':' + c.op);
        if (opts.farFails && name === 'far') throw Error('HELPER_TIMEOUT_OR_OLD_AGENT');
        if (name === 'far' && c.op === 'text' && opts.farTextFails > 0) { opts.farTextFails--; throw Error('CLIPBOARD_BUSY'); }
        if (name === 'local' && c.op === 'snapshot' && opts.localSnapshotFails > 0) { opts.localSnapshotFails--; throw Error('CLIPBOARD_BUSY'); }
        switch (c.op) {
            case 'state': return { sequence: s.seq, files: s.files };
            case 'snapshot': return { job: 'j', sequence: s.seq, entries: s.files ? [{ path: 'a.txt', directory: false, size: s.size }] : [], text: s.files ? null : s.text };
            case 'landed': if (c.sequence !== s.seq) throw Error('CLIPBOARD_CHANGED'); s.files = true; s.text = null; s.seq++; return {};
            case 'text': if (c.sequence !== undefined && c.sequence !== s.seq) throw Error('CLIPBOARD_CHANGED'); s.text = c.text; s.files = false; s.seq++; return {};
            default: throw Error(c.op);
        }
    }
    let connections = 0;
    const context = {
        window: null, Map, Set, Promise, console,
        document: { documentElement: { lang: 'th' }, body: { appendChild() { } }, createElement: element, getElementById: () => ({ offsetParent: {} }), addEventListener() { }, hasFocus: () => opts.focused !== false },
        Date: { now: () => clock.t },
        setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; }, clearTimeout,
        serverPublicNamePort: 'host', authCookie: 'c', domainUrl: '/', scpClipboardReady: true,
        scpTransfer: { transfer: async (src, dst, snap, sequence) => { calls.push('TRANSFER'); await dst({ op: 'landed', sequence }); } },
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
    const handlers = {};
    context.document.addEventListener = (k, fn) => { handlers[k] = fn; };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../desktop-app/inject-clipboard.js'), 'utf8'), context);
    const paste = () => handlers.keydown({ ctrlKey: true, code: 'KeyV', target: { closest: () => false }, preventDefault() { }, stopImmediatePropagation() { } });
    return { side, calls, sync: () => context.scpClipboardSync(), shown: () => elements[0].style.display === 'flex', status: () => elements[1].textContent, action: () => elements[4], paste, opts, clock, connections: () => connections, context };
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

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 2)); };
// Files, with the mouse as well as the keyboard: copying a file on either computer puts it on the
// other's clipboard, so right-click Paste works there. Small ones go by themselves; large ones
// are offered with their size, because a copied folder can be gigabytes.
test('a small file copied here is carried to the remote by itself, ready for right-click Paste', async () => {
    const p = page({ localText: 'x' });
    await p.sync();                                   // session in use, clipboards in step
    p.side.local.files = true; p.side.local.seq++;    // a file copied in Explorer on this computer
    await p.sync(); await settle();
    assert.equal(p.calls.filter(c => c === 'TRANSFER').length, 1);
    assert.equal(p.side.far.files, true, 'it is on the remote clipboard');
    assert.equal(p.calls.some(c => c.startsWith('key:')), false, 'nothing is pasted for them: they choose where');
    assert.match(p.status(), /พร้อมวางที่เครื่องปลายทาง/);
});

test('a small file copied on the remote comes here by itself', async () => {
    const p = page({ localText: 'x' });
    await p.sync();
    p.side.far.files = true; p.side.far.seq++;        // right-click Copy on a file in the remote screen
    await p.sync(); await settle();
    assert.equal(p.calls.filter(c => c === 'TRANSFER').length, 1);
    assert.equal(p.side.local.files, true);
    assert.match(p.status(), /พร้อมวางที่เครื่องนี้/);
});

test('what was just carried is not carried back, and not carried twice', async () => {
    const p = page({ localText: 'x' });
    await p.sync();
    p.side.local.files = true; p.side.local.seq++;
    await p.sync(); await settle();
    await p.sync(); await settle(); await p.sync(); await settle();
    assert.equal(p.calls.filter(c => c === 'TRANSFER').length, 1);
});

test('Ctrl+V after that only pastes: the file is already there', async () => {
    const p = page({ localText: 'x' });
    await p.sync();
    p.side.local.files = true; p.side.local.seq++;
    await p.sync(); await settle();
    p.paste(); await settle();
    assert.equal(p.calls.filter(c => c === 'TRANSFER').length, 1, 'not sent a second time');
    assert.equal(p.calls.filter(c => c === 'key:86').length, 1, 'Ctrl+V reaches the remote computer');
});

test('a large copy is offered with its size, not taken', async () => {
    const p = page({ localText: 'x', localSize: 3 * 1024 * 1024 * 1024 });
    await p.sync();
    p.side.local.files = true; p.side.local.seq++;
    await p.sync(); await settle();
    assert.equal(p.calls.includes('TRANSFER'), false);
    assert.equal(p.shown(), true);
    assert.match(p.status(), /3\.0 GB/);
    assert.equal(p.action().style.display, 'inline-block', 'with a button to send it');
    await p.action().onclick(); await settle();
    assert.equal(p.calls.filter(c => c === 'TRANSFER').length, 1, 'pressing the button sends it');
    assert.equal(p.side.far.files, true);
});

test('a file copied before the session was opened is there to paste as well', async () => {
    // Copy the file, then connect, then right-click Paste: the usual order. Leaving this out made
    // copy and paste look as if it worked only some of the time.
    const p = page({ localFiles: true });
    await p.sync(); await settle();
    assert.equal(p.calls.filter(c => c === 'TRANSFER').length, 1);
    assert.equal(p.side.far.files, true);
});

// The Windows clipboard is briefly unavailable whenever another program has it open, which is
// often, right after something is copied. A copy that could not be read at that instant has to
// be tried again, not quietly forgotten.
test('a clipboard that was busy for a moment is tried again on the next pass', async () => {
    const p = page({ localText: 'one', farTextFails: 1 });
    await p.sync();
    assert.equal(p.side.far.text, null, 'the first try failed');
    await p.sync();
    assert.equal(p.side.far.text, 'one', 'the second gets it across');
});

test('text copied here while the clipboard is being read is not lost either', async () => {
    const p = page({ localText: 'one' });
    await p.sync();
    p.side.local.text = 'two'; p.side.local.seq++; p.opts.localSnapshotFails = 2;
    await p.sync(); await p.sync();
    assert.equal(p.side.far.text, 'one');
    await p.sync();
    assert.equal(p.side.far.text, 'two');
});

test('a copy that keeps failing is given up after three tries, not retried for ever', async () => {
    const p = page({ localText: 'one', farTextFails: 99 });
    for (let i = 0; i < 8; i++) await p.sync();
    assert.equal(p.calls.filter(c => c === 'far:text').length, 3);
    // and the next thing copied starts with a clean count
    p.opts.farTextFails = 0; p.side.local.text = 'next'; p.side.local.seq++;
    await p.sync();
    assert.equal(p.side.far.text, 'next');
});

test('copy on the remote, then click away at once: it still arrives here', async () => {
    const p = page({ localText: 'x' });
    await p.sync();
    p.side.far.text = 'copied just before leaving'; p.side.far.seq++;
    p.opts.focused = false;                 // the technician has clicked on their own desktop
    p.clock.t += 3000;
    await p.sync();                         // an ordinary pass, a few seconds after leaving
    assert.equal(p.side.local.text, 'copied just before leaving');
    // but a window left alone for a while exchanges nothing
    p.side.far.text = 'much later'; p.side.far.seq++;
    p.clock.t += 60000;
    await p.sync();
    assert.equal(p.side.local.text, 'copied just before leaving');
});

test('Ctrl+V pressed while a pass is in flight waits for it instead of colliding', () => {
    const source = fs.readFileSync(path.join(__dirname, '../desktop-app/inject-clipboard.js'), 'utf8');
    assert.match(source, /for\(let i=0;i<60&&autoBusy;i\+\+\)await delay\(50\);/);
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
