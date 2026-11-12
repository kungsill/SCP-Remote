/* SCP-Remote: technician tools brought over from SCPclear 2.3 (the IT officer's own PC-care program).

   One computer (section in the computer window) or the whole hospital (🧰 page on the dashboard):

   - Blue screens: reads C:\Windows\Minidump itself and names the driver that crashed Windows, with
     the stop code in Thai and what to do. The hospital page adds up which driver crashes the most
     computers. Sudden power loss (Kernel-Power 41, code 0) is counted separately.
   - RAM: slots used / free, DDR type, the most the board takes, so upgrades are planned from here.
   - Laptop battery: designed vs. full-charge capacity = how worn the battery is.
   - Windows files: SFC /verifyonly and DISM /CheckHealth (both only look, nothing is changed).
   - Disk speed: an unbuffered sequential + random 4K test (asks first; writes a temporary file).
   - Install programs with winget on one or many computers (asks first).
   - LAN scan from a chosen computer: who answers on its network, printers / cameras / Windows.
   - Send SCPclear itself to a computer (checked by SHA-256, shortcut on the public desktop).

   Everything goes through MeshCentral's Run Commands as SYSTEM, like the health check, and runs
   the file scripts/scp-tech.ps1. Results of the hospital page are kept in this browser. */
(function (root) {
    'use strict';
    var th = document.documentElement.lang === 'th';
    function t(en, thai) { return th ? thai : en; }
    function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
    function btn(text, cls, fn) { var b = el('button', text, cls || 'scp-health-btn'); b.type = 'button'; b.onclick = fn; return b; }
    function online(n) { return !!(n && (n.conn & 1)); }
    function windowsAgent(n) { var id = n && n.agent && n.agent.id; return (id > 0 && id < 5) || (id > 41 && id < 44); }
    function when(ms) { return new Date(ms).toLocaleString(th ? 'th-TH' : undefined, { dateStyle: 'short', timeStyle: 'short' }); }
    function hex(code) { return '0x' + ('0000000' + (Number(code) >>> 0).toString(16).toUpperCase()).slice(-8); }
    function nodeById(id) { var list = root.ScpDashboard && root.ScpDashboard.nodes ? root.ScpDashboard.nodes() : (root.nodes || []); for (var i = 0; i < list.length; i++) if (list[i]._id === id) return list[i]; return null; }
    function domainUrl() { return root.domainUrl || '/'; }

    /* ---------- knowledge taken from SCPclear ---------- */
    var BUG = {
        0x0A: ['IRQL_NOT_LESS_OR_EQUAL', 'ไดรเวอร์เข้าถึงหน่วยความจำผิด มักเป็นไดรเวอร์เครือข่าย/USB หรือ RAM เสีย', 'A driver touched memory it should not (often network/USB) or bad RAM'],
        0x19: ['BAD_POOL_HEADER', 'ไดรเวอร์ทำหน่วยความจำเสียหาย หรือ RAM มีปัญหา', 'A driver corrupted memory, or bad RAM'],
        0x1A: ['MEMORY_MANAGEMENT', 'มักเกิดจาก RAM เสีย/หลวม หรือไดรเวอร์ — ควรทดสอบ RAM', 'Usually bad or loose RAM — test the RAM'],
        0x1E: ['KMODE_EXCEPTION_NOT_HANDLED', 'ไดรเวอร์ทำงานผิดพลาด — อัปเดตหรือถอนไดรเวอร์ตัวที่เป็นตัวการ', 'A driver failed — update or remove it'],
        0x3B: ['SYSTEM_SERVICE_EXCEPTION', 'ไดรเวอร์ (มักเป็นการ์ดจอ/แอนตี้ไวรัส) ทำงานผิดพลาด', 'A driver (often graphics/antivirus) failed'],
        0x4E: ['PFN_LIST_CORRUPT', 'มักเกิดจาก RAM เสีย — ควรทดสอบ RAM', 'Usually bad RAM'],
        0x50: ['PAGE_FAULT_IN_NONPAGED_AREA', 'RAM เสีย ไดรเวอร์ หรือดิสก์มีปัญหา', 'Bad RAM, a driver or the disk'],
        0x77: ['KERNEL_STACK_INPAGE_ERROR', 'อ่านข้อมูลจากดิสก์ไม่ได้ — ดิสก์ใกล้เสียหรือสาย SATA หลวม', 'Could not read the disk — failing disk or loose cable'],
        0x7A: ['KERNEL_DATA_INPAGE_ERROR', 'อ่านข้อมูลจากดิสก์ไม่ได้ — ดิสก์ใกล้เสีย สายหลวม หรือ RAM', 'Could not read the disk — disk, cable or RAM'],
        0x7E: ['SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', 'ไดรเวอร์ทำงานผิดพลาด — อัปเดตไดรเวอร์ตัวที่เป็นตัวการ', 'A driver failed — update it'],
        0x9F: ['DRIVER_POWER_STATE_FAILURE', 'ไดรเวอร์มีปัญหาตอนพัก/ปลุกเครื่อง (Sleep) — อัปเดตไดรเวอร์ หรือปิด Fast Startup', 'A driver failed on sleep/wake — update it or turn off Fast Startup'],
        0xBE: ['ATTEMPTED_WRITE_TO_READONLY_MEMORY', 'ไดรเวอร์ทำงานผิดพลาด', 'A driver failed'],
        0xC2: ['BAD_POOL_CALLER', 'ไดรเวอร์ใช้หน่วยความจำผิดวิธี', 'A driver misused memory'],
        0xC5: ['DRIVER_CORRUPTED_EXPOOL', 'ไดรเวอร์ทำหน่วยความจำเสียหาย', 'A driver corrupted memory'],
        0xD1: ['DRIVER_IRQL_NOT_LESS_OR_EQUAL', 'ไดรเวอร์เข้าถึงหน่วยความจำผิด — แก้ที่ไดรเวอร์ตัวที่เป็นตัวการ (มักเป็นเครือข่าย/USB/โปรแกรมจำลอง)', 'A driver touched memory it should not — fix that driver (often network/USB/emulators)'],
        0xEF: ['CRITICAL_PROCESS_DIED', 'โปรเซสสำคัญของ Windows หยุดทำงาน — ไฟล์ระบบเสียหรือดิสก์มีปัญหา (รัน SFC/DISM)', 'A core Windows process died — system files or disk (run SFC/DISM)'],
        0xF4: ['CRITICAL_OBJECT_TERMINATION', 'มักเกิดจากดิสก์หรือสาย SATA มีปัญหา', 'Usually the disk or SATA cable'],
        0x101: ['CLOCK_WATCHDOG_TIMEOUT', 'CPU ไม่ตอบสนอง — ความร้อน โอเวอร์คล็อก หรือต้องอัปเดต BIOS', 'CPU stopped answering — heat, overclock or BIOS'],
        0x116: ['VIDEO_TDR_FAILURE', 'การ์ดจอค้าง — อัปเดต/ติดตั้งไดรเวอร์จอใหม่ ตรวจความร้อนการ์ดจอ', 'Graphics hung — reinstall the graphics driver, check its heat'],
        0x117: ['VIDEO_TDR_TIMEOUT_DETECTED', 'การ์ดจอค้าง — ไดรเวอร์จอหรือความร้อน', 'Graphics hung — driver or heat'],
        0x124: ['WHEA_UNCORRECTABLE_ERROR', 'ฮาร์ดแวร์ผิดพลาด: CPU / ไฟเลี้ยง (PSU) / ความร้อน / โอเวอร์คล็อก', 'Hardware error: CPU / power supply / heat / overclock'],
        0x133: ['DPC_WATCHDOG_VIOLATION', 'ไดรเวอร์ค้างนานเกินไป — มักเป็นไดรเวอร์ SSD/SATA หรือ firmware SSD', 'A driver hung — often SSD/SATA driver or SSD firmware'],
        0x139: ['KERNEL_SECURITY_CHECK_FAILURE', 'ไดรเวอร์หรือไฟล์ระบบเสียหาย หรือ RAM', 'A driver, system files or RAM'],
        0x13A: ['KERNEL_MODE_HEAP_CORRUPTION', 'ไดรเวอร์ทำหน่วยความจำเสียหาย', 'A driver corrupted memory'],
        0x144: ['BUGCODE_USB3_DRIVER', 'อุปกรณ์ USB 3.0 หรือไดรเวอร์ USB มีปัญหา', 'A USB 3.0 device or driver']
    };
    var HINTS = [
        [/^(ld\d*vmm|ldvbox|vbox)/i, 'โปรแกรมจำลอง Android / VirtualBox (เช่น LDPlayer) — อัปเดตเป็นเวอร์ชันล่าสุดหรือถอนออก', 'Android emulator / VirtualBox (e.g. LDPlayer) — update or remove it'],
        [/^(bstk|hd-)/i, 'BlueStacks (โปรแกรมจำลอง Android) — อัปเดตหรือถอนออก', 'BlueStacks — update or remove it'],
        [/^(nox|mumu)/i, 'โปรแกรมจำลอง Android — อัปเดตหรือถอนออก', 'Android emulator — update or remove it'],
        [/^nvlddmkm/i, 'ไดรเวอร์การ์ดจอ NVIDIA — ติดตั้งไดรเวอร์จอใหม่ (แนะนำล้างของเก่าก่อน)', 'NVIDIA graphics driver — reinstall it (clean install)'],
        [/^(atikmdag|amdkmdag|amdkmpfd)/i, 'ไดรเวอร์การ์ดจอ AMD — ติดตั้งไดรเวอร์จอใหม่', 'AMD graphics driver — reinstall it'],
        [/^igdkmd/i, 'ไดรเวอร์การ์ดจอ Intel — อัปเดตไดรเวอร์จอ', 'Intel graphics driver — update it'],
        [/^(dxgkrnl|dxgmms)/i, 'ระบบกราฟิกของ Windows — มักมาจากไดรเวอร์การ์ดจอ', 'Windows graphics — usually the graphics driver'],
        [/^(rt6\d|rtwlan|rtl8|rtux)/i, 'ไดรเวอร์ LAN / Wi-Fi ของ Realtek — อัปเดตจากเว็บผู้ผลิตเมนบอร์ด', 'Realtek LAN / Wi-Fi driver — update from the board maker'],
        [/^(netwtw|netwlv|netwsw|netwew)/i, 'ไดรเวอร์ Wi-Fi ของ Intel — อัปเดตไดรเวอร์ Wi-Fi', 'Intel Wi-Fi driver — update it'],
        [/^e1[dirk]/i, 'ไดรเวอร์ LAN ของ Intel — อัปเดตไดรเวอร์', 'Intel LAN driver — update it'],
        [/^(tcpip|ndis|netio|afd)/i, 'ระบบเครือข่ายของ Windows — มักมาจากไดรเวอร์การ์ดเครือข่ายหรือโปรแกรม VPN', 'Windows networking — usually a network card driver or VPN'],
        [/^(wintun|tap0901|tapwin|ftvnic|ftsvnic|fortips|vpn)/i, 'ไดรเวอร์ VPN — อัปเดตหรือถอนโปรแกรม VPN', 'VPN driver — update or remove the VPN'],
        [/^(usbxhci|usbport|ucx01000|usbhub)/i, 'ไดรเวอร์ USB — ถอดอุปกรณ์ USB ที่ต่ออยู่แล้วลองใหม่ / อัปเดตชิปเซ็ต', 'USB driver — unplug USB devices / update chipset'],
        [/^(storport|stornvme|storahci|iastor|nvme|amdsata)/i, 'ไดรเวอร์ดิสก์/SSD — อัปเดตชิปเซ็ต/firmware SSD ตรวจสาย SATA', 'Disk/SSD driver — chipset/SSD firmware, SATA cable'],
        [/^ntfs/i, 'ระบบไฟล์ — ดิสก์อาจมีปัญหา รัน chkdsk และดู SMART', 'File system — check the disk (chkdsk, SMART)'],
        [/^(aswsp|aswsnx|aswarpot|avgsp|klif|kl1|bdselfpr|trufos|mfehidk|epfwwfp|eamonm)/i, 'โปรแกรมแอนตี้ไวรัส — อัปเดตหรือถอนแอนตี้ไวรัสตัวนั้น', 'Antivirus — update or remove it'],
        [/^(wdfilter|mpfilter|wdboot)/i, 'Windows Defender', 'Windows Defender'],
        [/^(ntoskrnl|hal)/i, 'แกนกลาง Windows — สาเหตุจริงมักเป็น RAM หรือไดรเวอร์อื่น ควรทดสอบ RAM', 'Windows kernel — the real cause is usually RAM or another driver']
    ];
    function bugInfo(code) { var b = BUG[Number(code) >>> 0]; return b ? { name: b[0], why: th ? b[1] : b[2] } : null; }
    function driverHint(drv) { if (!drv) return ''; for (var i = 0; i < HINTS.length; i++) if (HINTS[i][0].test(drv)) return th ? HINTS[i][1] : HINTS[i][2]; return ''; }
    var MEMTYPE = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 34: 'DDR5', 35: 'LPDDR5' };
    var FORM = { 8: 'DIMM', 12: 'SO-DIMM' };
    // Programs a hospital computer may need. Any other winget id can be typed in.
    var CATALOG = [
        ['Google.Chrome', 'Google Chrome'], ['Mozilla.Firefox', 'Firefox'], ['LINE.LINE', 'LINE'], ['Zoom.Zoom', 'Zoom'],
        ['Microsoft.Teams', 'Microsoft Teams'], ['AnyDeskSoftwareGmbH.AnyDesk', 'AnyDesk'], ['Adobe.Acrobat.Reader.64-bit', 'Adobe Acrobat Reader'],
        ['Foxit.FoxitReader', 'Foxit PDF Reader'], ['TheDocumentFoundation.LibreOffice', 'LibreOffice'], ['Notepad++.Notepad++', 'Notepad++'],
        ['7zip.7zip', '7-Zip'], ['VideoLAN.VLC', 'VLC'], ['Microsoft.VCRedist.2015+.x64', 'Visual C++ Runtime x64'], ['Microsoft.VCRedist.2015+.x86', 'Visual C++ Runtime x86'],
        ['Microsoft.DotNet.DesktopRuntime.8', '.NET Desktop Runtime 8'], ['Oracle.JavaRuntimeEnvironment', 'Java (JRE)'],
        ['CPUID.CPU-Z', 'CPU-Z'], ['CrystalDewWorld.CrystalDiskInfo', 'CrystalDiskInfo']
    ];
    var WINGET_ID = /^[A-Za-z0-9][A-Za-z0-9.+_-]{1,99}$/;
    // Seconds before the page stops waiting. The agent itself gives up after 30 minutes.
    var TIMEOUT = { inventory: 180, bench: 240, sfc: 35 * 60, dism: 20 * 60, lan: 300, winget: 31 * 60, deploy: 600, avscan: 180, avremove: 25 * 60, wurepair: 15 * 60, wuinstall: 28 * 60, wurestart: 60 };
    // Tasks whose script announces its steps (SCP_PROGRAM_STEP). The agent forwards those lines only
    // for tickets that start with "scpprog", so these use that prefix and the page shows 0-100%.
    var STEPPED = { wurepair: 6, wuinstall: 5 };
    var STEP_TEXT = {
        space: t('checking free disk space and Windows Update settings', 'ตรวจพื้นที่ดิสก์และการตั้งค่า Windows Update'),
        services: t('starting the update services that are stopped', 'เปิดบริการอัปเดตที่หยุดอยู่'),
        stop: t('pausing the update services', 'พักบริการอัปเดตชั่วคราว'),
        cache: t('clearing the stuck download cache', 'ล้างแคชดาวน์โหลดที่ค้าง'),
        dism: t('checking Windows system files (DISM)', 'ตรวจไฟล์ระบบ Windows (DISM)'),
        scan: t('asking Windows Update what is waiting', 'ถาม Windows Update ว่ามีอะไรรออยู่'),
        search: t('searching for updates', 'ค้นหาอัปเดตที่รออยู่'),
        download: t('downloading the updates', 'ดาวน์โหลดอัปเดต'),
        install: t('installing the updates (do not switch the computer off)', 'กำลังติดตั้งอัปเดต (อย่าปิดเครื่อง)'),
        verify: t('checking what was installed', 'ตรวจว่าติดตั้งสำเร็จกี่รายการ')
    };
    var LABEL = {
        inventory: t('read blue screens, RAM and battery', 'อ่าน BSOD / RAM / แบตเตอรี่'),
        bench: t('disk speed test', 'วัดความเร็วดิสก์'),
        sfc: t('check Windows files (SFC)', 'ตรวจไฟล์ Windows (SFC)'),
        dism: t('check the component store (DISM)', 'ตรวจคลังระบบ (DISM)'),
        lan: t('scan the LAN', 'สแกนเครือข่าย LAN'),
        winget: t('install programs', 'ลงโปรแกรม'),
        deploy: t('send SCPclear', 'ส่ง SCPclear'),
        wurepair: t('repair Windows Update', 'ซ่อม Windows Update'),
        wuinstall: t('install Windows updates', 'ติดตั้งอัปเดต Windows'),
        wurestart: t('restart the computer', 'รีสตาร์ทเครื่อง'),
        avscan: t('check antivirus', 'ตรวจแอนตี้ไวรัส'),
        avremove: t('remove the antivirus with its own uninstaller', 'ถอนแอนตี้ไวรัสด้วยตัวถอนของมันเอง')
    };

    /* ---------- running a task: one per computer at a time ---------- */
    var script = null, seq = 0, queue = {}, active = {}, jobs = {}, results = {}, mounts = {}, listeners = [];
    var STORE = 'scpTech:' + (location.pathname || '/');
    try { var saved = JSON.parse(root.localStorage.getItem(STORE) || '{}'); if (saved && typeof saved === 'object') results = saved; } catch (e) { results = {}; }
    function persist() {
        try {
            // install logs are long and go stale; LAN scans are kept for the "not installed yet" list
            var keep = {};
            Object.keys(results).forEach(function (id) { var r = results[id], k = {}; ['inventory', 'bench', 'sfc', 'dism', 'deploy', 'lan', 'avscan', 'avremove', 'wurepair', 'wuinstall'].forEach(function (x) { if (r[x]) k[x] = r[x]; }); if (Object.keys(k).length) keep[id] = k; });
            root.localStorage.setItem(STORE, JSON.stringify(keep));
        } catch (e) { /* storage full or blocked: results stay on this page */ }
    }
    // The server keeps the latest result of each task for each computer, so they can be read
    // from any browser and are not lost with this one's storage. Browser storage stays as a
    // copy for when the server cannot be reached. Newest wins in both directions.
    var KEPT = ['inventory', 'bench', 'sfc', 'dism', 'deploy', 'lan', 'avscan', 'avremove', 'wurepair', 'wuinstall'];
    function ops() { return (root.ScpOperations && typeof root.ScpOperations.request === 'function' && root.meshserver) ? root.ScpOperations : null; }
    function upload(items) { var o = ops(); if (!o || !items.length) return Promise.resolve(); return o.request('techSave', { items: items }).catch(function () { /* kept in this browser; sent again next time */ }); }
    var synced = false;
    function syncWithServer() {
        var o = ops();
        if (!o || synced) return Promise.resolve(false);
        synced = true;
        return o.request('techList').then(function (server) {
            server = (server && typeof server === 'object') ? server : {};
            var touched = {}, send = [];
            Object.keys(server).forEach(function (id) { Object.keys(server[id] || {}).forEach(function (task) {
                var s = server[id][task], mine = results[id] && results[id][task];
                if (s && s.data && (!mine || !(mine.at >= s.at))) { results[id] = results[id] || {}; results[id][task] = { data: s.data, at: s.at }; touched[id] = true; }
            }); });
            Object.keys(results).forEach(function (id) { KEPT.forEach(function (task) {
                var mine = results[id][task], s = server[id] && server[id][task];
                if (mine && mine.data && typeof mine.at === 'number' && (!s || mine.at > s.at)) send.push({ nodeid: id, task: task, at: mine.at, data: mine.data });
            }); });
            persist();
            Object.keys(touched).forEach(changed);
            return upload(send).then(function () { return true; });
        }).catch(function () { synced = false; return false; });
    }
    (function waitForServer(n) { if (ops()) { syncWithServer(); } else if (n < 40 && typeof setTimeout === 'function') { setTimeout(function () { waitForServer(n + 1); }, 1500); } })(0);
    function loadScript() {
        if (script) return Promise.resolve(script);
        return fetch(domainUrl() + 'scripts/scp-tech.ps1', { credentials: 'same-origin', cache: 'no-cache' })
            .then(function (r) { if (!r.ok) throw Error('NO_SCRIPT'); return r.text(); })
            .then(function (s) { if (s.indexOf('SCP_TECH:') < 0) throw Error('BAD_SCRIPT'); script = s.replace(/\r?\n/g, '\r\n'); return script; });
    }
    function psq(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
    function busy(nodeid) { return !!active[nodeid] || !!(queue[nodeid] && queue[nodeid].length); }
    function next(nodeid) {
        if (active[nodeid] || !queue[nodeid] || !queue[nodeid].length) return;
        var job = queue[nodeid].shift();
        active[nodeid] = job;
        fire(job);
    }
    function fire(job) {
        job.ticket = (STEPPED[job.task] ? 'scpprogtech' : 'scptech') + Date.now() + '_' + (++seq);
        job.step = 0; job.of = STEPPED[job.task] || 0; job.what = '';
        job.state = 'working'; job.started = job.started || Date.now();
        jobs[job.nodeid][job.task] = job;
        loadScript().then(function (s) {
            if (active[job.nodeid] !== job) return;
            var cmds = '$ScpTask = ' + psq(job.task) + '\r\n$ScpArg = ' + psq(job.arg || '') + '\r\n' + s;
            root.meshserver.send({ action: 'runcommands', nodeids: [job.nodeid], type: 2, runAsUser: 0, reply: true, responseid: job.ticket, cmds: cmds });
            if (STEPPED[job.task] && !job.tick) job.tick = setInterval(function () {
                if (active[job.nodeid] !== job || job.state !== 'working') { clearInterval(job.tick); job.tick = null; return; }
                changed(job.nodeid); // the seconds counter
            }, 1000);
            clearTimeout(job.timer);
            job.timer = setTimeout(function () { done(job, null, t('No answer in time (the computer may have gone off or the task is still running)', 'ไม่ได้คำตอบในเวลาที่กำหนด (เครื่องอาจปิดไป หรืองานยังทำไม่เสร็จ)')); }, TIMEOUT[job.task] * 1000);
        }).catch(function () { done(job, null, t('The script scripts/scp-tech.ps1 could not be loaded', 'โหลดสคริปต์ scripts/scp-tech.ps1 ไม่ได้')); });
        changed(job.nodeid);
    }
    function run(node, task, arg) {
        var id = node._id || node;
        jobs[id] = jobs[id] || {};
        if (jobs[id][task] && (jobs[id][task].state === 'working' || jobs[id][task].state === 'queued')) return jobs[id][task];
        var job = { nodeid: id, task: task, arg: arg || '', state: 'queued', tries: 0, started: Date.now() };
        jobs[id][task] = job;
        (queue[id] = queue[id] || []).push(job);
        next(id);
        changed(id);
        return job;
    }
    function done(job, data, error) {
        if (active[job.nodeid] !== job) return;
        clearTimeout(job.timer);
        job.state = error ? 'failed' : 'done'; job.error = error || ''; job.at = Date.now();
        if (data) { results[job.nodeid] = results[job.nodeid] || {}; results[job.nodeid][job.task] = { data: data, at: job.at }; persist(); if (KEPT.indexOf(job.task) >= 0) upload([{ nodeid: job.nodeid, task: job.task, at: job.at, data: data }]); }
        active[job.nodeid] = null;
        changed(job.nodeid);
        next(job.nodeid);
    }
    function receive(m) {
        if (!m || m.action !== 'msg' || m.type !== 'runcommands' || typeof m.responseid !== 'string' || !/^(scptech|scpprogtech)/.test(m.responseid)) return false;
        if (m.progress === true) {
            var cur = active[m.nodeid], stepLine = String(m.result || '').match(/SCP_PROGRAM_STEP:(\{[^\r\n]*\})/);
            if (cur && cur.ticket === m.responseid && stepLine) {
                try { var at = JSON.parse(stepLine[1]); cur.step = +at.n || cur.step; cur.of = +at.of || cur.of; cur.what = String(at.what || ''); } catch (e) { /* a step line we cannot read changes nothing */ }
                changed(m.nodeid);
            }
            return true;
        }
        var job = active[m.nodeid];
        if (!job || job.ticket !== m.responseid) return true; // an older request this page no longer waits for
        var text = String(m.result || ''), match = text.match(/SCP_TECH:(\{[^\r\n]*\})/);
        if (match) {
            var data = null;
            try { data = JSON.parse(match[1]); } catch (e) { done(job, null, t('Unreadable answer', 'อ่านคำตอบไม่ได้')); return true; }
            if (data.ok === false) done(job, data, errorText(data));
            else done(job, data, null);
        } else if (/COMMAND_BUSY/.test(text) && job.tries < 12) {
            // busy with a health check or another tool: try again shortly
            job.tries++; job.state = 'waiting'; clearTimeout(job.timer);
            job.timer = setTimeout(function () { if (active[job.nodeid] === job) fire(job); }, 20000);
            changed(job.nodeid);
        } else {
            done(job, null, /COMMAND_BUSY/.test(text) ? t('The computer stayed busy with another command', 'เครื่องติดทำคำสั่งอื่นอยู่นานเกินไป') : (t('No result: ', 'ไม่ได้ผล: ') + text.replace(/\s+/g, ' ').slice(0, 200)));
        }
        return true;
    }
    function errorText(d) {
        var map = {
            NO_SPACE: t('Not enough free space on the system drive (Windows Update needs at least 8 GB free; free some space first)', 'พื้นที่ไดรฟ์ระบบเหลือไม่พอ (Windows Update ต้องการที่ว่างอย่างน้อย 8 GB ให้ล้างพื้นที่ก่อน)'),
            NO_NETWORK: t('The computer has no working network', 'เครื่องไม่มีเครือข่ายที่ใช้งานได้'),
            ALREADY_SCHEDULED: t('A restart is already scheduled on that computer (use "Cancel restart" first to change it)', 'เครื่องนั้นมีการสั่งรีสตาร์ทค้างอยู่แล้ว (กด "ยกเลิกรีสตาร์ท" ก่อนถ้าจะสั่งใหม่)'),
            WU_DISABLED: t('Windows Update is switched off on this computer (by a policy or its service is disabled). It is left as it is: decide at the computer whether to turn it on.', 'เครื่องนี้ปิด Windows Update ไว้ (ด้วยนโยบายหรือปิดบริการไว้) จึงไม่แตะต้อง ให้ตัดสินใจที่หน้าเครื่องว่าจะเปิดหรือไม่'),
            NO_WU_SERVICE: t('This computer has no Windows Update service (removed from this Windows)', 'เครื่องนี้ไม่มีบริการ Windows Update (ถูกถอดออกจาก Windows)'),
            NOT_FOUND: t('That program is no longer in the list', 'ไม่พบโปรแกรมนี้ในรายการแล้ว (อาจถูกถอนไปแล้ว)'),
            REFUSED_REMOTE_AGENT: t('Refused: this is the remote-support agent', 'ไม่ดำเนินการ: นี่คือเอเจนต์รีโมต ถอดแล้วจะเข้าเครื่องนี้ไม่ได้อีก'),
            REFUSED_ACTIVE_ANTIVIRUS: t('Refused: this antivirus is on and up to date, so it is protecting the computer', 'ไม่ดำเนินการ: แอนตี้ไวรัสตัวนี้เปิดอยู่และฐานไวรัสล่าสุด คือตัวที่กำลังป้องกันเครื่อง'),
            NO_SILENT_UNINSTALLER: t('It has no silent uninstaller to call. Uninstall it at the computer (see AV-REMOVAL.md)', 'โปรแกรมนี้ไม่มีตัวถอนแบบเงียบให้เรียก ต้องถอนที่หน้าเครื่อง (ดู AV-REMOVAL.md)'),
            TIMEOUT: t('The uninstaller ran for 20 minutes and was stopped', 'ตัวถอนทำงานเกิน 20 นาที จึงถูกหยุด'),
            NO_WINGET: t('winget (App Installer) is not on this computer — Windows 10 1809+ from the Microsoft Store', 'เครื่องนี้ไม่มี winget (App Installer) — ต้องเป็น Windows 10 1809 ขึ้นไปและมี App Installer จาก Microsoft Store'),
            HASH_MISMATCH: t('The downloaded file did not match (SHA-256); nothing was installed', 'ไฟล์ที่ดาวน์โหลดไม่ตรง SHA-256 จึงไม่ได้ติดตั้ง'),
            BAD_ARGUMENT: t('Bad request', 'คำสั่งไม่ถูกต้อง'),
            UNKNOWN_TASK: t('This computer has an older script', 'สคริปต์ไม่รู้จักงานนี้')
        };
        return map[d.error] || ((d.error || 'FAILED') + (d.message ? ': ' + d.message : ''));
    }
    function onChange(fn) { listeners.push(fn); }
    function changed(nodeid) {
        var m = mounts[nodeid];
        if (m) { if (m.box.isConnected) draw(m.box, nodeById(nodeid) || m.node); else delete mounts[nodeid]; }
        listeners = listeners.filter(function (fn) { try { return fn(nodeid) !== false; } catch (e) { return false; } });
    }
    function state(nodeid, task) { return (jobs[nodeid] && jobs[nodeid][task]) || null; }
    function result(nodeid, task) { return (results[nodeid] && results[nodeid][task]) || null; }

    /* ---------- reading the answers ---------- */
    function crashSummary(inv) {
        var drivers = {}, codes = {};
        (inv.crash || []).forEach(function (c) {
            var k = c.driver || '';
            if (k) drivers[k] = (drivers[k] || 0) + 1;
            codes[c.code] = (codes[c.code] || 0) + 1;
        });
        return { count: (inv.crash || []).length, drivers: drivers, codes: codes, power: (inv.power || []).length };
    }
    function ramVerdict(ram) {
        if (!ram) return null;
        var used = (ram.sticks || []).length, slots = Math.max(ram.slots || 0, used), free = Math.max(0, slots - used);
        var type = MEMTYPE[(ram.sticks[0] || {}).type] || '', form = FORM[(ram.sticks[0] || {}).form] || '';
        var speed = (ram.sticks[0] || {}).speed || 0, maxGb = ram.maxGb || 0;
        var tone = ram.totalGb <= 4 ? 'bad' : (ram.totalGb < 8 ? 'warn' : 'ok');
        var advice;
        if (ram.totalGb >= 16) advice = t('Enough RAM for office and hospital work', 'RAM เพียงพอสำหรับงานสำนักงาน/งานโรงพยาบาล');
        else if (free > 0) advice = t('Add a stick in the free slot: ', 'เพิ่ม RAM ในช่องว่างได้: ') + (type || 'RAM') + (form ? ' ' + form : '') + (speed ? ' ' + speed + ' MHz' : '') + t(' (same as the one fitted)', ' (ให้ตรงกับแถวเดิม)');
        else if (used && maxGb > ram.totalGb) advice = t('No free slot: replace with bigger sticks (board takes up to ', 'ไม่มีช่องว่าง: ต้องเปลี่ยนแถวที่ใหญ่ขึ้น (บอร์ดรับได้สูงสุด ') + maxGb + ' GB)';
        else advice = t('At the board\'s limit', 'เต็มความสามารถของบอร์ดแล้ว');
        return { used: used, slots: slots, free: free, type: type, form: form, speed: speed, maxGb: maxGb, tone: tone, advice: advice };
    }
    function batteryVerdict(b) {
        if (!b) return null;
        var h = b.health, tone = h < 0 ? 'warn' : (h < 50 ? 'bad' : (h < 70 ? 'warn' : 'ok'));
        var text = h < 0 ? t('Wear could not be read (the laptop does not report it)', 'อ่านความเสื่อมไม่ได้ (เครื่องไม่รายงานค่า)') :
            h < 50 ? t('Worn out — replace the battery', 'แบตเสื่อมมาก ควรเปลี่ยนแบต') :
            h < 70 ? t('Worn — plan a replacement', 'แบตเริ่มเสื่อม วางแผนเปลี่ยน') : t('Battery is fine', 'แบตยังดี');
        return { health: h, tone: tone, text: text };
    }
    function lanKind(h, gateway) {
        var p = ',' + (h.ports || '') + ',';
        if (h.ip === gateway) return t('Router / gateway', 'เราเตอร์ / เกตเวย์');
        if (/,9100,|,631,|,515,/.test(p)) return t('Printer', 'เครื่องพิมพ์');
        if (/,554,/.test(p)) return t('Camera / NVR', 'กล้อง / NVR');
        if (/,445,|,3389,/.test(p)) return t('Windows computer / server', 'คอมพิวเตอร์ Windows / เซิร์ฟเวอร์');
        if (/,22,/.test(p)) return t('Linux / network device', 'Linux / อุปกรณ์เครือข่าย');
        if (/,80,|,443,/.test(p)) return t('Device with a web page', 'อุปกรณ์ที่มีหน้าเว็บ');
        return t('Unknown device', 'อุปกรณ์ไม่ทราบชนิด');
    }

    /* ---------- the section in a computer's window ---------- */
    function section(node) {
        var box = el('section', null, 'scp-cm-section scp-tech');
        box.dataset.nodeid = node._id;
        mounts[node._id] = { box: box, node: node };
        draw(box, node);
        return box;
    }
    function statusLine(nodeid, task) {
        var j = state(nodeid, task);
        if (!j) return null;
        if (j.state === 'queued') return el('p', '⏳ ' + LABEL[task] + t(' — waiting for the previous task', ' — รองานก่อนหน้าเสร็จ'), 'scp-health-note busy');
        if (j.state === 'waiting') return el('p', '⏳ ' + LABEL[task] + t(' — the computer is busy, trying again…', ' — เครื่องกำลังทำคำสั่งอื่น จะลองใหม่อัตโนมัติ…'), 'scp-health-note busy');
        if (j.state === 'working' && STEPPED[task]) {
            // 0-100% by step: step n of N has begun, so n-1 of N is done
            var pct = j.step ? Math.round((j.step - 1) / j.of * 100) : 0, box = el('div', null, 'scp-health-note busy');
            box.appendChild(el('strong', '⏳ ' + LABEL[task] + ' · ' + pct + '%'));
            var bar = el('div', null, 'scp-fixprog-bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', String(pct));
            var fill = el('i'); fill.style.width = pct + '%'; bar.appendChild(fill); box.appendChild(bar);
            box.appendChild(el('small', (j.step ? t('step ', 'ขั้นที่ ') + j.step + '/' + j.of + ' · ' + (STEP_TEXT[j.what] || j.what) : t('sent, waiting for the computer', 'ส่งคำสั่งแล้ว รอเครื่องตอบ')) + ' · ' + Math.round((Date.now() - j.started) / 1000) + t(' s', ' วิ')));
            return box;
        }
        if (j.state === 'working') return el('p', '⏳ ' + LABEL[task] + t(' — running since ', ' — กำลังทำ ตั้งแต่ ') + when(j.started) + (task === 'sfc' ? t(' (takes 5–20 minutes)', ' (ใช้เวลา 5–20 นาที)') : ''), 'scp-health-note busy');
        if (j.state === 'failed') return el('p', '❌ ' + LABEL[task] + ': ' + j.error, 'scp-health-note bad');
        return null;
    }
    function draw(box, node) {
        box.textContent = '';
        var id = node._id, ready = online(node) && windowsAgent(node);
        var head = el('div', null, 'scp-health-head');
        head.appendChild(el('h4', '🧰 ' + t('Technician tools (SCPclear)', 'เครื่องมือช่าง (SCPclear)'), 'scp-cm-section-title'));
        box.appendChild(head);
        if (!windowsAgent(node)) { box.appendChild(el('p', t('Windows computers only.', 'ใช้ได้กับเครื่อง Windows เท่านั้น'), 'scp-health-hint')); return; }
        if (!online(node)) box.appendChild(el('p', t('The computer is off; the last results are shown.', 'เครื่องปิดอยู่ แสดงผลล่าสุดที่เคยอ่านไว้'), 'scp-health-hint'));
        var bar = el('div', null, 'scp-tech-bar');
        function add(task, text, primary, ask, arg) {
            var j = state(id, task), going = j && (j.state === 'working' || j.state === 'queued' || j.state === 'waiting');
            var b = btn(text, 'scp-health-btn' + (primary ? ' primary' : ''), function () {
                if (ask && !root.confirm(ask)) return;
                run(node, task, typeof arg === 'function' ? arg() : arg);
            });
            b.disabled = !ready || going;
            bar.appendChild(b);
        }
        add('inventory', '🔍 ' + t('Blue screens / RAM / battery', 'BSOD / RAM / แบตเตอรี่'), true, null, '180');
        add('sfc', '🛡️ ' + t('Check Windows files (SFC)', 'ตรวจไฟล์ Windows (SFC)'), false, t('Run SFC /verifyonly on ', 'ตรวจไฟล์ระบบ (SFC /verifyonly) ที่เครื่อง ') + node.name + t('?\n\nOnly checks, repairs nothing. Takes 5–20 minutes and keeps the computer busy for other remote commands.', '?\n\nตรวจอย่างเดียว ไม่ซ่อม ใช้เวลา 5–20 นาที ระหว่างนั้นเครื่องจะรับคำสั่งรีโมทอื่นไม่ได้'));
        add('dism', '🧩 DISM CheckHealth', false, null);
        add('bench', '⚡ ' + t('Disk speed', 'วัดความเร็วดิสก์'), false, t('Test the disk speed of ', 'วัดความเร็วดิสก์เครื่อง ') + node.name + t('?\n\nWrites a 256 MB temporary file in C:\\Windows\\Temp and deletes it. The user may notice the computer slow down for about 30 seconds.', '?\n\nจะเขียนไฟล์ชั่วคราว 256 MB ใน C:\\Windows\\Temp แล้วลบทิ้ง ผู้ใช้อาจรู้สึกเครื่องช้าลงราว 30 วินาที'), '256');
        add('lan', '📡 ' + t('Scan its LAN', 'สแกน LAN จากเครื่องนี้'), false, null, '');
        add('wurepair', '🩹 ' + t('Repair Windows Update', 'ซ่อม Windows Update'), false, t('Repair Windows Update on ', 'ซ่อม Windows Update ที่เครื่อง ') + node.name + t('?\n\nIt checks free disk space, starts the update services that are stopped, clears the half-downloaded update cache (Windows downloads it again), checks the system files (DISM, read only) and asks Windows Update what is waiting. Nothing is installed and the computer is not restarted. Takes a few minutes.\n\nIf the computer has Windows Update switched off on purpose, it is left alone.', '?\n\nตรวจพื้นที่ดิสก์ เปิดบริการอัปเดตที่หยุดอยู่ ล้างแคชอัปเดตที่โหลดค้าง (Windows จะโหลดใหม่เอง) ตรวจไฟล์ระบบด้วย DISM (อ่านอย่างเดียว) แล้วถาม Windows Update ว่ามีอะไรรออยู่ ไม่ติดตั้งอะไรและไม่รีสตาร์ทเครื่อง ใช้เวลาไม่กี่นาที\n\nถ้าเครื่องนั้นปิด Windows Update ไว้ตั้งใจ ระบบจะไม่แตะต้อง'), '');
        add('wuinstall', '⬇️ ' + t('Install updates', 'ติดตั้งอัปเดต'), false, t('Install the waiting Windows updates on ', 'ติดตั้งอัปเดต Windows ที่รออยู่ที่เครื่อง ') + node.name + t('?\n\nDownloads and installs up to 10 updates (security and quality updates). It does NOT restart the computer: if a restart is needed it says so and you choose when. Skipped on purpose: Windows version upgrades (feature updates), drivers, and anything that needs the user to click. It can take 5 to 25 minutes and the computer may be slower meanwhile.\n\nIf Windows Update is switched off on purpose on that computer, it is left alone.', '?\n\nดาวน์โหลดและติดตั้งอัปเดตความปลอดภัย/คุณภาพได้ไม่เกิน 10 รายการต่อครั้ง ไม่รีสตาร์ทเครื่อง ถ้าต้องรีสตาร์ทจะบอก แล้วคุณเลือกเวลาเอง ที่ข้ามไว้ตั้งใจ: อัปเดตเปลี่ยนเวอร์ชัน Windows (feature update), ไดรเวอร์ และอัปเดตที่ต้องให้ผู้ใช้กด ใช้เวลา 5–25 นาที เครื่องอาจช้าลงระหว่างนั้น\n\nถ้าเครื่องนั้นปิด Windows Update ไว้ตั้งใจ ระบบจะไม่แตะต้อง'), '');
        bar.appendChild(btn('🔄 ' + t('Restart (warn user 5 min)', 'รีสตาร์ท (แจ้งผู้ใช้ 5 นาที)'), 'scp-health-btn', function () {
            if (!root.confirm(t('Restart ', 'รีสตาร์ทเครื่อง ') + node.name + t(' in 5 minutes?\n\nThe user sees a message and has 5 minutes to save their work. You can cancel it with "Cancel restart".', ' ในอีก 5 นาที?\n\nผู้ใช้จะเห็นข้อความแจ้งและมีเวลา 5 นาทีเพื่อบันทึกงาน ยกเลิกได้ด้วยปุ่ม "ยกเลิกรีสตาร์ท"'))) return;
            var msg = t('SCP-Remote: this computer will restart in 5 minutes to finish Windows updates. Please save your work.', 'SCP-Remote: เครื่องนี้จะรีสตาร์ทในอีก 5 นาที เพื่อติดตั้งอัปเดต Windows ให้เสร็จ กรุณาบันทึกงานของท่าน');
            run(node, 'wurestart', 'restart|' + btoa(unescape(encodeURIComponent(msg))));
        })).disabled = !ready;
        bar.appendChild(btn('✋ ' + t('Cancel restart', 'ยกเลิกรีสตาร์ท'), 'scp-health-btn', function () { run(node, 'wurestart', 'cancel'); })).disabled = !ready;
        add('avscan', '🛡️ ' + t('Antivirus: check / remove', 'แอนตี้ไวรัส: ตรวจ / ถอน'), false, null, '');
        bar.appendChild(btn('📦 ' + t('Install programs…', 'ลงโปรแกรม…'), 'scp-health-btn', function () { openInstall([node]); })).disabled = !ready;
        bar.appendChild(btn('🧹 ' + t('Send SCPclear', 'ส่ง SCPclear ไปเครื่องนี้'), 'scp-health-btn', function () { deploy([node]); })).disabled = !ready;
        box.appendChild(bar);
        ['inventory', 'sfc', 'dism', 'bench', 'lan', 'winget', 'deploy', 'avscan', 'avremove', 'wurepair', 'wuinstall', 'wurestart'].forEach(function (task) { var s = statusLine(id, task); if (s) box.appendChild(s); });
        var inv = result(id, 'inventory');
        if (inv) box.appendChild(inventoryView(inv.data, inv.at));
        else box.appendChild(el('p', t('Reads the Windows crash files (minidumps) to name the driver behind each blue screen, the RAM slots and the laptop battery wear. Changes nothing.', 'อ่านไฟล์ minidump เพื่อบอกว่าไดรเวอร์ตัวไหนทำจอฟ้า, ช่อง RAM ที่ว่าง/อัปเกรดได้ และความเสื่อมของแบตโน้ตบุ๊ก — อ่านอย่างเดียว ไม่เปลี่ยนแปลงอะไร'), 'scp-health-hint'));
        ['sfc', 'dism', 'bench', 'winget', 'deploy', 'avremove', 'wurepair', 'wuinstall', 'wurestart'].forEach(function (task) { var r = result(id, task); if (r) box.appendChild(smallResult(task, r.data, r.at)); });
        var av = result(id, 'avscan');
        if (av) box.appendChild(avView(node, av.data, av.at));
        var lan = result(id, 'lan');
        if (lan) box.appendChild(lanView(lan.data, lan.at));
    }
    function inventoryView(d, at) {
        var wrap = el('div', null, 'scp-tech-inv');
        wrap.appendChild(el('p', t('Read ', 'อ่านเมื่อ ') + when(at), 'scp-health-hint'));
        // blue screens
        var crash = d.crash || [], sum = crashSummary(d);
        var bs = el('div', null, 'scp-tech-block');
        bs.appendChild(el('h5', '💥 ' + t('Blue screens in the last ', 'จอฟ้า (BSOD) ใน ') + (d.days || 180) + t(' days: ', ' วันล่าสุด: ') + crash.length));
        if (!crash.length) bs.appendChild(el('p', t('No blue screen found.', 'ไม่พบจอฟ้า'), 'scp-health-note ok'));
        var top = Object.keys(sum.drivers).sort(function (a, b) { return sum.drivers[b] - sum.drivers[a]; });
        top.forEach(function (drv) {
            var hint = driverHint(drv), owner = (d.owners || {})[drv];
            var p = el('p', null, 'scp-health-note ' + (sum.drivers[drv] > 1 ? 'bad' : 'warn'));
            p.appendChild(el('strong', drv)); p.appendChild(document.createTextNode(' × ' + sum.drivers[drv] + (owner ? ' — ' + owner : '') + (hint ? '\n→ ' + hint : '')));
            bs.appendChild(p);
        });
        if (crash.length) {
            var tbl = el('table', null, 'scp-tech-table'), hr = tbl.insertRow();
            [t('When', 'เมื่อ'), t('Stop code', 'รหัส'), t('Driver', 'ไดรเวอร์'), t('Meaning', 'ความหมาย')].forEach(function (h) { hr.appendChild(el('th', h)); });
            crash.slice(0, 15).forEach(function (c) {
                var r = tbl.insertRow(), b = bugInfo(c.code);
                r.insertCell().textContent = when(Date.parse(c.at));
                r.insertCell().textContent = hex(c.code) + (b ? ' ' + b.name : '');
                r.insertCell().textContent = c.driver || (c.src === 'event' ? t('(no dump file)', '(ไม่มีไฟล์ dump)') : '—');
                r.insertCell().textContent = b ? b.why : '';
            });
            bs.appendChild(tbl);
        }
        if (sum.power) bs.appendChild(el('p', '🔌 ' + t('Sudden power loss / hard reset: ', 'ไฟดับ/ปิดเครื่องกะทันหัน (ไม่ใช่จอฟ้า): ') + sum.power + t(' times — check the UPS, power cable and power supply', ' ครั้ง — ตรวจ UPS ปลั๊ก และพาวเวอร์ซัพพลาย'), 'scp-health-note warn'));
        wrap.appendChild(bs);
        // RAM
        var ram = d.ram, rv = ramVerdict(ram);
        if (rv) {
            var rb = el('div', null, 'scp-tech-block');
            rb.appendChild(el('h5', '🧠 RAM ' + ram.totalGb + ' GB · ' + t('slots ', 'ช่อง ') + rv.used + '/' + rv.slots + (rv.type ? ' · ' + rv.type : '') + (rv.form ? ' ' + rv.form : '') + (rv.maxGb ? ' · ' + t('board max ', 'บอร์ดรับสูงสุด ') + rv.maxGb + ' GB' : '')));
            rb.appendChild(el('p', rv.advice, 'scp-health-note ' + rv.tone));
            rb.appendChild(el('p', (ram.sticks || []).map(function (s) { return (s.slot || '?') + ': ' + s.gb + ' GB ' + (MEMTYPE[s.type] || '') + (s.speed ? ' ' + s.speed + ' MHz' : '') + (s.maker && s.maker !== 'Unknown' ? ' ' + s.maker : '') + (s.part && s.part.length > 2 ? ' (' + s.part + ')' : ''); }).join('\n') + '\n' + [ram.model, ram.board, ram.cpu].filter(Boolean).join(' · '), 'scp-health-hint scp-tech-pre'));
            wrap.appendChild(rb);
        }
        var bv = batteryVerdict(d.battery);
        if (bv) {
            var bb = el('div', null, 'scp-tech-block');
            bb.appendChild(el('h5', '🔋 ' + t('Battery ', 'แบตเตอรี่ ') + (bv.health >= 0 ? bv.health + '%' : '?') + t(' of new', ' ของตอนใหม่') + ' · ' + t('charge ', 'ชาร์จอยู่ ') + d.battery.charge + '%' + (d.battery.cycles >= 0 ? ' · ' + d.battery.cycles + t(' cycles', ' รอบ') : '')));
            bb.appendChild(el('p', bv.text + (d.battery.design ? ' (' + Math.round(d.battery.full) + ' / ' + Math.round(d.battery.design) + ' mWh)' : ''), 'scp-health-note ' + bv.tone));
            wrap.appendChild(bb);
        }
        return wrap;
    }
    function smallResult(task, d, at) {
        var tone = 'ok', text = '';
        if (task === 'sfc') {
            tone = d.verdict === 'clean' ? 'ok' : (d.verdict === 'violations' ? 'bad' : 'warn');
            text = d.verdict === 'clean' ? t('SFC: Windows files are intact', 'SFC: ไฟล์ Windows ปกติ') :
                d.verdict === 'violations' ? t('SFC: damaged Windows files found — run "sfc /scannow" and "DISM /RestoreHealth" at the computer (or SCPclear › Windows tools)', 'SFC: พบไฟล์ Windows เสียหาย — ให้รัน sfc /scannow และ DISM /RestoreHealth (หรือ SCPclear › เครื่องมือ Windows)') :
                t('SFC finished; see the output', 'SFC ทำเสร็จ ดูข้อความด้านล่าง');
        } else if (task === 'dism') {
            tone = d.verdict === 'clean' || d.verdict === 'ok' ? 'ok' : (d.verdict === 'broken' ? 'bad' : 'warn');
            text = d.verdict === 'clean' ? t('DISM: no component store corruption', 'DISM: คลังระบบปกติ') :
                d.verdict === 'repairable' ? t('DISM: damage found that can be repaired (DISM /Online /Cleanup-Image /RestoreHealth)', 'DISM: พบความเสียหายที่ซ่อมได้ (DISM /Online /Cleanup-Image /RestoreHealth)') :
                d.verdict === 'broken' ? t('DISM: damage that cannot be repaired — consider reinstalling Windows', 'DISM: เสียหายซ่อมไม่ได้ ควรพิจารณาลง Windows ใหม่') : t('DISM finished; see the output', 'DISM ทำเสร็จ ดูข้อความด้านล่าง');
        } else if (task === 'bench') {
            tone = d.read < 150 ? 'bad' : (d.read < 400 ? 'warn' : 'ok');
            text = '⚡ ' + (d.disk || 'Disk') + ' — ' + t('read ', 'อ่าน ') + d.read + ' MB/s · ' + t('write ', 'เขียน ') + d.write + ' MB/s · 4K ' + d.rand + ' MB/s (' + d.iops + ' IOPS)' +
                (d.read < 150 ? t('\nSlow like an old hard disk — an SSD makes this computer much faster', '\nช้าแบบฮาร์ดดิสก์เก่า — เปลี่ยนเป็น SSD จะเร็วขึ้นมาก') : '');
        } else if (task === 'winget') {
            var res = d.results || [];
            tone = res.every(function (r) { return r.code === 0; }) ? 'ok' : 'warn';
            text = '📦 ' + res.map(function (r) { return r.id + ': ' + wingetText(r.code); }).join('\n');
        } else if (task === 'wurestart') {
            text = d.action === 'cancel' ? (d.none ? t('No restart was scheduled on that computer', 'เครื่องนั้นไม่ได้ตั้งรีสตาร์ทไว้') : t('The scheduled restart was cancelled', 'ยกเลิกการรีสตาร์ทที่ตั้งไว้แล้ว')) : t('Restart set for 5 minutes from ', 'ตั้งรีสตาร์ทในอีก 5 นาที เมื่อ ') + when(at) + t(' (the user has been told on screen)', ' (ผู้ใช้เห็นข้อความบนหน้าจอแล้ว)');
        } else if (task === 'wuinstall') {
            var inst = d.installed || [], fail = d.failed || [], skip = d.skipped || [];
            tone = (fail.length || d.state !== 'done') ? 'warn' : 'ok';
            if (d.state === 'timeout') text = '⬇️ ' + t('The install took over 25 minutes and this page stopped waiting. Windows may still be installing: look at the computer (Settings → Windows Update).', 'ติดตั้งเกิน 25 นาที หน้านี้หยุดรอแล้ว Windows อาจยังติดตั้งอยู่ ให้ดูที่หน้าเครื่อง (Settings → Windows Update)');
            else if (d.state === 'error') text = '⬇️ ' + t('The update service answered with an error: ', 'บริการอัปเดตตอบกลับว่าผิดพลาด: ') + (d.message || '') + t('\nTry "Repair Windows Update" first.', '\nลอง "ซ่อม Windows Update" ก่อน');
            else if (!d.found) text = '⬇️ ' + t('Nothing is waiting: Windows is up to date.', 'ไม่มีอัปเดตรออยู่ Windows เป็นรุ่นล่าสุดแล้ว');
            else text = '⬇️ ' + t('Installed ', 'ติดตั้งสำเร็จ ') + inst.length + t(' update(s)', ' รายการ') + (inst.length ? ':\n· ' + inst.join('\n· ') : '') +
                (fail.length ? '\n' + t('Failed or not downloaded: ', 'ไม่สำเร็จ/โหลดไม่ได้: ') + fail.length + ':\n· ' + fail.join('\n· ') : '') +
                (skip.length ? '\n' + t('Left for later (feature updates, over the limit of 10, or needing the user): ', 'ข้ามไว้ (เปลี่ยนเวอร์ชัน Windows, เกิน 10 รายการ หรือต้องให้ผู้ใช้กด): ') + skip.length + ':\n· ' + skip.join('\n· ') : '');
            if (d.reboot) text += '\n🔄 ' + t('A restart is needed to finish. Use "Restart (warn user 5 min)" when it suits the user.', 'ต้องรีสตาร์ทเครื่องให้เสร็จ กดปุ่ม "รีสตาร์ท (แจ้งผู้ใช้ 5 นาที)" เมื่อสะดวกสำหรับผู้ใช้');
        } else if (task === 'wurepair') {
            var pend = d.pending || 0;
            tone = d.dism === 'broken' || d.scan !== 'done' ? 'warn' : 'ok';
            text = '🩹 ' + t('Windows Update repaired: ', 'ซ่อม Windows Update แล้ว: ') + t('cleared ', 'ล้างแคช ') + (d.freedMb || 0) + t(' MB of stuck downloads', ' MB') + (d.left ? t(' (' + d.left + ' items could not be removed)', ' (ลบไม่ได้ ' + d.left + ' รายการ)') : '') +
                '\n' + t('System files (DISM): ', 'ไฟล์ระบบ (DISM): ') + ({ clean: t('fine', 'ปกติ'), ok: t('fine', 'ปกติ'), repairable: t('damaged but repairable — run DISM /RestoreHealth at the computer', 'เสียหายแต่ซ่อมได้ รัน DISM /RestoreHealth ที่หน้าเครื่อง'), broken: t('damaged and not repairable — consider reinstalling Windows', 'เสียหายซ่อมไม่ได้ ควรพิจารณาลง Windows ใหม่') }[d.dism] || t('could not be read', 'อ่านไม่ได้')) +
                '\n' + (d.scan === 'done' ? t('Windows Update says ', 'Windows Update บอกว่ามีอัปเดตรออยู่ ') + pend + t(' update(s) waiting', ' รายการ') + (pend ? ':\n· ' + (d.titles || []).join('\n· ') + (pend > (d.titles || []).length ? '\n…' : '') : t(' — up to date', ' — ล่าสุดแล้ว')) : (d.scan === 'timeout' ? t('The update search took over 6 minutes and was stopped: the computer cannot reach Windows Update (check its internet / proxy)', 'ค้นหาอัปเดตเกิน 6 นาทีจึงหยุด เครื่องนี้ติดต่อ Windows Update ไม่ได้ (ตรวจอินเทอร์เน็ต/พร็อกซีของเครื่อง)') : t('The update search failed (see the error at the computer: Settings → Windows Update)', 'ค้นหาอัปเดตไม่สำเร็จ (ดูรหัส error ที่หน้าเครื่อง: Settings → Windows Update)'))) +
                (d.reboot ? '\n' + t('A restart is waiting to finish earlier updates.', 'มีรีสตาร์ทรออยู่เพื่อให้อัปเดตก่อนหน้าเสร็จ') : '');
        } else if (task === 'avremove') {
            tone = d.gone ? 'ok' : 'bad';
            text = '🛡️ ' + d.name + ': ' + avCodeText(d.code) + ' · ' + (d.gone ? t('it is gone from the program list', 'หายไปจากรายการโปรแกรมแล้ว') : t('STILL INSTALLED', 'ยังติดตั้งอยู่')) +
                (d.restart ? t(' · restart the computer to finish', ' · ต้องรีสตาร์ทเครื่องให้เสร็จ') : '') + '\n' + avDefenderText(d.defender) +
                (d.gone ? '' : t('\nNext: ESET Uninstaller (or the maker\'s removal tool) in Safe Mode at the computer — see AV-REMOVAL.md', '\nขั้นต่อไป: ใช้ ESET Uninstaller (หรือเครื่องมือถอนของผู้ผลิต) ใน Safe Mode ที่หน้าเครื่อง — ดู AV-REMOVAL.md'));
        } else if (task === 'deploy') {
            text = '🧹 ' + t('SCPclear is on the desktop (', 'วาง SCPclear บนเดสก์ท็อปแล้ว (') + d.path + ')';
        }
        var p = el('p', text + ' · ' + when(at), 'scp-health-note ' + tone);
        if (d.tail && (task === 'sfc' || task === 'dism' || task === 'avremove')) { var det = el('details'); det.appendChild(el('summary', t('Output', 'ข้อความจากเครื่อง'))); det.appendChild(el('pre', d.tail, 'scp-tech-pre')); p.appendChild(det); }
        return p;
    }
    // Plain text for the antivirus results (display only).
    function avCodeText(code) {
        if (code === 0) return t('uninstaller finished (code 0)', 'ตัวถอนทำงานสำเร็จ (รหัส 0)');
        if (code === 3010 || code === 1641) return t('uninstaller finished, restart needed (code ' + code + ')', 'ตัวถอนทำงานสำเร็จ ต้องรีสตาร์ท (รหัส ' + code + ')');
        if (code === 1618) return t('another installation was running (code 1618)', 'มีการติดตั้งอื่นทำอยู่ ลองใหม่ในไม่กี่นาที (รหัส 1618)');
        if (code === 1605) return t('Windows Installer says it is not installed (code 1605)', 'Windows Installer บอกว่าไม่ได้ติดตั้ง (รหัส 1605)');
        if (code === 1603) return t('fatal error (code 1603); a settings password blocks silent uninstall by design', 'ผิดพลาดร้ายแรง (รหัส 1603) ถ้าตั้งรหัสผ่านป้องกันไว้ การถอนแบบเงียบจะถูกกันไว้ตามที่ออกแบบ');
        return t('uninstaller ended with code ', 'ตัวถอนจบด้วยรหัส ') + code;
    }
    function avDefenderText(d) {
        if (!d || !d.present) return t('Microsoft Defender: not readable on this computer', 'Microsoft Defender: อ่านสถานะไม่ได้');
        var mode = d.mode ? ' (' + d.mode + ')' : '';
        return 'Microsoft Defender: ' + (d.enabled ? t('on', 'เปิดอยู่') : t('off', 'ปิดอยู่')) + mode + ' · ' + t('signatures ', 'ฐานไวรัสอายุ ') + (d.sigAge != null ? d.sigAge : '?') + t(' days old', ' วัน');
    }
    // What antivirus is on the computer and, for each one that has a silent uninstaller, a button for it.
    function avView(node, d, at) {
        var wrap = el('div', null, 'scp-tech-block');
        wrap.appendChild(el('h5', '🛡️ ' + t('Antivirus on this computer', 'แอนตี้ไวรัสในเครื่องนี้') + ' · ' + when(at)));
        var prods = d.products || [];
        wrap.appendChild(el('p', prods.length ? prods.map(function (p) { return p.name + ' — ' + (p.on ? t('on', 'เปิด') : t('off', 'ปิด')) + (p.old ? t(', signatures out of date', ' · ฐานไวรัสเก่า') : t(', up to date', ' · ล่าสุด')); }).join('\n') : t('Windows reports no antivirus.', 'Windows ไม่รายงานแอนตี้ไวรัสเลย'), 'scp-health-note ' + (prods.some(function (p) { return p.on && !p.old; }) ? 'ok' : 'bad')));
        wrap.appendChild(el('p', avDefenderText(d.defender), 'scp-health-hint'));
        var ents = d.entries || [];
        if (!ents.length) { wrap.appendChild(el('p', t('No other antivirus program is installed.', 'ไม่พบโปรแกรมแอนตี้ไวรัสอื่นติดตั้งอยู่'), 'scp-health-hint')); return wrap; }
        var tbl = el('table', null, 'scp-tech-table'), hr = tbl.insertRow();
        [t('Program', 'โปรแกรม'), t('Version', 'รุ่น'), t('Maker', 'ผู้ผลิต'), ''].forEach(function (h) { hr.appendChild(el('th', h)); });
        ents.forEach(function (e) {
            var r = tbl.insertRow(), j = state(node._id, 'avremove'), going = j && (j.state === 'working' || j.state === 'queued' || j.state === 'waiting');
            r.insertCell().textContent = e.name + (e.wow ? ' (32-bit)' : '');
            r.insertCell().textContent = e.version || '';
            r.insertCell().textContent = e.publisher || '';
            var cell = r.insertCell();
            if (!e.silent) { cell.textContent = t('No silent uninstaller — remove at the computer', 'ไม่มีตัวถอนแบบเงียบ ต้องถอนที่หน้าเครื่อง'); return; }
            var b = btn('🗑️ ' + t('Uninstall', 'ถอนด้วยตัวถอนของมัน'), 'scp-health-btn', function () {
                if (!root.confirm(t('Uninstall ', 'ถอน ') + e.name + t(' from ', ' ออกจากเครื่อง ') + node.name + '?\n\n' +
                    t('Runs the program\'s own silent uninstaller (msiexec /x), then checks it is really gone. Refused if this antivirus is on and up to date, because then it is the one protecting the computer. If it has a settings password or defends itself, the uninstall can fail: use the maker\'s removal tool in Safe Mode at the computer (AV-REMOVAL.md). Windows Defender takes over once no other antivirus is registered.',
                        'ใช้ตัวถอนแบบเงียบของโปรแกรมเอง (msiexec /x) แล้วตรวจว่าหายไปจริง ถ้าแอนตี้ไวรัสตัวนี้เปิดอยู่และฐานไวรัสล่าสุด ระบบจะไม่ถอนให้ เพราะเป็นตัวที่ป้องกันเครื่องอยู่ ถ้าตั้งรหัสผ่านป้องกันไว้หรือป้องกันตัวเอง การถอนอาจไม่สำเร็จ ให้ใช้เครื่องมือถอนของผู้ผลิตใน Safe Mode ที่หน้าเครื่อง (AV-REMOVAL.md) เมื่อไม่มีแอนตี้ไวรัสอื่นลงทะเบียนแล้ว Windows Defender จะรับช่วงต่อ'))) return;
                run(node, 'avremove', e.key);
            });
            b.disabled = !online(node) || !!going;
            cell.appendChild(b);
        });
        wrap.appendChild(tbl);
        return wrap;
    }
    function wingetText(code) {
        if (code === 0) return t('installed', 'ติดตั้งแล้ว');
        if (code === -1978335189 || code === -1978335135) return t('already installed / up to date', 'มีอยู่แล้ว / เป็นรุ่นล่าสุด');
        if (code === -1978335212) return t('not found in winget', 'ไม่พบในคลัง winget');
        if (code === -999) return t('took too long', 'ใช้เวลานานเกิน');
        if (code === 3010 || code === 1641) return t('installed, restart needed', 'ติดตั้งแล้ว ต้องรีสตาร์ท');
        return t('failed (code ', 'ไม่สำเร็จ (รหัส ') + code + ')';
    }
    // Computers SCP-Remote already knows, by IP and by name (the scan's DNS name is "NAME" or "NAME.domain").
    function knownComputers() {
        var byIp = {}, byName = {};
        (root.ScpDashboard && root.ScpDashboard.nodes ? root.ScpDashboard.nodes() : (root.nodes || [])).forEach(function (n) {
            if (n.ip) byIp[n.ip] = n.name;
            [n.name, n.host, n.rname].forEach(function (x) { if (x) byName[String(x).split('.')[0].toLowerCase()] = n.name; });
        });
        return { lookup: function (h) { return byIp[h.ip] || (h.name && byName[String(h.name).split('.')[0].toLowerCase()]) || ''; } };
    }
    function looksLikeWindows(h) { return /(^|,)(445|3389)(,|$)/.test(h.ports || ''); }
    function lanView(d, at) {
        var wrap = el('div', null, 'scp-tech-block');
        wrap.appendChild(el('h5', '📡 ' + t('LAN ', 'เครือข่าย ') + d.prefix + '.0/24 — ' + (d.hosts || []).length + t(' devices answered', ' อุปกรณ์ที่ตอบ') + ' · ' + when(at)));
        var known = knownComputers();
        var tbl = el('table', null, 'scp-tech-table'), hr = tbl.insertRow();
        ['IP', t('Name', 'ชื่อ'), t('Kind', 'ชนิด'), t('Open ports', 'พอร์ตที่เปิด'), 'MAC'].forEach(function (h) { hr.appendChild(el('th', h)); });
        (d.hosts || []).forEach(function (h) {
            var r = tbl.insertRow(), k = known.lookup(h), missing = !k && looksLikeWindows(h) && h.ip !== d.self && h.ip !== d.gateway;
            if (missing) r.className = 'scp-tech-missing';
            r.insertCell().textContent = h.ip + (h.ip === d.self ? t(' (this one)', ' (เครื่องนี้)') : '');
            r.insertCell().textContent = h.name || k || '';
            r.insertCell().textContent = lanKind(h, d.gateway) + (k ? ' · SCP-Remote' : (missing ? t(' · ⚠️ no SCP-Remote yet', ' · ⚠️ ยังไม่ได้ลง SCP-Remote') : ''));
            r.insertCell().textContent = h.ports || '';
            r.insertCell().textContent = h.mac || '';
        });
        wrap.appendChild(tbl);
        return wrap;
    }
    // Windows computers seen in any LAN scan kept in this browser that SCP-Remote does not know yet.
    function notInstalled() {
        var known = knownComputers(), seen = {};
        Object.keys(results).forEach(function (id) {
            var r = results[id] && results[id].lan;
            if (!r || !r.data) return;
            var from = (nodeById(id) || {}).name || '';
            (r.data.hosts || []).forEach(function (h) {
                if (!looksLikeWindows(h) || h.ip === r.data.self || h.ip === r.data.gateway || known.lookup(h)) return;
                if (!seen[h.ip] || seen[h.ip].at < r.at) seen[h.ip] = { ip: h.ip, name: h.name || '', mac: h.mac || '', ports: h.ports || '', at: r.at, from: from };
            });
        });
        return Object.keys(seen).map(function (k) { return seen[k]; }).sort(function (a, b) {
            var x = a.ip.split('.').map(Number), y = b.ip.split('.').map(Number);
            for (var i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i];
            return 0;
        });
    }
    function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    // A sheet to carry round the wards: tick each computer once SCP-Remote-Setup.exe is installed.
    function printNotInstalled(list) {
        var w = root.open('', '_blank');
        if (!w) { root.alert(t('The print window was blocked; allow pop-ups.', 'เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัป')); return; }
        var title = t('Computers without SCP-Remote', 'เครื่องที่ยังไม่ได้ลง SCP-Remote');
        var rows = list.map(function (h, i) {
            return '<tr><td class="c">☐</td><td>' + (i + 1) + '</td><td>' + escHtml(h.ip) + '</td><td>' + escHtml(h.name) + '</td><td>' + escHtml(h.mac) + '</td><td>' + escHtml(h.ports) + '</td><td></td><td></td></tr>';
        }).join('');
        w.document.write('<!doctype html><html lang="' + (th ? 'th' : 'en') + '"><head><meta charset="utf-8"><title>' + escHtml(title) + '</title><style>' +
            'body{font-family:"IBM Plex Sans Thai","TH Sarabun New",sans-serif;margin:16px;color:#111}h1{font-size:18px;margin:0 0 4px}p{font-size:12px;margin:2px 0 10px;color:#444}' +
            'table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #999;padding:6px;text-align:left}th{background:#f3f3f3}td.c{font-size:16px;text-align:center;width:24px}' +
            'td:nth-child(7){width:22%}td:nth-child(8){width:16%}tr{page-break-inside:avoid}@media print{button{display:none}}</style></head><body>' +
            '<h1>' + escHtml(title) + ' (' + list.length + ')</h1>' +
            '<p>' + escHtml(t('From LAN scans in SCP-Remote, printed ', 'จากการสแกน LAN ใน SCP-Remote พิมพ์เมื่อ ') + new Date().toLocaleString(th ? 'th-TH' : undefined)) +
            escHtml(t(' · Windows computers (port 445/3389) not in SCP-Remote. Install SCP-Remote-Setup.exe and tick the box.', ' · เครื่อง Windows (พอร์ต 445/3389) ที่ยังไม่อยู่ใน SCP-Remote ติดตั้ง SCP-Remote-Setup.exe แล้วติ๊กช่อง')) + '</p>' +
            '<table><tr><th>✓</th><th>#</th><th>IP</th><th>' + escHtml(t('Name', 'ชื่อเครื่อง')) + '</th><th>MAC</th><th>' + escHtml(t('Ports', 'พอร์ต')) + '</th><th>' + escHtml(t('Department / room', 'หน่วยงาน / ห้อง')) + '</th><th>' + escHtml(t('Note', 'หมายเหตุ')) + '</th></tr>' + rows + '</table>' +
            '<script>setTimeout(function(){window.print();},300);<\/script></body></html>');
        w.document.close();
    }
    function notInstalledView() {
        var list = notInstalled(), wrap = el('div', null, 'scp-tech-block');
        wrap.appendChild(el('h5', '🧭 ' + t('Windows computers without SCP-Remote (all scans kept here): ', 'เครื่อง Windows ที่ยังไม่ได้ลง SCP-Remote (รวมทุกการสแกน): ') + list.length));
        if (!list.length) { wrap.appendChild(el('p', t('None found yet. Scan each network (e.g. one computer per ward) to fill this list.', 'ยังไม่พบ สแกนแต่ละวง (เช่น เลือกเครื่องละวอร์ด) แล้วรายการจะรวมมาที่นี่'), 'scp-health-hint')); return wrap; }
        var bar = el('div', null, 'scp-tech-bar');
        bar.appendChild(btn('🖨️ ' + t('Print the list to install', 'พิมพ์รายการไปติดตั้ง'), 'scp-health-btn primary', function () { printNotInstalled(notInstalled()); }));
        bar.appendChild(btn('📋 ' + t('Copy IPs', 'คัดลอก IP'), 'scp-health-btn', function (e) {
            var text = notInstalled().map(function (h) { return h.ip + (h.name ? '\t' + h.name : ''); }).join('\n'), b = e && e.target;
            Promise.resolve(root.navigator && root.navigator.clipboard ? root.navigator.clipboard.writeText(text) : null).then(function () { if (b) b.textContent = '✅ ' + t('Copied', 'คัดลอกแล้ว'); }).catch(function () { });
        }));
        bar.appendChild(el('span', t('Found by open Windows ports (445 file sharing / 3389 remote desktop); a computer with both closed will not show here.', 'ดูจากพอร์ตของ Windows (445 แชร์ไฟล์ / 3389 รีโมตเดสก์ท็อป) เครื่องที่ปิดทั้งสองพอร์ตจะไม่ขึ้นในรายการนี้'), 'scp-health-hint'));
        wrap.appendChild(bar);
        var tbl = el('table', null, 'scp-tech-table'), hr = tbl.insertRow();
        ['IP', t('Name', 'ชื่อ'), 'MAC', t('Ports', 'พอร์ต'), t('Seen from', 'สแกนจาก'), t('When', 'เมื่อ')].forEach(function (h) { hr.appendChild(el('th', h)); });
        list.forEach(function (h) {
            var r = tbl.insertRow();
            [h.ip, h.name, h.mac, h.ports, h.from, when(h.at)].forEach(function (v) { r.insertCell().textContent = v || ''; });
        });
        wrap.appendChild(tbl);
        return wrap;
    }

    // The dashboard hands in its own dialog; this one (same classes) is for a computer window opened before it.
    function plainOverlay(title) {
        var overlay = el('div', null, 'scp-asset-dialog-overlay scp-extra-overlay'), box = el('div', null, 'scp-asset-dialog-box scp-extra-box'), head = el('div', null, 'scp-extra-head');
        function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
        function onKey(e) { if (e.key === 'Escape') close(); }
        head.appendChild(el('h3', title)); head.appendChild(btn('✕', 'scp-dialog-close-btn', close));
        box.appendChild(head); overlay.appendChild(box);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
        return { overlay: overlay, box: box, close: close };
    }

    /* ---------- install programs on one or many computers ---------- */
    function openInstall(nodes, overlay) {
        overlay = overlay || root.ScpTech.overlay || plainOverlay;
        var list = (nodes || []).filter(function (n) { return online(n) && windowsAgent(n); });
        var d = overlay('📦 ' + t('Install programs (winget)', 'ลงโปรแกรม (winget)'));
        var body = el('div', null, 'scp-extra-body');
        body.appendChild(el('p', t('Installs silently for all users from the winget catalogue (official installers from each maker). Programs already installed are left as they are.', 'ติดตั้งแบบเงียบให้ทุกผู้ใช้ จากคลัง winget (ตัวติดตั้งจากผู้ผลิตโดยตรง) โปรแกรมที่มีแล้วจะไม่ถูกเปลี่ยน'), 'scp-health-hint'));
        var grid = el('div', null, 'scp-tech-pick'), picked = {};
        CATALOG.forEach(function (c) {
            var lab = el('label', null, 'scp-tech-check'), cb = el('input'); cb.type = 'checkbox';
            cb.onchange = function () { if (cb.checked) picked[c[0]] = true; else delete picked[c[0]]; };
            lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + c[1])); grid.appendChild(lab);
        });
        body.appendChild(grid);
        var other = el('input', null, 'scp-tech-input'); other.placeholder = t('Other winget ids, comma separated (e.g. Microsoft.PowerToys)', 'winget id อื่น คั่นด้วยจุลภาค (เช่น Microsoft.PowerToys)');
        body.appendChild(other);
        var who = el('div', null, 'scp-tech-pick scp-tech-who'), chosen = {};
        body.appendChild(el('h5', t('Computers (online Windows): ', 'เครื่อง (Windows ที่ออนไลน์): ') + list.length));
        var filter = el('input', null, 'scp-tech-input'); filter.placeholder = t('Filter by name…', 'ค้นหาชื่อเครื่อง…');
        body.appendChild(filter);
        var boxes = [];
        list.forEach(function (n) {
            var lab = el('label', null, 'scp-tech-check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = list.length === 1;
            if (cb.checked) chosen[n._id] = n;
            cb.onchange = function () { if (cb.checked) chosen[n._id] = n; else delete chosen[n._id]; };
            lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + n.name)); who.appendChild(lab); boxes.push({ lab: lab, cb: cb, n: n });
        });
        filter.oninput = function () { var q = filter.value.toLowerCase(); boxes.forEach(function (b) { b.lab.style.display = !q || b.n.name.toLowerCase().indexOf(q) >= 0 ? '' : 'none'; }); };
        var all = btn(t('Select all shown', 'เลือกทั้งหมดที่แสดง'), 'scp-health-btn', function () { boxes.forEach(function (b) { if (b.lab.style.display !== 'none') { b.cb.checked = true; chosen[b.n._id] = b.n; } }); });
        body.appendChild(all); body.appendChild(who);
        var status = el('div', null, 'scp-tech-status');
        var go = btn(t('Install', 'ติดตั้ง'), 'scp-health-btn primary', function () {
            var ids = Object.keys(picked).concat(other.value.split(/[\s,]+/).filter(Boolean));
            var bad = ids.filter(function (x) { return !WINGET_ID.test(x); });
            if (bad.length) { status.textContent = t('Not a winget id: ', 'ไม่ใช่ winget id: ') + bad.join(', '); return; }
            ids = ids.filter(function (x, i) { return ids.indexOf(x) === i; });
            var targets = Object.keys(chosen).map(function (k) { return chosen[k]; });
            if (!ids.length || !targets.length) { status.textContent = t('Pick at least one program and one computer.', 'เลือกโปรแกรมและเครื่องอย่างน้อยอย่างละ 1'); return; }
            if (ids.length > 6) { status.textContent = t('At most 6 programs per round (the computer stops a command after 30 minutes).', 'ครั้งละไม่เกิน 6 โปรแกรม (เครื่องจะตัดคำสั่งที่นานเกิน 30 นาที)'); return; }
            if (!root.confirm(t('Install ', 'ติดตั้ง ') + ids.join(', ') + t(' on ', ' ที่ ') + targets.length + t(' computers?', ' เครื่อง?') + t('\n\nUsers can keep working; some installers close the program they replace.', '\n\nผู้ใช้ทำงานต่อได้ บางโปรแกรมอาจปิดตัวเก่าระหว่างติดตั้ง'))) return;
            go.disabled = true;
            targets.forEach(function (n) { run(n, 'winget', ids.join(',')); });
            paintStatus();
            onChange(function () { if (!status.isConnected) return false; paintStatus(); });
            function paintStatus() {
                status.textContent = '';
                targets.forEach(function (n) {
                    var j = state(n._id, 'winget'), r = result(n._id, 'winget');
                    var line = el('p', null, 'scp-health-note ' + (!j || j.state === 'done' ? 'ok' : (j.state === 'failed' ? 'bad' : 'busy')));
                    line.textContent = n.name + ': ' + (!j ? '' : j.state === 'done' && r ? (r.data.results || []).map(function (x) { return x.id + ' ' + wingetText(x.code); }).join(' · ') : j.state === 'failed' ? j.error : t('working…', 'กำลังติดตั้ง…'));
                    status.appendChild(line);
                });
            }
        });
        body.appendChild(go); body.appendChild(status);
        d.box.appendChild(body);
    }

    /* ---------- send SCPclear ---------- */
    function deploy(nodes) {
        var list = (nodes || []).filter(function (n) { return online(n) && windowsAgent(n); });
        if (!list.length) return;
        fetch(domainUrl() + 'tools/scpclear.json', { credentials: 'same-origin', cache: 'no-cache' })
            .then(function (r) { if (!r.ok) throw Error('NO_TOOL'); return r.json(); })
            .then(function (info) {
                if (!info || !/^[0-9a-fA-F]{64}$/.test(info.sha256) || !/^[A-Za-z0-9_.-]+$/.test(info.file)) throw Error('BAD_TOOL');
                if (!root.confirm(t('Put SCPclear ', 'วาง SCPclear ') + info.version + t(' on ', ' ไว้ที่ ') + (list.length === 1 ? list[0].name : list.length + t(' computers', ' เครื่อง')) + '?\n\n' +
                    t('Copied to C:\\ProgramData\\SCPclear with a shortcut on every user\'s desktop. The file is checked by SHA-256 before it is kept. Nothing is started.', 'คัดลอกไปที่ C:\\ProgramData\\SCPclear และสร้างทางลัดบนเดสก์ท็อปของทุกผู้ใช้ ตรวจ SHA-256 ก่อนเก็บ — ไม่เปิดโปรแกรมให้เอง'))) return;
                var base = location.origin + domainUrl();
                list.forEach(function (n) { run(n, 'deploy', 'tools/' + info.file + '|' + info.sha256 + '|' + base); });
            })
            .catch(function () { root.alert(t('SCPclear is not on the server yet (public/tools/scpclear.json).', 'ยังไม่มีไฟล์ SCPclear บนเซิร์ฟเวอร์ (public/tools/scpclear.json)')); });
    }

    /* ---------- the hospital page ---------- */
    function openFleet(nodes, overlay) {
        root.ScpTech.overlay = overlay;
        var all = (nodes || []).filter(windowsAgent);
        var d = overlay('🧰 ' + t('Technician tools (SCPclear) — all computers', 'เครื่องมือช่าง (SCPclear) — ทั้งโรงพยาบาล'));
        var body = el('div', null, 'scp-extra-body scp-tech-fleet');
        var tabs = el('div', null, 'scp-tech-tabs'), pane = el('div', null, 'scp-tech-pane');
        var TABS = [
            ['crash', '💥 ' + t('Blue screens', 'จอฟ้า (BSOD)')], ['ram', '🧠 ' + t('RAM upgrades', 'อัปเกรด RAM')], ['battery', '🔋 ' + t('Laptop batteries', 'แบตโน้ตบุ๊ก')],
            ['av', '🛡️ ' + t('Antivirus', 'แอนตี้ไวรัส')], ['install', '📦 ' + t('Install programs', 'ลงโปรแกรม')], ['lan', '📡 ' + t('LAN scan', 'สแกน LAN')], ['scpclear', '🧹 SCPclear']
        ];
        var current = 'crash';
        try { current = root.localStorage.getItem('scpTechTab') || 'crash'; } catch (e) { }
        TABS.forEach(function (tb) {
            var b = btn(tb[1], 'scp-tech-tab', function () { current = tb[0]; try { root.localStorage.setItem('scpTechTab', current); } catch (e) { } paint(); });
            b.dataset.tab = tb[0]; tabs.appendChild(b);
        });
        body.appendChild(tabs); body.appendChild(pane); d.box.appendChild(body);
        onChange(function () { if (!pane.isConnected) return false; if (current === 'crash' || current === 'ram' || current === 'battery' || current === 'lan' || current === 'av') schedule(); });
        var timer = null;
        function schedule() { if (!timer) timer = setTimeout(function () { timer = null; paint(); }, 600); }
        function paint() {
            Array.prototype.forEach.call(tabs.children, function (b) { b.classList.toggle('active', b.dataset.tab === current); });
            pane.textContent = '';
            if (current === 'install') return installTab();
            if (current === 'lan') return lanTab();
            if (current === 'av') return avTab();
            if (current === 'scpclear') return scpclearTab();
            inventoryTab(current);
        }
        function readBar() {
            var on = all.filter(online), going = on.filter(function (n) { var j = state(n._id, 'inventory'); return j && j.state !== 'done' && j.state !== 'failed'; });
            var have = all.filter(function (n) { return result(n._id, 'inventory'); });
            var bar = el('div', null, 'scp-tech-bar');
            var b = btn(going.length ? t('Reading… ', 'กำลังอ่าน… ') + (on.length - going.length) + ' / ' + on.length : t('Read all online computers (', 'อ่านทุกเครื่องที่ออนไลน์ (') + on.length + ')', 'scp-health-btn primary', function () {
                on.forEach(function (n) { run(n, 'inventory', '180'); });
            });
            b.disabled = !on.length || going.length > 0;
            bar.appendChild(b);
            bar.appendChild(el('span', t('Results kept for ', 'มีผลแล้ว ') + have.length + ' / ' + all.length + t(' computers (in this browser). Reading only — nothing is changed.', ' เครื่อง (เก็บในเบราว์เซอร์นี้) · อ่านอย่างเดียว ไม่เปลี่ยนแปลงเครื่อง'), 'scp-health-hint'));
            pane.appendChild(bar);
            return have;
        }
        function nodeRow(n, title, detail, tone) {
            var row = el('button', null, 'scp-health-fleet-row' + (tone === 'bad' ? ' slow' : '')); row.type = 'button';
            row.appendChild(el('strong', n.name)); row.appendChild(el('span', title, 'scp-health-fleet-count')); row.appendChild(el('small', detail));
            row.onclick = function () { if (root.showComputerDetailModal) { d.close(); root.showComputerDetailModal(n); } };
            return row;
        }
        function inventoryTab(kind) {
            var have = readBar(), table = el('div', null, 'scp-health-fleet');
            if (kind === 'crash') {
                var byDriver = {}, rows = [], powerRows = [];
                have.forEach(function (n) {
                    var inv = result(n._id, 'inventory').data, s = crashSummary(inv);
                    Object.keys(s.drivers).forEach(function (drv) { var k = drv.toLowerCase(); (byDriver[k] = byDriver[k] || { name: drv, nodes: [], crashes: 0 }); byDriver[k].nodes.push(n.name); byDriver[k].crashes += s.drivers[drv]; });
                    if (s.count) rows.push({ n: n, s: s, inv: inv });
                    if (s.power >= 2) powerRows.push({ n: n, s: s });
                });
                var top = Object.keys(byDriver).map(function (k) { return byDriver[k]; }).sort(function (a, b) { return b.nodes.length - a.nodes.length || b.crashes - a.crashes; });
                if (top.length) {
                    pane.appendChild(el('h5', t('Drivers behind blue screens, by number of computers', 'ไดรเวอร์ที่ทำให้จอฟ้า เรียงตามจำนวนเครื่อง')));
                    var tbl = el('table', null, 'scp-tech-table'), hr = tbl.insertRow();
                    [t('Driver', 'ไดรเวอร์'), t('Computers', 'เครื่อง'), t('Crashes', 'ครั้ง'), t('What to do', 'ควรทำ')].forEach(function (h) { hr.appendChild(el('th', h)); });
                    top.slice(0, 15).forEach(function (x) {
                        var r = tbl.insertRow();
                        r.insertCell().textContent = x.name; r.insertCell().textContent = x.nodes.length; r.insertCell().textContent = x.crashes;
                        r.insertCell().textContent = (driverHint(x.name) || '') + (x.nodes.length ? ' (' + x.nodes.slice(0, 5).join(', ') + (x.nodes.length > 5 ? '…' : '') + ')' : '');
                    });
                    pane.appendChild(tbl);
                }
                rows.sort(function (a, b) { return b.s.count - a.s.count; });
                pane.appendChild(el('h5', t('Computers with blue screens: ', 'เครื่องที่จอฟ้า: ') + rows.length));
                rows.forEach(function (x) {
                    var drv = Object.keys(x.s.drivers), codes = Object.keys(x.s.codes).map(function (c) { var b = bugInfo(c); return hex(c) + (b ? ' ' + b.name : ''); });
                    table.appendChild(nodeRow(x.n, '💥 ' + x.s.count, (drv.length ? drv.join(', ') + ' · ' : '') + codes.join(', '), x.s.count > 2 ? 'bad' : 'warn'));
                });
                if (powerRows.length) {
                    table.appendChild(el('h5', '🔌 ' + t('Sudden power loss twice or more: ', 'ไฟดับ/ปิดกะทันหัน 2 ครั้งขึ้นไป: ') + powerRows.length + t(' (check UPS / power supply)', ' เครื่อง (ตรวจ UPS / พาวเวอร์ซัพพลาย)')));
                    powerRows.sort(function (a, b) { return b.s.power - a.s.power; }).forEach(function (x) { table.appendChild(nodeRow(x.n, '🔌 ' + x.s.power, t('times without a proper shutdown', 'ครั้งที่เครื่องดับโดยไม่ได้ปิดตามปกติ'), 'warn')); });
                }
                if (!rows.length && have.length) table.appendChild(el('p', t('No blue screens on the computers read.', 'ไม่พบจอฟ้าในเครื่องที่อ่านแล้ว'), 'scp-health-note ok'));
            } else if (kind === 'ram') {
                var list = have.map(function (n) { var inv = result(n._id, 'inventory').data; return { n: n, ram: inv.ram, v: ramVerdict(inv.ram) }; }).filter(function (x) { return x.v; });
                var small = list.filter(function (x) { return x.ram.totalGb < 8; }).length;
                pane.appendChild(el('p', t('Under 8 GB: ', 'RAM ต่ำกว่า 8 GB: ') + small + ' / ' + list.length + t(' computers. Sorted by least RAM first.', ' เครื่อง · เรียงจาก RAM น้อยสุด'), 'scp-health-sum'));
                var need = {};
                list.sort(function (a, b) { return a.ram.totalGb - b.ram.totalGb; }).forEach(function (x) {
                    if (x.ram.totalGb < 8 && x.v.free > 0) { var k = (x.v.type || 'RAM') + ' ' + (x.v.form || ''); need[k] = (need[k] || 0) + 1; }
                    table.appendChild(nodeRow(x.n, x.ram.totalGb + ' GB · ' + x.v.used + '/' + x.v.slots, [x.v.type, x.v.form, x.v.speed ? x.v.speed + ' MHz' : '', x.v.maxGb ? 'max ' + x.v.maxGb + ' GB' : ''].filter(Boolean).join(' ') + ' — ' + x.v.advice, x.v.tone));
                });
                var keys = Object.keys(need);
                if (keys.length) pane.appendChild(el('p', t('To buy for computers under 8 GB with a free slot: ', 'ควรจัดซื้อสำหรับเครื่องต่ำกว่า 8 GB ที่มีช่องว่าง: ') + keys.map(function (k) { return k.trim() + ' × ' + need[k]; }).join(' · '), 'scp-health-note warn'));
            } else {
                var bats = have.map(function (n) { var inv = result(n._id, 'inventory').data; return { n: n, b: inv.battery, v: batteryVerdict(inv.battery) }; }).filter(function (x) { return x.v; });
                pane.appendChild(el('p', t('Laptops read: ', 'โน้ตบุ๊กที่อ่านได้: ') + bats.length + t(' · worn below 70%: ', ' เครื่อง · เสื่อมต่ำกว่า 70%: ') + bats.filter(function (x) { return x.v.health >= 0 && x.v.health < 70; }).length, 'scp-health-sum'));
                bats.sort(function (a, b) { return (a.v.health < 0 ? 999 : a.v.health) - (b.v.health < 0 ? 999 : b.v.health); }).forEach(function (x) {
                    table.appendChild(nodeRow(x.n, '🔋 ' + (x.v.health >= 0 ? x.v.health + '%' : '?'), x.v.text + (x.b.cycles >= 0 ? ' · ' + x.b.cycles + t(' cycles', ' รอบ') : ''), x.v.tone));
                });
            }
            pane.appendChild(table);
        }
        function installTab() {
            pane.appendChild(el('p', t('Choose the programs and the computers in the next window.', 'เลือกโปรแกรมและเครื่องในหน้าต่างถัดไป ติดตั้งพร้อมกันหลายเครื่องได้'), 'scp-health-hint'));
            pane.appendChild(btn('📦 ' + t('Choose programs and computers…', 'เลือกโปรแกรมและเครื่อง…'), 'scp-health-btn primary', function () { openInstall(all, overlay); }));
        }
        // Which computers have no working antivirus, or an old one that is not the one protecting them.
        function avTab() {
            var on = all.filter(online), going = on.filter(function (n) { var j = state(n._id, 'avscan'); return j && j.state !== 'done' && j.state !== 'failed'; });
            var have = all.filter(function (n) { return result(n._id, 'avscan'); });
            var bar = el('div', null, 'scp-tech-bar');
            var b = btn(going.length ? t('Reading… ', 'กำลังอ่าน… ') + (on.length - going.length) + ' / ' + on.length : t('Check antivirus on all online computers (', 'ตรวจแอนตี้ไวรัสทุกเครื่องที่ออนไลน์ (') + on.length + ')', 'scp-health-btn primary', function () { on.forEach(function (n) { run(n, 'avscan', ''); }); });
            b.disabled = !on.length || going.length > 0;
            bar.appendChild(b);
            bar.appendChild(el('span', t('Reading only. Uninstalling is done per computer, from its window (🧰 section).', 'อ่านอย่างเดียว การถอนทำทีละเครื่องจากหน้าต่างของเครื่องนั้น (ส่วน 🧰)') + ' · ' + t('kept for ', 'มีผลแล้ว ') + have.length + ' / ' + all.length, 'scp-health-hint'));
            pane.appendChild(bar);
            var rows = have.map(function (n) {
                var d = result(n._id, 'avscan').data, prods = d.products || [];
                var good = prods.some(function (p) { return p.on && !p.old; });
                var legacy = (d.entries || []).length;
                var def = d.defender || {};
                var bad = !good || (legacy && def.present && def.mode && def.mode !== 'Normal');
                return { n: n, d: d, good: good, legacy: legacy, bad: !!bad };
            }).sort(function (a, b) { return (b.bad - a.bad) || (b.legacy - a.legacy); });
            pane.appendChild(el('p', t('Without working protection: ', 'ไม่มีตัวป้องกันที่ใช้งานได้: ') + rows.filter(function (x) { return !x.good; }).length + ' / ' + rows.length + t(' computers read', ' เครื่องที่อ่านแล้ว'), 'scp-health-sum'));
            var table = el('div', null, 'scp-health-fleet');
            rows.forEach(function (x) {
                var names = (x.d.entries || []).map(function (e) { return e.name + (e.version ? ' ' + e.version : ''); }).join(', ');
                table.appendChild(nodeRow(x.n, x.good ? '✅' : '⚠️', (names ? names + ' · ' : '') + avDefenderText(x.d.defender), x.bad ? 'bad' : 'ok'));
            });
            pane.appendChild(table);
        }
        function lanTab() {
            var on = all.filter(online);
            var row = el('div', null, 'scp-tech-bar'), sel = el('select', null, 'scp-tech-input'), sub = el('input', null, 'scp-tech-input');
            on.sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (n) { var o = el('option', n.name + (n.ip ? ' (' + n.ip + ')' : '')); o.value = n._id; sel.appendChild(o); });
            try { var last = root.localStorage.getItem('scpTechLanFrom'); if (last) sel.value = last; } catch (e) { }
            sub.placeholder = t('Network, e.g. 192.168.2 (blank = its own)', 'วง เช่น 192.168.2 (ว่าง = วงของเครื่องนั้น)');
            row.appendChild(el('span', t('Scan from', 'สแกนจากเครื่อง'))); row.appendChild(sel); row.appendChild(sub);
            var go = btn(t('Scan', 'สแกน'), 'scp-health-btn primary', function () {
                var v = sub.value.trim().replace(/\.0(\/24)?$/, '');
                if (v && !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v)) { root.alert(t('Write the first three numbers, e.g. 192.168.2', 'ใส่เลข 3 ชุดแรก เช่น 192.168.2')); return; }
                var n = nodeById(sel.value); if (!n) return;
                try { root.localStorage.setItem('scpTechLanFrom', n._id); } catch (e) { }
                run(n, 'lan', v);
                paint();
            });
            go.disabled = !on.length;
            row.appendChild(go); pane.appendChild(row);
            pane.appendChild(el('p', t('Pings the 254 addresses of a /24 network, then reads names, MAC addresses and common ports (web, printer, camera, Windows). Takes about a minute; nothing is changed.', 'ping ทุกเลข 1–254 ในวง แล้วอ่านชื่อ MAC และพอร์ตที่ใช้บ่อย (เว็บ เครื่องพิมพ์ กล้อง Windows) ใช้เวลาราว 1 นาที ไม่เปลี่ยนแปลงอะไร'), 'scp-health-hint'));
            var id = sel.value, s = id && statusLine(id, 'lan'), r = id && result(id, 'lan');
            if (s) pane.appendChild(s);
            pane.appendChild(notInstalledView());
            if (r) pane.appendChild(lanView(r.data, r.at));
            sel.onchange = function () { try { root.localStorage.setItem('scpTechLanFrom', sel.value); } catch (e) { } paint(); };
        }
        function scpclearTab() {
            pane.appendChild(el('p', t('Put SCPclear (the IT officer\'s PC-care program) on computers, so staff or the technician can open it at the computer.', 'วาง SCPclear (โปรแกรมดูแลเครื่องของงาน IT) ไว้ในเครื่อง ให้ช่าง/ผู้ใช้เปิดใช้ที่หน้าเครื่องได้'), 'scp-health-hint'));
            var on = all.filter(online);
            var info = el('p', t('Checking the file on the server…', 'กำลังดูไฟล์บนเซิร์ฟเวอร์…'), 'scp-health-hint');
            pane.appendChild(info);
            fetch(domainUrl() + 'tools/scpclear.json', { credentials: 'same-origin', cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
                info.textContent = j ? 'SCPclear ' + j.version + ' · ' + Math.round(j.size / 1024) + ' KB · SHA-256 ' + String(j.sha256).slice(0, 16) + '…' : t('Not on the server yet: copy SCPclear.exe to public/tools and write scpclear.json.', 'ยังไม่มีไฟล์บนเซิร์ฟเวอร์: คัดลอก SCPclear.exe ไปที่ public/tools และสร้าง scpclear.json');
            }).catch(function () { });
            var bar = el('div', null, 'scp-tech-bar');
            bar.appendChild(btn(t('Send to all online computers (', 'ส่งไปทุกเครื่องที่ออนไลน์ (') + on.length + ')', 'scp-health-btn primary', function () { deploy(on); }));
            pane.appendChild(bar);
            var table = el('div', null, 'scp-health-fleet');
            all.forEach(function (n) {
                var j = state(n._id, 'deploy'), r = result(n._id, 'deploy');
                if (!j && !r) return;
                table.appendChild(nodeRow(n, j && j.state === 'failed' ? '❌' : (j && j.state !== 'done' ? '⏳' : '✅'), j && j.state === 'failed' ? j.error : (r ? when(r.at) : t('working…', 'กำลังส่ง…')), j && j.state === 'failed' ? 'bad' : 'ok'));
            });
            pane.appendChild(table);
            onChange(function () { if (!table.isConnected) return false; if (current === 'scpclear') schedule(); });
        }
        paint();
    }

    root.ScpTech = { syncWithServer: syncWithServer, receive: receive, section: section, openFleet: openFleet, openInstall: openInstall, deploy: deploy, run: run, state: state, result: result, results: results, busy: busy,
        notInstalled: notInstalled, bugInfo: bugInfo, driverHint: driverHint, crashSummary: crashSummary, ramVerdict: ramVerdict, batteryVerdict: batteryVerdict, lanKind: lanKind, wingetText: wingetText, WINGET_ID: WINGET_ID, CATALOG: CATALOG, overlay: null };
})(window);
