'use strict';
// npm run update:system  --  one controlled command to update the whole SCP-Remote system.
//
// What it does, in order:
//   1. Rebuilds the Thai/English pages from the templates (npm run build:hospital).
//   2. Restarts the server the reliable, orphan-aware way: stop the Windows service, make
//      sure the old process is really gone and port 8443 is free (killing a stuck child
//      before its parent if needed), then start it with Start-Service -- not `npm run
//      service:start`, which has reported success while the service stayed Stopped -- and
//      wait until the port is listening and HTTPS answers 200 before returning.
//   3. Reports the new PID and how many agents have reconnected.
//
// Why a restart updates the whole fleet: restarting drops every agent's connection. As each
// agent reconnects it compares the core it holds (and, when agent auto-update is enabled --
// i.e. settings.noagentupdate is not set -- the native binary too) against the server's and
// pulls whatever changed. So one deliberate restart pushes the new core to every connected
// computer at once, instead of waiting for the automatic check.
//
// This is a controlled action: it is only ever run when someone types the command. It briefly
// disconnects every agent (a few seconds) while the server comes back, which is expected.
//
// Flags:
//   --check / --dry-run   Show the current state and what would happen. Changes nothing.
//   --no-build            Skip the page rebuild (just restart + push).
//   --yes / -y            Do not pause for confirmation before restarting.

const { spawnSync } = require('child_process');
const https = require('https');
const readline = require('readline');

const SERVICE = 'scpremote.exe';
const PORT = 8443;
const args = process.argv.slice(2);
const CHECK = args.includes('--check') || args.includes('--dry-run');
const NO_BUILD = args.includes('--no-build');
const ASSUME_YES = args.includes('--yes') || args.includes('-y');

function ps(script) { return spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }); }
const wait = ms => new Promise(r => setTimeout(r, ms));

function portListenerPid() {
    const r = ps(`(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`);
    return (r.stdout || '').trim();
}
function serviceStatus() {
    const r = ps(`(Get-Service '${SERVICE}' -ErrorAction SilentlyContinue).Status`);
    return (r.stdout || '').trim() || 'Unknown';
}
function establishedAgents() {
    const r = ps(`@(Get-NetTCPConnection -LocalPort ${PORT} -State Established -ErrorAction SilentlyContinue).Count`);
    return Number((r.stdout || '').trim()) || 0;
}
function httpsStatus() {
    return new Promise(resolve => {
        const req = https.request({ host: '127.0.0.1', port: PORT, path: '/', method: 'GET', rejectUnauthorized: false, timeout: 6000 },
            res => { res.destroy(); resolve(res.statusCode); });
        req.on('error', () => resolve(0));
        req.on('timeout', () => { req.destroy(); resolve(0); });
        req.end();
    });
}

// Run an npm script through the shell, streaming its output.
function runNpm(script) {
    const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], { stdio: 'inherit' });
    return r.status === 0;
}

function agentUpdatesOn() {
    // Binary auto-update is off only when settings.noagentupdate is truthy.
    try {
        const fs = require('fs'), path = require('path');
        const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.local', 'scp-remote', 'config.json'), 'utf8'));
        const v = cfg.settings && cfg.settings.noagentupdate;
        return !(v === true || v === 1);
    } catch (e) { return null; }
}

async function confirm(question) {
    if (ASSUME_YES) return true;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(res => rl.question(question, res));
    rl.close();
    return /^(y|yes|ใช่|ตกลง)$/i.test(answer.trim());
}

function killOrphans() {
    // The service is Stopped but something still holds the port: kill the sichomphu-remote
    // node processes, children before parents, so a fresh start can bind 8443.
    ps(`
        $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*sichomphu-remote*' }
        $ids = $procs.ProcessId
        foreach ($p in $procs | Sort-Object { if ($ids -contains $_.ParentProcessId) { 0 } else { 1 } }) {
            try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {}
        }
    `);
}

async function showState(label) {
    const on = agentUpdatesOn();
    console.log(`--- ${label} ---`);
    console.log('  บริการ scpremote.exe : ' + serviceStatus());
    console.log('  พอร์ต 8443 (PID)     : ' + (portListenerPid() || 'ไม่มีใคร listen'));
    console.log('  เครื่องลูกที่ต่ออยู่  : ' + establishedAgents());
    console.log('  agent binary update : ' + (on === null ? 'อ่าน config ไม่ได้' : (on ? 'เปิด (จะ push binary ด้วย)' : 'ปิด (push เฉพาะ core)')));
}

async function main() {
    console.log('=== อัปเดตทั้งระบบ SCP-Remote ===\n');
    await showState('สถานะปัจจุบัน');

    if (CHECK) {
        console.log('\n[--check] จะทำ: ' + (NO_BUILD ? '' : 'build หน้าเว็บ → ') +
            'หยุดบริการ → เคลียร์ orphan/พอร์ต → Start-Service → รอ 8443 + HTTP 200 → รายงาน');
        console.log('โหมดตรวจสอบ: ไม่มีการเปลี่ยนแปลงใดๆ');
        return 0;
    }

    const before = portListenerPid();
    console.log('\n⚠️  การรีสตาร์ตจะตัดการเชื่อมต่อเครื่องลูกทุกเครื่องชั่วคราว (ไม่กี่วินาที) แล้วต่อกลับเอง');
    if (!(await confirm('ดำเนินการอัปเดตทั้งระบบเลยไหม? (y/N) '))) { console.log('ยกเลิก ไม่มีการเปลี่ยนแปลง'); return 1; }

    if (!NO_BUILD) {
        console.log('\n[1/3] build หน้าเว็บ...');
        if (!runNpm('build:hospital')) { console.error('❌ build ล้มเหลว — หยุด ไม่รีสตาร์ต'); return 1; }
    }

    console.log('\n[2/3] รีสตาร์ตบริการแบบ orphan-aware...');
    runNpm('service:stop');
    // Give the service a moment, then make sure it is truly down.
    for (let i = 0; i < 15; i++) { if (!portListenerPid()) break; await wait(1000); }
    if (portListenerPid()) { console.log('  พอร์ตยังถูกจอง — เคลียร์ orphan...'); killOrphans(); await wait(2000); }
    if (portListenerPid()) { console.error('❌ พอร์ต 8443 ยังไม่ว่างหลังเคลียร์ orphan — หยุดเพื่อความปลอดภัย'); return 1; }

    const start = ps(`try { Start-Service -Name '${SERVICE}' -ErrorAction Stop; 'ok' } catch { 'fail: ' + $_.Exception.Message }`);
    if (!/ok/.test(start.stdout || '')) { console.error('❌ Start-Service ล้มเหลว: ' + (start.stdout || start.stderr || '').trim()); return 1; }

    console.log('  รอ server ผูกพอร์ต 8443...');
    let up = false;
    for (let i = 0; i < 40; i++) { if (portListenerPid()) { up = true; break; } await wait(1000); }
    if (!up) { console.error('❌ server ไม่ผูกพอร์ตใน 40 วินาที — ตรวจ .local/scp-remote/mesherrors.txt'); return 1; }

    let code = 0;
    for (let i = 0; i < 20; i++) { code = await httpsStatus(); if (code) break; await wait(1000); }
    const after = portListenerPid();

    console.log('\n[3/3] ยืนยันผล...');
    console.log('  PID: ' + (before || '-') + ' → ' + after + (before && before === after ? '  ⚠️ PID ไม่เปลี่ยน!' : '  ✅ PID เปลี่ยนแล้ว'));
    console.log('  HTTPS: ' + (code ? 'HTTP ' + code : 'ยังไม่ตอบ'));

    // Give agents a short head start to reconnect, then report the count.
    console.log('  รอเครื่องลูกทยอยต่อกลับ (~15 วิ)...');
    await wait(15000);
    await showState('สถานะหลังอัปเดต');

    if (code === 200 && after && after !== before) {
        console.log('\n✅ อัปเดตทั้งระบบสำเร็จ — server เวอร์ชันใหม่กำลังทำงาน เครื่องลูกจะทยอยดึง core ใหม่จนครบภายใน 1-2 นาที');
        return 0;
    }
    console.log('\n⚠️ อัปเดตอาจไม่สมบูรณ์ — ตรวจผลด้านบน (PID/HTTP)');
    return 1;
}

main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
