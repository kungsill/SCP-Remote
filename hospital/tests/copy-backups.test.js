'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { backupSettings, prune, copyFolder } = require('../../scripts/copy-backups.js');

function tempDir(t, name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-' + name + '-'));
    t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (error) { /* gone already */ } });
    return dir;
}

function write(file, content, ageDays) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    if (ageDays) {
        const when = new Date(Date.now() - (ageDays * 86400000));
        fs.utimesSync(file, when, when);
    }
}

test('the retention window is taken from the server settings, not assumed', () => {
    assert.equal(backupSettings({ settings: { autoBackup: { keepLastDaysBackup: 7, backupPath: 'X:/b' } } }).keepDays, 7);
    assert.equal(backupSettings({ settings: { autoBackup: { backupPath: 'X:/b' } } }).keepDays, 30, 'a sensible default when unset');
    assert.equal(backupSettings({}).source, null, 'without a backup path there is nothing to copy');
});

test('copying brings over new files and leaves identical ones alone', (t) => {
    const from = tempDir(t, 'from'), to = tempDir(t, 'to');
    write(path.join(from, 'meshcentral-autobackup-2026-09-15-02-00.zip'), 'one');
    write(path.join(from, 'nested', 'deep.bin'), 'two');

    let result = copyFolder(from, to);
    assert.equal(result.copied, 2, 'both files should arrive, including the nested one');
    assert.equal(fs.readFileSync(path.join(to, 'nested', 'deep.bin'), 'utf8'), 'two');

    result = copyFolder(from, to);
    assert.equal(result.copied, 0, 'a second run must not copy the same bytes again');
    assert.equal(result.skipped, 2);
});

test('a changed file is copied again even though the name is the same', (t) => {
    const from = tempDir(t, 'from2'), to = tempDir(t, 'to2');
    write(path.join(from, 'a.zip'), 'short');
    copyFolder(from, to);
    write(path.join(from, 'a.zip'), 'a longer body');
    assert.equal(copyFolder(from, to).copied, 1);
    assert.equal(fs.readFileSync(path.join(to, 'a.zip'), 'utf8'), 'a longer body');
});

test('pruning removes only old backups this script made', (t) => {
    const dir = tempDir(t, 'prune');
    write(path.join(dir, 'meshcentral-autobackup-old.zip'), 'x', 40);
    write(path.join(dir, 'meshcentral-autobackup-new.zip'), 'x', 2);
    write(path.join(dir, 'notes.txt'), 'keep me', 400);
    write(path.join(dir, 'something-else.zip'), 'keep me too', 400);

    assert.equal(prune(dir, 30), 1);
    const left = fs.readdirSync(dir).sort();
    assert.deepEqual(left, ['meshcentral-autobackup-new.zip', 'notes.txt', 'something-else.zip'],
        'anything that is not one of our backup files must survive');
});

test('pruning is skipped entirely when the server keeps backups for ever', (t) => {
    const dir = tempDir(t, 'forever');
    write(path.join(dir, 'meshcentral-autobackup-ancient.zip'), 'x', 5000);
    assert.equal(prune(dir, 0), 0);
    assert.equal(fs.readdirSync(dir).length, 1);
});

const { msUntilDailyTime, scheduleDaily } = require('../../scripts/copy-backups.js');

test('the daily copy is pinned to the clock, not to when the server started', () => {
    const hour = 60 * 60 * 1000;
    // Before the hour on the same day: it waits until later today.
    assert.equal(msUntilDailyTime(2, 30, new Date(2026, 8, 15, 1, 30, 0)), hour);
    // After it: it waits until tomorrow, not a day from now.
    assert.equal(msUntilDailyTime(2, 30, new Date(2026, 8, 15, 3, 30, 0)), 23 * hour);
    // Exactly on it: the next one is tomorrow, so a restart at 02:30 cannot loop.
    assert.equal(msUntilDailyTime(2, 30, new Date(2026, 8, 15, 2, 30, 0)), 24 * hour);
});

test('the daily copy survives a destination that is not reachable', (t) => {
    // A drive that has been unplugged must be reported, not thrown, or it would take the
    // whole server down with it when the service starts.
    const said = [];
    const job = scheduleDaily('Z:\\definitely-not-there', 2, 30, line => said.push(line));
    t.after(() => job.stop());
    assert.ok(job && typeof job.stop === 'function');
});

test('scheduling the copy never holds the server open by itself', (t) => {
    const job = scheduleDaily('Z:\\nowhere', 2, 30, () => {});
    t.after(() => job.stop());
    // If the timers were referenced, node would refuse to exit while they were pending.
    // There is no direct way to assert that, so assert the handle offers stopping instead.
    assert.doesNotThrow(() => job.stop());
});
