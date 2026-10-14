'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// The client setup used to run any program that happened to sit in the same folder and
// match the machine's architecture, with administrator rights — so leaving it beside an
// AnyDesk download ran AnyDesk's installer. It now only runs files carrying the settings
// block the server appends to a real agent. This checks both the rule and the source.
const root = path.join(__dirname, '../..');
const setupSource = fs.readFileSync(path.join(root, 'hospital/client-setup/src/Setup.cs'), 'utf8');

const MESH_POLICY = 'b996015880544a19b7f7e9be44914c19';
const JAVASCRIPT = 'b996015880544a19b7f7e9be44914c18';

// The same rule the installer applies, so the files that ship can be checked against it.
function isOurAgent(file) {
    let handle;
    try { handle = fs.openSync(file, 'r'); } catch (error) { return false; }
    try {
        const size = fs.fstatSync(handle).size;
        if (size < 1024) return false;
        const tail = Buffer.alloc(20);
        fs.readSync(handle, tail, 0, 20, size - 20);
        const marker = tail.slice(4).toString('hex');
        if ((marker !== MESH_POLICY) && (marker !== JAVASCRIPT)) return false;
        const length = tail.readUInt32BE(0);
        if ((length <= 0) || (length > size - 20)) return false;
        const read = Math.min(length, 8192);
        const settings = Buffer.alloc(read);
        fs.readSync(handle, settings, 0, read, size - 20 - length);
        const text = settings.toString('utf8');
        return (text.indexOf('MeshServer=') >= 0) || (text.indexOf('MeshID=') >= 0);
    } catch (error) {
        return false;
    } finally {
        fs.closeSync(handle);
    }
}

test('the agents that ship in the setup are recognised as ours', () => {
    const folder = path.join(root, 'hospital/client-setup/agents');
    if (!fs.existsSync(folder)) { return; } // built artefacts are not in the repository
    const agents = fs.readdirSync(folder).filter(name => name.toLowerCase().endsWith('.exe'));
    assert.ok(agents.length > 0, 'there should be agents to check');
    agents.forEach(name => {
        assert.equal(isOurAgent(path.join(folder, name)), true, name + ' should be recognised');
    });
});

test('ordinary programs are not mistaken for an agent', () => {
    // Real executables that ship with MeshCentral but are not agents for this server.
    ['agents/MeshCentralRouter.exe', 'agents/MeshCentralAssistant.exe', 'agents/MeshCmdARM64.exe']
        .map(name => path.join(root, name))
        .filter(file => fs.existsSync(file))
        .forEach(file => {
            assert.equal(isOurAgent(file), false, path.basename(file) + ' must never be run as an agent');
        });
});

test('a file that is not an executable at all is refused', () => {
    assert.equal(isOurAgent(path.join(root, 'package.json')), false);
    assert.equal(isOurAgent(path.join(root, 'does-not-exist.exe')), false);
});

test('the setup no longer falls back to any program in the folder', () => {
    assert.equal(setupSource.indexOf('keep the rest as a fallback'), -1,
        'the fallback that ran any matching executable must be gone');
    assert.ok(setupSource.indexOf('if (IsOurAgent(file)) agents.Add(file);') > 0,
        'candidates must be filtered to our agents before anything is chosen');
    assert.ok(setupSource.indexOf('if (!IsOurAgent(file)) continue;') > 0,
        'the architecture warning must ignore other programs too');
});

test('the check looks at the settings block, not at the file name', () => {
    const start = setupSource.indexOf('public static bool IsOurAgent');
    assert.ok(start > 0);
    const body = setupSource.substring(start, setupSource.indexOf('\n        }', start));
    assert.ok(body.indexOf('MeshServer=') > 0, 'it must require the server address inside the file');
    assert.ok(body.indexOf('MeshPolicyGuid') > 0, 'and the marker the server appends');
    assert.equal(body.indexOf('GetFileName'), -1, 'a name is not evidence of anything');
});
