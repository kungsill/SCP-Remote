/* SCP-Remote dashboard: one screen showing every computer, what it is doing, what looks
   risky on it, and the two actions IT needs most — take over, or shut it down. */
(function () {
    'use strict';
    var thai = document.documentElement.lang === 'th';
    var texts = {
        title: ['Dashboard', 'แดชบอร์ด'],
        eyebrow: ['SCP-REMOTE / OVERVIEW', 'SCP-REMOTE / ภาพรวม'],
        intro: ['Every computer in one place. Check status, spot risks, then take over or shut down.', 'ดูคอมพิวเตอร์ทุกเครื่องในที่เดียว ตรวจสถานะ เห็นความเสี่ยง แล้วเข้าไปแก้หรือสั่งปิดได้ทันที'],
        total: ['Computers', 'เครื่องทั้งหมด'],
        online: ['Powered on', 'เปิดอยู่'],
        busy: ['In use', 'กำลังใช้งาน'],
        idle: ['Idle', 'ว่าง'],
        offline: ['Offline', 'ปิด / ไม่ติดต่อ'],
        risky: ['Need attention', 'ต้องดูแล'],
        byRoom: ['By room', 'แยกตามห้อง'],
        room: ['Room', 'ห้อง'],
        devices: ['Computers', 'เครื่อง'],
        allDevices: ['All rooms', 'ทุกห้อง'],
        nameCol: ['Computer', 'เครื่อง'],
        statusCol: ['Status', 'สถานะ'],
        userCol: ['Signed in', 'ผู้ใช้'],
        riskCol: ['Attention', 'สิ่งที่ต้องดู'],
        actionCol: ['Actions', 'สั่งงาน'],
        remote: ['Remote', 'รีโมต'],
        services: ['Services', 'เซอร์วิส'],
        shutdown: ['Shut down', 'ปิดเครื่อง'],
        scan: ['Check programs', 'ตรวจโปรแกรม'],
        refresh: ['Refresh', 'รีเฟรช'],
        none: ['Nothing to flag', 'ไม่พบสิ่งผิดปกติ'],
        avProblem: ['Windows reports this computer is not protected', 'Windows รายงานว่าเครื่องนี้ไม่ได้รับการป้องกัน'],
        avPassive: ['idle', 'ตัวที่พักอยู่'],
        diskFree: ['C: {0} GB free ({1}%)', 'C: ว่าง {0} GB ({1}%)'],
        empty: ['No computers yet. Install the agent on a computer to see it here.', 'ยังไม่มีเครื่องในระบบ ติดตั้งเอเจนต์บนเครื่องลูกแล้วจะขึ้นที่นี่'],
        noUser: ['No one signed in', 'ไม่มีผู้ใช้ล็อกอิน'],
        confirmOff: ['Shut down this computer now?', 'สั่งปิดเครื่องนี้เดี๋ยวนี้หรือไม่?'],
        offlineAction: ['This computer is not connected.', 'เครื่องนี้ไม่ได้เชื่อมต่ออยู่'],
        scanning: ['Checking installed programs…', 'กำลังตรวจโปรแกรมที่ติดตั้ง…'],
        scanDone: ['Programs checked', 'ตรวจโปรแกรมแล้ว'],
        programList: ['Open the list', 'ดูรายการ / ถอดออก'],
        scanFail: ['Could not read the program list', 'อ่านรายการโปรแกรมไม่ได้'],
        scanClean: ['No watched programs found', 'ไม่พบโปรแกรมที่เฝ้าระวัง'],
        programs: ['programs', 'โปรแกรม'],
        avOff: ['Antivirus turned off', 'แอนติไวรัสถูกปิด'],
        avOld: ['Virus signatures out of date', 'ฐานข้อมูลไวรัสเก่า'],
        firewallOff: ['Firewall not protecting', 'ไฟร์วอลล์ไม่ทำงาน'],
        firewallUnknown: ['Firewall state not reported yet', 'ยังตรวจสถานะไฟร์วอลล์ไม่ได้'],
        updateOff: ['Windows Update not protecting', 'Windows Update ไม่ทำงาน'],
        rebootDue: ['Waiting for a restart', 'รอการรีสตาร์ต'],
        uptimeLong: ['Not restarted for {0} days', 'ไม่ได้รีสตาร์ตมา {0} วัน'],
        watched: ['Watched program: {0}', 'โปรแกรมเฝ้าระวัง: {0}'],
        days: ['days', 'วัน'],
        roomEmpty: ['No computers in this room yet. Install the agent, or move a computer here.', 'ห้องนี้ยังไม่มีเครื่อง ติดตั้งเอเจนต์เพิ่ม หรือย้ายเครื่องเข้ามาได้'],
        scanBusy: ['A program check is already running. Wait for it to finish.', 'กำลังตรวจโปรแกรมของอีกเครื่องอยู่ กรุณารอให้เสร็จก่อน'],
        liveCol: ['Screen', 'หน้าจอ'],
        search: ['Search a computer, a person, an address', 'ค้นหาชื่อเครื่อง ชื่อผู้ใช้ หรือ IP'],
        searchNone: ['Nothing matched “{0}”.', 'ไม่พบอะไรที่ตรงกับ “{0}”'],
        specsCol: ['Specification', 'สเปกเครื่อง'],
        specsWait: ['Reading…', 'กำลังอ่าน…'],
        diskLow: ['Disk {0} is {1}% free', 'ดิสก์ {0} เหลือ {1}%'],
        diskFull: ['Disk {0} almost full — {1}% free', 'ดิสก์ {0} ใกล้เต็ม เหลือ {1}%'],
        rebootPending: ['Waiting for a restart to finish updates', 'รอรีสตาร์ตเพื่อให้อัปเดตเสร็จ'],
        rebootPendingFiles: ['Waiting for a restart to replace files in use', 'รอรีสตาร์ตเพื่อแทนที่ไฟล์ที่ถูกใช้งานอยู่'],
        driverFault: ['{0}: {1}', '{0}: {1}'],
        driverMore: ['and {0} more devices', 'และอีก {0} อุปกรณ์'],
        fault28: ['no driver installed', 'ยังไม่ได้ติดตั้งไดรเวอร์'],
        fault10: ['cannot start', 'เริ่มอุปกรณ์ไม่ได้'],
        fault1: ['not configured correctly', 'ตั้งค่าไม่ถูกต้อง'],
        fault43: ['stopped by Windows after a fault', 'Windows หยุดอุปกรณ์เพราะมีปัญหา'],
        fault31: ['not working properly', 'ทำงานไม่ถูกต้อง'],
        fault12: ['not enough resources', 'ทรัพยากรไม่พอ'],
        fault18: ['drivers need reinstalling', 'ต้องติดตั้งไดรเวอร์ใหม่'],
        fault19: ['registry entry damaged', 'ข้อมูลใน registry เสียหาย'],
        faultOther: ['driver problem (code {0})', 'ไดรเวอร์มีปัญหา (รหัส {0})'],
        fixDrivers: ['Install drivers', 'ติดตั้งไดรเวอร์'],
        fixAll: ['Install drivers on all {0} computers', 'ติดตั้งไดรเวอร์ทั้ง {0} เครื่อง'],
        fixAsk: ['Install missing drivers on {0}?\n\nWindows will look for drivers and install what it finds. It can take several minutes. The computer will NOT be restarted — if a restart is needed, the dashboard will say so afterwards.\n\nThe person using it can carry on working.', 'สั่งติดตั้งไดรเวอร์ที่ขาดบน {0} ใช่ไหม\n\nWindows จะค้นหาไดรเวอร์แล้วติดตั้งที่หาเจอ อาจใช้เวลาหลายนาที\n\nระบบจะไม่รีสตาร์ตเครื่องให้ ถ้าต้องรีสตาร์ต แดชบอร์ดจะบอกทีหลัง คนที่ใช้เครื่องอยู่ทำงานต่อได้ตามปกติ'],
        fixAskMany: ['{0} computers', '{0} เครื่อง'],
        fixWorking: ['Installing drivers…', 'กำลังติดตั้งไดรเวอร์…'],
        fixOffline: ['{0} is switched off, so it was skipped.', '{0} ปิดอยู่ จึงข้ามไป'],
        fixSent: ['Sent to {0} computers. This takes a few minutes.', 'สั่งไปแล้ว {0} เครื่อง ใช้เวลาสักครู่'],
        fixAwaiting: ['Command sent. The computer has not answered yet.', 'ส่งคำสั่งแล้ว ยังไม่มีคำตอบจากเครื่อง'],
        fixDone: ['Drivers installed. {0}', 'ติดตั้งไดรเวอร์แล้ว {0}'],
        fixNothing: ['Windows had no drivers to offer for this computer.', 'Windows ไม่มีไดรเวอร์ให้สำหรับเครื่องนี้'],
        fixReboot: ['Finished, but this computer needs restarting.', 'เสร็จแล้ว แต่เครื่องนี้ต้องรีสตาร์ต'],
        fixFailed: ['Could not finish: {0}', 'ทำไม่สำเร็จ: {0}'],
        fixTimeout: ['No answer after 15 minutes. It may still be working — check again later.', 'ไม่ตอบกลับภายใน 15 นาที อาจยังทำงานอยู่ ลองดูใหม่ภายหลัง'],
        exportCsv: ['Export inventory', 'ออกรายการครุภัณฑ์'],
        exportNone: ['No specifications have been read yet. Open the page for a moment and try again.', 'ยังไม่ได้อ่านสเปกเครื่องเลย เปิดหน้านี้ทิ้งไว้สักครู่แล้วลองใหม่'],
        exportDone: ['Saved {0} computers.', 'บันทึกแล้ว {0} เครื่อง'],
        mostUsed: ['Powered on longest, by department', 'เปิดใช้งานนานที่สุด แยกตามหน่วยงาน'],
        hoursTotal: ['{0} hrs on', 'เปิดอยู่ {0} ชม.'],
        rankingNote: ['Total hours each computer was powered on over the last {0} days. {1} are left out — those computers are left on around the clock on purpose.', 'รวมเวลาที่เครื่องเปิดอยู่ ย้อนหลัง {0} วัน ไม่นับ {1} เพราะตั้งใจเปิดทิ้งไว้ตลอดอยู่แล้ว'],
        rankingThin: ['only {0} days of history so far', 'เพิ่งมีประวัติ {0} วัน ยังเทียบไม่เต็มที่'],
        rankingYoung: ['less than a day of history', 'เพิ่งมีประวัติไม่ถึงวัน'],
        rankingWait: ['Reading usage history…', 'กำลังอ่านประวัติการใช้งาน…'],
        rankingNone: ['No usage history yet. It builds up as the computers stay connected.', 'ยังไม่มีประวัติการใช้งาน ข้อมูลจะสะสมขึ้นเองเมื่อเครื่องเชื่อมต่ออยู่'],
        awayDays: ['Not seen for {0} days', 'ไม่ติดต่อมา {0} วัน'],
        awayNever: ['Never connected since it was added', 'ไม่เคยเชื่อมต่อเลยตั้งแต่เพิ่มเข้ามา'],
        attention: ['Needs attention', 'ต้องดูแล'],
        attentionCount: ['{0} computers need attention', '{0} เครื่องต้องดูแล'],
        attentionOne: ['1 computer needs attention', '1 เครื่องต้องดูแล'],
        attentionNone: ['Nothing needs attention right now.', 'ตอนนี้ไม่มีเรื่องต้องดูแล'],
        attentionGo: ['Open', 'เปิด'],
        weekChart: ['Last 7 days', '7 วันล่าสุด'],
        weekHours: ['{0}: on {1} hrs', '{0}: เปิด {1} ชม.'],
        exportUsage: ['Export usage', 'ออกรายงานการใช้งาน'],
        exportUsageNone: ['No usage history has arrived yet. Open the page for a moment and try again.', 'ยังไม่ได้รับประวัติการใช้งาน เปิดหน้านี้ทิ้งไว้สักครู่แล้วลองใหม่'],
        pickRooms: ['Show', 'เลือกดู'],
        everyRoom: ['Everywhere', 'ทุกที่'],
        roomHidden: ['Not selected', 'ไม่ได้เลือก'],
        liveOn: ['Show screens', 'เปิดดูภาพหน้าจอ'],
        liveOff: ['Hide screens', 'ปิดภาพหน้าจอ'],
        liveConnecting: ['Connecting…', 'กำลังเชื่อมต่อ…'],
        liveEnded: ['Picture stopped', 'ภาพหยุดแล้ว'],
        liveRetry: ['Try again', 'ลองใหม่'],
        liveOffline: ['Computer is off', 'เครื่องปิดอยู่'],
        liveWaiting: ['Not shown', 'ยังไม่แสดง'],
        liveOpen: ['Click the picture to take over this computer', 'คลิกที่ภาพเพื่อเข้าควบคุมเครื่องนี้'],
        liveShot: ['Save a full-size picture of this screen', 'บันทึกภาพหน้าจอนี้แบบความละเอียดเต็ม'],
        liveShooting: ['Fetching the full-size picture…', 'กำลังขอภาพความละเอียดเต็ม…'],
        liveFull: ['Showing {0} screens at once. Turn the rest off, or open one room at a time, to see the others.', 'แสดงได้ครั้งละ {0} จอ ปิดบางเครื่องหรือดูทีละห้อง เพื่อดูเครื่องที่เหลือ'],
        liveNoSupport: ['This browser cannot show live screens.', 'เบราว์เซอร์นี้แสดงภาพหน้าจอสดไม่ได้'],
        consentPrompt: ['Each computer asks the person sitting at it first. The picture starts only after they allow it.', 'เครื่องปลายทางจะถามผู้ใช้ก่อน ภาพจะเริ่มก็ต่อเมื่อผู้ใช้กดอนุญาตเท่านั้น'],
        consentBar: ['While you watch, a bar on that computer says its screen is being shared.', 'ระหว่างที่ดู เครื่องปลายทางจะขึ้นแถบบอกว่าหน้าจอกำลังถูกดูอยู่'],
        consentNotify: ['While you watch, that computer shows a notice that its screen is being viewed.', 'ระหว่างที่ดู เครื่องปลายทางจะขึ้นแจ้งเตือนว่าหน้าจอกำลังถูกดู'],
        consentSilent: ['Nothing appears on the computer being watched. Staff should be told in writing that screens may be viewed.', 'เครื่องปลายทางจะไม่ขึ้นอะไรเลย ควรแจ้งเจ้าหน้าที่เป็นลายลักษณ์อักษรไว้ว่าหน้าจออาจถูกดู']
    };
    function t(key) { var entry = texts[key]; return entry ? entry[thai ? 1 : 0] : key; }
    // Fills {0}, {1}, … so a sentence can carry more than one value.
    function format(value) {
        var args = Array.prototype.slice.call(arguments, 1);
        return String(value).replace(/\{(\d+)\}/g, function (whole, index) {
            return (args[index] === undefined) ? whole : args[index];
        });
    }

    /* Programs the hospital wants to know about when they appear on a computer.
       Match is a lowercase substring of the program name. Edit this list to suit.

       Remote-management tools lead the list because that is how intrusions of this kind
       actually run: rather than writing malware, an attacker installs a legitimate,
       signed remote-control product, which antivirus has no reason to stop and which
       looks like ordinary IT work. A Thai broadband provider was taken this way in 2026
       using MeshCentral — the same product this system is built on.

       One limitation to know: our own agent installs under the name "Mesh Agent", so a
       rogue MeshCentral agent on a ward computer cannot be told apart from ours by name
       alone. What separates them is the server each one reports to, which is written in
       the .msh file beside the agent and is not visible in a list of installed programs.
       "meshcentral" below catches the server being installed somewhere it should not be,
       which is the step that matters most. */
    var watchlist = [
        // Remote control and remote management
        'teamviewer', 'anydesk', 'ultraviewer', 'ammyy', 'radmin', 'supremo',
        'vnc', 'logmein', 'splashtop', 'rustdesk', 'dwservice', 'gotoassist',
        'remote utilities', 'chrome remote desktop', 'meshcentral',
        'screenconnect', 'connectwise', 'atera', 'syncro', 'action1',
        'ninjaone', 'ninjarmm', 'pulseway', 'level.io', 'kaseya',
        // Tunnels that carry traffic out past the hospital firewall
        'hamachi', 'ngrok', 'zerotier', 'tailscale', 'cloudflared', 'playit',
        // File sharing
        'utorrent', 'bittorrent', 'qbittorrent', 'thunder', 'tor browser'
    ];
    /* A computer with no keyboard or mouse activity for this long counts as idle
       rather than in use. */
    var idleSeconds = 300;
    var staleSignatureDays = 7;
    var longUptimeDays = 14;

    var activeView = 'overview', attentionExpanded = false;
    var panel, body, scanState = {}, pending = null, timer = null;

    /* Driver installs in flight, keyed by the id we sent with the command so a reply can
       never be credited to the wrong computer. Unlike the software scan these may run on
       several machines at once, because each is a separate job on a separate agent. */
    var fixing = {}, fixTicket = 0;
    var liveToggle = null, liveHint = null, liveNote = null;

    /* Live screen tiles. Small, slow and look-only: no mouse or keyboard handler is
       ever attached to these canvases, so a tile cannot touch the computer it shows.
       Watching starts only when someone presses the button, and never resumes by
       itself on a later visit. */
    var tiles = {}, liveOn = false, liveSkipped = 0;

    /* Which rooms to show. Null means all of them. Kept in the browser because it is a
       way of looking at the page, not an action: it opens nothing on its own, and the
       buttons above the list say plainly what is being left out. */
    var roomFilter = null;

    /* What each computer is made of, as the agent already reported it to the server.
       Asked for once per computer per visit and kept here; nothing is collected that
       the server does not already hold. */
    var specs = {}, specsAsked = {}, listening = false, searchText = '';

    /* How long each computer has been powered on, and when each was last heard from.
       Both come from what the server already recorded; nothing extra is asked of the
       computers themselves. */
    var timelines = {}, timelinesAsked = {}, lastSeen = null, lastSeenAsked = false;

    /* Departments left out of the ranking. Their computers are left running around the
       clock on purpose, so hours powered on says nothing useful about them and they
       would win every day. */
    var departmentsNotRanked = ['ทดสอบ', 'ห้องสารสนเทศ'];
    var rankingDays = 7, awayWarnDays = 7;
    var diskWarnPercent = 15, diskCriticalPercent = 8;
    var liveLimit = 12;
    var liveSettings = { encoding: 4, quality: 40, scaling: 384, framerate: 1000 };
    // Used for a single frame when someone saves a picture, then dropped again.
    var liveCapture = { encoding: 4, quality: 100, scaling: 1024 };

    function element(tag, className, text) {
        var item = document.createElement(tag);
        if (className) item.className = className;
        if (text != null) item.textContent = text;
        return item;
    }
    function button(label, className, click) {
        var item = element('button', className, label);
        item.type = 'button';
        item.addEventListener('click', click);
        return item;
    }
    function isOnline(node) { return (node.conn & 1) !== 0; }
    function signedInUser(node) {
        var users = node.users || [];
        if (!users.length) return '';
        return String(users[0]).split('\\').pop();
    }
    function isBusy(node) {
        return isOnline(node) && signedInUser(node) !== '' && typeof node.idletime === 'number' && node.idletime < idleSeconds;
    }
    // The agent reports this as a WMI timestamp such as 20260913205104.000000+000.
    function signatureAge(node) {
        var stamp = node.defender && node.defender.AntivirusSignatureLastUpdated;
        if (typeof stamp !== 'string' || stamp.length < 14) return null;
        var when = new Date(
            Number(stamp.substring(0, 4)), Number(stamp.substring(4, 6)) - 1, Number(stamp.substring(6, 8)),
            Number(stamp.substring(8, 10)), Number(stamp.substring(10, 12)), Number(stamp.substring(12, 14))
        );
        if (isNaN(when.getTime())) return null;
        return Math.floor((Date.now() - when.getTime()) / 86400000);
    }
    function daysSince(milliseconds) {
        if (!milliseconds) return null;
        return Math.floor((Date.now() - milliseconds) / 86400000);
    }
    // Everything here comes from what the agent already reports, so the list is accurate
    // the moment a computer connects; no extra query is needed.
    function risksOf(node) {
        var found = [];
        // Windows runs one real-time antivirus at a time and puts any second product
        // installed beside it into passive mode on purpose. A product reading as disabled is
        // therefore not the fault by itself; what decides it is whether Windows concludes the
        // computer is unprotected. Flagging the passive one asks somebody to go and "fix" a
        // machine that was never broken.
        var products = (node.av || []).filter(Boolean);
        var guarding = products.filter(function (p) { return p.enabled === true; });
        var passive = products.filter(function (p) { return p.enabled === false; });
        var named = passive.map(function (p) { return p.product || ''; }).filter(Boolean).join(', ');
        var verdict = (node.wsc || {}).antiVirus;
        if (verdict && verdict !== 'OK' && verdict !== 'UNKNOWN') {
            found.push({ level: 'high', text: t('avProblem') + (named ? ' (' + t('avPassive') + ': ' + named + ')' : '') });
        } else if (!guarding.length && passive.length) {
            found.push({ level: 'high', text: t('avOff') + ': ' + named });
        }
        var age = signatureAge(node);
        if (age != null && age > staleSignatureDays) { found.push({ level: 'warn', text: t('avOld') + ' (' + age + ' ' + t('days') + ')' }); }
        if (node.wsc) {
            // Windows Security Center answers UNKNOWN while it is still working the answer
            // out, which is ordinary in the minutes after a restart. Announcing an unprotected
            // firewall then is a false alarm, and false alarms are how a panel stops being read.
            if (node.wsc.firewall && node.wsc.firewall !== 'OK') {
                found.push((node.wsc.firewall === 'UNKNOWN')
                    ? { level: 'warn', text: t('firewallUnknown') }
                    : { level: 'high', text: t('firewallOff') });
            }
            if (node.wsc.autoUpdate && node.wsc.autoUpdate !== 'OK' && node.wsc.autoUpdate !== 'UNKNOWN') found.push({ level: 'warn', text: t('updateOff') });
        }
        var uptime = daysSince(node.lastbootuptime);
        if (uptime != null && uptime > longUptimeDays) { found.push({ level: 'warn', text: format(t('uptimeLong'), uptime) }); }
        disksOf(node).forEach(function (disk) {
            if (disk.percent <= diskCriticalPercent) { found.push({ level: 'high', text: format(t('diskFull'), disk.letter, disk.percent) }); }
            else if (disk.percent <= diskWarnPercent) { found.push({ level: 'warn', text: format(t('diskLow'), disk.letter, disk.percent) }); }
        });
        var away = daysAway(node);
        if (away === -1) { found.push({ level: 'warn', text: t('awayNever') }); }
        else if ((away != null) && (away >= awayWarnDays)) { found.push({ level: 'warn', text: format(t('awayDays'), away) }); }
        var record = specs[node._id];
        // win-info reports the reasons as a list, and an empty list is still truthy, so a
        // computer with nothing pending used to be told it was waiting on a restart -- and
        // restarting it could not clear the message, because the message was never about it.
        var pending = record && record.pendingReboot;
        var reasons = Array.isArray(pending) ? pending : (pending ? [String(pending)] : []);
        if (reasons.length) {
            // Nearly all of these are a file waiting to be replaced, which any installer can
            // leave behind. Calling that an unfinished update is untrue, and a panel that
            // says untrue things is one people learn to scroll past.
            var updating = reasons.some(function (why) { return /update/i.test(why); });
            found.push({ level: 'warn', text: updating ? t('rebootPending') : t('rebootPendingFiles') });
        }
        faultsOf(node).forEach(function (fault) { found.push(fault); });
        var scan = scanState[node._id];
        if (scan && scan.hits) { scan.hits.forEach(function (name) { found.push({ level: 'high', text: format(t('watched'), name) }); }); }
        return found;
    }
    function roomOf(node) {
        var mesh = window.meshes ? window.meshes[node.meshid] : null;
        return mesh && mesh.name ? mesh.name : t('allDevices');
    }
    function allNodes() {
        var list = window.nodes;
        if (!list) return [];
        return Array.isArray(list) ? list.slice() : [];
    }

    function loadRoomFilter() {
        try {
            var saved = JSON.parse(localStorage.getItem('scpDashRooms') || 'null');
            if (Array.isArray(saved) && saved.length) { roomFilter = saved; }
        } catch (error) { /* a private window, or storage turned off */ }
    }
    function saveRoomFilter() {
        try {
            if (roomFilter && roomFilter.length) { localStorage.setItem('scpDashRooms', JSON.stringify(roomFilter)); }
            else { localStorage.removeItem('scpDashRooms'); }
        } catch (error) { /* nothing here is worth failing over */ }
    }
    function roomShown(name) { return (roomFilter == null) || (roomFilter.indexOf(name) >= 0); }

    function toggleRoom(name, everyRoom) {
        if (roomFilter == null) {
            // Nothing is narrowed yet, so picking a room out of a list means "this one",
            // not "all of them except this one".
            roomFilter = [name];
        } else {
            var at = roomFilter.indexOf(name);
            if (at >= 0) { roomFilter.splice(at, 1); } else { roomFilter.push(name); }
        }
        // Showing nothing at all is never what someone meant, and neither is a list of
        // every room: both mean the same as no filter.
        if ((roomFilter.length === 0) || (roomFilter.length === everyRoom.length)) { roomFilter = null; }
        saveRoomFilter();
        render();
    }

    function roomChips(everyRoom, counts) {
        var bar = element('div', 'scp-dash-rooms');
        bar.appendChild(element('span', 'scp-dash-rooms-label', t('pickRooms')));
        var all = button(t('everyRoom'), 'scp-dash-chip' + ((roomFilter == null) ? ' on' : ''), function () {
            roomFilter = null; saveRoomFilter(); render();
        });
        bar.appendChild(all);
        everyRoom.forEach(function (name) {
            // Lit only when it is the reason something is being left out. With no choice
            // made, "everywhere" is the lit one and the rooms read as available.
            var on = (roomFilter != null) && (roomFilter.indexOf(name) >= 0);
            var chip = button(name + '  ' + (counts[name] || 0), 'scp-dash-chip' + (on ? ' on' : ''), function () { toggleRoom(name, everyRoom); });
            chip.setAttribute('aria-pressed', on ? 'true' : 'false');
            bar.appendChild(chip);
        });
        return bar;
    }

    // One line per department, naming the computer that has been powered on longest.
    // Departments that run their computers overnight on purpose are left out rather than
    // allowed to win every day.
    function usageRanking(rooms, shownRooms) {
        var panelEl = element('section', 'scp-dash-rank');
        var head = element('div', 'scp-dash-rank-head');
        head.appendChild(element('h3', '', t('mostUsed')));
        head.appendChild(element('span', 'scp-dash-rank-note',
            format(t('rankingNote'), rankingDays, departmentsNotRanked.join(' · '))));
        panelEl.appendChild(head);

        var rows = element('div', 'scp-dash-rank-rows'), drawn = 0, best = 0;
        var ranked = shownRooms.filter(function (room) { return departmentsNotRanked.indexOf(room) < 0; })
            .map(function (room) {
                var top = null;
                (rooms[room] || []).filter(matchesSearch).forEach(function (node) {
                    var use = usageOf(node);
                    if (use && (!top || (use.hours > top.use.hours))) { top = { node: node, use: use }; }
                });
                return top ? { room: room, node: top.node, use: top.use } : null;
            }).filter(Boolean);

        // Bars are drawn against the busiest computer on show, not against 24 hours, so
        // that the difference between departments is what the eye picks up.
        ranked.forEach(function (entry) { if (entry.use.hours > best) { best = entry.use.hours; } });
        ranked.sort(function (a, b) { return b.use.hours - a.use.hours; });

        ranked.forEach(function (entry) {
            drawn++;
            var row = element('div', 'scp-dash-rank-row');
            row.appendChild(element('span', 'scp-dash-rank-room', entry.room));
            row.appendChild(element('span', 'scp-dash-rank-name', entry.node.name || ''));
            var hours = element('span', 'scp-dash-rank-hours', format(t('hoursTotal'), entry.use.hours.toFixed(1)));
            // Say so when a total rests on less history than a full window, so a computer
            // that was only added this week is not read as an idle one.
            if (entry.use.days < (rankingDays - 0.5)) {
                hours.title = (entry.use.days < 1)
                    ? t('rankingYoung')
                    : format(t('rankingThin'), Math.round(entry.use.days));
                hours.appendChild(element('em', '', ' *'));
            }
            row.appendChild(hours);
            var bar = element('div', 'scp-dash-rank-bar');
            var fill = element('span', '');
            fill.style.width = (best > 0 ? Math.max(3, Math.round((entry.use.hours / best) * 100)) : 0) + '%';
            bar.appendChild(fill);
            row.appendChild(bar);
            var week = weekBars(entry.node);
            if (week) { row.appendChild(week); }
            rows.appendChild(row);
        });

        if (!drawn) {
            var answered = Object.keys(timelines).length > 0;
            rows.appendChild(element('div', 'scp-dash-note', t(answered ? 'rankingNone' : 'rankingWait')));
        }
        panelEl.appendChild(rows);
        return panelEl;
    }

    /* Everything that needs doing, in one place at the top. The same findings already
       appear on each computer's own row, but a person looking after a hospital single
       handed should not have to scan sixty rows to discover there are three jobs today.
       Sorted worst first, and each line opens the computer it is about. */
    function attentionPanel(list) {
        var panelEl = element('section', 'scp-dash-attention');
        var flagged = [];
        list.forEach(function (node) {
            var risks = risksOf(node);
            if (!risks.length) return;
            var worst = risks.some(function (r) { return r.level === 'high'; }) ? 'high' : 'warn';
            flagged.push({ node: node, risks: risks, worst: worst });
        });
        flagged.sort(function (a, b) {
            if (a.worst !== b.worst) { return (a.worst === 'high') ? -1 : 1; }
            if (b.risks.length !== a.risks.length) { return b.risks.length - a.risks.length; }
            return String(a.node.name || '').localeCompare(String(b.node.name || ''));
        });

        var head = element('div', 'scp-dash-attention-head');
        head.appendChild(element('h3', '', t('attention')));
        head.appendChild(element('span', 'scp-dash-attention-count', flagged.length
            ? ((flagged.length === 1) ? t('attentionOne') : format(t('attentionCount'), flagged.length))
            : t('attentionNone')));
        // One press for every computer missing a driver, since they are usually missing
        // the same one — a room of machines imaged from the same disk.
        var faulty = flagged.map(function (entry) { return entry.node; })
            .filter(function (node) { return faultsOf(node).length && isOnline(node); });
        if (faulty.length > 1) {
            head.appendChild(button(format(t('fixAll'), faulty.length), 'scp-dash-fix-all',
                function () { fixDrivers(faulty); }));
        }
        // One press for the guards that are simply switched off. Safe on every machine, so it
        // runs on all the flagged ones at once and never on the risky problems beside them.
        if (window.ScpCare) {
            var careable = flagged.map(function (entry) { return entry.node; }).filter(isOnline);
            if (careable.length) { head.appendChild(button(t('Safe auto-care', 'ดูแลอัตโนมัติ (ปลอดภัย)'), 'scp-dash-fix-all', function () { window.ScpCare.run(careable); })); }
        }
        panelEl.appendChild(head);
        if (!flagged.length) { panelEl.className += ' scp-dash-attention-clear'; return panelEl; }

        var rows = element('div', 'scp-dash-attention-rows');
        flagged.forEach(function (entry, index) {
            var row = element('div', 'scp-dash-attention-row scp-dash-attention-' + entry.worst);
            row.hidden = !attentionExpanded && index >= 5;
            var who = element('div', 'scp-dash-attention-who');
            who.appendChild(element('strong', '', entry.node.name || ''));
            who.appendChild(element('small', '', roomOf(entry.node)));
            row.appendChild(who);
            var what = element('div', 'scp-dash-attention-what');
            entry.risks.forEach(function (risk) {
                // The same chip the computer's own row uses, so one finding looks the same
                // wherever it is read.
                what.appendChild(element('span', 'scp-dash-flag ' + risk.level, risk.text));
            });
            row.appendChild(what);
            var state = fixing[entry.node._id];
            if (state) {
                what.appendChild(element('span', 'scp-dash-fix-state scp-dash-fix-' + state.state,
                    state.text || t('fixWorking')));
            }
            if(state&&state.progress&&window.ScpProgress)what.appendChild(ScpProgress.view(state.progress,'driver',state.started));
            var buttons = element('div', 'scp-dash-attention-buttons');
            // Only offered where it is the right tool: a computer with a driver Windows
            // cannot start. It is never offered as a general fix for anything else wrong.
            if (faultsOf(entry.node).length && (!state || (state.state !== 'working'))) {
                buttons.appendChild(button(t('fixDrivers'), 'scp-dash-fix-go', function () { fixDrivers([entry.node]); }));
            }
            if (state) {
                buttons.appendChild(button(document.documentElement.lang === 'th' ? 'ล้างงานค้าง' : 'Clear', 'scp-dash-attention-go', function () { clearDriverJob(entry.node); }));
            }
            buttons.appendChild(button(t('attentionGo'), 'scp-dash-attention-go', function () { openRemote(entry.node); }));
            row.appendChild(buttons);
            rows.appendChild(row);
        });
        panelEl.appendChild(rows);
        if (flagged.length > 5) panelEl.appendChild(button(attentionExpanded ? (thai ? 'ย่อรายการ' : 'Show less') : (thai ? 'ดูทั้งหมด ' + flagged.length + ' เครื่อง' : 'View all ' + flagged.length + ' devices'), 'scp-dash-expand', function () { attentionExpanded = !attentionExpanded; render(); }));
        return panelEl;
    }

    /* One small column per day for the past week, so the shape of a department's week is
       readable at a glance: which wards run at weekends, which day went wrong. Drawn
       against a full day, because the question here is how much of each day was used,
       not how this computer compares to another. */
    function weekBars(node) {
        var days = hoursByDay(node, rankingDays);
        if (!days) return null;
        var chart = element('div', 'scp-dash-week');
        chart.setAttribute('aria-label', t('weekChart'));
        days.forEach(function (entry) {
            var column = element('span', 'scp-dash-week-day' + ((entry.hours == null) ? ' scp-dash-week-blank' : ''));
            if (entry.hours != null) {
                var fill = element('i', '');
                fill.style.height = Math.max(4, Math.round((entry.hours / 24) * 100)) + '%';
                column.appendChild(fill);
                column.title = format(t('weekHours'), dayName(entry.day), entry.hours.toFixed(1));
            }
            chart.appendChild(column);
        });
        return chart;
    }

    function dayName(date) {
        try { return date.toLocaleDateString(thai ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
        catch (error) { return date.toDateString(); }
    }

    function stat(label, value, tone) {
        var card = element('div', 'scp-dash-stat' + (tone ? ' scp-dash-' + tone : ''));
        card.appendChild(element('div', 'scp-dash-stat-value', String(value)));
        card.appendChild(element('div', 'scp-dash-stat-label', label));
        return card;
    }

    function actionCell(node) {
        var cell = element('div', 'scp-dash-actions');
        cell.appendChild(button(t('remote'), 'scp-dash-go', function () { openRemote(node); }));
        cell.appendChild(button(t('scan'), 'scp-dash-scan', function () { scan(node); }));
        if (window.ScpMonitor) cell.appendChild(button(document.documentElement.lang==='th'?'สถานะเครื่อง / Task Manager':'Monitor / Task Manager','scp-dash-scan',function(){window.ScpMonitor.open(node);}));
        if (window.ScpCleanup) cell.appendChild(window.ScpCleanup.control(node));
        if (window.ScpServices) cell.appendChild(button(t('services'), 'scp-dash-scan', function () {
            if (!isOnline(node)) { window.alert(t('offlineAction')); return; }
            window.ScpServices.open(node);
        }));
        if (fixing[node._id]) { cell.appendChild(element('small', 'scp-dash-note', fixing[node._id].text || t('fixWorking'))); if(window.ScpProgress&&fixing[node._id].progress)cell.appendChild(ScpProgress.view(fixing[node._id].progress,'driver')); }
        cell.appendChild(button(t('shutdown'), 'scp-dash-off', function () {
            if (!isOnline(node)) { window.alert(t('offlineAction')); return; }
            if (!window.confirm(t('confirmOff') + '\n\n' + node.name)) return;
            // 2 is the power-off action the device page uses for the same command.
            try { window.meshserver.send({ action: 'poweraction', nodeids: [node._id], actiontype: 2 }); } catch (error) { /* the list refresh shows the result */ }
        }));
        return cell;
    }

    // One computer at a time, so a reply cannot be attributed to the wrong machine.
    function scan(node) {
        if (!isOnline(node)) { window.alert(t('offlineAction')); return; }
        // Only one check runs at a time so a reply can never be credited to the wrong
        // computer. Say so rather than letting the button appear to do nothing.
        if (pending) { window.alert(t('scanBusy')); return; }
        pending = node._id;
        scanState[node._id] = { state: 'scanning' };
        render();
        try { window.meshserver.send({ action: 'software', nodeid: node._id, type: 'installedapps' }); }
        catch (error) { pending = null; scanState[node._id] = { state: 'error' }; render(); return; }
        window.setTimeout(function () {
            if (pending === node._id) { pending = null; scanState[node._id] = { state: 'error' }; render(); }
        }, 45000);
    }
    function receiveSoftware(raw) {
        // Leave the reply alone unless this page asked for it. Someone can open a
        // device's own software tab, and that answer belongs to the tab, not here.
        if (!pending || !panel || panel.hidden) return false;
        var nodeid = pending; pending = null;
        var list;
        try { list = JSON.parse(raw); } catch (error) { scanState[nodeid] = { state: 'error' }; render(); return true; }
        if (!Array.isArray(list)) { scanState[nodeid] = { state: 'error' }; render(); return true; }
        var hits = [];
        list.forEach(function (entry) {
            var name = entry && (entry.name || entry.DisplayName);
            if (!name) return;
            var lower = String(name).toLowerCase();
            for (var i = 0; i < watchlist.length; i++) {
                if (lower.indexOf(watchlist[i]) >= 0) { hits.push(String(name)); return; }
            }
        });
        scanState[nodeid] = { state: 'done', count: list.length, hits: hits, list: list };
        render();
        return true;
    }

    // The page keeps one callback for everything the server sends. Wrap it to watch for
    // the answers to our own questions, and always hand the message on afterwards so the
    // rest of the page behaves exactly as before.
    function listen() {
        if (listening || !window.meshserver) return;
        listening = true;
        var original = window.meshserver.onMessage;
        window.meshserver.onMessage = function (server, message) {
            try {
                if (window.ScpCare && window.ScpCare.receive(message)) { /* care answered its own request */ }
                else if (window.ScpServices && window.ScpServices.receive(message)) { /* services answered its own request */ }
                else if (window.ScpPrograms && window.ScpPrograms.receive(message)) { /* it answered its own question */ }
                else if (message && (message.action === 'getsysinfo') && message.nodeid) {
                    specs[message.nodeid] = (message.hardware || message.noinfo) ? message : null;
                    render();
                } else if (message && (message.action === 'powertimeline') && message.nodeid) {
                    timelines[message.nodeid] = message.timeline || [];
                    render();
                } else if (message && (message.action === 'msg') && (message.type === 'runcommands')
                    && message.nodeid && fixing[message.nodeid] && message.responseid === fixing[message.nodeid].ticket) {
                    if(message.progress === true) readDriverProgress(message.nodeid, message.result);
                    else readDriverReply(message.nodeid, message.result);
                } else if (message && message.action === 'runcommands' && message.result !== 'OK') {
                    Object.keys(fixing).forEach(function(id){ if(fixing[id].ticket === message.responseid) readDriverReply(id, 'FAILED ' + String(message.result)); });
                } else if (message && (message.action === 'event') && message.event
                    && (message.event.action === 'nodeconnect') && message.event.nodeid && (message.event.conn & 1)) {
                    // A computer that has just come back may have restarted since it was last
                    // asked. Without this the panel keeps showing what it reported before it
                    // left, and nothing on screen tells the reader to reload the page.
                    specsAsked[message.event.nodeid] = false;
                    askForSpecs({ _id: message.event.nodeid });
                } else if (message && (message.action === 'lastconnects') && message.lastconnects) {
                    // Keyed by node, each a moment in milliseconds.
                    var seen = message.lastconnects, kept = {};
                    Object.keys(seen).forEach(function (nodeid) {
                        var when = Number(seen[nodeid]);
                        if (!isFinite(when) || (when <= 0)) { when = Date.parse(seen[nodeid]); }
                        if (isFinite(when) && (when > 0)) { kept[nodeid] = when; }
                    });
                    lastSeen = kept;
                    render();
                }
            } catch (error) { /* never let our own bookkeeping break the page */ }
            if (typeof original === 'function') { return original.apply(this, arguments); }
        };
    }

    function askForSpecs(node) {
        if (specsAsked[node._id] || !window.meshserver) return;
        specsAsked[node._id] = true;
        try { window.meshserver.send({ action: 'getsysinfo', nodeid: node._id }); } catch (error) { specsAsked[node._id] = false; }
    }

    function askForTimeline(node) {
        if (timelinesAsked[node._id] || !window.meshserver) return;
        timelinesAsked[node._id] = true;
        try { window.meshserver.send({ action: 'powertimeline', nodeid: node._id }); }
        catch (error) { timelinesAsked[node._id] = false; }
    }

    function askForLastSeen() {
        if (lastSeenAsked || !window.meshserver) return;
        lastSeenAsked = true;
        try { window.meshserver.send({ action: 'lastconnects' }); } catch (error) { lastSeenAsked = false; }
    }

    function overlap(fromA, toA, fromB, toB) {
        var start = Math.max(fromA, fromB), end = Math.min(toA, toB);
        return (end > start) ? (end - start) : 0;
    }

    /* Every moment in a real history is written in seconds. When the server has no power
       records for a computer at all it falls back to the state it sees right now and writes
       that moment in milliseconds instead. A number that large is therefore the server
       saying "nothing recorded", not a history to read — and reading it as seconds would
       put the machine tens of thousands of years in the future. */
    function historyStart(timeline) {
        var value = Number(timeline[1]);
        if (!isFinite(value) || (value <= 0) || (value > 1e11)) return null;
        return value * 1000;
    }

    /* The history arrives packed tight: the state before the first event, the time of
       that event, the state after it, then pairs of how long a state lasted and what it
       changed to. Walk it and add up the time spent powered on since the given moment.
       Power state 1 is on; sleep and hibernate do not count, which is right — a sleeping
       computer is not in use. */
    function hoursPoweredOn(timeline, sinceMs, untilMs) {
        if (!timeline || (timeline.length < 3)) return null;
        var at = historyStart(timeline);
        if (at == null) return null;
        var now = Date.now();
        // Never count past this moment. A day still being lived has only the hours it has
        // actually had, not the hours it will have by midnight.
        var until = (untilMs == null) ? now : Math.min(untilMs, now);
        var state = timeline[2], on = 0;
        for (var i = 3; (i + 1) < timeline.length; i += 2) {
            var next = at + (Number(timeline[i]) * 1000);
            if (state === 1) { on += overlap(at, next, sinceMs, until); }
            at = next;
            state = timeline[i + 1];
        }
        if (state === 1) { on += overlap(at, now, sinceMs, until); }
        return on / 3600000;
    }

    // Midnight to midnight, local time, for the day a given number of days back from
    // today. Local, because a hospital day is a local day and the shifts are read against
    // it — not against UTC.
    function dayEdges(daysBack) {
        var start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - daysBack);
        var end = new Date(start.getTime());
        end.setDate(end.getDate() + 1);
        return { from: start.getTime(), until: end.getTime(), label: start };
    }

    // Hours powered on for each of the last few days, oldest first. Null for a day that
    // begins before this computer's history does, so an absence of records is never drawn
    // as a quiet day.
    function hoursByDay(node, days) {
        var timeline = timelines[node._id];
        if (!timeline || (timeline.length < 3)) return null;
        var known = historyStart(timeline);
        if (known == null) return null;
        var out = [];
        for (var back = days - 1; back >= 0; back--) {
            var edge = dayEdges(back);
            if (edge.until <= known) { out.push({ day: edge.label, hours: null }); continue; }
            out.push({ day: edge.label, hours: hoursPoweredOn(timeline, Math.max(edge.from, known), edge.until) });
        }
        return out;
    }

    /* Total hours powered on within the window — a fact about what was observed, not a
       rate. The distinction matters: dividing by the days of history we happen to have
       turns half a day of watching a machine that was on the whole time into "24 hours
       a day", which is an artifact of when we started looking, not a finding. A total
       cannot lie that way. A computer added this week simply has fewer hours behind it
       and says so, and it catches up on its own as the history fills in. */
    function usageOf(node) {
        var timeline = timelines[node._id];
        if (!timeline || (timeline.length < 3)) return null;
        var known = historyStart(timeline);
        if (known == null) return null;
        var now = Date.now();
        var from = Math.max(now - (rankingDays * 86400000), known);
        var days = (now - from) / 86400000;
        // A window of no width means the server had no records and answered with the state
        // it happens to see right now. There is nothing to measure in that.
        if (!(days > 0)) return null;
        var hours = hoursPoweredOn(timeline, from);
        if (hours == null) return null;
        return { hours: hours, days: days };
    }

    /* Days since the server last heard from a computer. Null while it is connected now,
       and -1 for one that has never connected at all — which is the useful case: it means
       the agent was installed but has never reached the server. */
    function daysAway(node) {
        if (isOnline(node) || (lastSeen == null)) return null;
        var at = lastSeen[node._id];
        if (at == null) return -1;
        return Math.floor((Date.now() - at) / 86400000);
    }

    function gigabytes(value) {
        var n = Number(value);
        if (!n || n <= 0) return null;
        return Math.round(n / 1073741824);
    }

    function hardwareOf(node) {
        var record = specs[node._id];
        return (record && record.hardware) ? record.hardware : null;
    }

    // Every drive the computer reports, as a percentage free. Removable drives and
    // network drives are left out: a memory stick at 2% is not a fault to report.
    function disksOf(node) {
        var hardware = hardwareOf(node);
        var volumes = hardware && hardware.windows && hardware.windows.volumes;
        if (!volumes) return [];
        return Object.keys(volumes).map(function (letter) {
            var volume = volumes[letter];
            if (!volume || (volume.dType !== 3) || !volume.size) return null;
            return { letter: letter, percent: Math.round((Number(volume.sizeremaining) / Number(volume.size)) * 100), free: gigabytes(volume.sizeremaining) };
        }).filter(Boolean);
    }

    /* The devices Windows itself cannot start, as the agent read them out of Device
       Manager. Kept to the three worst so one badly broken machine cannot push every
       other computer's problems off the panel; the rest are counted in a final line. */
    // Windows raises a yellow flag on the chipset housekeeping devices it has no built-in
    // name for -- SM Bus, the MEI "PCI Simple Communications Controller", the generic PCI
    // placeholders. There is one on nearly every machine, the computer works without them,
    // and left in they crowd out the device fault that actually stops something. So they are
    // not attention: a computer whose only faults are these has nothing here to report.
    var HOUSEKEEPING = /^(SM ?Bus Controller|PCI Simple Communications Controller|PCI Memory Controller|PCI Data Acquisition and Signal Processing Controller|PCI Device|Base System Device|PCI Serial Port|PCI Encryption\/Decryption Controller|Performance Counters|PCI standard RAM Controller|Communications controller|Unknown device)$/i;
    function faultsOf(node) {
        var record = specs[node._id];
        var faults = record && record.deviceFaults;
        if (!Array.isArray(faults) || !faults.length) return [];
        var real = faults.filter(function (fault) { return !HOUSEKEEPING.test(String(fault.name || '').trim()); });
        if (!real.length) return [];
        var found = real.slice(0, 3).map(function (fault) {
            var key = 'fault' + fault.code;
            var reason = (texts[key] != null) ? t(key) : format(t('faultOther'), fault.code);
            return { level: 'warn', text: format(t('driverFault'), fault.name || '?', reason) };
        });
        if (real.length > 3) { found.push({ level: 'warn', text: format(t('driverMore'), real.length - 3) }); }
        return found;
    }

    function specLine(node) {
        var hardware = hardwareOf(node);
        if (!hardware) return null;
        var identifiers = hardware.identifiers || {}, windows = hardware.windows || {};
        var parts = [];
        if (identifiers.cpu_name) { parts.push(String(identifiers.cpu_name).replace(/\s+/g, ' ').trim()); }
        var ram = 0;
        (windows.memory || []).forEach(function (stick) { ram += Number(stick.Capacity) || 0; });
        if (ram > 0) { parts.push(gigabytes(ram) + ' GB'); }
        var system = disksOf(node).filter(function (d) { return d.letter === 'C'; })[0];
        if (system) { parts.push(format(t('diskFree'), system.free, system.percent)); }
        // SCP-Remote installs the mirror driver itself for remote screens, so naming it on
        // every row describes this system, not the computer the reader is looking at.
        var gpu = String(identifiers.gpu_name || '').split(',').map(function (name) { return name.trim(); })
            .filter(function (name) { return name && !/basic|microsoft|mirror/i.test(name); });
        if (gpu.length) { parts.push(gpu.join(', ')); }
        return parts.length ? parts.join('  ·  ') : null;
    }

    function matchesSearch(node) {
        if (!searchText) return true;
        var hay = [node.name, node.rname, node.host, node.ip, signedInUser(node), roomOf(node)].join(' ').toLowerCase();
        return hay.indexOf(searchText) >= 0;
    }

    function csvCell(value) {
        var text = (value === null || value === undefined) ? '' : String(value);
        return '"' + text.replace(/"/g, '""').replace(/\s+/g, ' ').trim() + '"';
    }

    // One row per computer, for the asset register the hospital has to produce by hand
    // today. Written with a byte order mark so Excel opens Thai text correctly.
    function exportInventory() {
        var rows = allNodes().filter(function (node) { return hardwareOf(node); });
        if (!rows.length) { window.alert(t('exportNone')); return; }
        var header = ['ชื่อเครื่อง', 'หน่วยงาน', 'ชื่อเครื่องใน Windows', 'IP', 'รุ่นเครื่อง', 'ยี่ห้อเมนบอร์ด',
                      'CPU', 'การ์ดจอ', 'แรม (GB)', 'ดิสก์', 'ระบบปฏิบัติการ', 'Serial', 'วันที่ BIOS'];
        var lines = [header.map(csvCell).join(',')];
        rows.forEach(function (node) {
            var hardware = hardwareOf(node), identifiers = hardware.identifiers || {}, windows = hardware.windows || {};
            var ram = 0;
            (windows.memory || []).forEach(function (stick) { ram += Number(stick.Capacity) || 0; });
            var serial = identifiers.bios_serial || identifiers.chassis_serial || '';
            if (/to be filled|default string|none/i.test(serial)) { serial = ''; }
            var bios = String(identifiers.bios_date || '');
            if (/^\d{8}/.test(bios)) { bios = bios.substring(6, 8) + '/' + bios.substring(4, 6) + '/' + bios.substring(0, 4); }
            lines.push([
                node.name, roomOf(node), node.rname || node.host || '', node.ip || '',
                identifiers.product_name || '', identifiers.board_vendor || '',
                identifiers.cpu_name || '', identifiers.gpu_name || '',
                ram > 0 ? gigabytes(ram) : '',
                disksOf(node).map(function (d) { return d.letter + ':' + d.free + 'GB'; }).join(' '),
                (node.osdesc || '').replace('Microsoft ', ''), serial, bios
            ].map(csvCell).join(','));
        });
        saveCsv('SCP-Remote_ครุภัณฑ์คอมพิวเตอร์_' + stamp() + '.csv', lines);
        window.alert(format(t('exportDone'), rows.length));
    }

    // Saves a file rather than making the browser navigate, and names it for what it is.
    function saveCsv(name, lines) {
        var link = document.createElement('a');
        link.download = name;
        link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\ufeff' + lines.join('\r\n'));
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function stamp() {
        function pad(value) { return (value < 10 ? '0' : '') + value; }
        var now = new Date();
        return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
    }

    /* One row per computer, one column per day, so the whole week opens in Excel as a
       grid somebody can sort, total or chart without asking us for anything further.
       A day with no history is left blank rather than written as a zero: the difference
       between "switched off" and "we were not watching" has to survive the export. */
    function exportUsage() {
        var rows = allNodes().filter(function (node) { return hoursByDay(node, rankingDays) != null; });
        if (!rows.length) { window.alert(t('exportUsageNone')); return; }
        var columns = hoursByDay(rows[0], rankingDays).map(function (entry) { return dayName(entry.day); });
        var lines = [['ชื่อเครื่อง', 'หน่วยงาน'].concat(columns).concat(['รวม (ชม.)']).map(csvCell).join(',')];
        rows.forEach(function (node) {
            var days = hoursByDay(node, rankingDays), total = 0, any = false;
            var cells = days.map(function (entry) {
                if (entry.hours == null) return '';
                any = true;
                total += entry.hours;
                return entry.hours.toFixed(1);
            });
            lines.push([node.name, roomOf(node)].concat(cells).concat([any ? total.toFixed(1) : ''])
                .map(csvCell).join(','));
        });
        saveCsv('SCP-Remote_การใช้งาน_' + stamp() + '.csv', lines);
        window.alert(format(t('exportDone'), rows.length));
    }

    /* What gets run on the far machine, as SYSTEM.

       Two steps, cheapest first. A device re-scan installs anything already sitting in
       the machine's own driver store and costs nothing; only then do we ask Windows
       Update, which has to download. Drivers only — this must never turn into a general
       Windows update that reboots a ward computer in the middle of a shift.

       Nothing here restarts the machine. Where a restart is needed we say so and leave
       the decision to a person who knows what the computer is being used for. */
    var driverScript = [
        "$ProgressPreference='SilentlyContinue'; $out=@()",
        "Write-Output 'SCP_DRIVER_STAGE:rescan'",
        "try {",
        "  $rescan = Start-Process -FilePath \"$env:windir\\System32\\pnputil.exe\" -ArgumentList '/scan-devices' -PassThru -WindowStyle Hidden",
        "  if ($rescan.WaitForExit(180000)) { $out += 'rescan ok' } else { $rescan.Kill(); $out += 'rescan timed out' }",
        "} catch { $out += 'rescan failed' }",
        "try {",
        "  Write-Output 'SCP_DRIVER_STAGE:search'",
        "  $s = New-Object -ComObject Microsoft.Update.Session",
        "  $r = $s.CreateUpdateSearcher().Search(\"IsInstalled=0 and Type='Driver'\")",
        "  if ($r.Updates.Count -eq 0) { $out += 'NODRIVERS' } else {",
        "    $c = New-Object -ComObject Microsoft.Update.UpdateColl",
        "    foreach ($u in $r.Updates) { if (-not $u.EulaAccepted) { $u.AcceptEula() }; $null = $c.Add($u) }",
        "    Write-Output 'SCP_DRIVER_STAGE:download'",
        "    for ($k=0; $k -lt $c.Count; $k++) {",
        "      Write-Output ('SCP_DRIVER_PROGRESS:' + (@{stage='download';done=$k;total=$c.Count}|ConvertTo-Json -Compress))",
        "      $one=New-Object -ComObject Microsoft.Update.UpdateColl; $null=$one.Add($c.Item($k)); $d=$s.CreateUpdateDownloader();$d.Updates=$one;$download=$d.Download()",
        "      if ($download.ResultCode -ne 2) { throw ('Download result code ' + $download.ResultCode) }",
        "      Write-Output ('SCP_DRIVER_PROGRESS:' + (@{stage='download';done=($k+1);total=$c.Count}|ConvertTo-Json -Compress))",
        "    }",
        "    Write-Output 'SCP_DRIVER_STAGE:install'",
        "    $needsReboot=$false",
        "    for ($k=0; $k -lt $c.Count; $k++) {",
        "      Write-Output ('SCP_DRIVER_PROGRESS:' + (@{stage='install';done=$k;total=$c.Count}|ConvertTo-Json -Compress))",
        "      $one=New-Object -ComObject Microsoft.Update.UpdateColl;$null=$one.Add($c.Item($k));$i=$s.CreateUpdateInstaller();$i.Updates=$one;$res=$i.Install()",
        "      if ($res.ResultCode -ne 2) { throw ('Install result code ' + $res.ResultCode) }",
        "      if($res.RebootRequired){$needsReboot=$true}",
        "      Write-Output ('SCP_DRIVER_PROGRESS:' + (@{stage='install';done=($k+1);total=$c.Count}|ConvertTo-Json -Compress))",
        "    }",
        "    $out += ('installed ' + $c.Count + ' driver(s)')",
        "    if ($needsReboot) { $out += 'REBOOT' }",
        "  }",
        "} catch { $out += ('FAILED ' + $_.Exception.Message) }",
        "$out -join ' | '"
    ].join('\n');

    // Take a finished-or-stuck driver job off the panel. It does not stop a command still
    // running on the computer; it clears the card and asks the computer again, so a fault
    // that is really gone clears with it and one that is real comes back named.
    function clearDriverJob(node) {
        delete fixing[node._id];
        if (window.ScpOperations) { window.ScpOperations.request('driverClear', { nodeid: node._id }).catch(function () {}); }
        specsAsked[node._id] = false;
        askForSpecs(node);
        render();
    }
    function fixDrivers(nodes) {
        var targets = nodes.filter(function(node){return isOnline(node) && (!fixing[node._id] || fixing[node._id].state !== 'working');});
        var asleep = nodes.filter(function (node) { return !isOnline(node); });
        if (asleep.length && !targets.length) { window.alert(format(t('fixOffline'), asleep[0].name || '')); return; }
        if (!targets.length) return;

        var who = (targets.length === 1) ? (targets[0].name || '') : format(t('fixAskMany'), targets.length);
        if (!window.confirm(format(t('fixAsk'), who))) return;

        var ticket = 'scpfix' + (++fixTicket) + '_' + Date.now();
        // Until the computer says something, the only true thing to report is that we asked.
        // Showing a stage here made a command that never arrived look like work in progress.
        targets.forEach(function (node) { fixing[node._id] = { state: 'working', ticket: ticket, text: t('fixAwaiting'), progress: null, started: Date.now() }; });
        render();
        try {
            window.meshserver.send({
                action: 'runcommands',
                nodeids: targets.map(function (node) { return node._id; }),
                type: 2,          // Windows PowerShell
                runAsUser: 0,     // as the agent, so no one has to be signed in
                reply: true,
                responseid: ticket,
                cmds: driverScript
            });
        } catch (error) {
            targets.forEach(function (node) { fixing[node._id] = { state: 'failed', text: String(error) }; });
            render();
            return;
        }
        if (asleep.length) { window.alert(format(t('fixOffline'), asleep[0].name || '')); }
        else if (targets.length > 1) { window.alert(format(t('fixSent'), targets.length)); }

        // Windows Update can genuinely take a quarter of an hour. Give up waiting after
        // that rather than leaving a row spinning for ever, and say the work may yet
        // finish, because it may.
        window.setTimeout(function () {
            var changed = false;
            targets.forEach(function (node) {
                var state = fixing[node._id];
                if (state && (state.ticket === ticket) && (state.state === 'working')) {
                    fixing[node._id] = { state: 'unknown', ticket: state.ticket, progress:state.progress, text: t('fixTimeout') };
                    changed = true;
                }
            });
            if (changed) { render(); }
        }, 900000);
    }

    function readDriverProgress(nodeid, result) {
        var report=null;try{var json=String(result).match(/SCP_DRIVER_PROGRESS:(\{[^\r\n]*\})/);if(json)report=JSON.parse(json[1]);}catch(e){}
        var match=report?[null,report.stage]:String(result).match(/SCP_DRIVER_STAGE:(rescan|search|download|install)/);if(!match||!['rescan','search','download','install'].includes(match[1]))return;
        if(window.ScpProgress)fixing[nodeid].progress=ScpProgress.model(match[1],report&&report.done,report&&report.total);
        var labels={rescan:['Re-scanning the computer\u2019s own devices…','กำลังสแกนอุปกรณ์ในเครื่อง…'],search:['Searching Windows Update…','กำลังค้นหาไดรเวอร์จาก Windows Update…'],download:['Downloading drivers…','กำลังดาวน์โหลดไดรเวอร์…'],install:['Installing drivers…','กำลังติดตั้งไดรเวอร์…']};
        fixing[nodeid].state='working';if(!fixing[nodeid].started)fixing[nodeid].started=Date.now();fixing[nodeid].text=labels[match[1]][document.documentElement.lang==='th'?1:0];render();
        var ticket=fixing[nodeid].ticket;window.setTimeout(function(){var job=fixing[nodeid];if(job&&job.ticket===ticket&&job.state==='working'){job.state='unknown';job.text=t('fixTimeout');render();}},900000);
    }
    var driverStatusLoading=false;
    function loadDriverStatus() {
        if(window.ScpCleanup)window.ScpCleanup.refresh();
        if(driverStatusLoading||!window.ScpOperations)return;
        driverStatusLoading=true;
        window.ScpOperations.request('driverStatus').then(function(rows){rows.forEach(function(row){
            var previous=fixing[row.nodeid];if(previous&&previous.ticket!==row.ticket)return;
            if(previous&&previous.reportedAt>=row.updated)return;
            if(!previous)fixing[row.nodeid]={ticket:row.ticket};
            if(row.progress){
                if(Date.now()-row.updated>900000){fixing[row.nodeid]={ticket:row.ticket,state:'unknown',text:t('fixTimeout')};}
                else readDriverProgress(row.nodeid,row.result);
            }else readDriverReply(row.nodeid,row.result);
            fixing[row.nodeid].reportedAt=row.updated;
        });render();}).catch(function(){}).then(function(){driverStatusLoading=false;});
    }
    // Turn what the far machine printed into one plain sentence.
    function readDriverReply(nodeid, result) {
        var ticket = fixing[nodeid] && fixing[nodeid].ticket;
        var progress = fixing[nodeid] && fixing[nodeid].progress;
        var text = String(result == null ? '' : result).replace(/SCP_DRIVER_STAGE:(rescan|search|download|install)|SCP_DRIVER_PROGRESS:\{[^\r\n]*\}/g, '').trim();
        if (/COMMAND_BUSY/.test(text)) { fixing[nodeid] = {state:'failed', text:document.documentElement.lang==='th'?'เครื่องลูกกำลังทำคำสั่งอื่น จึงยังไม่ได้เริ่มติดตั้งไดรเวอร์':'The remote computer is busy; driver installation was not started'}; }
        else if (/FAILED/.test(text)) { fixing[nodeid] = { state: 'failed', text: format(t('fixFailed'), text.split('FAILED')[1].trim().substring(0, 120)) }; }
        else if (/REBOOT/.test(text)) { fixing[nodeid] = { state: 'reboot', text: t('fixReboot') }; }
        else if (/NODRIVERS/.test(text)) { fixing[nodeid] = { state: 'done', text: t('fixNothing') }; }
        else if (/installed [0-9]+ driver/.test(text)) { fixing[nodeid] = { state: 'done', text: format(t('fixDone'), text.substring(0, 120)) }; }
        else { fixing[nodeid] = { state: 'unknown', text: document.documentElement.lang === 'th' ? 'ได้รับคำตอบ แต่ยังยืนยันผลติดตั้งไม่ได้' : 'Reply received, but installation is not confirmed' }; }
        fixing[nodeid].ticket = ticket;
        if(window.ScpProgress)fixing[nodeid].progress=['done','reboot'].includes(fixing[nodeid].state)?ScpProgress.model('summarizing',null,null,true):progress;
        // What the agent reported a moment ago is now out of date; ask again so the fault
        // disappears from the panel on its own once it is really gone.
        specsAsked[nodeid] = false;
        askForSpecs({ _id: nodeid });
        render();
    }

    function openRemote(node) {
        if (!isOnline(node)) { window.alert(t('offlineAction')); return; }
        hide();
        if (typeof window.gotoDevice === 'function') window.gotoDevice(node._id, 11);
    }

    function liveSupported() {
        return (typeof window.CreateAgentRedirect === 'function') && (typeof window.CreateAgentRemoteDesktop === 'function');
    }
    // What the person at the far end sees while a tile is running. Read from the
    // server's own consent flags, so this sentence stays true if the policy changes.
    function consentNote() {
        var flags = (window.serverinfo && typeof window.serverinfo.consent === 'number') ? window.serverinfo.consent : 0;
        // These tiles are picture-only connections. When the server lets those through
        // without the permission box, saying otherwise here would promise a box that
        // never appears, so drop it before describing what happens.
        if (window.serverinfo && (window.serverinfo.desktopviewonlynoprompt === true)) { flags &= ~8; }
        // More than one of these can be set at once, and each is a separate thing the
        // person at that computer sees, so say all of them rather than only the first.
        var parts = [];
        if (flags & 8) { parts.push(t('consentPrompt')); }
        else if (flags & 1) { parts.push(t('consentNotify')); }
        if (flags & 64) { parts.push(t('consentBar')); }
        if (!parts.length) { parts.push(t('consentSilent')); }
        return parts.join(' ');
    }
    function saveCanvas(node, canvas) {
        function pad(value) { return (value < 10 ? '0' : '') + value; }
        function safe(text) { return String(text).replace(/[\\/:*?"<>|]/g, '_').trim(); }
        var now = new Date();
        var stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
        var link = document.createElement('a');
        // Room and computer in the name, so a folder of these reads as a record.
        link.download = ['SCP-Remote', safe(roomOf(node)), safe(node.name || node._id), stamp].join('_') + '.png';
        try { link.href = canvas.toDataURL('image/png'); } catch (error) { return; }
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    // The tile on screen is deliberately small, but a saved picture is the record of
    // what was seen and has to be readable. So ask that one computer for a single
    // frame at full size and best quality, wait until it has all arrived, save that,
    // and put the small cheap picture back.
    function snapshot(node, entry) {
        if (entry.capturing) return;
        var desk = entry.desk;
        if (!desk || !desk.m || (desk.m.State !== 3) || (typeof desk.m.SendCompressionLevel !== 'function')) {
            saveCanvas(node, entry.canvas); // nothing is streaming; save whatever is on the tile
            return;
        }
        entry.capturing = true;
        tileMessage(entry, t('liveShooting'), null);
        var startWidth = entry.canvas.width, waited = 0;
        desk.m.SendCompressionLevel(liveCapture.encoding, liveCapture.quality, liveCapture.scaling, liveSettings.framerate);
        if (typeof desk.m.SendRefresh === 'function') { desk.m.SendRefresh(); }
        entry.capture = window.setInterval(function () {
            waited += 150;
            // The larger frame announces itself as a new screen size, then arrives as
            // tiles. The desktop module zeroes its tile counter once everything it has
            // received is drawn, which is the moment the picture is whole.
            var resized = (entry.canvas.width !== startWidth);
            var settled = (desk.m.tilesReceived === 0);
            if ((resized && settled && (waited >= 450)) || (waited >= 6000)) { finishCapture(node, entry); }
        }, 150);
    }
    function finishCapture(node, entry) {
        if (entry.capture) { window.clearInterval(entry.capture); entry.capture = null; }
        if (!entry.capturing) return;
        entry.capturing = false;
        if (tiles[node._id] !== entry) return; // the tile was closed while we waited
        saveCanvas(node, entry.canvas);
        if (entry.desk && entry.desk.m && (typeof entry.desk.m.SendCompressionLevel === 'function')) {
            entry.desk.m.SendCompressionLevel(liveSettings.encoding, liveSettings.quality, liveSettings.scaling, liveSettings.framerate);
        }
        entry.overlay.hidden = true;
        entry.overlay.textContent = '';
    }
    function stopTile(nodeid) {
        var entry = tiles[nodeid];
        if (!entry) return;
        delete tiles[nodeid];
        if (entry.capture) { window.clearInterval(entry.capture); entry.capture = null; }
        entry.capturing = false;
        try { if (entry.desk) entry.desk.Stop(); } catch (error) { /* the tunnel had already closed */ }
    }
    function stopAllTiles() { Object.keys(tiles).forEach(stopTile); }
    function tileMessage(entry, text, retry) {
        entry.overlay.hidden = false;
        entry.overlay.textContent = '';
        entry.overlay.appendChild(element('span', null, text));
        if (retry) { entry.overlay.appendChild(button(t('liveRetry'), 'scp-dash-tile-retry', function (event) { event.stopPropagation(); retry(); })); }
    }
    function connectTile(entry, node) {
        var desk = window.CreateAgentRedirect(window.meshserver, window.CreateAgentRemoteDesktop(entry.canvas),
            window.serverPublicNamePort, window.authCookie, window.authRelayCookie, window.domainUrl);
        desk.viewonly = true; // a tile shows a picture and nothing else
        desk.m.ImageType = liveSettings.encoding;
        desk.m.CompressionLevel = liveSettings.quality;
        desk.m.ScalingLevel = liveSettings.scaling;
        desk.m.FrameRateTimer = liveSettings.framerate;
        desk.onStateChanged = function (sender, state) {
            if (!tiles[node._id]) return;
            if (entry.capturing) {
                if (state !== 0) return; // a capture changes the picture, not the session
                if (entry.capture) { window.clearInterval(entry.capture); entry.capture = null; }
                entry.capturing = false;
            }
            if (state === 3) { entry.overlay.hidden = true; entry.overlay.textContent = ''; return; }
            // The far end can refuse, and a session can drop. Never reconnect on a timer:
            // that would put the permission box back on their screen again and again.
            // Show the button instead and let a person decide.
            if (state === 0) { tileMessage(entry, t('liveEnded'), function () { connectTile(entry, node); }); }
            else { tileMessage(entry, t('liveConnecting'), null); }
        };
        entry.desk = desk;
        tileMessage(entry, t('liveConnecting'), null);
        desk.Start(node._id);
    }
    function tileCell(node) {
        var entry = tiles[node._id];
        if (entry) return entry.box;
        // A cap on how many desktops stream at once, so opening this page on a large
        // site does not try to connect to every computer in the hospital.
        if (Object.keys(tiles).length >= liveLimit) { liveSkipped++; return null; }
        var box = element('div', 'scp-dash-cell scp-dash-tile');
        box.title = t('liveOpen');
        var canvas = document.createElement('canvas');
        canvas.className = 'scp-dash-tile-canvas';
        var overlay = element('div', 'scp-dash-tile-overlay');
        entry = { box: box, canvas: canvas, overlay: overlay, desk: null, capturing: false, capture: null };
        var shot = button('⤓', 'scp-dash-tile-shot', function (event) { event.stopPropagation(); snapshot(node, entry); });
        shot.title = t('liveShot');
        box.appendChild(canvas);
        box.appendChild(overlay);
        box.appendChild(shot);
        box.addEventListener('click', function () { openRemote(node); });
        tiles[node._id] = entry;
        connectTile(entry, node);
        return box;
    }
    function setLive(on) {
        liveOn = (on === true) && liveSupported();
        if (liveOn) activeView = 'devices';
        if (!liveOn) stopAllTiles();
        updateLiveControls();
        render();
    }
    function updateLiveControls() {
        if (!liveToggle) return;
        if (!liveSupported()) { liveToggle.hidden = true; liveHint.textContent = t('liveNoSupport'); return; }
        liveToggle.textContent = liveOn ? t('liveOff') : t('liveOn');
        liveToggle.classList.toggle('on', liveOn);
        liveHint.textContent = liveOn ? consentNote() : '';
    }

    function deviceRow(node) {
        var row = element('div', 'scp-dash-row');
        var online = isOnline(node), busy = isBusy(node);

        if (liveOn) {
            row.classList.add('scp-dash-row-live');
            var tile = (online && liveSupported()) ? tileCell(node) : null;
            // A computer that is off, or one past the cap, still gets a box of the same
            // size, so the columns beside it stay lined up.
            row.appendChild(tile || element('div', 'scp-dash-cell scp-dash-tile scp-dash-tile-blank', online ? t('liveWaiting') : t('liveOffline')));
        }

        var name = element('div', 'scp-dash-cell scp-dash-name');
        name.appendChild(element('span', 'scp-dash-dot ' + (online ? (busy ? 'busy' : 'idle') : 'off')));
        var label = element('span', 'scp-dash-label');
        label.appendChild(element('strong', '', node.name || node.rname || ''));
        var meta = [node.host || node.ip || '', (node.osdesc || '').replace('Microsoft ', '')].filter(Boolean).join(' · ');
        label.appendChild(element('small', '', meta));
        // Only when it needs saying: up to date, or offline and therefore stale, is what
        // the reader already assumes, and the status column says the offline part again.
        var release = window.ScpConnection ? window.ScpConnection.releaseBadge(node, true) : null;
        if (release) { label.appendChild(release); }
        var line = specLine(node);
        if (line) { label.appendChild(element('small', 'scp-dash-specs', line)); }
        name.appendChild(label);
        row.appendChild(name);

        var status = element('div', 'scp-dash-cell');
        status.appendChild(element('span', 'scp-dash-tag ' + (online ? (busy ? 'busy' : 'idle') : 'off'), online ? (busy ? t('busy') : t('idle')) : t('offline')));
        row.appendChild(status);

        row.appendChild(element('div', 'scp-dash-cell scp-dash-user', signedInUser(node) || t('noUser')));

        var risk = element('div', 'scp-dash-cell scp-dash-risk');
        var found = risksOf(node);
        var state = scanState[node._id];
        if (state && state.state === 'scanning') { risk.appendChild(element('span', 'scp-dash-note', t('scanning'))); }
        else if (state && state.state === 'error') { risk.appendChild(element('span', 'scp-dash-note', t('scanFail'))); }
        if (found.length) {
            found.forEach(function (item) { risk.appendChild(element('span', 'scp-dash-flag ' + item.level, item.text)); });
        }
        if (state && state.state === 'done') {
            risk.appendChild(element('span', 'scp-dash-note', t('scanDone') + ': ' + state.count + ' ' + t('programs') + (state.hits.length ? '' : ' · ' + t('scanClean'))));
            if (window.ScpPrograms && state.list) {
                risk.appendChild(button(t('programList'), 'scp-dash-scan', function () { window.ScpPrograms.open(node, state.list); }));
            }
        }
        row.appendChild(risk);

        row.appendChild(actionCell(node));
        return row;
    }

    function render() {
        if (!body || panel.hidden) return;
        // This redraws every ten seconds. Without keeping the scroll position, anyone
        // reading a room further down the page is thrown back to the top each time.
        var libraryButton=document.getElementById('scpDriverLibraryButton');if(libraryButton)libraryButton.hidden=!(window.userinfo&&window.userinfo.siteadmin===4294967295);
        var scrollTop = panel.scrollTop;
        body.textContent = '';
        liveSkipped = 0;
        var list = allNodes();

        // Close the tiles that should no longer be running — the feature switched off,
        // or a computer powered down or removed — before the rows below hand out the
        // remaining slots. Each tile is a live desktop session against someone's screen,
        // so none may outlive the row that shows it.
        var watchable = {};
        if (liveOn) { list.forEach(function (node) { if (isOnline(node) && roomShown(roomOf(node))) { watchable[node._id] = true; } }); }
        Object.keys(tiles).forEach(function (nodeid) { if (!watchable[nodeid]) { stopTile(nodeid); } });

        if (!list.length) { body.appendChild(element('div', 'scp-dash-empty', t('empty'))); return; }

        // Group first, so the buttons can be drawn and the rest of the page can follow
        // what they say. Start from the groups themselves so a room with no computer in
        // it yet is still offered, rather than looking as though it does not exist.
        var rooms = {};
        Object.keys(window.meshes || {}).forEach(function (id) {
            var mesh = window.meshes[id];
            if (mesh && mesh.name) rooms[mesh.name] = [];
        });
        list.forEach(function (node) {
            var room = roomOf(node);
            if (!rooms[room]) rooms[room] = [];
            rooms[room].push(node);
        });
        var everyRoom = Object.keys(rooms).sort();
        // Ask once per computer per visit. The server answers from what it already holds,
        // so this costs the computers themselves nothing.
        list.forEach(askForSpecs);
        list.forEach(askForTimeline);
        askForLastSeen();
        var counts = {};
        everyRoom.forEach(function (name) { counts[name] = rooms[name].length; });
        if (everyRoom.length > 1) { body.appendChild(roomChips(everyRoom, counts)); }

        // Everything below counts only what is being shown, so the numbers and the list
        // never disagree.
        var shownRooms = everyRoom.filter(roomShown);
        list = list.filter(function (node) { return roomShown(roomOf(node)) && matchesSearch(node); });

        var online = list.filter(isOnline);
        var busy = list.filter(isBusy);
        var needing = list.filter(function (node) { return risksOf(node).length > 0; });

        var stats = element('div', 'scp-dash-stats');
        stats.appendChild(stat(t('total'), list.length));
        stats.appendChild(stat(t('online'), online.length, 'ok'));
        stats.appendChild(stat(t('busy'), busy.length, 'busy'));
        stats.appendChild(stat(t('idle'), online.length - busy.length, 'idle'));
        stats.appendChild(stat(t('offline'), list.length - online.length, 'off'));
        stats.appendChild(stat(t('risky'), needing.length, needing.length ? 'risk' : 'ok'));
        body.appendChild(stats);
        var tabs = element('nav', 'scp-dash-tabs');
        tabs.setAttribute('aria-label', thai ? 'มุมมองแดชบอร์ด' : 'Dashboard views');
        var sections = {};
        [['overview','ภาพรวม','Overview'],['devices','เครื่องทั้งหมด','Devices'],['jobs','สถานะงาน','Jobs'],['reports','รายงาน','Reports']].forEach(function (entry) {
            var tab = button(entry[thai ? 1 : 2], 'scp-dash-tab', function () {
                activeView = entry[0];
                if (activeView !== 'devices' && liveOn) { liveOn = false; stopAllTiles(); updateLiveControls(); }
                render();
            });
            tab.setAttribute('aria-pressed', String(activeView === entry[0]));
            tab.setAttribute('aria-controls', 'scp-dash-view-' + entry[0]);
            tabs.appendChild(tab);
            var section = element('section', 'scp-dash-view');
            section.id = 'scp-dash-view-' + entry[0]; section.hidden = activeView !== entry[0];
            sections[entry[0]] = section;
        });
        body.appendChild(tabs);
        Object.keys(sections).forEach(function (key) { body.appendChild(sections[key]); });
        var overview = element('div', 'scp-dash-overview-grid');
        var fleet = element('section', 'scp-dash-fleet');
        fleet.appendChild(element('h3', '', thai ? 'ความพร้อมของเครื่อง' : 'Device availability'));
        var pct = list.length ? Math.round(online.length / list.length * 100) : 0;
        var ring = element('div', 'scp-dash-ring');
        ring.style.setProperty('--online', pct + '%');
        ring.setAttribute('role', 'img'); ring.setAttribute('aria-label', t('online') + ' ' + pct + '%');
        var center = element('div', 'scp-dash-ring-center');
        center.appendChild(element('strong', '', pct + '%')); center.appendChild(element('span', '', t('online'))); ring.appendChild(center); fleet.appendChild(ring);
        fleet.appendChild(element('p', '', t('online') + ' ' + online.length + ' / ' + list.length + ' ' + t('devices')));
        fleet.appendChild(element('small', '', thai ? 'เลือกเครื่องเพื่อดู CPU, RAM และโปรเซสแบบสด' : 'Select a device for live CPU, RAM and processes'));
        fleet.appendChild(button(thai ? 'ดูสถานะเครื่อง / Task Manager' : 'Monitor / Task Manager', 'scp-dash-refresh', function () { if(window.ScpMonitor) window.ScpMonitor.open(); }));
        overview.appendChild(fleet); overview.appendChild(attentionPanel(list)); sections.overview.appendChild(overview);
        var jobs = list.filter(function (node) { return !!fixing[node._id]; });
        sections.jobs.appendChild(element('h3', '', thai ? 'สถานะงานไดรเวอร์ล่าสุด' : 'Latest driver jobs'));
        var jobGrid = element('div', 'scp-dash-job-grid');
        jobs.forEach(function (node) {
            var state = fixing[node._id], card = element('article', 'scp-dash-job-card');
            card.appendChild(element('strong', '', node.name)); card.appendChild(element('small', 'scp-dash-note', roomOf(node)));
            card.appendChild(element('p', 'scp-dash-job-message', state.text || t('fixWorking')));
            if (window.ScpProgress && state.progress) card.appendChild(ScpProgress.view(state.progress, 'driver', state.started));
            jobGrid.appendChild(card);
        });
        sections.jobs.appendChild(jobGrid);
        if (!jobs.length) sections.jobs.appendChild(element('div', 'scp-dash-empty', thai ? 'ยังไม่มีงานไดรเวอร์ในรายการที่เลือก' : 'No driver jobs for the selected devices'));
        if(window.ScpMonitor) sections.reports.appendChild(window.ScpMonitor.overview());
        sections.reports.appendChild(usageRanking(rooms, shownRooms));

        // Filled in at the end of this pass, once the rows are built and it is known
        // whether the screen cap was reached.
        liveNote = element('div', 'scp-dash-live-note');
        liveNote.hidden = true;
        sections.devices.appendChild(liveNote);

        if (searchText && !list.length) {
            body.appendChild(element('div', 'scp-dash-empty', format(t('searchNone'), searchText)));
            liveNote.hidden = true;
            if (scrollTop > 0) { panel.scrollTop = scrollTop; }
            return;
        }
        // A search narrows to the rooms that still have something in them.
        if (searchText) { shownRooms = shownRooms.filter(function (room) { return (rooms[room] || []).some(matchesSearch); }); }
        shownRooms.forEach(function (room) {
            var group = (rooms[room] || []).filter(matchesSearch);
            var section = element('section', 'scp-dash-room');
            var head = element('div', 'scp-dash-room-head');
            head.appendChild(element('h3', '', room));
            var onlineHere = group.filter(isOnline).length, busyHere = group.filter(isBusy).length;
            head.appendChild(element('span', 'scp-dash-room-count',
                group.length + ' ' + t('devices') + ' · ' + t('online') + ' ' + onlineHere + ' · ' + t('busy') + ' ' + busyHere));
            section.appendChild(head);

            var header = element('div', 'scp-dash-row scp-dash-head');
            if (liveOn) { header.classList.add('scp-dash-row-live'); header.appendChild(element('div', 'scp-dash-cell', t('liveCol'))); }
            [t('nameCol'), t('statusCol'), t('userCol'), t('riskCol'), t('actionCol')].forEach(function (title) {
                header.appendChild(element('div', 'scp-dash-cell', title));
            });
            if (group.length) {
                section.appendChild(header);
                group.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
                    .forEach(function (node) { section.appendChild(deviceRow(node)); });
            } else {
                section.appendChild(element('div', 'scp-dash-empty-room', t('roomEmpty')));
            }
            sections.devices.appendChild(section);
        });
        liveNote.hidden = (liveSkipped === 0);
        liveNote.textContent = liveSkipped ? format(t('liveFull'), liveLimit) : '';

        if (scrollTop > 0) { panel.scrollTop = scrollTop; }
    }

    // The workspace column clips whatever overflows it, so each page scrolls itself.
    // Measure the space actually left below the header instead of assuming a height,
    // which keeps working if the header or the language bar changes size.
    function fitHeight() {
        if (!panel || panel.hidden) return;
        var top = panel.getBoundingClientRect().top;
        var available = window.innerHeight - top - 8;
        panel.style.maxHeight = Math.max(240, available) + 'px';
    }
    function show() {
        if (!panel) return;
        document.querySelectorAll('#page_leftbar .lbbutton').forEach(function (item) { item.classList.remove('lbbuttonsel'); });
        var navButton = document.getElementById('LeftMenuScpDashboard');
        if (navButton) navButton.classList.add('lbbuttonsel');
        // Hide whatever page the site is showing without touching how it manages them.
        ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].forEach(function (id) {
            var page = document.getElementById(id);
            if (page && page.style.display !== 'none') { page.dataset.scpHidden = '1'; page.style.display = 'none'; }
        });
        panel.hidden = false;
        listen();
        loadDriverStatus();
        render();
        fitHeight();
        if (!timer) timer = window.setInterval(function(){loadDriverStatus();render();}, 10000);
    }
    function hide() {
        if (!panel || panel.hidden) return;
        panel.hidden = true;
        stopAllTiles();
        var navButton = document.getElementById('LeftMenuScpDashboard');
        if (navButton) navButton.classList.remove('lbbuttonsel');
        document.querySelectorAll('[data-scp-hidden]').forEach(function (page) {
            page.style.display = '';
            delete page.dataset.scpHidden;
        });
        if (timer) { window.clearInterval(timer); timer = null; }
    }

    function init() {
        if (panel) return;
        var bar = document.getElementById('page_leftbar');
        var devices = document.getElementById('p1');
        if (!bar || !devices) return;

        var navButton = element('div', 'lbbutton');
        navButton.id = 'LeftMenuScpDashboard';
        navButton.tabIndex = 0;
        navButton.title = t('title');
        navButton.setAttribute('role', 'button');
        navButton.setAttribute('aria-label', t('title'));
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('scp-nav-icon');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z');
        svg.appendChild(path);
        navButton.appendChild(svg);
        navButton.appendChild(element('span', 'scp-nav-label', t('title')));
        navButton.addEventListener('click', show);
        navButton.addEventListener('keypress', function (event) { if (event.key === 'Enter') show(); });
        var first = document.getElementById('LeftMenuMyDevices');
        if (first) bar.insertBefore(navButton, first); else bar.appendChild(navButton);

        panel = element('div', 'scp-dash');
        panel.id = 'scpDashboard';
        panel.hidden = true;
        var heading = element('section', 'scp-dash-heading');
        heading.appendChild(element('span', 'scp-eyebrow', t('eyebrow')));
        heading.appendChild(element('h2', '', t('title')));
        heading.appendChild(element('p', '', t('intro')));
        var actions = element('div', 'scp-dash-heading-actions');
        liveToggle = button(t('liveOn'), 'scp-dash-live', function () { setLive(!liveOn); });
        actions.appendChild(liveToggle);
        actions.appendChild(button(t('exportCsv'), 'scp-dash-refresh', exportInventory));
        actions.appendChild(button(t('exportUsage'), 'scp-dash-refresh', exportUsage));
        actions.appendChild(button(t('refresh'), 'scp-dash-refresh', render));
        actions.appendChild(button(document.documentElement.lang === 'th' ? 'แจ้งซ่อม / ตรวจระบบ' : 'Repairs / system checks', 'scp-dash-refresh', function () { window.ScpOperations.open(); }));
        var libraryButton=button(thai?'คลังไดรเวอร์':'Driver library','scp-dash-refresh',function(){window.ScpOperations.openLibrary();});libraryButton.id='scpDriverLibraryButton';libraryButton.hidden=true;actions.appendChild(libraryButton);
        heading.appendChild(actions);
        liveHint = element('p', 'scp-dash-live-hint');
        heading.appendChild(liveHint);

        var find = document.createElement('input');
        find.type = 'search';
        find.id = 'scpDashSearch';
        find.className = 'scp-dash-search';
        find.placeholder = t('search');
        find.setAttribute('aria-label', t('search'));
        find.addEventListener('input', function () { searchText = find.value.trim().toLowerCase(); if (searchText) activeView = 'devices'; render(); });
        heading.appendChild(find);
        updateLiveControls();
        panel.appendChild(heading);
        body = element('div', 'scp-dash-body');
        panel.appendChild(body);
        devices.parentElement.insertBefore(panel, devices);

        // Leaving through any of the site's own menu buttons closes the dashboard.
        if (typeof window.go === 'function') {
            var original = window.go;
            window.go = function () { hide(); return original.apply(this, arguments); };
        }
        if (typeof window.handleInstalledAppsResponse === 'function') {
            var originalApps = window.handleInstalledAppsResponse;
            window.handleInstalledAppsResponse = function (raw) {
                if (receiveSoftware(raw)) return;
                return originalApps.apply(this, arguments);
            };
        }
        loadRoomFilter();
        window.addEventListener('resize', fitHeight);
        window.ScpDashboard = { show: show, hide: hide, render: render, fitHeight: fitHeight, receiveSoftware: receiveSoftware, setLive: setLive, roomShown: roomShown, toggleRoom: toggleRoom,
            exportInventory: exportInventory, specLine: specLine, disksOf: disksOf,
            hoursPoweredOn: hoursPoweredOn, usageOf: usageOf, daysAway: daysAway,
            hoursByDay: hoursByDay, exportUsage: exportUsage, faultsOf: faultsOf,
            fixDrivers: fixDrivers, driverScript: driverScript };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
