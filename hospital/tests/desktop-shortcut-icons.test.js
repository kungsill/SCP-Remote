'use strict';
// The desktop program fixes its own shortcuts' icon. An update replaces the program's inner files
// but never SCP-Remote.exe, and shortcuts take their picture from the .exe, so after the logo
// changed every desktop and Start-menu shortcut kept the old one until someone reinstalled.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const icons = require('../desktop-app/shortcut-icons');

const EXE = 'C:\\Users\\nurse\\AppData\\Local\\Programs\\scp-remote-desktop\\SCP-Remote.exe';
const ICON = 'C:\\Users\\nurse\\AppData\\Roaming\\scp-remote-desktop\\scp-logo.ico';

test('a shortcut to this program with another icon is updated', () => {
    assert.equal(icons.needsIcon({ target: EXE, icon: EXE, iconIndex: 0 }, EXE, ICON), true);
    assert.equal(icons.needsIcon({ target: EXE }, EXE, ICON), true, 'no icon set means the .exe one');
});

test('Windows paths are compared without case', () => {
    assert.equal(icons.needsIcon({ target: EXE.toLowerCase(), icon: ICON.toUpperCase() }, EXE, ICON), false);
});

test('shortcuts to other programs, and ones already done, are left alone', () => {
    assert.equal(icons.needsIcon({ target: 'C:\\Windows\\notepad.exe', icon: '' }, EXE, ICON), false);
    assert.equal(icons.needsIcon({ target: EXE, icon: ICON, iconIndex: 0 }, EXE, ICON), false);
    assert.equal(icons.needsIcon(null, EXE, ICON), false);
});

function fakeShell(links) {
    const written = [];
    return {
        written,
        readShortcutLink(p) { if (!(p in links)) throw Error('not a shortcut'); return links[p]; },
        writeShortcutLink(p, op, opts) { written.push({ p, op, opts }); links[p] = Object.assign({}, links[p], opts); return true; },
    };
}

test('refresh copies the icon to a lasting place and points matching shortcuts at it', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-icons-'));
    const desk = path.join(tmp, 'Desktop'), menu = path.join(tmp, 'Programs'), data = path.join(tmp, 'data');
    [desk, menu, data].forEach(d => fs.mkdirSync(d));
    const source = path.join(tmp, 'scp-logo.ico');
    fs.writeFileSync(source, 'ICON-v2');
    for (const f of ['SCP-Remote.lnk', 'Notepad.lnk', 'readme.txt']) fs.writeFileSync(path.join(desk, f), '');
    fs.writeFileSync(path.join(menu, 'SCP-Remote.lnk'), '');
    const stable = path.join(data, 'scp-logo.ico');
    const shell = fakeShell({
        [path.join(desk, 'SCP-Remote.lnk')]: { target: EXE, icon: EXE, iconIndex: 0 },
        [path.join(desk, 'Notepad.lnk')]: { target: 'C:\\Windows\\notepad.exe' },
        [path.join(menu, 'SCP-Remote.lnk')]: { target: EXE },
    });
    const fixed = icons.refresh({ shell, dirs: [desk, menu, path.join(tmp, 'missing')], exe: EXE, iconSource: source, stableIcon: stable });
    assert.equal(fs.readFileSync(stable, 'utf8'), 'ICON-v2', 'the icon lives outside the versioned update folder');
    assert.deepEqual(fixed.sort(), [path.join(desk, 'SCP-Remote.lnk'), path.join(menu, 'SCP-Remote.lnk')].sort());
    for (const w of shell.written) {
        assert.equal(w.op, 'update', 'only the icon changes; target and arguments stay');
        assert.deepEqual(w.opts, { icon: stable, iconIndex: 0 });
    }
    // Second start: nothing left to do.
    assert.deepEqual(icons.refresh({ shell, dirs: [desk, menu], exe: EXE, iconSource: source, stableIcon: stable }), []);
});

test('a shortcut it may not change (e.g. the all-users desktop) does not stop the others', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-icons-'));
    const source = path.join(tmp, 'scp-logo.ico');
    fs.writeFileSync(source, 'ICON');
    fs.writeFileSync(path.join(tmp, 'A.lnk'), '');
    fs.writeFileSync(path.join(tmp, 'B.lnk'), '');
    const shell = fakeShell({ [path.join(tmp, 'A.lnk')]: { target: EXE }, [path.join(tmp, 'B.lnk')]: { target: EXE } });
    const write = shell.writeShortcutLink;
    shell.writeShortcutLink = (p, op, opts) => { if (p.endsWith('A.lnk')) throw Error('EPERM'); return write(p, op, opts); };
    const fixed = icons.refresh({ shell, dirs: [tmp], exe: EXE, iconSource: source, stableIcon: path.join(tmp, 'stable.ico') });
    assert.deepEqual(fixed, [path.join(tmp, 'B.lnk')]);
});

test('the program runs it at start, with the icon kept outside the update folder', () => {
    const main = fs.readFileSync(path.join(__dirname, '../desktop-app/main.js'), 'utf8');
    assert.match(main, /require\('\.\/shortcut-icons'\)\.refresh\(/);
    assert.match(main, /stableIcon:path\.join\(app\.getPath\('userData'\),'scp-logo\.ico'\)/);
    assert.match(main, /process\.platform==='win32'\)try\{/, 'Windows only, and a failure must not stop the program');
});

test('without its icon file it changes nothing', () => {
    const shell = fakeShell({});
    assert.deepEqual(icons.refresh({ shell, dirs: [os.tmpdir()], exe: EXE, iconSource: path.join(os.tmpdir(), 'nope.ico'), stableIcon: path.join(os.tmpdir(), 'x.ico') }), []);
    assert.equal(shell.written.length, 0);
});
