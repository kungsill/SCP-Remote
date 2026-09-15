'use strict';
// Proves that a backup can actually be restored. Everything else written down here —
// moving the server, recovering from a dead disk, the quarterly drill in the handover
// document — rests on that one assumption, and an untested backup is only a belief.
//
//   npm run drill:restore
//
// Restores the newest backup into a throwaway folder, starts a server on it that listens
// only on this machine, checks it serves its login page and still holds the same accounts
// and computers, then stops it and deletes the folder. The running server is never
// touched: the copy uses its own data folder, its own port, and accepts nothing from the
// network.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const liveData = path.join(root, '.local', 'scp-remote');

function say(line) { console.log(line); }
function fail(line) { console.error('ล้มเหลว: ' + line); process.exitCode = 1; }

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function newestBackup(folder) {
    const files = fs.readdirSync(folder)
        .filter(name => /^meshcentral-autobackup-.*\.zip$/.test(name))
        .map(name => ({ name: name, file: path.join(folder, name), at: fs.statSync(path.join(folder, name)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
    return files[0] || null;
}

function extract(zipFile, into) {
    const yauzl = require('yauzl');
    return new Promise(function (resolve, reject) {
        yauzl.open(zipFile, { lazyEntries: true }, function (error, zip) {
            if (error) { return reject(error); }
            let count = 0;
            zip.on('entry', function (entry) {
                // Never let an archive write outside the folder it is being opened into.
                const target = path.join(into, entry.fileName);
                if (!target.startsWith(into + path.sep) && target !== into) { return reject(new Error('ไฟล์ในซิปชี้ออกนอกโฟลเดอร์: ' + entry.fileName)); }
                if (/\/$/.test(entry.fileName)) { fs.mkdirSync(target, { recursive: true }); zip.readEntry(); return; }
                zip.openReadStream(entry, function (streamError, stream) {
                    if (streamError) { return reject(streamError); }
                    fs.mkdirSync(path.dirname(target), { recursive: true });
                    const out = fs.createWriteStream(target);
                    stream.pipe(out);
                    out.on('close', function () { count++; zip.readEntry(); });
                    out.on('error', reject);
                });
            });
            zip.on('end', function () { resolve(count); });
            zip.on('error', reject);
            zip.readEntry();
        });
    });
}

function freePort() {
    return new Promise(function (resolve, reject) {
        const probe = net.createServer();
        probe.on('error', reject);
        probe.listen(0, '127.0.0.1', function () {
            const port = probe.address().port;
            probe.close(function () { resolve(port); });
        });
    });
}

// Make the restored copy harmless: a different port, reachable from this machine only,
// no agent may reach it, and it must not write backups of its own.
function makeSafe(configFile, port) {
    const config = readJson(configFile);
    const s = config.settings || (config.settings = {});
    s.port = port;
    s.portBind = '127.0.0.1';
    s.redirPort = 0;
    s.mpsPort = 0;
    s.userAllowedIP = ['127.0.0.1', '::1'];
    s.agentAllowedIP = ['127.0.0.1', '::1'];
    delete s.autoBackup;
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
}

function countRecords(dbFile) {
    const kinds = { user: {}, node: {}, mesh: {} };
    for (const line of fs.readFileSync(dbFile, 'utf8').split('\n')) {
        if (!line) { continue; }
        let row = null;
        try { row = JSON.parse(line); } catch (error) { continue; }
        if (row && row._id && kinds[row.type]) { kinds[row.type][row._id] = true; }
    }
    return { users: Object.keys(kinds.user).length, nodes: Object.keys(kinds.node).length, meshes: Object.keys(kinds.mesh).length };
}

function waitForLogin(port, seconds) {
    const deadline = Date.now() + (seconds * 1000);
    return new Promise(function (resolve) {
        (function attempt() {
            const request = https.get({ host: '127.0.0.1', port: port, path: '/', rejectUnauthorized: false, timeout: 4000 }, function (response) {
                let body = '';
                response.on('data', chunk => { body += chunk; });
                response.on('end', function () { resolve({ status: response.statusCode, body: body }); });
            });
            request.on('error', retry);
            request.on('timeout', function () { request.destroy(); retry(); });
            function retry() {
                if (Date.now() > deadline) { return resolve(null); }
                setTimeout(attempt, 1500);
            }
        }());
    });
}

function stop(child) {
    return new Promise(function (resolve) {
        if (!child || child.exitCode !== null) { return resolve(); }
        if (process.platform === 'win32') {
            spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('close', () => setTimeout(resolve, 500));
        } else {
            child.kill('SIGTERM');
            setTimeout(resolve, 500);
        }
    });
}

(async function main() {
    const backupFolder = process.argv[2] || (function () {
        const auto = readJson(path.join(liveData, 'config.json')).settings.autoBackup || {};
        return auto.backupPath;
    }());
    if (!backupFolder || !fs.existsSync(backupFolder)) { return fail('ไม่พบโฟลเดอร์ไฟล์สำรอง: ' + backupFolder); }

    const backup = newestBackup(backupFolder);
    if (!backup) { return fail('ไม่มีไฟล์สำรองในโฟลเดอร์ ' + backupFolder); }

    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-restore-drill-'));
    let child = null;
    try {
        say('ซ้อมกู้คืนไฟล์สำรอง');
        say('  ไฟล์ที่ใช้ : ' + backup.name + '  (' + new Date(backup.at).toLocaleString('sv') + ')');

        const files = await extract(backup.file, work);
        say('  แตกไฟล์   : ' + files + ' ไฟล์');

        const dataPath = path.join(work, 'scp-remote');
        if (!fs.existsSync(path.join(dataPath, 'config.json'))) { return fail('ในไฟล์สำรองไม่มี scp-remote/config.json'); }
        for (const needed of ['agentserver-cert-public.crt', 'agentserver-cert-private.key', 'meshcentral.db']) {
            if (!fs.existsSync(path.join(dataPath, needed))) { return fail('ในไฟล์สำรองไม่มี ' + needed + ' ซึ่งขาดไม่ได้'); }
        }
        say('  ใบรับรองและฐานข้อมูล: ครบ');

        const port = await freePort();
        makeSafe(path.join(dataPath, 'config.json'), port);

        child = spawn(process.execPath, [path.join(root, 'meshcentral.js'), '--datapath', dataPath], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { output += chunk; });

        say('  เริ่มเซิร์ฟเวอร์จำลองที่ 127.0.0.1:' + port + ' (เครื่องอื่นเข้าไม่ได้) กำลังรอ…');
        const page = await waitForLogin(port, 90);
        if (page == null) {
            say('');
            say('ข้อความจากเซิร์ฟเวอร์จำลอง:');
            say(output.split('\n').slice(-12).map(l => '    ' + l).join('\n'));
            return fail('เซิร์ฟเวอร์ที่กู้คืนไม่ตอบใน 90 วินาที');
        }
        if (page.status !== 200) { return fail('หน้าเข้าสู่ระบบตอบรหัส ' + page.status); }
        say('  หน้าเข้าสู่ระบบ: ตอบ 200 ✓');

        const restored = countRecords(path.join(dataPath, 'meshcentral.db'));
        const live = countRecords(path.join(liveData, 'meshcentral.db'));
        say('  ข้อมูลที่กู้ได้ : บัญชี ' + restored.users + ' · กลุ่ม ' + restored.meshes + ' · เครื่อง ' + restored.nodes);
        say('  ของจริงตอนนี้  : บัญชี ' + live.users + ' · กลุ่ม ' + live.meshes + ' · เครื่อง ' + live.nodes);

        if (restored.users === 0) { return fail('กู้คืนแล้วไม่มีบัญชีผู้ใช้เลย เข้าระบบไม่ได้'); }
        if (restored.users < live.users || restored.meshes < live.meshes || restored.nodes < live.nodes) {
            say('  หมายเหตุ: น้อยกว่าของจริง เป็นเรื่องปกติถ้ามีการเพิ่มบัญชีหรือเครื่องหลังเวลาที่สำรอง');
        }

        say('');
        say('ผ่าน — ไฟล์สำรองนี้กู้คืนเป็นเซิร์ฟเวอร์ที่ทำงานได้จริง');
    } catch (error) {
        fail(error.message);
    } finally {
        await stop(child);
        try { fs.rmSync(work, { recursive: true, force: true }); } catch (error) { say('  (ลบโฟลเดอร์ชั่วคราวไม่สำเร็จ: ' + work + ')'); }
    }
}());
