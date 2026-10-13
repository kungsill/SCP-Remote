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
        restart: ['Restart', 'รีสตาร์ต'],
        watchOn: ['🔔 Watching', '🔔 เฝ้าระวังอยู่'],
        watchOff: ['🔕 Watch', '🔕 เฝ้าระวัง'],
        confirmRestart: ['Restart this computer now? Anyone using it will be interrupted.', 'สั่งรีสตาร์ตเครื่องนี้เดี๋ยวนี้หรือไม่? คนที่กำลังใช้อยู่จะถูกขัดจังหวะ'],
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
    var selectedCampusDept = null;
    var campusViewMode = 'map';
    var currentIsoMap = null, mapTimer = null;
    /* Where computers were dragged to on the map (shared on the server) and whether the
       map is in its arrange mode. Kept here so a refresh of the page keeps both. */
    var mapPlacements = null, mapEditMode = false;
    // The at-risk list on the map: open or not, which group, and whether the low-RAM banner was closed.
    var mapRiskOpen = false, mapRiskFilter = 'all', mapRamAlertClosed = false, mapRiskRefresh = null;
    var mapFullKey = null;
    function mapTrafficOn() {
        try { return window.localStorage.getItem('scpMapTraffic') !== '0'; } catch (e) { return true; }
    }
    var panel, mapPanel, body, scanState = {}, pending = null, timer = null;

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
    var specs = {}, specsAsked = {}, listening = false, searchText = '', watched = {}, watchedLoaded = false;
    var cachedFleetAssessment = null, fleetAssessmentLoading = false;
    window.__scpSpecs = specs;

    function loadFleetAssessment(force) {
        if (!window.ScpOperations || !window.ScpOperations.request) return;
        if (fleetAssessmentLoading) return;
        if (cachedFleetAssessment && !force) return;
        fleetAssessmentLoading = true;
        if (!window.ScpCachedAssets && window.ScpOperations && window.ScpOperations.request) {
            window.ScpOperations.request('getAssetInfo').then(function (map) {
                window.ScpCachedAssets = map || {};
            }).catch(function(){});
        }
        window.ScpOperations.request('fleetAssessment').then(function (result) {
            fleetAssessmentLoading = false;
            if (result && result.devices) {
                cachedFleetAssessment = result;
                window.ScpCachedFleetAssessment = result;
                window.ScpCachedDeviceAssessments = {};
                loadChassis();
                if (!window.ScpCachedAssets) window.ScpCachedAssets = {};
                result.devices.forEach(function (d) {
                    var nid = d.nodeid || d.nodeId;
                    window.ScpCachedDeviceAssessments[nid] = d;
                    if (d.assetNumber || d.fiscalYear || d.purchasePrice != null) {
                        window.ScpCachedAssets[nid] = {
                            nodeid: nid,
                            assetNumber: d.assetNumber || '',
                            fiscalYear: d.fiscalYear || null,
                            price: d.purchasePrice != null ? d.purchasePrice : null,
                            note: d.assetNote || ''
                        };
                    }
                });
                render();
                refreshOpenModal();
                // The map page reads the same specs; give it the new numbers too.
                if (mapPanel && !mapPanel.hidden && currentIsoMap) {
                    currentIsoMap.setNodes(allNodes().filter(matchesSearch));
                    if (mapRiskRefresh) mapRiskRefresh();
                }
            }
        }).catch(function (err) {
            fleetAssessmentLoading = false;
            console.error('fleetAssessment error:', err);
        });
    }

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
        virtualisationNotesOf(node).forEach(function (note) { found.push(note); });
        licenseRisksOf(node).forEach(function (risk) { found.push(risk); });
        hardwareRisksOf(node).forEach(function (risk) { found.push(risk); });
        var scan = scanState[node._id];
        if (scan && scan.hits) { scan.hits.forEach(function (name) { found.push({ level: 'high', text: format(t('watched'), name) }); }); }
        return found;
    }
    /* Hardware that makes a computer slow, unreliable or unsafe to keep using: too little
       memory, an old processor, an old machine, a Windows that no longer gets security
       fixes. Built only from what the computer actually reported -- a value nobody knows
       (no memory list, no BIOS date, a processor the table does not recognise) raises
       nothing, because a false alarm is how a warning list stops being read. */
    function hardwareRisksOf(node) {
        var a = (window.ScpFleetAssess && window.ScpFleetAssess.assessDevice) ? window.ScpFleetAssess.assessDevice(node) : null;
        if (!a) return [];
        var found = [];
        var ram = Number(a.ramGb) || 0;
        if (ram > 0 && ram <= 4) {
            found.push({ level: 'high', kind: 'ram', text: thai ? ('RAM ต่ำมาก ' + ram + ' GB — ช้า ค้างง่าย ควรเพิ่มเป็น 8 GB') : ('Very low RAM: ' + ram + ' GB — slow and freezes, upgrade to 8 GB') });
        } else if (ram > 4 && ram < 8) {
            found.push({ level: 'warn', kind: 'ram', text: thai ? ('RAM ' + ram + ' GB ต่ำกว่าที่แนะนำ (8 GB)') : ('RAM ' + ram + ' GB, below the recommended 8 GB') });
        }
        var cpu = String(a.cpuName || a.cpu || '').replace(/\(R\)|\(TM\)|CPU|Processor/gi, '').replace(/\s+/g, ' ').trim();
        if (cpu && cpu !== '-') {
            var ev = a.cpuEval || {};
            var gen = typeof ev.gen === 'number' ? ev.gen : null;
            var ancient = /\bAtom\b|Core\s*2|Pentium\s*(Dual|D\b|4)|Celeron\s*[NJ]\d{4}|Pentium\s*[NJ]\d{4}|\bAMD\s*(A\d+|E\d?-|FX)|Athlon\s*(II|64|X2)|Phenom/i.test(cpu);
            var label = cpu + (gen ? (thai ? ' (รุ่นที่ ' + gen + ')' : ' (gen ' + gen + ')') : '');
            if (ancient || (gen !== null && gen <= 4)) {
                found.push({ level: 'high', kind: 'cpu', text: (thai ? 'CPU เก่ามาก: ' : 'Very old CPU: ') + label + (thai ? ' — ช้า เสี่ยงค้าง ไม่รองรับ Windows 11' : ' — slow, unreliable, no Windows 11') });
            } else if ((gen !== null && gen < 8) || (ev.supported === false && ev.brand === 'AMD')) {
                found.push({ level: 'warn', kind: 'cpu', text: (thai ? 'CPU รุ่นเก่า ไม่รองรับ Windows 11: ' : 'Old CPU, no Windows 11: ') + label });
            }
        }
        // Only a real date counts: the BIOS year, or the fiscal year typed into the asset record.
        var age = (a.yearSource || a.biosYear || a.fiscalYear) ? Number(a.ageYears) : NaN;
        var ageFrom = a.yearSource === 'cpu' ? (thai ? ' (ประมาณจากรุ่น CPU)' : ' (from the CPU model)') : a.yearSource === 'asset' ? (thai ? ' (ตามปีงบครุภัณฑ์)' : ' (asset record)') : '';
        if (age >= 10) {
            found.push({ level: 'high', kind: 'age', text: thai ? ('เครื่องเก่ามาก อายุประมาณ ' + age + ' ปี' + ageFrom + ' — เสี่ยงเสียกลางคัน ควรเปลี่ยน') : ('Very old machine, about ' + age + ' years' + ageFrom + ' — likely to fail, replace') });
        } else if (age >= 7) {
            found.push({ level: 'warn', kind: 'age', text: thai ? ('เครื่องอายุประมาณ ' + age + ' ปี' + ageFrom + ' ครบเกณฑ์พิจารณาเปลี่ยน') : ('About ' + age + ' years old' + ageFrom + ', due for replacement') });
        }
        var os = String(a.osCaption || a.os || node.osdesc || '');
        if (a.isWin7 || /Windows\s*(XP|Vista|7|8)\b/i.test(os)) {
            found.push({ level: 'high', kind: 'os', text: thai ? (os.replace(/Microsoft\s*/i, '') + ' หมดการสนับสนุนแล้ว — ไม่มีแพตช์ความปลอดภัย เสี่ยงไวรัส/แรนซัมแวร์') : (os + ' is out of support — no security fixes') });
        } else if (a.isWin10 || /Windows\s*10\b/i.test(os)) {
            found.push({ level: 'warn', kind: 'os', text: thai ? 'Windows 10 หมดการสนับสนุนแล้ว (14 ต.ค. 2568) ควรอัปเกรด' : 'Windows 10 support ended (14 Oct 2025), upgrade' });
        }
        return found;
    }

    // One line of the computer's specs, for the map card. Empty strings for what is unknown.
    function specSummaryOf(node) {
        var a = (window.ScpFleetAssess && window.ScpFleetAssess.assessDevice) ? window.ScpFleetAssess.assessDevice(node) : null;
        if (!a) return null;
        var cpu = String(a.cpuName || a.cpu || '').replace(/\(R\)|\(TM\)|CPU|Processor/gi, '').replace(/\s+/g, ' ').trim();
        return {
            cpu: cpu && cpu !== '-' ? cpu : '',
            ram: Number(a.ramGb) > 0 ? a.ramGb + ' GB' : '',
            os: String(a.osCaption || a.os || node.osdesc || '').replace(/Microsoft\s*/i, ''),
            age: (a.yearSource || a.biosYear || a.fiscalYear) && a.ageYears != null ? a.ageYears : null,
            bookValue: a.bookValue,
            type: a.deviceClass,
            disk: a.diskHasSsd ? 'SSD' : '',
            cFree: (a.cDriveFreePct != null ? a.cDriveFreePct : a.cFreePercent),
            score: a.healthScore != null ? a.healthScore : a.score
        };
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

    // The whole fleet in one plain object, for the report. Every judgement here -- who is
    // online, which room a computer sits in, what needs attention -- is the same call the
    // panel above makes (isOnline, roomOf, risksOf, daysAway), so the report can never say
    // something different from what the dashboard shows. Risk texts are already localised.
    // Disk and pending-restart lines only appear for computers whose details were loaded,
    // exactly as on the panel; the report never forces a fleet-wide query to fill them in.
    function snapshot() {
        var list = allNodes();
        var groupMap = {};
        var items = list.map(function (node) {
            var room = roomOf(node);
            var online = isOnline(node);
            var risks = risksOf(node) || [];
            var high = 0, warn = 0;
            risks.forEach(function (risk) { if (risk.level === 'high') { high++; } else { warn++; } });
            if (!groupMap[room]) { groupMap[room] = { name: room, total: 0, online: 0, offline: 0, attention: 0 }; }
            var group = groupMap[room];
            group.total++;
            if (online) { group.online++; } else { group.offline++; }
            if (risks.length) { group.attention++; }
            return { id: node._id, name: node.name || '', room: room, online: online, busy: isBusy(node),
                away: daysAway(node), risks: risks, high: high, warn: warn };
        });
        var groups = Object.keys(groupMap).map(function (key) { return groupMap[key]; })
            .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), thai ? 'th' : 'en'); });
        return { at: Date.now(), total: list.length,
            online: items.filter(function (node) { return node.online; }).length,
            groups: groups, nodes: items };
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
            if (window.ScpCare && window.ScpCare.history) { head.appendChild(button(thai ? 'ผลดูแลล่าสุด' : 'Last care results', 'scp-dash-fix-all', function () { window.ScpCare.history(); })); }
        }
        panelEl.appendChild(head);
        if (!flagged.length) { panelEl.className += ' scp-dash-attention-clear'; return panelEl; }

        var rows = element('div', 'scp-dash-attention-rows');
        flagged.forEach(function (entry, index) {
            var row = element('div', 'scp-dash-attention-row scp-dash-attention-' + entry.worst);
            row.hidden = !attentionExpanded && index >= 5;
            var who = element('div', 'scp-dash-attention-who');
            var whoName = element('strong', '', entry.node.name || '');
            whoName.style.cursor = 'pointer';
            whoName.title = thai ? 'คลิก/จิ้มเพื่อดูสถานะและสเปกเครื่องอย่างละเอียด' : 'Click to view full diagnostics';
            whoName.addEventListener('click', function (e) {
                e.stopPropagation();
                showComputerDetailModal(entry.node);
            });
            who.appendChild(whoName);
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

    function stat(label, value, tone, onClick) {
        var cls = 'scp-dash-stat' + (tone ? ' scp-dash-' + tone : '');
        var card = onClick ? button('', cls + ' scp-assess-stat', onClick) : element('div', cls);
        card.appendChild(element(onClick ? 'span' : 'div', 'scp-dash-stat-value', String(value)));
        card.appendChild(element(onClick ? 'span' : 'div', 'scp-dash-stat-label', label));
        return card;
    }

    function matchesAssessStatus(d, filter) {
        if (filter === 'eligible') return d.win11Status === 'eligible' || d.win11Status === 'already_win11';
        if (filter === 'upgradable' || filter === 'ineligible') return d.win11Status === filter;
        if (filter === 'critical') return d.healthStatus === 'critical' || d.recommendation === 'replace';
        return true;
    }

    function actionCell(node) {
        var cell = element('div', 'scp-dash-actions');
        var online = isOnline(node);
        // Instant RealVNC Remote button (Direct 1-click connection)
        var remoteBtn = button(thai ? 'รีโมท' : 'Remote', 'scp-dash-remote-btn' + (online ? '' : ' off'), function () {
            if (!online) { window.alert(t('offlineAction')); return; }
            openRemote(node);
        });
        remoteBtn.title = thai ? ('เชื่อมต่อรีโมตหน้าจอ: ' + (node.name || '')) : ('Remote control: ' + (node.name || ''));
        var rIcon = document.createElement('img');
        rIcon.src = 'images/vnc/da_summary_general.svg';
        rIcon.className = 'scp-dash-remote-icon';
        rIcon.alt = '';
        remoteBtn.insertBefore(rIcon, remoteBtn.firstChild);
        cell.appendChild(remoteBtn);

        cell.appendChild(button(thai ? 'ใบประเมิน' : 'Fact sheet', 'scp-dash-scan', function () {
            if (window.ScpReport) window.ScpReport.open('device', node._id);
        }));
        cell.appendChild(button(t('scan'), 'scp-dash-scan', function () { scan(node); }));
        if (window.ScpMonitor) cell.appendChild(button(document.documentElement.lang==='th'?'สถานะเครื่อง / Task Manager':'Monitor / Task Manager','scp-dash-scan',function(){window.ScpMonitor.open(node);}));
        if (window.ScpCleanup) cell.appendChild(window.ScpCleanup.control(node));
        if (window.ScpServices) cell.appendChild(button(t('services'), 'scp-dash-scan', function () {
            if (!isOnline(node)) { window.alert(t('offlineAction')); return; }
            window.ScpServices.open(node);
        }));
        if (window.ScpOperations) {
            var on = watched[node._id] === true;
            cell.appendChild(button(on ? t('watchOn') : t('watchOff'), on ? 'scp-dash-watch-on' : 'scp-dash-scan', function () {
                var next = !on; watched[node._id] = next; render();
                window.ScpOperations.request('alertWatchSet', { nodeid: node._id, watch: next })
                    .catch(function () { watched[node._id] = on; render(); });
            }));
        }
        if (fixing[node._id]) { cell.appendChild(element('small', 'scp-dash-note', fixing[node._id].text || t('fixWorking'))); if(window.ScpProgress&&fixing[node._id].progress)cell.appendChild(ScpProgress.view(fixing[node._id].progress,'driver')); }
        cell.appendChild(button(t('restart'), 'scp-dash-off', function () {
            if (!isOnline(node)) { window.alert(t('offlineAction')); return; }
            if (window.ScpPower) window.ScpPower.open(node,'restart');
        }));
        cell.appendChild(button(t('shutdown'), 'scp-dash-off', function () {
            if (!isOnline(node)) { window.alert(t('offlineAction')); return; }
            if (window.ScpPower) window.ScpPower.open(node,'shutdown');
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
        // The server connection may not exist yet when the dashboard first draws (straight after a
        // reload); try again shortly rather than never listening.
        if (!listening && !window.meshserver) { setTimeout(listen, 500); return; }
        if (listening) return;
        listening = true;
        var original = window.meshserver.onMessage;
        window.meshserver.onMessage = function (server, message) {
            try {
                if (chassisReceive(message)) { /* the type check answered its own request */ }
                else if (window.ScpCare && window.ScpCare.receive(message)) { /* care answered its own request */ }
                else if (window.ScpServices && window.ScpServices.receive(message)) { /* services answered its own request */ }
                else if (window.ScpPrograms && window.ScpPrograms.receive(message)) { /* it answered its own question */ }
                else if (message && (message.action === 'getsysinfo') && message.nodeid) {
                    specs[message.nodeid] = (message.hardware || message.noinfo) ? message : null;
                    render();
                    refreshOpenModal(message.nodeid);
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
    /* Hyper-V's own devices report code 37 on a real PC when Windows has Hyper-V or memory
       integrity switched on but the processor's virtualisation (VT-x / AMD SVM) is off in the
       BIOS. No driver fixes that, so it is not offered as a driver install; it is explained. */
    function isVirtualisationNote(fault) {
        return /Hyper-V/i.test(String(fault && fault.name || '')) && Number(fault.code) === 37;
    }
    function virtualisationNotesOf(node) {
        var record = specs[node._id];
        var faults = (record && Array.isArray(record.deviceFaults)) ? record.deviceFaults : [];
        if (!faults.some(isVirtualisationNote)) return [];
        return [{ level: 'warn', kind: 'virt', text: thai
            ? 'Hyper-V (รหัส 37) ไม่ใช่ปัญหาไดรเวอร์ — เปิด SVM/VT-x ใน BIOS หรือปิดฟีเจอร์ Hyper-V ถ้าไม่ได้ใช้ (ไม่กระทบการใช้งานทั่วไป)'
            : 'Hyper-V (code 37) is not a driver problem — turn on SVM/VT-x in the BIOS, or turn Hyper-V off if unused' }];
    }
    function faultsOf(node) {
        var record = specs[node._id];
        var faults = record && record.deviceFaults;
        if (!Array.isArray(faults) || !faults.length) return [];
        var real = faults.filter(function (fault) { return !HOUSEKEEPING.test(String(fault.name || '').trim()) && !isVirtualisationNote(fault); });
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
        if (!hardware) {
            var devAss = window.ScpCachedDeviceAssessments && (window.ScpCachedDeviceAssessments[node._id] || window.ScpCachedDeviceAssessments[node.id]);
            if (devAss) {
                var p = [];
                if (devAss.cpu && devAss.cpu !== '-') p.push(devAss.cpu);
                if (devAss.ramGb) p.push(devAss.ramGb + ' GB');
                var dType = (devAss.diskHasSsd || devAss.hasSsd) ? 'SSD' : 'HDD';
                if (devAss.cFreeGb) p.push(dType + ' · C: ' + devAss.cFreeGb + ' GB (' + (devAss.cFreePercent || devAss.cDriveFreePct || 0) + '%)');
                else p.push(dType);
                return p.length ? p.join('  ·  ') : null;
            }
            return null;
        }
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
        var header = ['ชื่อเครื่อง', 'หน่วยงาน', 'เลขครุภัณฑ์', 'ปีงบประมาณ_พศ', 'ราคาจัดซื้อ_บาท', 'ชื่อเครื่องใน Windows', 'IP', 'รุ่นเครื่อง', 'ยี่ห้อเมนบอร์ด',
                      'CPU', 'การ์ดจอ', 'แรม (GB)', 'ดิสก์', 'ระบบปฏิบัติการ', 'Serial', 'วันที่ BIOS', 'หมายเหตุ',
                      'ปีที่CPUออกขาย_พศ', 'ปีที่ได้มา_พศ_ประมาณ', 'ที่มาของปี', 'ประเภทเครื่อง', 'ราคาตั้งต้น_บาท', 'ที่มาของราคา',
                      'อายุการใช้งาน_ปี', 'ค่าเสื่อมราคาสะสม_บาท', 'มูลค่าคงเหลือตามบัญชี_บาท', 'Windows แท้ / Activate', 'Microsoft Office'];
        var lines = [header.map(csvCell).join(',')];
        rows.forEach(function (node) {
            var hardware = hardwareOf(node), identifiers = hardware.identifiers || {}, windows = hardware.windows || {};
            var ram = 0;
            (windows.memory || []).forEach(function (stick) { ram += Number(stick.Capacity) || 0; });
            var serial = identifiers.bios_serial || identifiers.chassis_serial || '';
            if (/to be filled|default string|none/i.test(serial)) { serial = ''; }
            var bios = String(identifiers.bios_date || '');
            if (/^\d{8}/.test(bios)) { bios = bios.substring(6, 8) + '/' + bios.substring(4, 6) + '/' + bios.substring(0, 4); }
            var asset = (window.ScpCachedAssets && window.ScpCachedAssets[node._id]) || {};
            var devAss = (window.ScpCachedDeviceAssessments && window.ScpCachedDeviceAssessments[node._id]) || {};
            var assetNo = asset.assetNumber || devAss.assetNumber || '';
            var fy = asset.fiscalYear || devAss.fiscalYear || '';
            var pr = asset.price != null ? asset.price : (devAss.purchasePrice != null ? devAss.purchasePrice : '');
            var nt = asset.note || devAss.assetNote || '';
            lines.push([
                node.name, roomOf(node), assetNo, fy, pr, node.rname || node.host || '', node.ip || '',
                identifiers.product_name || '', identifiers.board_vendor || '',
                identifiers.cpu_name || '', identifiers.gpu_name || '',
                ram > 0 ? gigabytes(ram) : '',
                disksOf(node).map(function (d) { return d.letter + ':' + d.free + 'GB'; }).join(' '),
                (node.osdesc || '').replace('Microsoft ', ''), serial, bios, nt
            ].concat((function () {
                var b = (window.ScpFleetAssess && window.ScpFleetAssess.assessDevice) ? window.ScpFleetAssess.assessDevice(node) : null;
                if (!b) return ['', '', '', '', '', '', '', '', '', licenseVerdictOf(node).text, officeVerdictOf(node).text];
                return [b.cpuYear ? b.cpuYear + 543 : '', b.acquiredYearBE || '',
                    { asset: 'ปีงบประมาณครุภัณฑ์', cpu: 'ประมาณจากรุ่น CPU', bios: 'ประมาณจากวันที่ BIOS' }[b.yearSource] || '',
                    (b.deviceClass === 'notebook' ? 'โน้ตบุ๊ก' : b.deviceClass === 'aio' ? 'All-in-One' : 'PC') + ' (' + typeSourceLabel(b.deviceTypeSource) + ')',
                    b.costBasis != null ? b.costBasis : '',
                    b.costSource === 'asset' ? 'ราคาจัดซื้อจริง' : ('ราคากลาง MDES' + (b.referencePriceYearBE ? ' ปี ' + b.referencePriceYearBE : '')),
                    b.usefulLifeYears || '', b.depreciation != null ? b.depreciation : '', b.bookValue != null ? b.bookValue : '', licenseVerdictOf(node).text, officeVerdictOf(node).text];
            })()).map(csvCell).join(','));
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
    // The computers marked to be watched for going offline. Loaded once; the toggle keeps it
    // current after that, so a redraw does not re-ask on every ten-second refresh.
    function loadWatched() {
        if (watchedLoaded || !window.ScpOperations) { return; }
        watchedLoaded = true;
        window.ScpOperations.request('alertWatch').then(function (ids) {
            (ids || []).forEach(function (id) { watched[id] = true; }); render();
        }).catch(function () { watchedLoaded = false; });
    }

    function loadDriverStatus() {
        if(window.ScpCleanup)window.ScpCleanup.refresh();
        loadWatched();
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
    function captureThumbnail(node, entry) {
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
        var shot = button('⤓', 'scp-dash-tile-shot', function (event) { event.stopPropagation(); captureThumbnail(node, entry); });
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
        
        var titleRow = element('div', 'scp-device-title-row');
        var devNameEl = element('strong', 'scp-device-name-text', node.name || node.rname || '');
        devNameEl.style.cursor = 'pointer';
        devNameEl.title = thai ? 'คลิก/จิ้มเพื่อดูสถานะและสเปกเครื่องอย่างละเอียด' : 'Click to view full diagnostics';
        devNameEl.addEventListener('click', function (e) {
            e.stopPropagation();
            showComputerDetailModal(node);
        });
        titleRow.appendChild(devNameEl);
        var release = window.ScpConnection ? window.ScpConnection.releaseBadge(node, true) : null;
        if (release) { titleRow.appendChild(release); }
        label.appendChild(titleRow);

        var metaRow = element('div', 'scp-device-meta-row');
        var ipAddr = node.ip || node.host || '';
        if (ipAddr) {
            var ipPill = element('span', 'scp-ip-pill' + (online ? '' : ' off'), 'IP ' + ipAddr);
            ipPill.title = thai ? 'หมายเลข IP ของเครื่อง' : 'Device IP Address';
            metaRow.appendChild(ipPill);
        }
        var osTxt = (node.osdesc || '').replace('Microsoft ', '');
        if (osTxt) {
            metaRow.appendChild(element('span', 'scp-os-desc', osTxt));
        }
        label.appendChild(metaRow);
        var line = specLine(node);
        if (line) { label.appendChild(element('small', 'scp-dash-specs', line)); }
        if (window.ScpFleetAssess && window.ScpFleetAssess.assessDevice) {
            var devAss = window.ScpFleetAssess.assessDevice(node);
            var tagWrap = element('div', 'scp-dash-assess-tags');
            var assetData = (window.ScpCachedAssets && window.ScpCachedAssets[node._id]) || {};
            var assetNo = assetData.assetNumber || (devAss && devAss.assetNumber) || '';
            var aTag = element('span', 'scp-badge-asset' + (assetNo ? '' : ' empty'), assetNo ? ('🏷️ ' + assetNo) : (thai ? '+ ระบุเลขครุภัณฑ์' : '+ Asset Tag'));
            aTag.title = thai ? 'คลิกเพื่อระบุ/แก้ไข เลขครุภัณฑ์, ปี พ.ศ., งบประมาณ, ราคา' : 'Click to edit asset tag, fiscal year, budget & price';
            aTag.addEventListener('click', function (e) {
                e.stopPropagation();
                if (typeof window.openAssetEditDialog === 'function') {
                    window.openAssetEditDialog(node._id);
                }
            });
            tagWrap.appendChild(aTag);
            if (assetData.fiscalYear) {
                var fyTag = element('span', 'scp-badge-fy', (thai ? 'พ.ศ. ' : 'FY ') + assetData.fiscalYear);
                fyTag.title = thai ? 'ปีงบประมาณ' : 'Fiscal Year';
                fyTag.style.cursor = 'pointer';
                fyTag.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (typeof window.openAssetEditDialog === 'function') window.openAssetEditDialog(node._id);
                });
                tagWrap.appendChild(fyTag);
            }
            if (assetData.price != null && assetData.price > 0) {
                var prTag = element('span', 'scp-badge-price', Number(assetData.price).toLocaleString() + (thai ? ' บ.' : ' THB'));
                prTag.title = thai ? 'ราคาจัดซื้อ' : 'Purchase Price';
                prTag.style.cursor = 'pointer';
                prTag.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (typeof window.openAssetEditDialog === 'function') window.openAssetEditDialog(node._id);
                });
                tagWrap.appendChild(prTag);
            }
            if (assetData.note) {
                var ntTag = element('span', 'scp-badge-note', assetData.note);
                ntTag.title = thai ? 'งบประจำปี / หมายเหตุ' : 'Budget / Note';
                ntTag.style.cursor = 'pointer';
                ntTag.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (typeof window.openAssetEditDialog === 'function') window.openAssetEditDialog(node._id);
                });
                tagWrap.appendChild(ntTag);
            }
            var wTag = element('span', 'scp-badge-' + devAss.win11Status, (devAss.win11Status === 'eligible' || devAss.win11Status === 'already_win11') ? (thai ? 'พร้อม Win 11' : 'Win 11 Ready') : (devAss.win11Status === 'upgradable' ? (thai ? 'อัปเกรดได้' : 'Win 11 Upgradable') : (thai ? 'ไม่รองรับ' : 'Win 11 Unsupported')));
            var hTag = element('span', 'scp-health-' + devAss.healthStatus, 'Health: ' + devAss.healthScore);
            tagWrap.appendChild(wTag);
            tagWrap.appendChild(hTag);

            var devIns = devAss.insight || (window.ScpFleetAssess && window.ScpFleetAssess.getDeviceInsight && window.ScpFleetAssess.getDeviceInsight(devAss));
            if (devIns && (devIns.summary || devIns.why)) {
                var bTag = element('span', 'scp-bulb-badge');
                bTag.innerHTML = '<span class="scp-bulb-icon">💡</span> <span>' + (devIns.summary || (thai ? 'วิเคราะห์เครื่อง' : 'Insight')) + '</span>';
                bTag.title = (devIns.what ? (devIns.what + '\n\n') : '') + (devIns.why ? ('เหตุผล: ' + devIns.why) : '');
                bTag.addEventListener('click', (function (dev, insight) {
                    return function (e) {
                        e.stopPropagation();
                        openDeviceInsightDialog(dev, insight);
                    };
                })(node, devIns));
                tagWrap.appendChild(bTag);
            }
            label.appendChild(tagWrap);
        }
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

    var assessmentExpanded = true, panelAnchor = null;
    function fitAssessmentView() {
        if (!panel) return;
        var expanded = !panel.hidden && activeView === 'assess' && assessmentExpanded;
        panel.classList.toggle('scp-dash-expanded', expanded);
        document.body.classList.toggle('scp-assessment-expanded', expanded);
        // Escape the workspace's clipped scroll container when occupying the viewport.
        if (expanded && panel.parentElement !== document.body) document.body.appendChild(panel);
        else if (!expanded && panelAnchor && panelAnchor.parentNode && panel.parentNode !== panelAnchor.parentNode) {
            panelAnchor.parentNode.insertBefore(panel, panelAnchor.nextSibling);
        }
    }

    function assessmentForPrint(d) {
        var node = allNodes().find(function (n) { return (n._id || n.id) === (d.nodeid || d.nodeId); }) || {};
        return Object.assign({}, d, { reportDetails: {
            ip: node.ip || node.agentip || '', host: node.host || node.rname || '',
            online: isOnline(node), user: signedInUser(node),
            windowsLicense: licenseVerdictOf(node).text, officeLicense: officeVerdictOf(node).text,
            risks: risksOf(node).map(function (r) { return r.text; })
        } });
    }

    function render() {
        if (!body || panel.hidden) return;
        fitAssessmentView();
        loadFleetAssessment();
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
        var tabEntries = [
            ['overview', 'ภาพรวม', 'Overview'],
            ['assess', 'การประเมินสภาพเครื่อง', 'Assessment'],
            ['budget', 'แผนงบประมาณ 5 ปี', 'Budget'],
            ['devices', 'เครื่องทั้งหมด', 'Devices'],
            ['jobs', 'สถานะงาน', 'Jobs'],
            ['reports', 'รายงาน & ชาร์ต', 'Reports']
        ];
        tabEntries.forEach(function (entry) {
            var tab = button(entry[thai ? 1 : 2], 'scp-dash-tab', function () {
                activeView = entry[0];
                if (window.ScpReport && typeof window.ScpReport.close === 'function') window.ScpReport.close();
                var rDialog = document.getElementById('scpReport');
                if (rDialog) { try { rDialog.close(); } catch(e){} rDialog.removeAttribute('open'); }
                var cDialog = document.getElementById('scpComputerModal');
                if (cDialog) cDialog.remove();
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

        var fleetAssess = cachedFleetAssessment || ((window.ScpFleetAssess && window.ScpFleetAssess.assessFleet) ? window.ScpFleetAssess.assessFleet(list) : { win11: {}, health: {}, forecast: {}, budget: {}, devices: [] });

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

        // Banner linking to the dedicated standalone Hospital Map page
        var mapCard = element('div', 'scp-map-overview-banner');
        var mapCardLeft = element('div', 'scp-map-overview-banner-left');
        mapCardLeft.appendChild(element('span', 'scp-map-overview-banner-icon', '🗺️'));
        var mapCardText = element('div', 'scp-map-overview-banner-text');
        mapCardText.appendChild(element('h4', '', thai ? 'ผังแผนที่และจุดบริการโรงพยาบาล (3D HosMap)' : 'Hospital 3D Map & Service Points'));
        mapCardText.appendChild(element('p', '', thai ? 'ดูโมเดล 3D อาคารผู้ป่วยนอก/ใน คลินิก และห้องตรวจ พร้อมตำแหน่งคอมพิวเตอร์และสถานะไฟสดทุกเครื่อง' : 'Interactive 3D model of hospital buildings with real-time workstation status'));
        mapCardLeft.appendChild(mapCardText);
        mapCard.appendChild(mapCardLeft);
        var mapCardBtn = button(thai ? 'เปิดดูผังแผนที่ 3D →' : 'Open 3D Map →', 'scp-map-overview-banner-btn', function () {
            showMap();
        });
        mapCard.appendChild(mapCardBtn);
        sections.overview.appendChild(mapCard);

        // --- Assess Tab ---
        var assessSec = sections.assess;
        assessSec.appendChild(element('h3', '', thai ? 'การประเมินสภาพเครื่องและความพร้อมอัปเกรด Windows 11' : 'Hardware Lifespan & Windows 11 Assessment'));
        var assessToolbar = element('div', 'scp-assess-toolbar');
        assessToolbar.appendChild(button(assessmentExpanded ? (thai ? 'กลับหน้าปกติ' : 'Normal view') : (thai ? 'ขยายเต็มจอ' : 'Expand view'), 'scp-dash-refresh', function () {
            assessmentExpanded = !assessmentExpanded;
            render(); fitHeight();
        }));
        assessSec.appendChild(assessToolbar);
        // Scope both counts and rows to the same devices, including room/search filters.
        var shownIds = new Set(list.map(function (n) { return n._id || n.id; }));
        var assessedDevices = (fleetAssess.devices || []).filter(function (d) {
            return shownIds.has(d.nodeid || d.nodeId);
        });
        var currentAssessFilter = window.__assessFilter || 'all';
        var assessFilters = [
            ['all', thai ? 'ทุกเครื่อง' : 'All', 'busy'],
            ['eligible', thai ? 'พร้อมใช้งาน' : 'Ready', 'ok'],
            ['upgradable', thai ? 'อัปเกรดได้' : 'Upgradable', 'idle'],
            ['ineligible', thai ? 'ไม่รองรับ' : 'Unsupported', 'risk'],
            ['critical', thai ? 'วิกฤต/ต้องเปลี่ยน' : 'Critical/Replace', 'risk']
        ];
        var assessCounts = {};
        assessFilters.forEach(function (f) {
            assessCounts[f[0]] = assessedDevices.filter(function (d) { return matchesAssessStatus(d, f[0]); }).length;
        });
        var aStats = element('div', 'scp-dash-stats scp-assess-stats');
        assessFilters.slice(1).forEach(function (f) {
            var card = stat(f[1], assessCounts[f[0]], f[2], function () {
                window.__assessFilter = f[0];
                render();
            });
            card.dataset.assessFilter = f[0];
            card.setAttribute('aria-pressed', String(currentAssessFilter === f[0]));
            card.title = thai ? 'กดดูรายชื่อและรายละเอียดเครื่อง' : 'Show devices and details';
            aStats.appendChild(card);
        });
        assessSec.appendChild(aStats);
        assessSec.appendChild(element('p', 'scp-dash-note', thai ?
            'กดตัวเลขเพื่อดูรายชื่อ · พร้อมใช้งานรวมเครื่องที่ลง Windows 11 แล้วและไม่ต้องเพิ่ม RAM · วิกฤต/ต้องเปลี่ยนเป็นธงสุขภาพ อาจซ้ำกับกลุ่มความพร้อม' :
            'Select a count to see devices. Ready includes Windows 11 devices with sufficient RAM. Critical/Replace is a health flag and may overlap readiness groups.'));

        var upgradeableDevices = assessedDevices.filter(function (d) { return d.win11Status === 'upgradable'; });
        if (upgradeableDevices.length) {
            var upgradeCost = upgradeableDevices.reduce(function (sum, d) { return sum + (d.upgradeCost || 0); }, 0);
            var replacementCost = upgradeableDevices.reduce(function (sum, d) { return sum + (d.replacementCost || (fleetAssess.criteria && fleetAssess.criteria.costs && fleetAssess.criteria.costs.newDevice) || 18000); }, 0);
            assessSec.appendChild(element('p', 'scp-assess-savings', thai ?
                'อัปเกรด ' + upgradeableDevices.length + ' เครื่อง: ประมาณ ' + upgradeCost.toLocaleString() + ' บาท เทียบซื้อใหม่ ' + replacementCost.toLocaleString() + ' บาท · ประหยัดประมาณ ' + Math.max(0, replacementCost - upgradeCost).toLocaleString() + ' บาท (ตามเกณฑ์ราคาที่ตั้งไว้)' :
                'Upgrade ' + upgradeableDevices.length + ' devices: estimated ฿' + upgradeCost.toLocaleString() + ' vs ฿' + replacementCost.toLocaleString() + ' new · estimated savings ฿' + Math.max(0, replacementCost - upgradeCost).toLocaleString() + ' (configured prices)'));
        }

        // Spare parts the read-only check found a need for, across the computers shown.
        var partCount = { disk: 0, cmos: 0, fan: 0, ups: 0 }, partCost = 0, upsCost = 0;
        assessedDevices.forEach(function (d) {
            (d.maintenance || []).forEach(function (m) {
                partCount[m.type] = (partCount[m.type] || 0) + 1;
                if (m.optional) upsCost += m.cost || 0; else partCost += m.cost || 0;
            });
        });
        if (partCount.disk || partCount.cmos || partCount.fan || partCount.ups) {
            assessSec.appendChild(element('p', 'scp-assess-savings', thai
                ? ('🔧 อะไหล่ที่ควรเปลี่ยน: ดิสก์ใกล้เสีย ' + partCount.disk + ' · ถ่าน BIOS ' + partCount.cmos + ' · พัดลม/ความร้อน ' + partCount.fan + ' เครื่อง — งบประมาณ ' + partCost.toLocaleString() + ' บาท' +
                    (partCount.ups ? ' · ไม่พบ UPS ต่อ USB ' + partCount.ups + ' เครื่อง (ถ้าซื้อครบ ≈ ' + upsCost.toLocaleString() + ' บาท)' : ''))
                : ('🔧 Parts: failing disks ' + partCount.disk + ' · BIOS batteries ' + partCount.cmos + ' · fans/heat ' + partCount.fan + ' — ฿' + partCost.toLocaleString() +
                    (partCount.ups ? ' · no USB UPS on ' + partCount.ups + ' (≈ ฿' + upsCost.toLocaleString() + ')' : ''))));
        }

        var aFilterWrap = element('div', 'scp-dash-assess-filters');
        aFilterWrap.appendChild(element('span', 'scp-dash-rooms-label', thai ? 'กรองตามสถานะ:' : 'Filter:'));
        assessFilters.forEach(function (f) {
            var chip = button(f[1] + ' (' + assessCounts[f[0]] + ')', 'scp-assess-pill' + (currentAssessFilter === f[0] ? ' on' : ''), function () {
                window.__assessFilter = f[0];
                render();
            });
            chip.dataset.assessFilter = f[0];
            chip.setAttribute('aria-pressed', String(currentAssessFilter === f[0]));
            aFilterWrap.appendChild(chip);
        });
        assessSec.appendChild(aFilterWrap);

        var aTable = element('table', 'scp-dash-table');
        var aHead = element('thead');
        var aHTr = element('tr');
        [
            thai ? 'ชื่อเครื่อง / แผนก' : 'Computer / Room',
            thai ? 'CPU' : 'CPU',
            thai ? 'RAM' : 'RAM',
            thai ? 'ดิสก์' : 'Disk',
            thai ? 'สถานะ Win 11' : 'Win 11 Status',
            thai ? 'คะแนนสุขภาพ' : 'Health Score',
            thai ? 'ปีงบที่ควรเปลี่ยน' : 'Replace FY',
            thai ? 'ใบประเมิน' : 'Fact Sheet'
        ].forEach(function (h) { aHTr.appendChild(element('th', '', h)); });
        aHead.appendChild(aHTr);
        aTable.appendChild(aHead);

        var aBody = element('tbody');
        var filteredAssessed = assessedDevices.filter(function (d) {
            return matchesAssessStatus(d, currentAssessFilter);
        });
        if (window.ScpReport && window.ScpReport.printAssessment) {
            var printSelected = button((thai ? 'พิมพ์รายละเอียดกลุ่มที่เลือก (' : 'Print selected group (') + filteredAssessed.length + ')', 'scp-dash-refresh scp-assess-print', function () {
                window.ScpReport.printAssessment(filteredAssessed.map(assessmentForPrint), { criteria: fleetAssess.criteria, scope: assessFilters.find(function (f) { return f[0] === currentAssessFilter; })[1] });
            });
            printSelected.disabled = !filteredAssessed.length;
            assessToolbar.appendChild(printSelected);
            var allAssessments = (fleetAssess.devices || []).filter(function (d) {
                return allNodes().some(function (n) { return (n._id || n.id) === (d.nodeid || d.nodeId); });
            });
            var printAll = button((thai ? 'พิมพ์ทุกเครื่อง (' : 'Print all devices (') + allAssessments.length + ')', 'scp-dash-refresh scp-assess-print-all', function () {
                window.ScpReport.printAssessment(allAssessments.map(assessmentForPrint), { criteria: fleetAssess.criteria, scope: thai ? 'ทุกเครื่อง' : 'All devices' });
            });
            printAll.disabled = !allAssessments.length;
            assessToolbar.appendChild(printAll);
        }
        assessSec.appendChild(element('p', 'scp-dash-note', (thai ? 'แสดง ' : 'Showing ') + filteredAssessed.length + ' / ' + assessedDevices.length + (thai ? ' เครื่อง' : ' devices')));

        if (!filteredAssessed.length) {
            var emptyRow = element('tr');
            var emptyCell = element('td', '', thai ? 'ไม่พบเครื่องในเงื่อนไขที่เลือก' : 'No devices match this filter');
            emptyCell.colSpan = 8;
            emptyRow.appendChild(emptyCell);
            aBody.appendChild(emptyRow);
        } else {
            filteredAssessed.forEach(function (d) {
                var tr = element('tr');
                var tdName = element('td');
                tdName.appendChild(element('strong', '', d.name));
                tdName.appendChild(element('small', 'scp-dash-note', ' · ' + (d.room || 'General') + ' (' + (d.os || d.osCaption || '').replace('Microsoft ', '') + ')'));
                tr.appendChild(tdName);

                var tdCpu = element('td');
                tdCpu.appendChild(element('span', '', d.cpu || d.cpuName || '-'));
                var cpuReason = (d.cpuEval && !d.cpuEval.supported && d.cpuEval.reason) || (!d.cpuSupported && d.cpuReason) || null;
                if (cpuReason) {
                    tdCpu.appendChild(element('small', 'scp-dash-flag high', cpuReason));
                }
                var ins = d.insight || (window.ScpFleetAssess && window.ScpFleetAssess.getDeviceInsight && window.ScpFleetAssess.getDeviceInsight(d));
                if (ins && (ins.summary || ins.why)) {
                    var bulb = element('div', 'scp-bulb-badge');
                    bulb.innerHTML = '<span class="scp-bulb-icon">💡</span> <span>' + (ins.summary || ins.what) + '</span>';
                    bulb.title = (ins.what ? (ins.what + '\n\n') : '') + (ins.why ? ('เหตุผล: ' + ins.why) : '');
                    bulb.addEventListener('click', (function (dev, insight) {
                        return function (e) {
                            e.stopPropagation();
                            openDeviceInsightDialog(dev, insight);
                        };
                    })(d, ins));
                    tdCpu.appendChild(bulb);
                }
                tr.appendChild(tdCpu);

                tr.appendChild(element('td', '', (d.ramGb || 0) + ' GB'));
                tr.appendChild(element('td', '', (d.diskHasSsd || d.hasSsd) ? 'SSD' : 'HDD'));

                var tdWin = element('td');
                var isWin11Already = d.win11Status === 'already_win11';
                var badgeCls = isWin11Already ? 'scp-badge-eligible' : ('scp-badge-' + d.win11Status);
                var badgeTxt = isWin11Already ? (thai ? 'ลง Win 11 แล้ว' : 'Already Win 11') :
                    (d.win11Status === 'eligible' ? (thai ? 'พร้อมใช้' : 'Eligible') :
                    (d.win11Status === 'upgradable' ? (thai ? 'อัปเกรดได้' : 'Upgradable') : (thai ? 'ไม่รองรับ' : 'Ineligible')));
                tdWin.appendChild(element('span', badgeCls, badgeTxt));
                if (d.isWin11 && !isWin11Already) tdWin.appendChild(element('small', 'scp-dash-note', thai ? 'ลง Win 11 แล้ว' : 'Windows 11 installed'));
                (d.win11Blockers || []).forEach(function (reason) { tdWin.appendChild(element('small', 'scp-dash-note', reason)); });
                (d.upgradeActions || d.upgradeSuggestions || []).forEach(function (action) {
                    tdWin.appendChild(element('small', 'scp-dash-note', typeof action === 'string' ? action : action.note));
                });
                (d.maintenance || []).forEach(function (m) {
                    tdWin.appendChild(element('small', 'scp-dash-note' + (m.urgent ? ' scp-note-urgent' : ''), '🔧 ' + m.note + ' (≈ ' + (m.cost || 0).toLocaleString() + (thai ? ' บาท)' : ' THB)')));
                });
                if (d.recommendation === 'upgrade') tdWin.appendChild(element('small', 'scp-dash-note', (thai ? 'งบอัปเกรดประมาณ ' : 'Estimated upgrade ฿') + (d.upgradeCost || 0).toLocaleString() + (thai ? ' บาท' : '')));
                tr.appendChild(tdWin);

                var tdHealth = element('td');
                tdHealth.appendChild(element('span', 'scp-health-' + (d.healthStatus || 'fair'), (d.healthScore || d.score || 0) + ' / 100'));
                tr.appendChild(tdHealth);

                var replacementYear = d.replacementYear || d.replaceByYear;
                tr.appendChild(element('td', '', replacementYear ? String(Number(replacementYear) + (thai ? 543 : 0)) : '-'));

                var tdAct = element('td');
                tdAct.appendChild(button(thai ? 'ใบประเมิน' : 'Fact sheet', 'scp-dash-refresh', function () {
                    if (window.ScpReport) window.ScpReport.open('device', d.nodeid || d.nodeId);
                }));
                if (window.ScpReport && window.ScpReport.printAssessment) tdAct.appendChild(button(thai ? 'พิมพ์เครื่องนี้' : 'Print this device', 'scp-dash-refresh scp-assess-print-device', function () {
                    window.ScpReport.printAssessment([assessmentForPrint(d)], { criteria: fleetAssess.criteria, scope: d.name });
                }));
                tr.appendChild(tdAct);

                aBody.appendChild(tr);
            });
        }
        aTable.appendChild(aBody);
        var aTableWrap = element('div', 'scp-assess-table-wrap');
        aTableWrap.appendChild(aTable);
        assessSec.appendChild(aTableWrap);

        // --- Budget Tab ---
        var budgetSec = sections.budget;
        var currentYear = fleetAssess.budgetYearBE ? fleetAssess.budgetYearBE - 543 : (window.ScpPriceReference ? window.ScpPriceReference.fiscalYearBE() - 543 : new Date().getFullYear());
        var bg = (fleetAssess && fleetAssess.budget) || {};
        var bgCur = bg.currentYear || {};
        var bgNext = bg.nextYear || {};
        var bgY23 = bg.year2to3 || {};
        budgetSec.appendChild(element('h3', '', thai ? 'ประมาณการงบประมาณจัดซื้อและอัปเกรด 1-5 ปี' : '5-Year Hardware Budget Forecast'));
        if (fleetAssess.criteria && fleetAssess.criteria.useReferencePricesForReplacement && fleetAssess.criteria.budgetYearBE === 2570) {
            var referenceNote = thai ? 'งบประมาณ 2570 ใช้เกณฑ์ราคากลางฉบับร่างที่แนบ ราคาซื้อทดแทนแยกตามชนิดและประเภทงานที่เลือกในเกณฑ์ประเมิน' : 'FY 2570 uses the supplied draft prices and the selected procurement category for each device type.';
            budgetSec.appendChild(element('p', 'scp-assess-savings', referenceNote));
            assessSec.insertBefore(element('p', 'scp-dash-note', referenceNote), aStats);
        }

        var bStats = element('div', 'scp-dash-stats');
        bStats.appendChild(stat(thai ? 'ปีนี้ (' + (currentYear + 543) + ')' : 'This Year', (bgCur.total || 0).toLocaleString() + ' ฿', 'risk'));
        bStats.appendChild(stat(thai ? 'ปีหน้า (' + (currentYear + 544) + ')' : 'Next Year', (bgNext.total || 0).toLocaleString() + ' ฿', 'idle'));
        bStats.appendChild(stat(thai ? 'ปี ' + (currentYear + 545) + '-' + (currentYear + 546) : 'Years 2-3', (bgY23.total || 0).toLocaleString() + ' ฿', 'busy'));
        bStats.appendChild(stat(thai ? 'รวมงบประมาณ 5 ปี' : '5-Year Total', (bg.fiveYearTotal || 0).toLocaleString() + ' ฿', 'ok'));
        budgetSec.appendChild(bStats);

        if (window.ScpReport && window.ScpReport.createBarChart) {
            var bChartBox = element('div', 'scp-dash-chart-box');
            bChartBox.style.margin = '16px 0';
            bChartBox.appendChild(element('h4', '', thai ? 'กราฟสัดส่วนงบประมาณจัดซื้อและอัปเกรดรายปี (บาท)' : 'Yearly Budget Allocation (THB)'));
            bChartBox.appendChild(window.ScpReport.createBarChart([
                { label: String(currentYear + 543), value: (bgCur.replace || bgCur.total || 0), color: '#ef4444', secondary: (bgCur.upgrade || 0), secondaryColor: '#f59e0b' },
                { label: String(currentYear + 544), value: (bgNext.replace || bgNext.total || 0), color: '#3b82f6' },
                { label: (currentYear + 545) + '-' + (currentYear + 546), value: (bgY23.replace || bgY23.total || 0), color: '#6366f1' },
                { label: (currentYear + 547) + '-' + (currentYear + 548), value: (bg.year4to5 ? (bg.year4to5.replace || bg.year4to5.total) : 0), color: '#10b981' }
            ], 560, 200, '฿'));
            budgetSec.appendChild(bChartBox);
        }

        var bActions = element('div', 'scp-dash-heading-actions');
        bActions.style.position = 'static';
        bActions.style.margin = '14px 0';
        bActions.appendChild(button(thai ? 'พิมพ์รายงานแผนงบประมาณ (PDF)' : 'Print Budget Report (PDF)', 'scp-dash-refresh', function () {
            if (window.ScpReport) window.ScpReport.open('budget');
        }));
        budgetSec.appendChild(bActions);

        budgetSec.appendChild(element('h4', '', thai ? 'ประมาณการแยกตามหน่วยงาน / วอร์ด' : 'Department Budget Allocation'));
        var bTable = element('table', 'scp-dash-table');
        var bHead = element('thead'), bHTr = element('tr');
        [
            thai ? 'หน่วยงาน' : 'Department',
            thai ? 'เครื่องทั้งหมด' : 'Total',
            thai ? 'ต้องเปลี่ยนปีนี้' : 'Replace Now',
            thai ? 'อัปเกรดได้' : 'Upgradable',
            thai ? 'งบประมาณประมาณการ (บาท)' : 'Est. Budget (THB)'
        ].forEach(function (h) { bHTr.appendChild(element('th', '', h)); });
        bHead.appendChild(bHTr);
        bTable.appendChild(bHead);
        var bBody = element('tbody');
        var roomKeys = Object.keys(fleetAssess.byRoom || {}).sort();
        if (!roomKeys.length) {
            var bEr = element('tr'), bEc = element('td', '', thai ? 'ไม่มีข้อมูล' : 'No data');
            bEc.colSpan = 5; bEr.appendChild(bEc); bBody.appendChild(bEr);
        } else {
            roomKeys.forEach(function (rName) {
                var r = fleetAssess.byRoom[rName];
                var tr = element('tr');
                tr.appendChild(element('td', '', rName));
                tr.appendChild(element('td', '', String(r.total)));
                tr.appendChild(element('td', '', String(r.replaceNow || 0)));
                tr.appendChild(element('td', '', String(r.upgradable || 0)));
                tr.appendChild(element('td', '', (r.cost || 0).toLocaleString() + ' ฿'));
                bBody.appendChild(tr);
            });
        }
        bTable.appendChild(bBody);
        budgetSec.appendChild(bTable);

        // --- Jobs Tab ---
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

        // --- Reports Tab ---
        sections.reports.appendChild(element('h3', '', thai ? 'รายงานและแบบฟอร์มประเมิน (สำหรับพิมพ์ / PDF)' : 'Printable Fleet & Assessment Reports'));
        var repCards = element('div', 'scp-dash-report-cards');
        [
            ['overview', thai ? '1. รายงานภาพรวมทั้งโรงพยาบาล' : '1. Hospital Fleet Overview', thai ? 'สรุปจำนวนเครื่อง ความพร้อม Windows 11 และสถิติภาพรวม' : 'Fleet availability and Windows 11 readiness'],
            ['department', thai ? '2. รายงานแยกตามหน่วยงาน / วอร์ด' : '2. By Department / Ward', thai ? 'รายงานผลการประเมินฮาร์ดแวร์และสรุปรายแผนก' : 'Department hardware status and replacement priorities'],
            ['device', thai ? '3. ใบประเมินสภาพเครื่องรายเครื่อง' : '3. Individual Device Fact Sheet', thai ? 'สเปกเครื่อง คะแนนสุขภาพ และกราฟความน่าจะเป็น 1-5 ปี' : 'Detailed device fact sheet with survival sparkline'],
            ['budget', thai ? '4. แผนงบประมาณจัดซื้อและอัปเกรด 1-5 ปี' : '4. 5-Year Budget Forecast', thai ? 'ประมาณการค่าใช้จ่ายครุภัณฑ์คอมพิวเตอร์ล่วงหน้า 5 ปี' : '5-year hardware budget breakdown']
        ].forEach(function (rItem) {
            var card = element('article', 'scp-dash-report-card');
            card.appendChild(element('strong', '', rItem[1]));
            card.appendChild(element('p', '', rItem[2]));
            card.appendChild(button(thai ? 'เปิดรายงาน / พิมพ์' : 'Open / Print', 'scp-dash-refresh', function () {
                if (window.ScpReport) window.ScpReport.open(rItem[0]);
            }));
            repCards.appendChild(card);
        });
        sections.reports.appendChild(repCards);

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

        fitHeight();
        if (scrollTop > 0) { panel.scrollTop = scrollTop; }
    }

    // The workspace column clips whatever overflows it, so each page scrolls itself.
    // Measure the space actually left below the header instead of assuming a height,
    // which keeps working if the header or the language bar changes size.
    function fitHeight() {
        if (panel && !panel.hidden) {
            var top = panel.getBoundingClientRect().top;
            var panelBottom = window.innerHeight;
            var dashboardFooter = document.getElementById('footer');
            if (!panel.classList.contains('scp-dash-expanded') && dashboardFooter && dashboardFooter.offsetHeight) {
                var footerTop = dashboardFooter.getBoundingClientRect().top;
                if (footerTop > top && footerTop < panelBottom) panelBottom = footerTop;
            }
            var available = panelBottom - top - (panel.classList.contains('scp-dash-expanded') ? 0 : 8);
            panel.style.maxHeight = Math.max(0, available) + 'px';
            panel.style.boxSizing = 'border-box';
        }
        if (mapPanel && !mapPanel.hidden) {
            var mTop = mapPanel.getBoundingClientRect().top;
            // Stop above the footer when it sits over the bottom of the window.
            var bottom = window.innerHeight;
            var footer = document.getElementById('footer');
            if (footer && footer.offsetHeight) {
                var fTop = footer.getBoundingClientRect().top;
                if (fTop > mTop && fTop < bottom) bottom = fTop;
            }
            var mAvailable = bottom - mTop - 8;
            mapPanel.style.maxHeight = Math.max(240, mAvailable) + 'px';
            // The map itself takes all the room left under the page's top bars, so nothing
            // of it (legend, at-risk button) hides below the fold.
            var wrap = mapPanel.querySelector('.scp-map-wrapper');
            if (wrap && !wrap.classList.contains('scp-map-full')) {
                var wTop = wrap.getBoundingClientRect().top - mapPanel.getBoundingClientRect().top + mapPanel.scrollTop;
                wrap.style.height = Math.max(420, Math.round(mAvailable - wTop - 14)) + 'px';
            }
        }
    }
    function stripUnwantedNav() {
        [
            'scp-back-to-devices',
            'LeftMenuMyDevices',
            'LeftMenuMyFiles',
            'MainMenuMyDevices',
            'MainMenuMyFiles',
            'MainDevDesktop',
            'MainDevTerminal',
            'MainDevFiles',
            'MainDevRegistry',
            'MainDevApps',
            'MainDevAmt',
            'MainDevConsole',
            'MainDevPlugins',
            'p9',
            'p12',
            'p13',
            'p14',
            'p15',
            'p18',
            'p19'
        ].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.style.setProperty('display', 'none', 'important');
        });
    }
    function showDashboard() {
        if (mapPanel) mapPanel.hidden = true;
        stripUnwantedNav();
        if (!panel) return;
        document.querySelectorAll('#page_leftbar .lbbutton').forEach(function (item) { item.classList.remove('lbbuttonsel'); });
        var navButton = document.getElementById('LeftMenuScpDashboard');
        if (navButton) navButton.classList.add('lbbuttonsel');
        // Hide whatever page the site is showing (p0-p60) without touching how it manages them.
        for (var i = 0; i <= 60; i++) {
            var page = document.getElementById('p' + i);
            if (page && page.style.display !== 'none') { page.dataset.scpHidden = '1'; page.style.display = 'none'; }
        }
        ['MainSubMenuSpan', 'MeshSubMenuSpan', 'EventsSubMenuSpan', 'UserSubMenuSpan', 'ServerSubMenuSpan', 'UsersSubMenuSpan'].forEach(function (id) {
            var sub = document.getElementById(id);
            if (sub && sub.style.display !== 'none') { sub.dataset.scpHidden = '1'; sub.style.display = 'none'; }
        });
        if (typeof window.xxcurrentView !== 'undefined' && window.xxcurrentView !== 1) {
            window.xxcurrentView = 1;
        }
        panel.hidden = false;
        listen();
        loadDriverStatus();
        render();
        fitHeight();
        if (!timer) timer = window.setInterval(function(){loadDriverStatus();render();}, 10000);
    }
    function showMap() {
        if (panel) panel.hidden = true;
        fitAssessmentView();
        stripUnwantedNav();
        if (!mapPanel) return;
        document.querySelectorAll('#page_leftbar .lbbutton').forEach(function (item) { item.classList.remove('lbbuttonsel'); });
        var navButton = document.getElementById('LeftMenuScpHosMap');
        if (navButton) navButton.classList.add('lbbuttonsel');
        for (var i = 0; i <= 60; i++) {
            var page = document.getElementById('p' + i);
            if (page && page.style.display !== 'none') { page.dataset.scpHidden = '1'; page.style.display = 'none'; }
        }
        ['MainSubMenuSpan', 'MeshSubMenuSpan', 'EventsSubMenuSpan', 'UserSubMenuSpan', 'ServerSubMenuSpan', 'UsersSubMenuSpan'].forEach(function (id) {
            var sub = document.getElementById(id);
            if (sub && sub.style.display !== 'none') { sub.dataset.scpHidden = '1'; sub.style.display = 'none'; }
        });
        if (typeof window.xxcurrentView !== 'undefined' && window.xxcurrentView !== 1) {
            window.xxcurrentView = 1;
        }
        mapPanel.hidden = false;
        listen();
        mapLastOnline = null;
        checkOfflineTransitions();
        renderMapPage();
        fitHeight();
        // Keep the computer status on the map live without rebuilding the page.
        if (!mapTimer) mapTimer = window.setInterval(function () {
            if (!mapPanel || mapPanel.hidden || campusViewMode !== 'map' || selectedCampusDept) return;
            if (currentIsoMap && currentIsoMap.canvas.isConnected) {
                currentIsoMap.setNodes(allNodes().filter(matchesSearch));
                loadMapPlacements();
                if (mapRiskRefresh) mapRiskRefresh();
                checkOfflineTransitions();
            }
        }, 10000);
    }
    var show = showDashboard;
    function hide() {
        if (mapPanel) mapPanel.hidden = true;
        if (!panel || panel.hidden) return;
        panel.hidden = true;
        fitAssessmentView();
        stopAllTiles();
        if (window.ScpReport && typeof window.ScpReport.close === 'function') window.ScpReport.close();
        var rDialog = document.getElementById('scpReport');
        if (rDialog) { try { rDialog.close(); } catch (e) {} rDialog.removeAttribute('open'); }
        var iDialog = document.getElementById('scpInsightDialog');
        if (iDialog) iDialog.remove();
        var aDialog = document.getElementById('scpAssetDialog');
        if (aDialog) aDialog.remove();
        var cDialog = document.getElementById('scpComputerModal');
        if (cDialog) cDialog.remove();
        var navButton = document.getElementById('LeftMenuScpDashboard');
        if (navButton) navButton.classList.remove('lbbuttonsel');
        var mapNavBtn = document.getElementById('LeftMenuScpHosMap');
        if (mapNavBtn) mapNavBtn.classList.remove('lbbuttonsel');
        document.querySelectorAll('[data-scp-hidden]').forEach(function (page) {
            page.style.display = '';
            delete page.dataset.scpHidden;
        });
        if (timer) { window.clearInterval(timer); timer = null; }
    }

    function openAssetEditDialog(nodeid) {
        var node = (window.currentDevices && window.currentDevices.find(function (n) { return n._id === nodeid; })) ||
                   (window.nodes && window.nodes[nodeid]) || { _id: nodeid, name: nodeid };
        var asset = (window.ScpCachedAssets && window.ScpCachedAssets[nodeid]) || {};
        var devAss = (window.ScpCachedDeviceAssessments && window.ScpCachedDeviceAssessments[nodeid]) || {};

        var existingDialog = document.getElementById('scpAssetDialog');
        if (existingDialog) existingDialog.remove();

        var dialog = element('div', 'scp-asset-dialog-overlay');
        dialog.id = 'scpAssetDialog';

        var box = element('div', 'scp-asset-dialog-box');

        var header = element('div', 'scp-asset-dialog-header');
        var title = element('h3', '', thai ? '🏷️ จัดการข้อมูลครุภัณฑ์และงบประมาณ' : '🏷️ Asset & Budget Management');
        var closeBtn = element('button', 'scp-dialog-close-btn', '✕');
        closeBtn.type = 'button';
        closeBtn.onclick = function () { dialog.remove(); };
        header.appendChild(title);
        header.appendChild(closeBtn);
        box.appendChild(header);

        var devInfo = element('div', 'scp-asset-dialog-device');
        devInfo.innerHTML = '<strong>' + (node.name || node.rname || nodeid) + '</strong>' +
            ((node.ip || node.host) ? (' <span class="scp-ip-pill">IP: ' + (node.ip || node.host) + '</span>') : '');
        box.appendChild(devInfo);

        var form = element('div', 'scp-asset-dialog-form');

        var fAsset = element('div', 'scp-form-group');
        fAsset.appendChild(element('label', '', thai ? 'เลขครุภัณฑ์ (Asset Number)' : 'Asset Number'));
        var inpAsset = document.createElement('input');
        inpAsset.type = 'text';
        inpAsset.className = 'scp-form-input';
        inpAsset.placeholder = thai ? 'เช่น 7440-001-0001/67' : 'e.g. 7440-001-0001/67';
        inpAsset.value = asset.assetNumber || devAss.assetNumber || '';
        fAsset.appendChild(inpAsset);
        form.appendChild(fAsset);

        var fYear = element('div', 'scp-form-group');
        fYear.appendChild(element('label', '', thai ? 'พ.ศ. (ปีงบประมาณ เช่น 2567)' : 'Fiscal Year (e.g. 2567)'));
        var inpYear = document.createElement('input');
        inpYear.type = 'number';
        inpYear.className = 'scp-form-input';
        inpYear.placeholder = '2567';
        inpYear.value = asset.fiscalYear || devAss.fiscalYear || '';
        fYear.appendChild(inpYear);
        form.appendChild(fYear);

        var fNote = element('div', 'scp-form-group');
        fNote.appendChild(element('label', '', thai ? 'งบประจำปี / ประเภทงบ (เช่น งบประจำปี 67, เงินบำรุง, งบลงทุน)' : 'Budget Source / Category'));
        var inpNote = document.createElement('input');
        inpNote.type = 'text';
        inpNote.className = 'scp-form-input';
        inpNote.placeholder = thai ? 'เช่น งบประจำปี 2567, เงินบำรุง' : 'e.g. Annual Budget 2024';
        inpNote.value = asset.note || asset.assetNote || devAss.assetNote || '';
        fNote.appendChild(inpNote);
        form.appendChild(fNote);

        var fPrice = element('div', 'scp-form-group');
        fPrice.appendChild(element('label', '', thai ? 'ราคาที่จัดซื้อ (บาท)' : 'Purchase Price (THB)'));
        var inpPrice = document.createElement('input');
        inpPrice.type = 'number';
        inpPrice.step = 'any';
        inpPrice.className = 'scp-form-input';
        inpPrice.placeholder = '25000';
        inpPrice.value = (asset.price != null) ? asset.price : ((devAss.purchasePrice != null) ? devAss.purchasePrice : '');
        fPrice.appendChild(inpPrice);
        form.appendChild(fPrice);

        box.appendChild(form);

        var actions = element('div', 'scp-asset-dialog-actions');
        var statusMsg = element('span', 'scp-save-status');

        var cancelBtn = element('button', 'scp-btn-cancel', thai ? 'ยกเลิก' : 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.onclick = function () { dialog.remove(); };

        var saveBtn = element('button', 'scp-btn-save', thai ? '💾 บันทึกข้อมูล' : '💾 Save');
        saveBtn.type = 'button';

        saveBtn.onclick = function () {
            saveBtn.disabled = true;
            statusMsg.textContent = thai ? 'กำลังบันทึก...' : 'Saving...';
            var assetVal = inpAsset.value.trim();
            var yearVal = inpYear.value ? parseInt(inpYear.value, 10) : null;
            var priceVal = inpPrice.value ? parseFloat(inpPrice.value) : null;
            var noteVal = inpNote.value.trim();

            if (window.ScpOperations && window.ScpOperations.request) {
                window.ScpOperations.request('saveAssetInfo', {
                    nodeid: nodeid,
                    assetNumber: assetVal,
                    fiscalYear: yearVal,
                    price: priceVal,
                    note: noteVal
                }).then(function (res) {
                    if (!window.ScpCachedAssets) window.ScpCachedAssets = {};
                    window.ScpCachedAssets[nodeid] = {
                        nodeid: nodeid,
                        assetNumber: assetVal,
                        fiscalYear: yearVal,
                        price: priceVal,
                        note: noteVal
                    };
                    dialog.remove();
                    render();
                }).catch(function (err) {
                    saveBtn.disabled = false;
                    statusMsg.textContent = thai ? ('เกิดข้อผิดพลาด: ' + (err.message || err)) : ('Error: ' + (err.message || err));
                });
            } else {
                if (!window.ScpCachedAssets) window.ScpCachedAssets = {};
                window.ScpCachedAssets[nodeid] = { nodeid: nodeid, assetNumber: assetVal, fiscalYear: yearVal, price: priceVal, note: noteVal };
                dialog.remove();
                render();
            }
        };

        actions.appendChild(statusMsg);
        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        box.appendChild(actions);

        dialog.appendChild(box);
        document.body.appendChild(dialog);
        inpAsset.focus();
    }
    window.openAssetEditDialog = openAssetEditDialog;

    function openDeviceInsightDialog(d, ins) {
        if (!d) return;
        if (!ins) {
            ins = d.insight || (window.ScpFleetAssess && window.ScpFleetAssess.getDeviceInsight && window.ScpFleetAssess.getDeviceInsight(d)) || { what: d.cpu || '', why: d.cpuReason || '', summary: '' };
        }
        var existingDialog = document.getElementById('scpInsightDialog');
        if (existingDialog) existingDialog.remove();

        var dialog = element('div', 'scp-asset-dialog-overlay');
        dialog.id = 'scpInsightDialog';

        var box = element('div', 'scp-asset-dialog-box scp-insight-dialog');

        var header = element('div', 'scp-asset-dialog-header');
        var title = element('h3', '', '💡 ' + (thai ? 'วิเคราะห์เครื่องและสาเหตุการประเมิน' : 'Device Insight & Reason'));
        var closeBtn = element('button', 'scp-dialog-close-btn', '✕');
        closeBtn.type = 'button';
        closeBtn.onclick = function () { dialog.remove(); };
        header.appendChild(title);
        header.appendChild(closeBtn);
        box.appendChild(header);

        var devInfo = element('div', 'scp-asset-dialog-device');
        devInfo.innerHTML = '<strong>' + (d.name || d._id) + '</strong> · ' + (d.room || d.meshName || (thai ? 'ทั่วไป' : 'General')) + ' (' + (d.os || d.osCaption || '').replace('Microsoft ', '') + ')';
        box.appendChild(devInfo);

        var content = element('div', 'scp-bulb-modal-wrap');

        var rowWhat = element('div', 'scp-bulb-modal-row');
        rowWhat.appendChild(element('strong', '', '🖥️ ' + (thai ? 'เครื่องนี้คืออะไร / สเปก' : 'What is this device?')));
        var whatText = element('div');
        whatText.textContent = ins.what || (d.cpu || d.cpuName || '-');
        rowWhat.appendChild(whatText);
        content.appendChild(rowWhat);

        var rowWhy = element('div', 'scp-bulb-modal-row');
        rowWhy.appendChild(element('strong', '', '❓ ' + (thai ? 'เหตุผลการประเมิน (เพราะอะไร)' : 'Why this assessment?')));
        var whyText = element('div');
        whyText.textContent = ins.why || (d.cpuReason || '-');
        rowWhy.appendChild(whyText);
        content.appendChild(rowWhy);

        var rowStatus = element('div', 'scp-bulb-modal-row');
        rowStatus.appendChild(element('strong', '', '🩺 ' + (thai ? 'สถานะความพร้อมและคะแนนสุขภาพ' : 'Readiness & Health Score')));
        var isInstalledWin11 = d.isWin11 || d.win11Status === 'already_win11' || /Windows\s*11/i.test(d.os || d.osCaption || '');
        var isCpuSupp = d.cpuSupported || (d.cpuEval && d.cpuEval.supported);
        var statusDesc = '';
        if (d.win11Status === 'upgradable') {
            statusDesc = thai ? 'อัปเกรดฮาร์ดแวร์ก่อนได้' : 'Upgradable';
        } else if (isInstalledWin11) {
            statusDesc = isCpuSupp ?
                (thai ? 'ติดตั้ง Windows 11 แล้ว (สเปกผ่านเกณฑ์ทางการ 100%)' : 'Windows 11 Installed (Supported)') :
                (thai ? 'ติดตั้ง Windows 11 แล้ว (ใช้งานได้ แต่สเปก CPU อยู่นอกลิสต์ทางการของ Microsoft)' : 'Windows 11 Installed (Unsupported CPU)');
        } else if (d.win11Status === 'eligible') {
            statusDesc = thai ? 'พร้อมอัปเกรดเป็น Windows 11' : 'Eligible for Win 11';
        } else if (d.win11Status === 'upgradable') {
            statusDesc = thai ? 'อัปเกรดฮาร์ดแวร์ก่อนได้' : 'Upgradable';
        } else {
            statusDesc = thai ? 'ไม่ผ่านเกณฑ์ Windows 11' : 'Ineligible';
        }
        var statusStr = (thai ? 'คะแนนสุขภาพ: ' : 'Health Score: ') + (d.healthScore || d.score || 0) + ' / 100 · สถานะ: ' + statusDesc;
        var statusDiv = element('div');
        statusDiv.textContent = statusStr;
        rowStatus.appendChild(statusDiv);
        content.appendChild(rowStatus);

        box.appendChild(content);

        var actions = element('div', 'scp-asset-dialog-actions');
        var btnOk = element('button', 'scp-btn-save', thai ? 'เข้าใจแล้ว' : 'Close');
        btnOk.type = 'button';
        btnOk.onclick = function () { dialog.remove(); };
        actions.appendChild(btnOk);
        box.appendChild(actions);

        dialog.appendChild(box);
        dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.remove(); });
        document.body.appendChild(dialog);
    }
    window.openDeviceInsightDialog = openDeviceInsightDialog;

    function getDeptIcon(name) {
        var lower = String(name || '').toLowerCase();
        if (/er|ฉุกเฉิน|อุบัติเหตุ|emergency/i.test(lower)) return '🚑';
        if (/ยา|pharm|ห้องยา|จ่ายยา/i.test(lower)) return '💊';
        if (/ทันต|dent/i.test(lower)) return '🦷';
        if (/opd|ผู้ป่วยนอก|คัดกรอง|ตรวจโรค|ซักประวัติ/i.test(lower)) return '🩺';
        if (/แล็ป|lab|ชันสูตร|พยาธิ/i.test(lower)) return '🔬';
        if (/x-ray|xray|รังสี|เอกซเรย์/i.test(lower)) return '🩻';
        if (/ไต|dialysis/i.test(lower)) return '🫘';
        if (/กายภาพ|pt|physio/i.test(lower)) return '🏃';
        if (/คลอด|lr|ห้องผ่าตัด|or|สูติ/i.test(lower)) return '👶';
        if (/ipd|หอผู้ป่วย|ตึกชาย|ตึกหญิง|วอร์ด|ward/i.test(lower)) return '🛏️';
        if (/ari|ทางเดินหายใจ|หวัด/i.test(lower)) return '😷';
        if (/คอม|it|สารสนเทศ|ศูนย์คอม|ไอที/i.test(lower)) return '💻';
        if (/เวชระเบียน|การเงิน|ธุรการ|บริหาร|สสจ/i.test(lower)) return '📋';
        return '🏥';
    }

    function formatUptime(node) {
        if (!node.lastbootuptime) return thai ? 'ไม่ระบุ' : 'Unknown';
        var diffMs = Date.now() - node.lastbootuptime;
        if (diffMs < 0) return thai ? 'เพิ่งเปิดเครื่อง' : 'Just started';
        var days = Math.floor(diffMs / 86400000);
        var hours = Math.floor((diffMs % 86400000) / 3600000);
        var mins = Math.floor((diffMs % 3600000) / 60000);
        if (days > 0) return thai ? (days + ' วัน ' + hours + ' ชม.') : (days + 'd ' + hours + 'h');
        if (hours > 0) return thai ? (hours + ' ชม. ' + mins + ' น.') : (hours + 'h ' + mins + 'm');
        return thai ? (mins + ' นาที') : (mins + 'm');
    }

    function formatLastSeen(node) {
        if (isOnline(node)) return thai ? 'ออนไลน์อยู่ในขณะนี้' : 'Online now';
        var away = daysAway(node);
        if (away === -1 || away == null) return thai ? 'ไม่ระบุ / ออฟไลน์' : 'Offline / Unknown';
        if (away === 0) return thai ? 'วันนี้' : 'Today';
        return thai ? (away + ' วันที่แล้ว') : (away + ' days ago');
    }

    function makeSpecItem(label, val, tone) {
        var item = element('div', 'scp-cm-spec-item');
        item.appendChild(element('span', 'scp-cm-spec-label', label));
        var valEl = element('strong', 'scp-cm-spec-value' + (tone ? ' tone-' + tone : ''), String(val));
        item.appendChild(valEl);
        return item;
    }

    /* The card can be opened from the map before the dashboard has ever asked for specs.
       Ask for what is missing, and redraw the open card when the answer arrives -- once,
       since by then the specs are there and nothing is asked again. */
    var modalNodeId = null;
    function refreshOpenModal(nodeid) {
        if (!modalNodeId || (nodeid && nodeid !== modalNodeId)) return;
        var open = document.getElementById('scpComputerModal');
        if (!open) { modalNodeId = null; return; }
        var body = open.querySelector('.scp-cm-body'), scroll = body ? body.scrollTop : 0;
        var node = allNodes().filter(function (n) { return n._id === modalNodeId; })[0];
        if (!node) return;
        showComputerDetailModal(node);
        var again = document.querySelector('#scpComputerModal .scp-cm-body');
        if (again) again.scrollTop = scroll;
    }
    function showComputerDetailModal(node) {
        if (!node) return;
        var existing = document.getElementById('scpComputerModal');
        if (existing) existing.remove();
        modalNodeId = node._id;
        // only if the server has never answered for it -- an answer of 'no info' must not loop
        if (!hardwareOf(node) && specs[node._id] === undefined) { specsAsked[node._id] = false; askForSpecs(node); }
        if (!window.ScpCachedDeviceAssessments) loadFleetAssessment();

        var dialog = element('div', 'scp-asset-dialog-overlay scp-computer-modal-overlay');
        dialog.id = 'scpComputerModal';

        var box = element('div', 'scp-asset-dialog-box scp-computer-modal-box');

        var online = isOnline(node);
        var busy = isBusy(node);
        var statusClass = online ? (busy ? 'busy' : 'idle') : 'off';
        var statusText = online
            ? (busy ? (thai ? 'กำลังใช้งาน' : 'In use') : (thai ? 'เปิดอยู่ (ว่าง)' : 'Online (idle)'))
            : (thai ? 'ปิดเครื่อง / ออฟไลน์' : 'Offline');

        var hardware = hardwareOf(node) || {};
        var ident = hardware.identifiers || {};
        var win = hardware.windows || {};
        var devAss = (window.ScpFleetAssess && window.ScpFleetAssess.assessDevice) ? window.ScpFleetAssess.assessDevice(node) : null;
        var assetData = (window.ScpCachedAssets && window.ScpCachedAssets[node._id]) || {};

        var header = element('div', 'scp-cm-header');
        var titleLeft = element('div', 'scp-cm-title-wrap');
        titleLeft.appendChild(element('span', 'scp-cm-icon', '🖥️'));
        var titleTextWrap = element('div', 'scp-cm-title-text');
        titleTextWrap.appendChild(element('h3', 'scp-cm-name', node.name || node.rname || '-'));
        var subDept = element('div', 'scp-cm-sub-dept');
        subDept.appendChild(element('span', 'scp-cm-dept-badge', '🏥 ' + roomOf(node)));
        if (node.host && node.host !== node.name) {
            subDept.appendChild(element('span', 'scp-cm-host-badge', node.host));
        }
        titleTextWrap.appendChild(subDept);
        titleLeft.appendChild(titleTextWrap);
        header.appendChild(titleLeft);

        var headerRight = element('div', 'scp-cm-header-right');
        headerRight.appendChild(element('span', 'scp-ws-status-badge ' + statusClass, statusText));
        var closeBtn = element('button', 'scp-dialog-close-btn', '✕');
        closeBtn.type = 'button';
        closeBtn.title = thai ? 'ปิดหน้าต่าง' : 'Close';
        closeBtn.onclick = function () { dialog.remove(); };
        headerRight.appendChild(closeBtn);
        header.appendChild(headerRight);
        box.appendChild(header);

        var quickBar = element('div', 'scp-cm-quick-bar');
        var qUser = element('div', 'scp-cm-quick-card');
        qUser.appendChild(element('span', 'scp-cm-quick-label', '👤 ' + (thai ? 'ผู้ใช้ล็อกอิน' : 'Signed-in user')));
        qUser.appendChild(element('strong', 'scp-cm-quick-val', signedInUser(node) || (thai ? 'ไม่มีผู้ใช้' : 'None')));
        quickBar.appendChild(qUser);

        var qIp = element('div', 'scp-cm-quick-card');
        qIp.appendChild(element('span', 'scp-cm-quick-label', '🌐 ' + (thai ? 'หมายเลข IP' : 'IP Address')));
        qIp.appendChild(element('strong', 'scp-cm-quick-val', node.ip || node.host || '-'));
        quickBar.appendChild(qIp);

        var qUptime = element('div', 'scp-cm-quick-card');
        qUptime.appendChild(element('span', 'scp-cm-quick-label', '⏱️ ' + (online ? (thai ? 'เปิดต่อเนื่อง' : 'Uptime') : (thai ? 'ใช้งานล่าสุด' : 'Last seen'))));
        qUptime.appendChild(element('strong', 'scp-cm-quick-val', online ? formatUptime(node) : formatLastSeen(node)));
        quickBar.appendChild(qUptime);

        var qScore = element('div', 'scp-cm-quick-card');
        var hScore = devAss ? (devAss.healthScore || 0) : 0;
        var hScoreColor = hScore >= 80 ? 'ok' : (hScore >= 50 ? 'busy' : 'risk');
        qScore.appendChild(element('span', 'scp-cm-quick-label', '❤️ ' + (thai ? 'สุขภาพเครื่อง' : 'Health Score')));
        qScore.appendChild(element('strong', 'scp-cm-quick-val score-' + hScoreColor, hScore + ' / 100'));
        quickBar.appendChild(qScore);
        box.appendChild(quickBar);

        var cmBody = element('div', 'scp-cm-body');

        // Section 1: Hardware Specifications
        var secHw = element('section', 'scp-cm-section');
        secHw.appendChild(element('h4', 'scp-cm-section-title', '⚙️ ' + (thai ? 'สเปกฮาร์ดแวร์และอุปกรณ์' : 'Hardware Specifications')));
        var hwGrid = element('div', 'scp-cm-spec-grid');

        var cpuVal = ident.cpu_name || (devAss && devAss.cpu) || '-';
        if (ident.cpu_cores) cpuVal += ' (' + ident.cpu_cores + ' cores)';
        hwGrid.appendChild(makeSpecItem('Processor (CPU)', cpuVal));

        var ramTotal = 0;
        (win.memory || []).forEach(function (m) { ramTotal += Number(m.Capacity) || 0; });
        var ramVal = ramTotal > 0 ? (gigabytes(ramTotal) + ' GB') : ((devAss && devAss.ramGb) ? (devAss.ramGb + ' GB') : '-');
        if (win.memory && win.memory[0] && win.memory[0].Speed) ramVal += ' (' + win.memory[0].Speed + ' MHz)';
        hwGrid.appendChild(makeSpecItem(thai ? 'หน่วยความจำ (RAM)' : 'Memory (RAM)', ramVal));

        var osVal = (win.osCaption || node.osdesc || '-').replace('Microsoft ', '');
        if (ident.os_arch) osVal += ' ' + ident.os_arch;
        hwGrid.appendChild(makeSpecItem(thai ? 'ระบบปฏิบัติการ (OS)' : 'Operating System', osVal));

        var mbVal = [ident.board_vendor, ident.board_name || ident.product_name].filter(Boolean).join(' ') || '-';
        hwGrid.appendChild(makeSpecItem(thai ? 'เมนบอร์ด / รุ่นเครื่อง' : 'Motherboard / Model', mbVal));

        var gpuVal = ident.gpu_name || '-';
        hwGrid.appendChild(makeSpecItem(thai ? 'การ์ดแสดงผล (GPU)' : 'Graphics (GPU)', gpuVal));

        var serialVal = ident.bios_serial || ident.chassis_serial || '-';
        hwGrid.appendChild(makeSpecItem('Serial Number / BIOS', serialVal + (ident.bios_date ? (' · ' + ident.bios_date) : '')));
        secHw.appendChild(hwGrid);

        // Disks / Storage Drives
        var vols = win.volumes || {};
        var diskList = Object.keys(vols).map(function (k) {
            var v = vols[k];
            if (!v || v.dType !== 3 || !v.size) return null;
            var totalGb = gigabytes(v.size);
            var freeGb = gigabytes(v.sizeremaining);
            var pctFree = Math.round((Number(v.sizeremaining) / Number(v.size)) * 100);
            var usedGb = Math.max(0, totalGb - freeGb);
            var pctUsed = Math.min(100, Math.max(0, 100 - pctFree));
            return { letter: k, total: totalGb, free: freeGb, used: usedGb, pctFree: pctFree, pctUsed: pctUsed, fs: v.fileSystem || 'NTFS' };
        }).filter(Boolean);

        if (!diskList.length) {
            disksOf(node).forEach(function (d) {
                diskList.push({ letter: d.letter, total: null, free: d.free, used: null, pctFree: d.percent, pctUsed: 100 - d.percent, fs: 'NTFS' });
            });
        }

        if (diskList.length) {
            var diskContainer = element('div', 'scp-cm-disks-container');
            diskContainer.appendChild(element('strong', 'scp-cm-disk-title', '💾 ' + (thai ? 'พื้นที่จัดเก็บข้อมูล (Storage Drives)' : 'Storage Drives')));
            diskList.forEach(function (disk) {
                var dBox = element('div', 'scp-cm-disk-item');
                var dHead = element('div', 'scp-cm-disk-head');
                var dLetter = element('span', 'scp-cm-disk-letter', 'ไดรฟ์ ' + disk.letter + ': (' + disk.fs + ')');
                var dInfo = element('span', 'scp-cm-disk-info', disk.total
                    ? (thai ? ('ว่าง ' + disk.free + ' GB จาก ' + disk.total + ' GB (' + disk.pctFree + '% ว่าง)') : (disk.free + ' GB free of ' + disk.total + ' GB (' + disk.pctFree + '% free)'))
                    : (thai ? ('ว่าง ' + disk.free + ' GB (' + disk.pctFree + '%)') : (disk.free + ' GB free (' + disk.pctFree + '%)'))
                );
                dHead.appendChild(dLetter);
                dHead.appendChild(dInfo);
                dBox.appendChild(dHead);

                var dBar = element('div', 'scp-cm-disk-bar');
                var dFill = element('div', 'scp-cm-disk-fill');
                dFill.style.width = disk.pctUsed + '%';
                if (disk.pctFree <= 8) {
                    dFill.className += ' disk-critical';
                } else if (disk.pctFree <= 15) {
                    dFill.className += ' disk-warn';
                } else {
                    dFill.className += ' disk-ok';
                }
                dBar.appendChild(dFill);
                dBox.appendChild(dBar);
                diskContainer.appendChild(dBox);
            });
            secHw.appendChild(diskContainer);
        }
        cmBody.appendChild(secHw);

        // Section 2: Security & Protection
        var secSec = element('section', 'scp-cm-section');
        secSec.appendChild(element('h4', 'scp-cm-section-title', '🛡️ ' + (thai ? 'ระบบความปลอดภัยและการป้องกัน' : 'Security & Protection')));
        var secGrid = element('div', 'scp-cm-spec-grid');

        var avList = win.av || [];
        var avDesc = thai ? 'ทำงานปกติ' : 'Active & Protected';
        var avClass = 'ok';
        if (avList.length) {
            avDesc = avList.map(function (a) { return a.name || a.displayName || 'Antivirus'; }).join(', ');
        } else {
            var avRisks = risksOf(node).filter(function (r) { return /antivirus|ไวรัส/i.test(r.text); });
            if (avRisks.length) {
                avDesc = avRisks.map(function (r) { return r.text; }).join(', ');
                avClass = 'risk';
            }
        }
        secGrid.appendChild(makeSpecItem(thai ? 'แอนติไวรัส (Antivirus)' : 'Antivirus', avDesc, avClass));

        var fwStatus = win.firewall != null ? (win.firewall ? (thai ? 'เปิดใช้งาน (ป้องกันอยู่)' : 'Enabled') : (thai ? 'ปิดอยู่' : 'Disabled')) : (thai ? 'เปิดใช้งาน' : 'Enabled');
        var fwClass = (win.firewall === false) ? 'risk' : 'ok';
        secGrid.appendChild(makeSpecItem(thai ? 'ไฟร์วอลล์ (Windows Firewall)' : 'Firewall', fwStatus, fwClass));

        var wuRisks = risksOf(node).filter(function (r) { return /update|อัปเดต/i.test(r.text); });
        var wuStatus = wuRisks.length ? wuRisks[0].text : (thai ? 'ทำงานปกติ' : 'Up to date');
        var wuClass = wuRisks.length ? 'risk' : 'ok';
        secGrid.appendChild(makeSpecItem('Windows Update', wuStatus, wuClass));

        var rebootRisks = risksOf(node).filter(function (r) { return /restart|รีสตาร์ต|reboot/i.test(r.text); });
        var rebootStatus = rebootRisks.length ? rebootRisks[0].text : (thai ? 'ไม่มีงานค้าง' : 'No reboot pending');
        var rebootClass = rebootRisks.length ? 'busy' : 'ok';
        secGrid.appendChild(makeSpecItem(thai ? 'สถานะรีสตาร์ต' : 'Pending Reboot', rebootStatus, rebootClass));
        secSec.appendChild(secGrid);
        cmBody.appendChild(secSec);

        // Section 3: Assessment & Diagnostics
        var secDiag = element('section', 'scp-cm-section');
        secDiag.appendChild(element('h4', 'scp-cm-section-title', '🩺 ' + (thai ? 'การวินิจฉัยสุขภาพและความพร้อม Windows 11' : 'Diagnostics & Health Assessment')));

        if (devAss) {
            var evalCard = element('div', 'scp-cm-eval-box');
            var w11Title = element('div', 'scp-cm-eval-line');
            w11Title.appendChild(element('strong', '', 'Windows 11 Readiness: '));
            var w11StatusBadge = element('span', 'scp-ws-w11-badge ' + ((devAss.win11Status === 'eligible' || devAss.win11Status === 'already_win11') ? 'ok' : (devAss.win11Status === 'upgradable' ? 'idle' : 'risk')),
                (devAss.win11Status === 'eligible' || devAss.win11Status === 'already_win11') ? (thai ? 'พร้อมใช้งาน 100%' : 'Eligible') :
                (devAss.win11Status === 'upgradable' ? (thai ? 'อัปเกรดฮาร์ดแวร์ก่อนได้' : 'Upgradable') : (thai ? 'ไม่ผ่านเกณฑ์ขั้นต่ำ' : 'Ineligible'))
            );
            w11Title.appendChild(w11StatusBadge);
            evalCard.appendChild(w11Title);

            if (devAss.win11Blockers && devAss.win11Blockers.length) {
                var reasonList = element('ul', 'scp-cm-reason-list');
                devAss.win11Blockers.forEach(function (r) {
                    reasonList.appendChild(element('li', '', r));
                });
                evalCard.appendChild(reasonList);
            }

            var recLine = element('div', 'scp-cm-eval-line');
            recLine.appendChild(element('strong', '', thai ? 'คำแนะนำการใช้งาน: ' : 'Recommendation: '));
            var recText = devAss.recommendation === 'keep' ? (thai ? 'สภาพดี ใช้งานต่อได้ยาวนาน' : 'Good condition') :
                (devAss.recommendation === 'upgrade' ? (thai ? 'อัปเกรดเครื่องเดิมเพื่อประหยัดงบประมาณ' : 'Upgrade this device to save costs') :
                (devAss.recommendation === 'upgrade_ram' ? (thai ? 'แนะนำเพิ่ม RAM เป็นอย่างน้อย 8-16 GB' : 'Upgrade RAM') :
                (devAss.recommendation === 'upgrade_ssd' ? (thai ? 'แนะนำเปลี่ยนฮาร์ดดิสก์เป็น SSD เพื่อเพิ่มความเร็ว' : 'Upgrade to SSD') :
                (thai ? 'ควรจัดสรรงบประมาณเพื่อจัดซื้อเครื่องทดแทน (ปลดระวาง)' : 'Recommend replacement'))));
            recLine.appendChild(element('span', 'scp-cm-rec-text', recText));
            evalCard.appendChild(recLine);
            (devAss.upgradeActions || devAss.upgradeSuggestions || []).forEach(function (action) {
                evalCard.appendChild(element('p', 'scp-dash-note', typeof action === 'string' ? action : action.note));
            });
            secDiag.appendChild(evalCard);
        }

        var faults = faultsOf(node);
        if (faults.length > 0) {
            var faultBox = element('div', 'scp-cm-faults-box');
            faultBox.appendChild(element('strong', '', '⚠️ ' + (thai ? 'อุปกรณ์ / ไดรเวอร์ที่พบปัญหา (' + faults.length + ' รายการ)' : 'Driver Issues (' + faults.length + ')')));
            var fList = element('ul', 'scp-cm-fault-list');
            faults.forEach(function (f) {
                fList.appendChild(element('li', '', f.text));
            });
            faultBox.appendChild(fList);
            secDiag.appendChild(faultBox);
        }

        var allRisks = risksOf(node);
        if (allRisks.length > 0) {
            var riskBox = element('div', 'scp-cm-risks-box');
            riskBox.appendChild(element('strong', '', '🔔 ' + (thai ? 'สิ่งที่ตรวจพบ / รายการเฝ้าระวัง' : 'Attention Items')));
            var rWrap = element('div', 'scp-cm-risk-wrap');
            allRisks.forEach(function (r) {
                rWrap.appendChild(element('span', 'scp-dash-flag ' + r.level, r.text));
            });
            riskBox.appendChild(rWrap);
            secDiag.appendChild(riskBox);
        } else {
            var safeBox = element('div', 'scp-cm-safe-box');
            safeBox.textContent = thai ? '✅ ระบบทำงานปกติ ไม่พบความเสี่ยงหรือสิ่งผิดปกติ' : '✅ System normal. No risks detected.';
            secDiag.appendChild(safeBox);
        }
        cmBody.appendChild(secDiag);

        // Section 4: Asset & Inventory (ครุภัณฑ์)
        var secAsset = element('section', 'scp-cm-section');
        secAsset.appendChild(element('h4', 'scp-cm-section-title', '🏷️ ' + (thai ? 'ข้อมูลครุภัณฑ์และทะเบียนทรัพย์สิน' : 'Asset Information')));
        var assetGrid = element('div', 'scp-cm-spec-grid');
        assetGrid.appendChild(makeSpecItem(thai ? 'หมายเลขครุภัณฑ์' : 'Asset Tag', assetData.assetNumber || (thai ? 'ยังไม่ได้ระบุ' : 'Unassigned')));
        assetGrid.appendChild(makeSpecItem(thai ? 'ปีงบประมาณ' : 'Fiscal Year', assetData.fiscalYear ? ((thai ? 'พ.ศ. ' : 'FY ') + assetData.fiscalYear) : '-'));
        assetGrid.appendChild(makeSpecItem(thai ? 'ราคาจัดซื้อ' : 'Purchase Price', assetData.price ? (Number(assetData.price).toLocaleString() + (thai ? ' บาท' : ' THB')) : '-'));
        assetGrid.appendChild(makeSpecItem(thai ? 'งบจัดซื้อ / หมายเหตุ' : 'Budget / Note', assetData.note || '-'));
        // Book value the government way: straight line to 1 baht, from the acquisition year
        // (asset record, else the CPU's launch year) and the purchase or reference price.
        var bookA = (window.ScpFleetAssess && window.ScpFleetAssess.assessDevice) ? window.ScpFleetAssess.assessDevice(node) : null;
        if (bookA && bookA.costBasis) {
            var baht = function (v) { return Number(v).toLocaleString(thai ? 'th-TH' : undefined, { maximumFractionDigits: 2 }) + (thai ? ' บาท' : ' THB'); };
            var srcText = bookA.yearSource === 'asset' ? (thai ? 'ตามปีงบประมาณครุภัณฑ์' : 'from the asset record')
                : bookA.yearSource === 'cpu' ? (thai ? 'ประมาณจากรุ่น CPU (ออกขายปี ' + (bookA.cpuYear + 543) + ')' : 'estimated from the CPU (released ' + bookA.cpuYear + ')')
                : bookA.yearSource === 'bios' ? (thai ? 'ประมาณจากวันที่ BIOS' : 'estimated from the BIOS date') : '';
            var licV = licenseVerdictOf(node);
            assetGrid.appendChild(makeSpecItem(thai ? 'Windows แท้ / Activate' : 'Genuine Windows', licV.text, licV.level ? 'risk' : (licV.state === 'genuine' ? 'ok' : '')));
            var offV = officeVerdictOf(node);
            if (offV.state !== 'unknown') assetGrid.appendChild(makeSpecItem('Microsoft Office', offV.text, offV.level ? 'risk' : (offV.state === 'genuine' ? 'ok' : '')));
            var partItems = (bookA.upgradeActions || bookA.upgradeSuggestions || []).filter(function (a) { return a && a.cost; }).concat(bookA.maintenance || []);
            if (partItems.length) {
                assetGrid.appendChild(makeSpecItem(thai ? '🔧 อะไหล่ / งานซ่อมที่แนะนำ' : '🔧 Recommended parts / repairs', partItems.map(function (m) {
                    return m.note + ' (≈ ' + Number(m.cost || 0).toLocaleString() + (thai ? ' บาท' : ' THB') + (m.optional ? (thai ? ', ถ้ายังไม่มี' : ', if missing') : '') + ')';
                }).join(' · '), partItems.some(function (m) { return m.urgent; }) ? 'risk' : ''));
            }
            assetGrid.appendChild(makeSpecItem(thai ? 'ประเภทเครื่อง' : 'Device type', typeLabel(bookA.deviceClass) + (bookA.modelName ? ' · ' + bookA.modelName : '') + ' · ' + typeSourceLabel(bookA.deviceTypeSource)));
            assetGrid.appendChild(makeSpecItem(thai ? 'ปีที่ได้มา (ประมาณ)' : 'Acquired (approx.)', bookA.acquiredYearBE ? ((thai ? 'พ.ศ. ' : 'BE ') + bookA.acquiredYearBE + ' · ' + srcText) : '-'));
            assetGrid.appendChild(makeSpecItem(thai ? 'ราคาตั้งต้น' : 'Cost basis', baht(bookA.costBasis) + ' · ' + (bookA.costSource === 'asset'
                ? (thai ? 'ราคาจัดซื้อจริง' : 'actual price')
                : (thai ? 'ราคากลาง MDES ' : 'MDES reference ') + (bookA.deviceClass === 'notebook' ? (thai ? 'โน้ตบุ๊ก' : 'notebook') : bookA.deviceClass === 'aio' ? 'All-in-One' : (thai ? 'เครื่องตั้งโต๊ะ' : 'desktop')) + (bookA.referencePriceYearBE ? (thai ? ' ปี ' : ' ') + bookA.referencePriceYearBE : ''))));
            assetGrid.appendChild(makeSpecItem(thai ? 'ค่าเสื่อมราคาสะสม' : 'Accumulated depreciation', bookA.depreciation != null ? baht(bookA.depreciation) + ' (' + bookA.depreciationPercent + '% · ' + (thai ? 'อายุใช้งาน ' : 'life ') + bookA.usefulLifeYears + (thai ? ' ปี' : ' yrs') + ')' : '-'));
            assetGrid.appendChild(makeSpecItem(thai ? 'มูลค่าคงเหลือตามบัญชี ณ วันนี้' : 'Book value today', bookA.bookValue != null ? baht(bookA.bookValue) + (bookA.fullyDepreciated ? (thai ? ' (ตัดค่าเสื่อมครบแล้ว คงไว้ 1 บาท)' : ' (fully depreciated, kept at 1 baht)') : '') : '-', bookA.fullyDepreciated ? 'risk' : ''));
        }
        secAsset.appendChild(assetGrid);

        var assetBtnRow = element('div', 'scp-cm-asset-actions');
        var editAssetBtn = button(thai ? '✏️ ระบุ / แก้ไขข้อมูลครุภัณฑ์' : '✏️ Edit Asset Info', 'scp-dash-scan', function () {
            if (typeof window.openAssetEditDialog === 'function') {
                window.openAssetEditDialog(node._id);
            }
        });
        assetBtnRow.appendChild(editAssetBtn);
        secAsset.appendChild(assetBtnRow);
        cmBody.appendChild(secAsset);
        if (window.ScpHealth) cmBody.appendChild(window.ScpHealth.section(node));
        cmBody.appendChild(historySection(node));
        box.appendChild(cmBody);

        // Footer Actions - STRICTLY NO REMOTE CONTROL BUTTON!
        var footer = element('div', 'scp-cm-footer');
        var footLeft = element('div', 'scp-cm-footer-left');
        var refreshSpecsBtn = button(thai ? '🔄 รีเฟรชสเปกเครื่อง' : '🔄 Refresh Specs', 'scp-dash-refresh', function () {
            // ask again for real: the old flag made this a no-op once the first request had gone
            specsAsked[node._id] = false;
            timelinesAsked[node._id] = false;
            askForSpecs(node);
            askForTimeline(node);
            loadFleetAssessment(true);
            refreshSpecsBtn.textContent = thai ? '⏳ กำลังขอข้อมูลจากเครื่อง…' : '⏳ Asking the computer…';
            refreshSpecsBtn.disabled = true;
        });
        footLeft.appendChild(refreshSpecsBtn);

        if (window.ScpReport) {
            var reportBtn = button(thai ? '📄 พิมพ์ใบประเมินเครื่อง (PDF)' : '📄 Print Fact Sheet (PDF)', 'scp-dash-refresh', function () {
                window.ScpReport.open('device', node._id);
            });
            footLeft.appendChild(reportBtn);
        }
        footer.appendChild(footLeft);

        var closeFootBtn = button(thai ? 'ปิดหน้าต่าง' : 'Close', 'scp-cm-btn-close', function () {
            dialog.remove();
        });
        footer.appendChild(closeFootBtn);
        box.appendChild(footer);

        dialog.appendChild(box);
        dialog.addEventListener('click', function (e) {
            if (e.target === dialog) dialog.remove();
        });
        function onKey(e) {
            if (e.key === 'Escape') {
                dialog.remove();
                document.removeEventListener('keydown', onKey);
            }
        }
        document.addEventListener('keydown', onKey);
        document.body.appendChild(dialog);
    }
    window.showComputerDetailModal = showComputerDetailModal;

    function workstationCard(node) {
        var online = isOnline(node);
        var busy = isBusy(node);
        var statusClass = online ? (busy ? 'busy' : 'idle') : 'off';
        var statusText = online
            ? (busy ? (thai ? 'กำลังใช้งาน' : 'In use') : (thai ? 'เปิดอยู่ (ว่าง)' : 'Online (idle)'))
            : (thai ? 'ปิดเครื่อง' : 'Offline');

        var card = element('article', 'scp-workstation-card status-' + statusClass);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.title = thai ? ('คลิก/จิ้ม เพื่อดูข้อมูลสถานะ ' + (node.name || '')) : ('Click to view diagnostics for ' + (node.name || ''));

        var topRow = element('div', 'scp-ws-top');
        var iconBox = element('div', 'scp-ws-icon-box');
        iconBox.appendChild(element('span', 'scp-ws-device-icon', '🖥️'));
        var pulseDot = element('span', 'scp-dash-dot ' + (online ? (busy ? 'busy' : 'idle') : 'off'));
        iconBox.appendChild(pulseDot);
        topRow.appendChild(iconBox);

        var badge = element('span', 'scp-ws-status-badge ' + statusClass, statusText);
        topRow.appendChild(badge);
        card.appendChild(topRow);

        var nameEl = element('strong', 'scp-ws-name', node.name || node.rname || '-');
        card.appendChild(nameEl);

        var user = signedInUser(node);
        var userEl = element('div', 'scp-ws-user');
        userEl.appendChild(element('span', 'scp-ws-user-icon', '👤'));
        userEl.appendChild(element('span', 'scp-ws-user-text', user || (thai ? 'ไม่มีผู้ใช้ล็อกอิน' : 'No user')));
        card.appendChild(userEl);

        var metaRow = element('div', 'scp-ws-meta');
        var ip = node.ip || node.host || '';
        if (ip) {
            metaRow.appendChild(element('span', 'scp-ws-ip', 'IP ' + ip));
        }
        var os = (node.osdesc || '').replace('Microsoft ', '');
        if (os) {
            metaRow.appendChild(element('span', 'scp-ws-os', os));
        }
        card.appendChild(metaRow);

        var line = specLine(node);
        if (line) {
            card.appendChild(element('div', 'scp-ws-specs', line));
        }

        if (window.ScpFleetAssess && window.ScpFleetAssess.assessDevice) {
            var ass = window.ScpFleetAssess.assessDevice(node);
            if (ass) {
                var scoreRow = element('div', 'scp-ws-score-row');
                var scClass = ass.healthStatus === 'good' ? 'ok' : (ass.healthStatus === 'fair' ? 'busy' : 'risk');
                scoreRow.appendChild(element('span', 'scp-ws-score-badge ' + scClass, '❤️ ' + (ass.healthScore || 0) + '/100'));
                var w11Class = (ass.win11Status === 'eligible' || ass.win11Status === 'already_win11') ? 'ok' : (ass.win11Status === 'upgradable' ? 'idle' : 'risk');
                var w11Text = (ass.win11Status === 'eligible' || ass.win11Status === 'already_win11') ? 'Win 11 Ready' : (ass.win11Status === 'upgradable' ? 'Win 11 Upgradable' : 'Win 11 Ineligible');
                scoreRow.appendChild(element('span', 'scp-ws-w11-badge ' + w11Class, w11Text));
                card.appendChild(scoreRow);
            }
        }

        var risks = risksOf(node);
        if (risks.length > 0) {
            var riskWrap = element('div', 'scp-ws-risks');
            risks.slice(0, 2).forEach(function (r) {
                riskWrap.appendChild(element('span', 'scp-dash-flag ' + r.level, r.text));
            });
            if (risks.length > 2) {
                riskWrap.appendChild(element('span', 'scp-dash-flag info', '+' + (risks.length - 2)));
            }
            card.appendChild(riskWrap);
        }

        var hint = element('div', 'scp-ws-footer-hint');
        hint.appendChild(element('span', '', thai ? '🔍 จิ้ม/คลิกดูสถานะเครื่องทั้งหมด' : '🔍 Tap to view all diagnostics'));
        card.appendChild(hint);

        function triggerModal(e) {
            e.preventDefault();
            e.stopPropagation();
            showComputerDetailModal(node);
        }
        card.addEventListener('click', triggerModal);
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { triggerModal(e); }
        });

        return card;
    }

    function renderHospitalCampus(rooms, list, everyRoom) {
        var container = element('div', 'scp-campus-section');

        // Department-specific Workstation View
        if (selectedCampusDept && rooms[selectedCampusDept]) {
            var deptName = selectedCampusDept;
            var deptNodes = (rooms[deptName] || []).filter(matchesSearch);
            var onlineCount = deptNodes.filter(isOnline).length;
            var busyCount = deptNodes.filter(isBusy).length;
            var offlineCount = deptNodes.length - onlineCount;
            var riskCount = deptNodes.filter(function (n) { return risksOf(n).length > 0; }).length;

            var header = element('div', 'scp-campus-dept-header');
            var backBtn = button(thai ? '← กลับไปดูภาพรวมทุกแผนก' : '← All Departments (Overview)', 'scp-campus-back-btn', function () {
                selectedCampusDept = null;
                rerenderCampus();
            });
            header.appendChild(backBtn);

            var titleBox = element('div', 'scp-campus-dept-title-box');
            var icon = getDeptIcon(deptName);
            var titleRow = element('div', 'scp-campus-dept-title-row');
            titleRow.appendChild(element('span', 'scp-campus-dept-icon-lg', icon));
            titleRow.appendChild(element('h3', 'scp-campus-dept-name-lg', deptName));
            titleBox.appendChild(titleRow);

            var badgeRow = element('div', 'scp-campus-dept-badges');
            badgeRow.appendChild(element('span', 'scp-chip-metric scp-chip-total', (thai ? 'คอมพิวเตอร์ทั้งหมด ' : 'Total: ') + deptNodes.length + (thai ? ' เครื่อง' : '')));
            badgeRow.appendChild(element('span', 'scp-chip-metric scp-chip-ok', (thai ? 'เปิดอยู่ ' : 'Online: ') + onlineCount));
            badgeRow.appendChild(element('span', 'scp-chip-metric scp-chip-busy', (thai ? 'กำลังใช้งาน ' : 'In Use: ') + busyCount));
            if (offlineCount > 0) {
                badgeRow.appendChild(element('span', 'scp-chip-metric scp-chip-off', (thai ? 'ปิด/ออฟไลน์ ' : 'Offline: ') + offlineCount));
            }
            if (riskCount > 0) {
                badgeRow.appendChild(element('span', 'scp-chip-metric scp-chip-risk', (thai ? 'ต้องดูแล ' : 'Attention: ') + riskCount));
            }
            titleBox.appendChild(badgeRow);
            header.appendChild(titleBox);
            container.appendChild(header);

            var instruction = element('div', 'scp-campus-instruction');
            instruction.textContent = thai
                ? '💡 ผังคอมพิวเตอร์ประจำแผนก: เอาเมาส์ชี้หรือคลิก/จิ้มที่เครื่องเพื่อดูสเปกและสถานะเครื่องอย่างละเอียด'
                : '💡 Workstation layout: Hover or tap/click any computer to view complete diagnostics and status.';
            container.appendChild(instruction);

            var wsGrid = element('div', 'scp-workstation-grid');
            if (!deptNodes.length) {
                wsGrid.appendChild(element('div', 'scp-dash-empty-room', thai ? 'ไม่มีคอมพิวเตอร์ในแผนกนี้' : 'No computers in this department'));
            } else {
                deptNodes.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }).forEach(function (node) {
                    wsGrid.appendChild(workstationCard(node));
                });
            }
            container.appendChild(wsGrid);
            return container;
        }

        // Header Bar with Mode Toggle (3D Map vs Department Cards)
        var campusModeBar = element('div', 'scp-map-header-bar');
        var hTitle = element('div', 'scp-campus-head-title');
        hTitle.appendChild(element('h3', '', thai ? 'ผังแผนที่และจุดบริการโรงพยาบาล' : 'Hospital Map & Campus View'));
        hTitle.appendChild(element('p', '', thai ? 'แผนที่สามมิติ Interactive แสดงตำแหน่งเครื่องคอมพิวเตอร์และสถานะการทำงานจริง' : '3D Interactive Isometric Map showing real-time computer locations and status.'));
        campusModeBar.appendChild(hTitle);

        var toggleWrap = element('div', 'scp-map-mode-toggle');
        var btnMap = button(thai ? '🗺️ แผนที่ 3D (HosMap)' : '🗺️ 3D Map', 'scp-map-mode-btn' + (campusViewMode === 'map' ? ' active' : ''), function () {
            campusViewMode = 'map';
            rerenderCampus();
        });
        var btnCards = button(thai ? '🏢 ผังการ์ดแผนก' : '🏢 Department Cards', 'scp-map-mode-btn' + (campusViewMode === 'cards' ? ' active' : ''), function () {
            campusViewMode = 'cards';
            rerenderCampus();
        });
        toggleWrap.appendChild(btnMap);
        toggleWrap.appendChild(btnCards);
        campusModeBar.appendChild(toggleWrap);
        container.appendChild(campusModeBar);

        // 3D Isometric Map View
        if (campusViewMode === 'map') {
            var mapWrapper = element('div', 'scp-map-wrapper');
            // Keep the same canvas and map across rebuilds: the view (floor, zoom, rotation)
            // survives a refresh and no second render loop is ever started.
            var canvas = (currentIsoMap && !currentIsoMap._destroyed) ? currentIsoMap.canvas : element('canvas');
            canvas.id = 'scpHosMapCanvas';
            mapWrapper.appendChild(canvas);

            var controls = element('div', 'scp-map-controls');
            var zIn = button('+', 'scp-map-ctrl-btn', function () { if (currentIsoMap) currentIsoMap.zoomBy(1.25); });
            zIn.title = thai ? 'ขยาย (Zoom In)' : 'Zoom In';
            var zOut = button('−', 'scp-map-ctrl-btn', function () { if (currentIsoMap) currentIsoMap.zoomBy(0.8); });
            zOut.title = thai ? 'ย่อ (Zoom Out)' : 'Zoom Out';
            var rotL = button('↺', 'scp-map-ctrl-btn', function () { if (currentIsoMap) currentIsoMap.rotate(Math.PI / 4); });
            rotL.title = thai ? 'หมุนซ้าย (Rotate Left)' : 'Rotate Left';
            var rotR = button('↻', 'scp-map-ctrl-btn', function () { if (currentIsoMap) currentIsoMap.rotate(-Math.PI / 4); });
            rotR.title = thai ? 'หมุนขวา (Rotate Right)' : 'Rotate Right';
            var homeBtn = button('⌂', 'scp-map-ctrl-btn', function () { if (currentIsoMap) currentIsoMap.fit(true); });
            homeBtn.title = thai ? 'มุมมองเริ่มต้น (Reset View)' : 'Reset View';

            controls.appendChild(zIn);
            controls.appendChild(zOut);
            controls.appendChild(rotL);
            controls.appendChild(rotR);
            controls.appendChild(homeBtn);
            // Full screen: the map covers the whole window; Esc or the same button returns.
            var fullBtn = button('⛶', 'scp-map-ctrl-btn', function () { setMapFull(!mapWrapper.classList.contains('scp-map-full')); });
            fullBtn.title = thai ? 'เต็มจอ (Esc เพื่อออก)' : 'Full screen (Esc to exit)';
            var setMapFull = function (on) {
                mapWrapper.classList.toggle('scp-map-full', on);
                document.body.classList.toggle('scp-map-full-open', on);
                fullBtn.textContent = on ? '✕' : '⛶';
                fullBtn.title = on ? (thai ? 'ออกจากเต็มจอ (Esc)' : 'Exit full screen (Esc)') : (thai ? 'เต็มจอ (Esc เพื่อออก)' : 'Full screen (Esc to exit)');
                if (!on) { fitHeight(); mapWrapper.dispatchEvent(new Event('scp-map-exit-full')); }
                if (currentIsoMap) window.requestAnimationFrame(function () { currentIsoMap.resize(); currentIsoMap.fit(); });
            };
            if (mapFullKey) document.removeEventListener('keydown', mapFullKey);
            mapFullKey = function (e) {
                if (e.key === 'Escape' && mapWrapper.classList.contains('scp-map-full')) setMapFull(false);
            };
            document.addEventListener('keydown', mapFullKey);
            controls.appendChild(fullBtn);
            // People and cars moving on the campus roads. Remembered per browser.
            var trafficBtn = button('🚶', 'scp-map-ctrl-btn' + (mapTrafficOn() ? ' on' : ''), function () {
                var next = !mapTrafficOn();
                try { window.localStorage.setItem('scpMapTraffic', next ? '1' : '0'); } catch (e) { /* private window */ }
                trafficBtn.classList.toggle('on', next);
                trafficBtn.title = next ? (thai ? 'ปิดภาพคนเดิน/รถวิ่ง' : 'Hide people and cars') : (thai ? 'แสดงคนเดิน/รถวิ่ง' : 'Show people and cars');
                if (currentIsoMap) currentIsoMap.setTraffic(next);
            });
            trafficBtn.title = mapTrafficOn() ? (thai ? 'ปิดภาพคนเดิน/รถวิ่ง' : 'Hide people and cars') : (thai ? 'แสดงคนเดิน/รถวิ่ง' : 'Show people and cars');
            controls.appendChild(trafficBtn);
            mapWrapper.appendChild(controls);

            // Arrange mode: drag computers to where they really stand. Saved for everyone.
            var editBar = element('div', 'scp-map-edit-bar');
            var toast = element('div', 'scp-map-toast');
            toast.hidden = true;
            var toastTimer = null;
            var showToast = function (text, bad) {
                toast.textContent = text;
                toast.className = 'scp-map-toast' + (bad ? ' bad' : '');
                toast.hidden = false;
                if (toastTimer) window.clearTimeout(toastTimer);
                toastTimer = window.setTimeout(function () { toast.hidden = true; }, 2600);
            };
            var paintEditBar = function () {
                editBar.textContent = '';
                editBar.classList.toggle('on', mapEditMode);
                mapWrapper.classList.toggle('scp-map-editing', mapEditMode);
                if (!mapEditMode) {
                    editBar.appendChild(button(thai ? '✥ จัดตำแหน่งเครื่อง' : '✥ Arrange computers', 'scp-map-edit-btn', function () {
                        mapEditMode = true;
                        if (currentIsoMap) currentIsoMap.setEditMode(true);
                        paintEditBar();
                    }));
                    return;
                }
                editBar.appendChild(element('span', 'scp-map-edit-text', thai
                    ? '✥ โหมดจัดตำแหน่ง: ลากเครื่องไปวางตรงไหนก็ได้ · ในภาพรวม ลากไปวางบนตึกเพื่อย้ายเข้าตึกนั้น · คลิกขวาที่เครื่องเพื่อคืนตำแหน่งอัตโนมัติ'
                    : '✥ Arrange mode: drag any computer anywhere · on the campus, drop on a building to move it inside · right-click a computer to reset it'));
                editBar.appendChild(button(thai ? '✓ เสร็จสิ้น' : '✓ Done', 'scp-map-edit-done', function () {
                    mapEditMode = false;
                    if (currentIsoMap) currentIsoMap.setEditMode(false);
                    paintEditBar();
                }));
            };
            if (window.ScpOperations) {
                paintEditBar();
                mapWrapper.appendChild(editBar);
            }
            mapWrapper.appendChild(toast);
            var savePlacement = function (node, placement, previous) {
                var data = placement ? { nodeid: node._id, floor: placement.floor, x: placement.x, y: placement.y } : { nodeid: node._id, clear: true };
                window.ScpOperations.request('mapPlacementSet', data).then(function () {
                    if (!mapPlacements) mapPlacements = {};
                    if (placement) mapPlacements[node._id] = placement; else delete mapPlacements[node._id];
                    showToast(placement
                        ? (thai ? 'บันทึกตำแหน่ง ' : 'Saved position of ') + (node.name || '')
                        : (thai ? 'คืนตำแหน่งอัตโนมัติให้ ' : 'Reset position of ') + (node.name || ''));
                }).catch(function (error) {
                    // Put it back where it was, so the map never shows a position that was not saved.
                    if (currentIsoMap) {
                        if (previous) currentIsoMap.placements[node._id] = previous; else delete currentIsoMap.placements[node._id];
                        currentIsoMap.setPlacements(currentIsoMap.placements);
                    }
                    var why = error && error.message;
                    showToast((thai ? 'บันทึกไม่สำเร็จ: ' : 'Could not save: ') + (why === 'ACCESS_DENIED' ? (thai ? 'ไม่มีสิทธิ์กับเครื่องนี้' : 'no rights to this computer')
                        : why === 'UNKNOWN_OPERATION' ? (thai ? 'เซิร์ฟเวอร์ยังเป็นเวอร์ชันเก่า กรุณารีสตาร์ทบริการ SCP-Remote' : 'the server needs a restart to enable this')
                        : why || ''), true);
                });
            };

            var floorBar = element('div', 'scp-map-floor-bar');
            floorBar.appendChild(element('span', 'scp-map-floor-label', thai ? 'อาคาร / ชั้น:' : 'Floor:'));
            var selectEl = document.createElement('select');
            selectEl.className = 'scp-map-floor-select';

            var floorOptions = [
                ['flr_campus', thai ? '🏥 ภาพรวมโรงพยาบาล (Campus Map)' : '🏥 Campus Overview'],
                ['flr_opd_1', thai ? '🩺 โซน OPD (ผู้ป่วยนอก / ER / ห้องยา / LAB)' : '🩺 OPD Zone (Floor 1)'],
                ['flr_dental_1', thai ? '🦷 ตึกทันตกรรม ชั้น 1 (ทันตกรรม)' : '🦷 Dental building, floor 1 (clinic)'],
                ['flr_dental_2', thai ? '🏢 ตึกทันตกรรม ชั้น 2 (ธุรการ · การเงิน · พัสดุ · โสต · พขร)' : '🏢 Dental building, floor 2 (offices)'],
                ['flr_ari_1', thai ? '😷 คลินิก ARI (ทางเดินหายใจ)' : '😷 ARI Clinic'],
                ['flr_dialysis_1', thai ? '🫘 ศูนย์ไตเทียม (Dialysis)' : '🫘 Dialysis Center'],
                ['flr_ipdm_1', thai ? '🛏️ ตึกผู้ป่วยในชาย (IPD Male)' : '🛏️ Male Inpatient Ward'],
                ['flr_ipdf_1', thai ? '🛏️ ตึกผู้ป่วยในหญิง (IPD Female)' : '🛏️ Female Inpatient Ward'],
                ['flr_lr_1', thai ? '👶 ห้องคลอด · ห้องผ่าตัด (LR / OR)' : '👶 Delivery & OR'],
                ['flr_physio_1', thai ? '🏃 แผนกกายภาพบำบัด (Physio)' : '🏃 Physiotherapy'],
                ['flr_clinic_1', thai ? '📋 คลินิกพิเศษ (Special Clinic)' : '📋 Special Clinic'],
                ['flr_promo_1', thai ? '💉 ตึกเวชปฏิบัติ · ส่งเสริมสุขภาพ' : '💉 General Practice & Health Promotion'],
                ['flr_psych_1', thai ? '🧠 ตึกจิตเวช (Psychiatry)' : '🧠 Psychiatry'],
                ['flr_thaimed_1', thai ? '🌿 แพทย์แผนไทย (Thai Medicine)' : '🌿 Thai Traditional Medicine']
            ];
            floorOptions.forEach(function (opt) {
                var optEl = document.createElement('option');
                optEl.value = opt[0];
                optEl.textContent = opt[1];
                if (opt[0] === (currentIsoMap ? currentIsoMap.floorId : 'flr_campus')) optEl.selected = true;
                selectEl.appendChild(optEl);
            });
            selectEl.addEventListener('change', function () {
                if (currentIsoMap) currentIsoMap.setFloor(selectEl.value);
            });
            floorBar.appendChild(selectEl);
            var campusBtn = button(thai ? '← ภาพรวม รพ.' : '← Campus', 'scp-map-back-btn', function () {
                if (currentIsoMap) currentIsoMap.setFloor('flr_campus');
            });
            campusBtn.hidden = !currentIsoMap || currentIsoMap.floorId === 'flr_campus';
            floorBar.appendChild(campusBtn);
            // Floor 1 / Floor 2 buttons, only for a building that has more than one floor plan.
            var levelBar = element('div', 'scp-map-level-bar');
            var paintLevels = function (floorId) {
                levelBar.textContent = '';
                var floors = currentIsoMap ? currentIsoMap.floorsOf(floorId) : [];
                levelBar.hidden = floors.length < 2;
                floors.forEach(function (f) {
                    levelBar.appendChild(button((thai ? 'ชั้น ' : 'Floor ') + (f.level || 1), 'scp-map-level-btn' + (f.id === floorId ? ' on' : ''), function () {
                        if (currentIsoMap) currentIsoMap.setFloor(f.id);
                    }));
                });
            };
            levelBar.hidden = true;
            floorBar.appendChild(levelBar);
            mapWrapper.appendChild(floorBar);

            var legend = element('div', 'scp-map-legend');
            var legOk = element('span', 'scp-map-legend-item');
            legOk.appendChild(element('span', 'scp-map-legend-dot ok'));
            legOk.appendChild(element('span', '', thai ? 'เปิดอยู่ (ว่าง)' : 'Online'));
            legend.appendChild(legOk);

            var legBusy = element('span', 'scp-map-legend-item');
            legBusy.appendChild(element('span', 'scp-map-legend-dot busy'));
            legBusy.appendChild(element('span', '', thai ? 'กำลังใช้งาน' : 'In Use'));
            legend.appendChild(legBusy);

            var legOff = element('span', 'scp-map-legend-item');
            legOff.appendChild(element('span', 'scp-map-legend-dot off'));
            legOff.appendChild(element('span', '', thai ? 'ปิดเครื่อง' : 'Offline'));
            legend.appendChild(legOff);

            var legCount = element('span', 'scp-map-legend-item');
            legCount.appendChild(element('span', 'scp-map-legend-chip', '🖥 4/5'));
            legCount.appendChild(element('span', '', thai ? 'เปิดอยู่ / ทั้งหมดในอาคาร' : 'online / total in building'));
            legend.appendChild(legCount);

            legend.appendChild(element('span', 'scp-map-legend-hint', thai ? 'ลากเพื่อเลื่อน · ลูกกลิ้งเพื่อซูม · คลิกอาคารเพื่อดูภายใน · คลิกเครื่องเพื่อดูสเปก' : 'Drag to pan · scroll to zoom · click a building to look inside · click a PC for details'));
            mapWrapper.appendChild(legend);

            var legRisk = element('span', 'scp-map-legend-item');
            legRisk.appendChild(element('span', 'scp-map-legend-risk', '!'));
            legRisk.appendChild(element('span', '', thai ? 'เครื่องเสี่ยง (RAM ต่ำ / CPU เก่า / ไม่ปลอดภัย)' : 'At risk (low RAM / old CPU / unsafe)'));
            legend.appendChild(legRisk);

            /* ---- Spec card on hover ---- */
            var card = element('div', 'scp-map-card');
            card.hidden = true;
            mapWrapper.appendChild(card);
            var showCard = function (node, sx, sy) {
                if (!node || mapEditMode) { card.hidden = true; return; }
                card.textContent = '';
                var head = element('div', 'scp-map-card-head');
                head.appendChild(element('strong', '', node.name || node.rname || '-'));
                var on = isOnline(node), busy = isBusy(node);
                head.appendChild(element('span', 'scp-map-card-status ' + (on ? (busy ? 'busy' : 'ok') : 'off'),
                    on ? (busy ? (thai ? 'กำลังใช้งาน' : 'In use') : (thai ? 'เปิดอยู่' : 'Online')) : (thai ? 'ปิดเครื่อง' : 'Offline')));
                card.appendChild(head);
                var sub = roomOf(node) + (signedInUser(node) ? ' · 👤 ' + signedInUser(node) : '');
                card.appendChild(element('div', 'scp-map-card-sub', sub));

                var spec = specSummaryOf(node);
                var rows = element('div', 'scp-map-card-specs');
                var addRow = function (label, value, bad) {
                    if (!value && value !== 0) return;
                    var r = element('div', 'scp-map-card-row' + (bad ? ' bad' : ''));
                    r.appendChild(element('span', '', label));
                    r.appendChild(element('b', '', String(value)));
                    rows.appendChild(r);
                };
                if (spec && (spec.cpu || spec.ram)) {
                    if (spec.type) addRow(thai ? 'ประเภท' : 'Type', typeLabel(spec.type));
                    addRow('CPU', spec.cpu);
                    var ramN = parseFloat(spec.ram);
                    addRow('RAM', spec.ram, ramN > 0 && ramN <= 4);
                    addRow('Windows', spec.os);
                    if (spec.age != null) addRow(thai ? 'อายุเครื่อง' : 'Age', '~' + spec.age + (thai ? ' ปี' : ' yr'), spec.age >= 7);
                    if (spec.cFree != null && spec.cFree < 100) addRow(thai ? 'ไดรฟ์ C ว่าง' : 'C: free', spec.cFree + '%', spec.cFree <= 10);
                    if (spec.score != null) addRow(thai ? 'คะแนนสุขภาพ' : 'Health', spec.score + ' / 100', spec.score < 50);
                } else {
                    rows.appendChild(element('div', 'scp-map-card-empty', thai ? 'ยังไม่มีข้อมูลสเปก — เครื่องนี้ยังไม่เคยรายงานฮาร์ดแวร์' : 'No specs yet — this computer has not reported its hardware'));
                }
                card.appendChild(rows);

                var risks = risksOf(node);
                if (risks.length) {
                    var list = element('ul', 'scp-map-card-risks');
                    risks.sort(function (a, b) { return (a.level === 'high' ? 0 : 1) - (b.level === 'high' ? 0 : 1); });
                    risks.slice(0, 6).forEach(function (r) { list.appendChild(element('li', r.level === 'high' ? 'high' : 'warn', r.text)); });
                    if (risks.length > 6) list.appendChild(element('li', 'more', '+' + (risks.length - 6) + (thai ? ' รายการ' : ' more')));
                    card.appendChild(list);
                } else if (spec && (spec.cpu || spec.ram)) {
                    card.appendChild(element('div', 'scp-map-card-good', thai ? '✓ ไม่พบความเสี่ยง' : '✓ No risks found'));
                }
                card.appendChild(element('div', 'scp-map-card-hint', thai ? 'คลิกเพื่อดูรายละเอียดทั้งหมด' : 'Click for full details'));

                card.hidden = false;
                var W = mapWrapper.clientWidth, H = mapWrapper.clientHeight;
                var cw = card.offsetWidth, ch = card.offsetHeight;
                var left = sx + 22, top = sy - ch / 2;
                if (left + cw > W - 12) left = sx - cw - 22;
                card.style.left = Math.max(12, left) + 'px';
                card.style.top = Math.max(12, Math.min(H - ch - 12, top)) + 'px';
            };

            /* ---- At-risk computers: alert + list ---- */
            var riskKinds = [
                ['all', thai ? 'ทั้งหมด' : 'All'],
                ['ram', thai ? 'RAM ต่ำ' : 'Low RAM'],
                ['cpu', thai ? 'CPU เก่า' : 'Old CPU'],
                ['age', thai ? 'เครื่องเก่า' : 'Old PC'],
                ['os', 'Windows'],
                ['license', thai ? 'Windows แท้' : 'Genuine'],
                ['security', thai ? 'ความปลอดภัย/อื่นๆ' : 'Security/other']
            ];
            var riskBtn = element('button', 'scp-map-risk-btn');
            riskBtn.type = 'button';
            var riskPanel = element('div', 'scp-map-risk-panel');
            var ramAlert = element('div', 'scp-map-alert');
            mapWrapper.appendChild(riskBtn);
            mapWrapper.appendChild(riskPanel);
            mapWrapper.appendChild(ramAlert);

            var collectRisks = function () {
                var items = [];
                allNodes().filter(matchesSearch).forEach(function (node) {
                    var risks = risksOf(node);
                    if (!risks.length) return;
                    var high = risks.filter(function (r) { return r.level === 'high'; }).length;
                    items.push({ node: node, risks: risks, high: high });
                });
                items.sort(function (a, b) { return (b.high - a.high) || (b.risks.length - a.risks.length) || String(a.node.name).localeCompare(String(b.node.name)); });
                return items;
            };
            var kindOf = function (r) { return (r.kind && r.kind !== 'virt') ? r.kind : 'security'; };

            var paintRisk = function () {
                var items = collectRisks();
                var highCount = items.filter(function (i) { return i.high > 0; }).length;
                riskBtn.textContent = '⚠️ ' + (thai ? 'เครื่องเสี่ยง ' : 'At risk ') + highCount + (items.length > highCount ? ' (+' + (items.length - highCount) + ')' : '');
                riskBtn.className = 'scp-map-risk-btn' + (highCount ? ' hot' : '') + (mapRiskOpen ? ' open' : '');
                riskBtn.title = thai ? 'ตัวเลขแรก = เสี่ยงสูง, ในวงเล็บ = ควรระวัง' : 'First number = serious, in brackets = minor';

                // Low-RAM alert: asked for specifically, so it gets its own banner.
                var lowRam = items.filter(function (i) { return i.risks.some(function (r) { return r.kind === 'ram' && r.level === 'high'; }); });
                ramAlert.textContent = '';
                ramAlert.hidden = !lowRam.length || mapRamAlertClosed;
                if (lowRam.length) {
                    var msg = element('button', 'scp-map-alert-msg', (thai ? '⚠️ พบ ' + lowRam.length + ' เครื่องที่ RAM ต่ำ (4 GB หรือน้อยกว่า) — ทำงานช้า ค้างง่าย · กดเพื่อดูรายชื่อ' : '⚠️ ' + lowRam.length + ' computers have 4 GB RAM or less — click to see them'));
                    msg.type = 'button';
                    msg.addEventListener('click', function () { mapRiskOpen = true; mapRiskFilter = 'ram'; paintRisk(); });
                    ramAlert.appendChild(msg);
                    var x = button('✕', 'scp-map-alert-close', function () { mapRamAlertClosed = true; ramAlert.hidden = true; });
                    x.title = thai ? 'ซ่อน' : 'Hide';
                    ramAlert.appendChild(x);
                }

                riskPanel.textContent = '';
                riskPanel.hidden = !mapRiskOpen;
                if (!mapRiskOpen) return;
                var ph = element('div', 'scp-map-risk-head');
                ph.appendChild(element('strong', '', thai ? '⚠️ เครื่องที่มีความเสี่ยง' : '⚠️ Computers at risk'));
                ph.appendChild(button('✕', 'scp-map-alert-close', function () { mapRiskOpen = false; paintRisk(); }));
                riskPanel.appendChild(ph);
                var chips = element('div', 'scp-map-risk-chips');
                riskKinds.forEach(function (k) {
                    var n = k[0] === 'all' ? items.length : items.filter(function (i) { return i.risks.some(function (r) { return kindOf(r) === k[0]; }); }).length;
                    chips.appendChild(button(k[1] + ' ' + n, 'scp-map-risk-chip' + (mapRiskFilter === k[0] ? ' on' : ''), function () { mapRiskFilter = k[0]; paintRisk(); }));
                });
                riskPanel.appendChild(chips);
                var listEl = element('div', 'scp-map-risk-list');
                var shown = items.filter(function (i) { return mapRiskFilter === 'all' || i.risks.some(function (r) { return kindOf(r) === mapRiskFilter; }); });
                if (!shown.length) listEl.appendChild(element('div', 'scp-map-card-empty', thai ? 'ไม่พบเครื่องในหมวดนี้ 👍' : 'Nothing in this group 👍'));
                shown.slice(0, 200).forEach(function (i) {
                    var main = i.risks.filter(function (r) { return mapRiskFilter === 'all' || kindOf(r) === mapRiskFilter; });
                    main.sort(function (a, b) { return (a.level === 'high' ? 0 : 1) - (b.level === 'high' ? 0 : 1); });
                    var row = element('button', 'scp-map-risk-row');
                    row.type = 'button';
                    row.appendChild(element('span', 'scp-map-risk-dot ' + (main[0].level === 'high' ? 'high' : 'warn')));
                    var txt = element('span', 'scp-map-risk-txt');
                    txt.appendChild(element('b', '', (i.node.name || '-') + ' · ' + roomOf(i.node)));
                    txt.appendChild(element('small', '', main[0].text + (main.length > 1 ? (thai ? ' และอีก ' : ' and ') + (main.length - 1) + (thai ? ' เรื่อง' : ' more') : '')));
                    row.appendChild(txt);
                    row.title = i.risks.map(function (r) { return '• ' + r.text; }).join('\n');
                    row.addEventListener('click', function () {
                        if (currentIsoMap && !currentIsoMap.focusNode(i.node._id)) showComputerDetailModal(i.node);
                    });
                    listEl.appendChild(row);
                });
                riskPanel.appendChild(listEl);
            };
            riskBtn.addEventListener('click', function () { mapRiskOpen = !mapRiskOpen; paintRisk(); });
            mapRiskRefresh = paintRisk;
            paintRisk();

            /* ---- View mode: status / risk heatmap / replacement plan ---- */
            var modeBar = element('div', 'scp-map-view-bar');
            var planBox = element('div', 'scp-map-plan-box');
            var paintModes = function () {
                modeBar.textContent = '';
                var mode = pref('scpMapView', 'status');
                [['status', thai ? '🖥 สถานะ' : '🖥 Status'], ['heat', thai ? '🌡 ความเสี่ยง' : '🌡 Risk'], ['plan', thai ? '📅 แผนเปลี่ยนเครื่อง' : '📅 Replacement']].forEach(function (m) {
                    modeBar.appendChild(button(m[1], 'scp-map-view-btn' + (mode === m[0] ? ' on' : ''), function () {
                        setPref('scpMapView', m[0]);
                        if (currentIsoMap) currentIsoMap.setViewMode(m[0]);
                        paintModes();
                    }));
                });
                planBox.textContent = '';
                planBox.hidden = mode === 'status';
                if (mode === 'heat') {
                    planBox.appendChild(element('span', 'scp-map-plan-key', thai ? 'สีห้อง/ตึก: 🟩 ปกติ 🟨 ควรระวัง 🟥 เสี่ยงสูง (เข้มตามสัดส่วนเครื่อง) · ⬜ ไม่มีคอม' : 'Room colour: green ok · amber caution · red serious · grey no computers'));
                }
                if (mode === 'plan') {
                    var year = (window.ScpPriceReference ? window.ScpPriceReference.fiscalYearBE() - 543 : new Date().getFullYear()), byYear = {}; // fiscal year, as A.D.
                    allNodes().forEach(function (n) {
                        var y = planYearOf(n);
                        if (y === null) return;
                        y = Math.max(y, year);
                        if (y > year + 3) return;
                        var a = window.ScpFleetAssess.assessDevice(n);
                        byYear[y] = byYear[y] || { count: 0, cost: 0 };
                        byYear[y].count++;
                        byYear[y].cost += Number(a && a.estimatedCost) || 0;
                    });
                    planBox.appendChild(element('span', 'scp-map-plan-key', thai ? 'ป้ายบนเครื่อง = ปีงบประมาณ (พ.ศ.) ที่ควรเปลี่ยน · ห้องสีส้ม-แดง = ถึงกำหนดปีงบนี้/ปีงบหน้า' : 'Badge = year to replace · orange/red rooms = due this or next year'));
                    Object.keys(byYear).sort().forEach(function (y) {
                        var v = byYear[y];
                        planBox.appendChild(element('span', 'scp-map-plan-chip' + (Number(y) <= year ? ' now' : Number(y) === year + 1 ? ' next' : ''),
                            (thai ? 'ปีงบ ' : 'FY ') + (Number(y) + 543) + ': ' + v.count + (thai ? ' เครื่อง' : ' PCs') + (v.cost ? ' · ≈฿' + v.cost.toLocaleString() : '')));
                    });
                    if (!Object.keys(byYear).length) planBox.appendChild(element('span', 'scp-map-plan-key', thai ? '(กำลังโหลดผลประเมินเครื่อง…)' : '(loading assessment…)'));
                }
            };
            paintModes();
            mapWrapper.appendChild(modeBar);
            mapWrapper.appendChild(planBox);

            /* ---- Night, sound and kiosk buttons ---- */
            var nightOn = function () {
                var p = pref('scpMapNight', 'auto');
                if (p === 'auto') { var h = new Date().getHours(); return h >= 18 || h < 6; }
                return p === '1';
            };
            var nightBtn = button('🌙', 'scp-map-ctrl-btn' + (nightOn() ? ' on' : ''), function () {
                var next = !nightOn();
                setPref('scpMapNight', next ? '1' : '0');
                nightBtn.classList.toggle('on', next);
                mapWrapper.classList.toggle('scp-map-night', next);
                if (currentIsoMap) currentIsoMap.setNight(next);
            });
            nightBtn.title = thai ? 'โหมดกลางคืน (ไฟตามเครื่องที่เปิดอยู่)' : 'Night mode';
            controls.appendChild(nightBtn);
            mapWrapper.classList.toggle('scp-map-night', nightOn());

            // Cartoon style: pastel buildings, trees, clouds and faces on the screens (on by default).
            var animeOn = function () { return pref('scpMapStyle', 'anime') === 'anime'; };
            var animeBtn = button('✨', 'scp-map-ctrl-btn' + (animeOn() ? ' on' : ''), function () {
                var next = !animeOn();
                setPref('scpMapStyle', next ? 'anime' : 'classic');
                animeBtn.classList.toggle('on', next);
                mapWrapper.classList.toggle('scp-map-anime', next);
                if (currentIsoMap) currentIsoMap.setAnime(next);
            });
            animeBtn.title = thai ? 'สไตล์การ์ตูน (ต้นไม้ เมฆ หน้าจอยิ้มได้) · กดอีกครั้งเพื่อกลับแบบเรียบ' : 'Cartoon style (trees, clouds, smiling screens) · press again for the plain style';
            controls.appendChild(animeBtn);
            mapWrapper.classList.toggle('scp-map-anime', animeOn());

            var soundBtn = button(mapSoundOn() ? '🔔' : '🔕', 'scp-map-ctrl-btn', function () {
                var next = !mapSoundOn();
                setPref('scpMapSound', next ? '1' : '0');
                soundBtn.textContent = next ? '🔔' : '🔕';
                if (next) beep();
            });
            soundBtn.title = thai ? 'เสียงเตือนเมื่อเครื่องหลุดออฟไลน์' : 'Sound when a computer goes offline';
            controls.appendChild(soundBtn);

            mapAlertFeed = element('div', 'scp-map-alert-feed');
            mapWrapper.appendChild(mapAlertFeed);
            paintAlertFeed();

            // Kiosk: full screen, the camera tours the buildings that hold computers.
            var kioskCard = element('div', 'scp-map-kiosk-card');
            kioskCard.hidden = true;
            mapWrapper.appendChild(kioskCard);
            var kioskTimer = null, kioskIndex = 0;
            var stopKiosk = function () {
                if (kioskTimer) window.clearInterval(kioskTimer);
                kioskTimer = null;
                kioskCard.hidden = true;
                mapWrapper.classList.remove('scp-map-kiosk');
            };
            var kioskStep = function () {
                if (!currentIsoMap || !mapWrapper.isConnected) { stopKiosk(); return; }
                if (currentIsoMap.floorId !== 'flr_campus') currentIsoMap.setFloor('flr_campus');
                var stats = currentIsoMap._roomStats || new Map();
                var tour = (currentIsoMap._campusBuildings || []).filter(function (b) { return stats.get(b) && stats.get(b).total; })
                    .sort(function (a, b) { return stats.get(b).total - stats.get(a).total; });
                var now = new Date();
                kioskCard.textContent = '';
                kioskCard.appendChild(element('div', 'scp-kiosk-clock', now.toLocaleTimeString(thai ? 'th-TH' : undefined, { timeStyle: 'short' }) + ' · ' + now.toLocaleDateString(thai ? 'th-TH' : undefined, { dateStyle: 'medium' })));
                var list = allNodes(), on = list.filter(isOnline).length;
                var risky = list.filter(function (n) { return risksOf(n).some(function (r) { return r.level === 'high'; }); }).length;
                if (!tour.length || kioskIndex % (tour.length + 1) === tour.length) {
                    currentIsoMap.fit();
                    kioskCard.appendChild(element('h2', '', thai ? 'โรงพยาบาลสีชมพู' : 'Sichomphu Hospital'));
                    kioskCard.appendChild(element('p', '', (thai ? 'เครื่องเปิดอยู่ ' : 'Online ') + on + ' / ' + list.length + (risky ? (thai ? ' · เสี่ยงสูง ' : ' · serious ') + risky : '')));
                } else {
                    var b = tour[kioskIndex % (tour.length + 1)], st = stats.get(b);
                    currentIsoMap.focusRoom(b.id, 2600);
                    kioskCard.appendChild(element('h2', '', b.name));
                    kioskCard.appendChild(element('p', '', '🖥 ' + st.online + ' / ' + st.total + (thai ? ' เครื่องเปิดอยู่' : ' online') + (st.busy ? (thai ? ' · ใช้งาน ' : ' · in use ') + st.busy : '') + (st.risky ? ' · ⚠ ' + st.risky : '')));
                }
                kioskCard.hidden = false;
                kioskIndex++;
            };
            var kioskBtn = button('📺', 'scp-map-ctrl-btn', function () {
                if (kioskTimer) { stopKiosk(); setMapFull(false); return; }
                setMapFull(true);
                mapWrapper.classList.add('scp-map-kiosk');
                kioskIndex = 0;
                window.setTimeout(kioskStep, 400);
                kioskTimer = window.setInterval(kioskStep, 10000);
            });
            kioskBtn.title = thai ? 'โหมดจอแสดงผล (ทัวร์รอบ รพ. อัตโนมัติ · Esc เพื่อออก)' : 'Kiosk mode (auto tour · Esc to exit)';
            controls.appendChild(kioskBtn);
            kioskCard.addEventListener('click', function () { stopKiosk(); setMapFull(false); });
            mapWrapper.addEventListener('scp-map-exit-full', stopKiosk);
            mapRiskRefresh = function () { paintRisk(); paintModes(); };

            container.appendChild(mapWrapper);

            if (window.ScpHosMap) {
                var initIsoMap = function () {
                    var syncFloorSelect = function (floorId) {
                        if (selectEl.value !== floorId) selectEl.value = floorId;
                        campusBtn.hidden = floorId === 'flr_campus';
                        paintLevels(floorId);
                    };
                    window.ScpHosMap.loadMapData(function (err, mapDoc) {
                        if (err || !mapDoc) {
                            mapWrapper.appendChild(element('div', 'scp-dash-empty-room', thai ? 'โหลดข้อมูลแผนที่ไม่สำเร็จ ลองกดรีเฟรชอีกครั้ง' : 'Could not load the map data. Try Refresh.'));
                            return;
                        }
                        var canvasEl = document.getElementById('scpHosMapCanvas');
                        if (!canvasEl) return;
                        if (!currentIsoMap || currentIsoMap._destroyed || currentIsoMap.canvas !== canvasEl) {
                            if (currentIsoMap) currentIsoMap.destroy();
                            currentIsoMap = new window.ScpHosMap.IsoMap(canvasEl, {
                                onNodeClick: function (node) {
                                    showComputerDetailModal(node);
                                },
                                isOnline: isOnline,
                                isBusy: isBusy,
                                signedInUser: signedInUser,
                                roomOf: roomOf,
                                planYear: planYearOf,
                                riskLevel: function (node) {
                                    var risks = risksOf(node);
                                    if (!risks.length) return null;
                                    return risks.some(function (r) { return r.level === 'high'; }) ? 'high' : 'warn';
                                }
                            });
                            if (mapPlacements) currentIsoMap.setPlacements(Object.assign({}, mapPlacements));
                            currentIsoMap.opts.onFloorChange = syncFloorSelect;
                            currentIsoMap.setMap(mapDoc);
                        }
                        currentIsoMap.opts.onFloorChange = syncFloorSelect;
                        currentIsoMap.opts.onPlace = window.ScpOperations ? savePlacement : null;
                        currentIsoMap.opts.onHoverNode = showCard;
                        currentIsoMap.opts.planYear = planYearOf;
                        if (currentIsoMap.viewMode !== pref('scpMapView', 'status')) currentIsoMap.setViewMode(pref('scpMapView', 'status'));
                        if (currentIsoMap.night !== nightOn()) currentIsoMap.setNight(nightOn());
                        if (currentIsoMap.anime !== animeOn() && currentIsoMap.setAnime) currentIsoMap.setAnime(animeOn());
                        if (currentIsoMap.traffic !== mapTrafficOn()) currentIsoMap.setTraffic(mapTrafficOn());
                        if (currentIsoMap.editMode !== (mapEditMode && !!window.ScpOperations)) currentIsoMap.setEditMode(mapEditMode && !!window.ScpOperations);
                        syncFloorSelect(currentIsoMap.floorId);
                        loadMapPlacements();
                        currentIsoMap.setNodes(list.filter(matchesSearch));
                        currentIsoMap.resize();
                    });
                };
                if (typeof window.requestAnimationFrame === 'function') {
                    window.requestAnimationFrame(initIsoMap);
                } else {
                    window.setTimeout(initIsoMap, 30);
                }
            }

            return container;
        }

        // Campus Overview: All Department Cards Grid
        var grid = element('div', 'scp-campus-grid');
        everyRoom.forEach(function (deptName) {
            var group = (rooms[deptName] || []).filter(matchesSearch);
            var onlineCount = group.filter(isOnline).length;
            var busyCount = group.filter(isBusy).length;
            var offlineCount = group.length - onlineCount;
            var riskCount = group.filter(function (n) { return risksOf(n).length > 0; }).length;
            var onlinePct = group.length ? Math.round((onlineCount / group.length) * 100) : 0;

            var card = element('article', 'scp-dept-card');
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.title = thai ? ('คลิกเพื่อดูคอมพิวเตอร์ในแผนก ' + deptName) : ('Click to view workstations in ' + deptName);

            var cardTop = element('div', 'scp-dept-card-top');
            var iconWrap = element('div', 'scp-dept-card-icon', getDeptIcon(deptName));
            cardTop.appendChild(iconWrap);

            var headerTexts = element('div', 'scp-dept-card-info');
            headerTexts.appendChild(element('h4', 'scp-dept-name', deptName));
            headerTexts.appendChild(element('span', 'scp-dept-total-badge', group.length + (thai ? ' เครื่อง' : ' devices')));
            cardTop.appendChild(headerTexts);
            card.appendChild(cardTop);

            var pBar = element('div', 'scp-dept-prog-bar');
            var pFill = element('div', 'scp-dept-prog-fill');
            pFill.style.width = onlinePct + '%';
            pBar.appendChild(pFill);
            card.appendChild(pBar);

            var statsRow = element('div', 'scp-dept-stats-row');
            statsRow.appendChild(element('span', 'scp-dept-stat-pill pill-ok', '🟢 ' + onlineCount + (thai ? ' เปิด' : ' on')));
            if (busyCount > 0) {
                statsRow.appendChild(element('span', 'scp-dept-stat-pill pill-busy', '🔵 ' + busyCount + (thai ? ' กำลังใช้' : ' busy')));
            }
            if (offlineCount > 0) {
                statsRow.appendChild(element('span', 'scp-dept-stat-pill pill-off', '⚪ ' + offlineCount + (thai ? ' ปิด' : ' off')));
            }
            if (riskCount > 0) {
                statsRow.appendChild(element('span', 'scp-dept-stat-pill pill-risk', '⚠️ ' + riskCount + (thai ? ' ต้องดูแล' : ' risk')));
            }
            card.appendChild(statsRow);

            var cardFooter = element('div', 'scp-dept-card-footer');
            cardFooter.appendChild(element('span', 'scp-dept-action-link', thai ? 'ดูผังคอมพิวเตอร์ในแผนก →' : 'View workstations →'));
            card.appendChild(cardFooter);

            function openDept() {
                selectedCampusDept = deptName;
                rerenderCampus();
                var target = document.getElementById('scpHosMapPage') || document.getElementById('scp-dash-view-overview');
                if (target) {
                    var el = target.querySelector('.scp-campus-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }

            card.addEventListener('click', openDept);
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDept(); }
            });

            grid.appendChild(card);
        });
        container.appendChild(grid);
        return container;
    }

    function rerenderCampus() {
        if (mapPanel && !mapPanel.hidden) {
            renderMapPage();
        } else {
            render();
        }
    }

    /* ================= Map & dashboard extras ================= */

    function pref(key, fallback) {
        try { var v = window.localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; }
    }
    function setPref(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* private window */ }
    }
    function fmtTime(ms) {
        return new Date(ms).toLocaleString(thai ? 'th-TH' : undefined, { dateStyle: 'short', timeStyle: 'short' });
    }
    // The year the assessment says a computer should be replaced, if it knows.
    function planYearOf(node) {
        var a = (window.ScpFleetAssess && window.ScpFleetAssess.assessDevice) ? window.ScpFleetAssess.assessDevice(node) : null;
        if (!a) return null;
        var y = Number(a.replacementYear || a.replaceByYear);
        return y > 2000 ? y : null;
    }
    function nodeByShortId(shortId) {
        var list = allNodes();
        for (var i = 0; i < list.length; i++) { if (String(list[i]._id).split('/').pop() === shortId) return list[i]; }
        return null;
    }
    function overlayDialog(title) {
        var overlay = element('div', 'scp-asset-dialog-overlay scp-extra-overlay');
        var box = element('div', 'scp-asset-dialog-box scp-extra-box');
        var head = element('div', 'scp-extra-head');
        head.appendChild(element('h3', '', title));
        var close = function () { overlay.remove(); document.removeEventListener('keydown', onKey); };
        var onKey = function (e) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        head.appendChild(button('✕', 'scp-dialog-close-btn', close));
        box.appendChild(head);
        overlay.appendChild(box);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        document.body.appendChild(overlay);
        return { overlay: overlay, box: box, close: close };
    }
    function printHtml(title, bodyHtml) {
        var w = window.open('', '_blank');
        if (!w) { window.alert(thai ? 'เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัป' : 'The print window was blocked; allow pop-ups.'); return; }
        w.document.write('<!doctype html><html lang="' + (thai ? 'th' : 'en') + '"><head><meta charset="utf-8"><title>' + title +
            '</title><style>body{font-family:"IBM Plex Sans Thai",sans-serif;margin:16px;color:#111}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px}' +
            'table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left}' +
            '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.card{border:1px dashed #999;border-radius:8px;padding:8px;text-align:center;page-break-inside:avoid;font-size:11px}' +
            '.card img{width:110px;height:110px}.card b{display:block;font-size:12px;margin-top:4px}@media print{button{display:none}}</style></head><body>' +
            bodyHtml + '<script>setTimeout(function(){window.print();},300);<\/script></body></html>');
        w.document.close();
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    /* ---- Genuine Windows: what the activation record says ---- */
    // LicenseStatus: 1 licensed; 0 unlicensed and 5 notification both show the watermark;
    // 2/3/4/6 are grace periods. KMS activation is normal only where the hospital runs its
    // own KMS server; a KMS host on the computer itself is the mark of an activation crack.
    function licenseVerdictOf(node) {
        var l = window.ScpCachedLicense && window.ScpCachedLicense[node._id];
        if (!l) return { state: 'unknown', text: thai ? 'ยังไม่ได้ตรวจ' : 'not checked yet' };
        if (!l.found) return { state: 'unlicensed', level: 'warn', text: thai ? 'ไม่พบสิทธิ์การใช้งาน Windows (มีลายน้ำ Activate Windows)' : 'No Windows licence found (watermark shows)' };
        var channel = String(l.channel || ''), desc = String(l.desc || '');
        var host = String(l.kms || l.kmsFound || '');
        var isKms = /GVLK|KMSCLIENT/i.test(channel + ' ' + desc);
        var localHost = /^(127\.|localhost|0\.0\.0\.0|::1)/i.test(host);
        // Traces a crack left on the computer outweigh everything else: they are there even
        // when the licence itself looks fine.
        var k = l.crack || {}, traces = [];
        if (k.hook) traces.push(thai ? 'ตัวดักระบบ activate (SppExtComObj hook)' : 'activation hook (SppExtComObj)');
        (k.tasks || []).forEach(function (x) { traces.push('Task ' + x); });
        (k.services || []).forEach(function (x) { traces.push('Service ' + x); });
        (k.files || []).forEach(function (x) { traces.push(String(x).split('\\').pop()); });
        (k.threats || []).forEach(function (x) { traces.push((thai ? 'Defender เคยจับ ' : 'Defender caught ') + x); });
        (k.exclusions || []).forEach(function (x) { traces.push((thai ? 'ยกเว้นใน Defender: ' : 'Defender exclusion: ') + x); });
        if (traces.length) {
            return { state: 'cracked', level: 'high', text: (thai ? '🏴‍☠️ พบร่องรอยโปรแกรมแคร็ก Windows: ' : '🏴‍☠️ Activation crack traces: ') + traces.slice(0, 4).join(', ') + (traces.length > 4 ? ' …' : '') };
        }
        // Real KMS activation lasts at most 180 days; KMS38 (a crack) runs to 2038.
        var kms38 = isKms && Number(l.grace) > 259200;
        var crackKms = /digiboy|msguides|03k\.org|loli\.|crsoo|chinancce|lotro\.cc|cangshui|library\.hk|kms\.cx|zhang\.|ddz\.red|kms\.lol|xspace|cy2617|moeclub|kms\.srv/i.test(host);
        if (Number(l.status) === 1) {
            if (kms38) return { state: 'cracked', level: 'high', text: thai ? '🏴‍☠️ Activate แบบ KMS38 (ใช้ได้ถึงปี 2038) — เป็นวิธีแคร็ก ไม่แท้' : '🏴‍☠️ KMS38 activation (valid to 2038) — a crack' };
            if (isKms && crackKms) return { state: 'cracked', level: 'high', text: thai ? ('🏴‍☠️ Activate กับเซิร์ฟเวอร์ KMS สาธารณะที่ใช้แคร็ก (' + host + ') — ไม่แท้') : ('🏴‍☠️ Activated against a public crack KMS (' + host + ')') };
            if (isKms && localHost) return { state: 'suspect', level: 'high', text: thai ? 'Activate ด้วย KMS ในเครื่องตัวเอง — ลักษณะของโปรแกรมแคร็ก (ไม่แท้)' : 'Activated by a KMS on the computer itself — an activation crack' };
            if (isKms) return { state: 'kms', level: 'warn', text: thai ? ('Activate แบบ KMS' + (host ? ' (' + host + ')' : '') + ' — ถ้า รพ. ไม่มีเซิร์ฟเวอร์ KMS เอง มักเป็นโปรแกรมแคร็ก') : ('KMS activation' + (host ? ' (' + host + ')' : '') + ' — a crack unless the hospital runs a KMS server') };
            var how = /OEM/i.test(channel) ? (thai ? 'OEM มากับเครื่อง' : 'OEM, came with the PC') : /Retail/i.test(channel) ? 'Retail' : /MAK/i.test(channel) ? (thai ? 'MAK องค์กร' : 'MAK volume') : (channel || 'licensed');
            // A digital licence runs on a public generic key. So does the HWID crack, and so
            // does a free upgrade from Windows 7/8 -- the paperwork decides, not the computer.
            if (GENERIC_KEYS[String(l.partial || '').toUpperCase()] && !l.oemKey) {
                return { state: 'digital', review: true, text: thai
                    ? '✓ Activate แล้ว (Digital License ด้วยคีย์ทั่วไป · ไม่มีคีย์ OEM ในเครื่อง) — ถ้าไม่มีเอกสารซื้อ/สิทธิ์อัปเกรด อาจเป็นแคร็กแบบ HWID ควรตรวจเอกสาร'
                    : '✓ Activated (digital licence on a generic key, no OEM key) — without a purchase or upgrade record this can be an HWID crack' };
            }
            return { state: 'genuine', text: (thai ? '✓ แท้ · Activate แล้ว (' : '✓ Genuine · activated (') + how + ')' };
        }
        if ([2, 3, 4, 6].indexOf(Number(l.status)) >= 0) {
            var days = Math.round(Number(l.grace || 0) / 1440);
            return { state: 'grace', level: 'warn', text: thai ? ('Windows อยู่ในช่วงผ่อนผัน ยังไม่ activate' + (days ? ' (เหลือ ' + days + ' วัน)' : '')) : ('In grace period, not activated' + (days ? ' (' + days + ' days left)' : '')) };
        }
        return { state: 'unlicensed', level: 'warn', text: thai ? 'Windows ยังไม่ได้ Activate — มีลายน้ำ "Activate Windows"' : 'Windows not activated — the watermark shows' };
    }
    // Public generic keys (last five characters) that Windows 10/11 digital licences use.
    var GENERIC_KEYS = { '3V66T': 'Pro', '8HVX7': 'Home', '6F4BT': 'Home Single Language', 'PKCKT': 'Pro N', '7CFBY': 'Education', '2YV77': 'Pro for Workstations', 'WXCHW': 'Home N' };

    // Microsoft Office: Ohook or a crack KMS is pirated; Microsoft 365 is a subscription
    // checked against the user's account, which the computer's licence store cannot show.
    function officeVerdictOf(node) {
        var l = window.ScpCachedLicense && window.ScpCachedLicense[node._id];
        var o = l && l.office;
        if (!o) return { state: 'unknown', text: thai ? 'ยังไม่ได้ตรวจ' : 'not checked yet' };
        var prods = o.products || [];
        if (!prods.length && !o.c2r) return { state: 'none', text: thai ? 'ไม่ได้ติดตั้ง Office (หรือไม่พบสิทธิ์)' : 'No Office found' };
        if (o.ohook) return { state: 'cracked', level: 'high', text: thai ? '🏴‍☠️ Office ถูกแคร็กด้วย Ohook (มีไฟล์ sppc.dll ปลอมในโฟลเดอร์ Office) — ไม่แท้' : '🏴‍☠️ Office cracked with Ohook (fake sppc.dll) — not genuine' };
        var licensed = prods.filter(function (p) { return Number(p.status) === 1; });
        for (var i = 0; i < licensed.length; i++) {
            var p = licensed[i], kms = /KMSCLIENT|GVLK/i.test(p.desc + ' ' + p.name), host = String(p.kms || '');
            if (kms && (/^(127\.|localhost|0\.0\.0\.0|::1)/i.test(host) || Number(p.grace) > 259200 ||
                /digiboy|msguides|03k\.org|loli\.|crsoo|chinancce|lotro\.cc|cangshui|library\.hk|kms\.cx|ddz\.red|kms\.lol|kms\.srv/i.test(host))) {
                return { state: 'cracked', level: 'high', text: thai ? ('🏴‍☠️ Office activate ด้วย KMS แคร็ก' + (host ? ' (' + host + ')' : '') + ' — ไม่แท้') : ('🏴‍☠️ Office activated by a crack KMS' + (host ? ' (' + host + ')' : '')) };
            }
            if (kms) return { state: 'kms', level: 'warn', text: thai ? ('Office activate แบบ KMS' + (host ? ' (' + host + ')' : '') + ' — ถ้า รพ. ไม่มีเซิร์ฟเวอร์ KMS เอง มักเป็นแคร็ก') : ('Office KMS activation' + (host ? ' (' + host + ')' : '')) };
        }
        if (licensed.length) return { state: 'genuine', text: (thai ? '✓ Office แท้ · Activate แล้ว (' : '✓ Office genuine (') + String(licensed[0].name).replace(/^Office \d+,\s*/, '').replace(/ edition$/, '') + ')' };
        if (/O365|M365|Microsoft365|SubPrem|_Grace/i.test(o.c2r + ' ' + prods.map(function (x) { return x.name; }).join(' '))) {
            return { state: 'subscription', text: thai ? 'Microsoft 365 แบบสมาชิก — ยืนยันสิทธิ์ผ่านบัญชีผู้ใช้ (ตรวจจากเครื่องไม่ได้)' : 'Microsoft 365 subscription — licensed through the user account' };
        }
        return { state: 'unlicensed', level: 'warn', text: thai ? 'Office ยังไม่ Activate (มีแถบแดงเตือนในโปรแกรม)' : 'Office not activated' };
    }
    function licenseRisksOf(node) {
        var out = [], v = licenseVerdictOf(node), o = officeVerdictOf(node);
        if (v.level) out.push({ level: v.level, kind: 'license', text: v.text });
        if (o.level) out.push({ level: o.level, kind: 'license', text: o.text });
        return out;
    }

    /* ---- PC / All-in-One / notebook: ask the computers themselves (read only) ---- */
    // One statement per line: the agent feeds this to PowerShell line by line.
    var CHASSIS_SCRIPT = [
        "$ErrorActionPreference='SilentlyContinue'",
        "$e = Get-CimInstance Win32_SystemEnclosure; $p = Get-CimInstance Win32_ComputerSystemProduct; $c = Get-CimInstance Win32_ComputerSystem",
        "$int = @(Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorConnectionParams | Where-Object { $_.VideoOutputTechnology -eq 2147483648 }).Count",
        // Parts worth replacing, read only: the real disk type and health (and which disk holds C:),
        // a USB-connected UPS, the clock reset to an old year at boot (a flat BIOS battery), and the
        // processor slowed by firmware (usually heat: a dusty or dead fan).
        "$sysDisk = [string](Get-Partition -DriveLetter C -ErrorAction SilentlyContinue | Select-Object -First 1).DiskNumber",
        "$dsk = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object { @{ model = [string]$_.FriendlyName; media = [string]$_.MediaType; bus = [string]$_.BusType; health = [string]$_.HealthStatus; sizeGb = [int]($_.Size / 1GB); system = ([string]$_.DeviceId -eq $sysDisk) } })",
        "$bat = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | ForEach-Object { @{ name = [string]$_.Name; charge = [int]$_.EstimatedChargeRemaining; status = [int]$_.BatteryStatus } })",
        "$cmos = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-General'; Id = 1; StartTime = (Get-Date).AddDays(-180) } -MaxEvents 300 -ErrorAction SilentlyContinue | Where-Object { $_.Properties.Count -ge 2 -and ([datetime]$_.Properties[1].Value).Year -lt 2015 }).Count",
        "$thr = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Processor-Power'; Id = 37; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 500 -ErrorAction SilentlyContinue).Count",
        "$o = @{ chassis = @($e.ChassisTypes); model = [string]$p.Version; name = [string]$p.Name; system = [string]$c.Model; pcType = [int]$c.PCSystemType; internal = $int; disks = $dsk; batteries = $bat; cmosResets = $cmos; throttle = $thr }",
        "Write-Output ('SCP_CHASSIS:' + ($o | ConvertTo-Json -Compress -Depth 4))",
        // Windows activation, the same record that decides the "Activate Windows" watermark.
        // The product key itself is never sent: only whether an OEM key is in the firmware.
        '$lic = @(Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID=\'55c92734-d682-4d71-983e-d6ec3f16059f\' AND PartialProductKey IS NOT NULL") | Where-Object { $_.Description -like \'*Operating System*\' } | Select-Object -First 1',
        '$svc = Get-CimInstance SoftwareLicensingService',
        // Traces the well-known activation cracks leave behind (KMSpico, KMSAuto, KMS_VL_ALL,
        // AutoKMS): their scheduled tasks, services, files, the hook on Windows' own activation
        // service, what Defender has caught, and Defender exclusions made for them. Read only.
        "$kTasks = @(Get-ScheduledTask | Where-Object { $_.TaskName -match 'AutoKMS|AutoPico|KMSAuto|KMS_VL|SppExtComObjHook|KMSpico' } | ForEach-Object { $_.TaskName })",
        "$kSvcs = @(Get-Service | Where-Object { $_.Name -match 'KMSELDI|KMSpico|AutoKMS|KMSAuto|SppExtComObjHook' } | ForEach-Object { $_.Name })",
        "$kFiles = @('C:\\Windows\\SECOH-QAD.exe','C:\\Windows\\SECOH-QAD.dll','C:\\Windows\\System32\\SppExtComObjHook.dll','C:\\Windows\\System32\\SppExtComObjPatcher.exe','C:\\Program Files\\KMSpico','C:\\ProgramData\\KMSAutoS','C:\\ProgramData\\KMSAuto','C:\\Windows\\KMSAutoS','C:\\Windows\\AutoKMS','C:\\Windows\\SysWOW64\\SppExtComObjHook.dll') | Where-Object { Test-Path $_ }",
        "$kIfeo = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\SppExtComObj.exe' -ErrorAction SilentlyContinue",
        "$kThreats = @(Get-MpThreat -ErrorAction SilentlyContinue | Where-Object { $_.ThreatName -match 'KMS|Pico|Activat|HackTool:Win32/AutoKMS' } | ForEach-Object { $_.ThreatName } | Select-Object -Unique)",
        "$kEx = @((Get-MpPreference -ErrorAction SilentlyContinue).ExclusionPath | Where-Object { $_ -match 'KMS|Pico|Activat|SECOH' })",
        "$k = @{ tasks = @($kTasks); services = @($kSvcs); files = @($kFiles); hook = [bool]($kIfeo -and ($kIfeo.Debugger -or $kIfeo.VerifierDlls)); threats = @($kThreats); exclusions = @($kEx) }",
        // Microsoft Office: its licences (Office 2013+ in SPP, Office 2010 in OSPP), the Ohook
        // crack (a fake sppc.dll inside Office's own folder) and the Click-to-Run products.
        '$oProd = @(Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID=\'0ff1ce15-a989-479d-af46-f275c6370663\' AND PartialProductKey IS NOT NULL" | ForEach-Object { @{ name = [string]$_.Name; desc = [string]$_.Description; status = [int]$_.LicenseStatus; kms = [string]($_.KeyManagementServiceMachine + $_.DiscoveredKeyManagementServiceMachineName); grace = [int]$_.GracePeriodRemaining } })',
        "$oOld = @(Get-CimInstance OfficeSoftwareProtectionProduct -ErrorAction SilentlyContinue | Where-Object { $_.PartialProductKey } | ForEach-Object { @{ name = [string]$_.Name; desc = [string]$_.Description; status = [int]$_.LicenseStatus; kms = [string]$_.KeyManagementServiceMachine; grace = [int]$_.GracePeriodRemaining } })",
        "$oHook = @('C:\\Program Files\\Microsoft Office\\root\\vfs\\System\\sppc.dll','C:\\Program Files\\Microsoft Office\\root\\vfs\\SystemX86\\sppc.dll','C:\\Program Files (x86)\\Microsoft Office\\root\\vfs\\System\\sppc.dll','C:\\Program Files (x86)\\Microsoft Office\\root\\vfs\\SystemX86\\sppc.dll') | Where-Object { Test-Path $_ }",
        "$oC2r = [string](Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Office\\ClickToRun\\Configuration' -ErrorAction SilentlyContinue).ProductReleaseIds",
        "$off = @{ products = @($oProd + $oOld); ohook = (@($oHook).Count -gt 0); c2r = $oC2r }",
        // Only the last five characters of the Windows key -- what Settings shows anyway -- to
        // recognise the generic keys a digital licence (or an HWID crack) runs on.
        '$l = @{ status = [int]$lic.LicenseStatus; channel = [string]$lic.ProductKeyChannel; desc = [string]$lic.Description; name = [string]$lic.Name; kms = [string]$lic.KeyManagementServiceMachine; kmsFound = [string]$lic.DiscoveredKeyManagementServiceMachineName; grace = [int]$lic.GracePeriodRemaining; oemKey = [bool]$svc.OA3xOriginalProductKey; found = [bool]$lic; partial = [string]$lic.PartialProductKey; crack = $k; office = $off }',
        "Write-Output ('SCP_LICENSE:' + ($l | ConvertTo-Json -Compress -Depth 5))"
    ].join('\r\n');
    var chassisJob = null;
    function typeLabel(type) {
        return { aio: 'All-in-One', notebook: thai ? 'โน้ตบุ๊ก' : 'Notebook', desktop: thai ? 'PC (เครื่องตั้งโต๊ะ + จอแยก)' : 'PC (separate screen)' }[type] || '-';
    }
    function typeSourceLabel(source) {
        return { probe: thai ? 'ตรวจจากเครื่องจริง' : 'checked on the computer', model: thai ? 'จากชื่อรุ่น' : 'from the model name',
            cpu: thai ? 'เดาจาก CPU รุ่นโน้ตบุ๊ก — ยังไม่ได้ตรวจ' : 'guessed from a laptop CPU — not checked yet',
            guess: thai ? 'เดา — ยังไม่ได้ตรวจ' : 'guess — not checked yet' }[source] || '';
    }
    function loadChassis() {
        if (!window.ScpOperations) return;
        window.ScpOperations.request('chassisList').then(function (map) { window.ScpCachedChassis = map || {}; }).catch(function () { });
        window.ScpOperations.request('licenseList').then(function (map) { window.ScpCachedLicense = map || {}; if (mapRiskRefresh) mapRiskRefresh(); }).catch(function () { });
    }
    // Replies to our own request only; everything else goes on to the other handlers.
    function chassisReceive(message) {
        var job = chassisJob;
        if (!job || !message || message.action !== 'msg' || message.type !== 'runcommands' || message.responseid !== job.ticket || message.progress === true) return false;
        if (!job.pending[message.nodeid]) return true;
        delete job.pending[message.nodeid];
        var text = String(message.result || ''), m = text.match(/SCP_CHASSIS:(\{[^\r\n]*\})/), lm = text.match(/SCP_LICENSE:(\{[^\r\n]*\})/);
        if (lm) { try { var lo = JSON.parse(lm[1]); lo.nodeid = message.nodeid; job.licenses.push(lo); } catch (e) { /* ignore */ } }
        if (/COMMAND_BUSY/.test(text)) job.busy++;
        else if (m) { try { var o = JSON.parse(m[1]); o.nodeid = message.nodeid; job.items.push(o); } catch (e) { job.failed++; } }
        else job.failed++;
        job.paint();
        if (!Object.keys(job.pending).length) job.finish();
        return true;
    }
    function probeChassis() {
        var online = allNodes().filter(isOnline);
        if (!online.length) { window.alert(thai ? 'ตอนนี้ไม่มีเครื่องที่ออนไลน์' : 'No computer is online right now'); return; }
        if (!window.confirm(thai ? ('ตรวจชนิดเครื่อง (PC / All-in-One / โน้ตบุ๊ก) และ Windows แท้ / Activate กับ ' + online.length + ' เครื่องที่ออนไลน์?\n\nเป็นการอ่านข้อมูลจาก Windows อย่างเดียว ไม่เปลี่ยนแปลงอะไรในเครื่อง ใช้เวลาไม่ถึงนาที')
            : ('Check the type (PC / All-in-One / notebook) of ' + online.length + ' online computers?\n\nRead-only; nothing on the computers is changed.'))) return;
        var d = overlayDialog(thai ? '🔍 ตรวจชนิดเครื่อง' : '🔍 Checking computer types');
        var body = element('div', 'scp-extra-body');
        var status = element('p', '');
        body.appendChild(status);
        d.box.appendChild(body);
        var job = chassisJob = { ticket: 'scpchassis' + Date.now(), pending: {}, items: [], licenses: [], busy: 0, failed: 0, total: online.length };
        online.forEach(function (n) { job.pending[n._id] = true; });
        job.paint = function () {
            var left = Object.keys(job.pending).length;
            status.textContent = (thai ? 'ได้คำตอบ ' : 'Answered ') + job.items.length + ' / ' + job.total + (left ? (thai ? ' · รออีก ' + left + ' เครื่อง' : ' · waiting for ' + left) : '') +
                (job.busy ? (thai ? ' · ติดคำสั่งอื่น ' : ' · busy ') + job.busy : '') + (job.failed ? (thai ? ' · ไม่ตอบ ' : ' · no answer ') + job.failed : '');
        };
        job.finish = function () {
            if (job.done) return;
            job.done = true;
            if (chassisJob === job) chassisJob = null;
            window.clearTimeout(job.timer);
            if (!job.items.length) { status.textContent += thai ? ' — ไม่มีผลให้บันทึก' : ' — nothing to save'; return; }
            var licenseSaved = window.ScpOperations.request('licenseSave', { items: job.licenses }).then(function () {
                window.ScpCachedLicense = window.ScpCachedLicense || {};
                job.licenses.forEach(function (l) { window.ScpCachedLicense[l.nodeid] = l; });
            }).catch(function () { });
            window.ScpOperations.request('chassisSave', { items: job.items }).then(function () { return licenseSaved; }).then(function () {
                window.ScpCachedChassis = window.ScpCachedChassis || {};
                job.items.forEach(function (it) { window.ScpCachedChassis[it.nodeid] = it; });
                var count = { desktop: 0, aio: 0, notebook: 0 };
                job.items.forEach(function (it) {
                    var n = allNodes().filter(function (x) { return x._id === it.nodeid; })[0];
                    var t = window.ScpFleetAssess.deviceTypeOf((n && n.cpu) || '', '', it).type;
                    count[t]++;
                });
                var lic = { genuine: 0, bad: 0 };
                job.licenses.forEach(function (l) {
                    var v = licenseVerdictOf({ _id: l.nodeid }), o = officeVerdictOf({ _id: l.nodeid });
                    if (v.level || o.level) lic.bad++; else if (v.review) lic.review = (lic.review || 0) + 1; else lic.genuine++;
                });
                status.textContent = (thai ? '✓ บันทึกแล้ว ' : '✓ Saved ') + job.items.length + (thai ? ' เครื่อง: PC ' : ' computers: PC ') + count.desktop + ' · All-in-One ' + count.aio + (thai ? ' · โน้ตบุ๊ก ' : ' · notebook ') + count.notebook +
                    (thai ? ' · Windows แท้ ' : ' · genuine Windows ') + lic.genuine + (lic.bad ? (thai ? ' · ไม่แท้/ยังไม่ activate (Windows หรือ Office) ' : ' · not genuine/not activated (Windows or Office) ') + lic.bad : '') + (lic.review ? (thai ? ' · ควรตรวจเอกสาร ' : ' · check paperwork ') + lic.review : '') +
                    (thai ? ' (เครื่องที่ปิดอยู่ กดตรวจอีกครั้งตอนเปิดเครื่อง)' : ' (run again later for computers that are off)');
                loadFleetAssessment(true);
            }).catch(function (e) { status.textContent = (thai ? 'บันทึกไม่สำเร็จ: ' : 'Could not save: ') + (e && e.message); });
        };
        job.paint();
        job.timer = window.setTimeout(function () { job.failed += Object.keys(job.pending).length; job.pending = {}; job.paint(); job.finish(); }, 120000);
        try {
            window.meshserver.send({ action: 'runcommands', nodeids: online.map(function (n) { return n._id; }), type: 2, runAsUser: 0, reply: true, responseid: job.ticket, cmds: CHASSIS_SCRIPT });
        } catch (e) { status.textContent = thai ? 'ส่งคำสั่งไม่ได้' : 'Could not send'; }
    }

    /* ---- Morning summary: one page for the start of the day ---- */
    function openMorningSummary() {
        var list = allNodes();
        var online = list.filter(isOnline);
        var offline = list.filter(function (n) { return !isOnline(n); });
        var dayAgo = Date.now() - 86400000;
        var wentDown = offline.filter(function (n) { var at = lastSeen && lastSeen[n._id]; return at && at >= dayAgo; });
        // never seen since the server started counting falls here too, rather than nowhere
        var longOff = offline.filter(function (n) { var at = lastSeen && lastSeen[n._id]; return !at || at < dayAgo; });
        var oldSig = list.filter(function (n) { var a = signatureAge(n); return a != null && a > staleSignatureDays; });
        var diskLow = list.filter(function (n) { return disksOf(n).some(function (d) { return d.percent <= diskWarnPercent; }); });
        var lowRam = list.filter(function (n) { return hardwareRisksOf(n).some(function (r) { return r.kind === 'ram' && r.level === 'high'; }); });
        var serious = list.filter(function (n) { return risksOf(n).some(function (r) { return r.level === 'high'; }); });

        var d = overlayDialog((thai ? '📰 สรุปประจำวัน · ' : '📰 Daily summary · ') + new Date().toLocaleDateString(thai ? 'th-TH' : undefined, { dateStyle: 'full' }));
        var body = element('div', 'scp-extra-body');
        d.box.appendChild(body);
        var kpis = element('div', 'scp-extra-kpis');
        [[thai ? 'เครื่องทั้งหมด' : 'Computers', list.length, ''], [thai ? 'เปิดอยู่' : 'Online', online.length, 'ok'],
         [thai ? 'ปิด/ออฟไลน์' : 'Offline', offline.length, 'off'], [thai ? 'เสี่ยงสูง' : 'Serious risk', serious.length, 'risk']].forEach(function (k) {
            var c = element('div', 'scp-extra-kpi ' + k[2]);
            c.appendChild(element('strong', '', String(k[1])));
            c.appendChild(element('span', '', k[0]));
            kpis.appendChild(c);
        });
        body.appendChild(kpis);

        var sections = [];
        var section = function (title, nodes, detail) {
            var s = element('section', 'scp-extra-section');
            s.appendChild(element('h4', '', title + ' (' + nodes.length + ')'));
            if (!nodes.length) { s.appendChild(element('p', 'scp-extra-muted', thai ? 'ไม่มี 👍' : 'None 👍')); }
            var ul = element('ul', 'scp-extra-list');
            nodes.slice(0, 12).forEach(function (n) {
                var li = element('li');
                var a = element('button', 'scp-extra-link', (n.name || '-') + ' · ' + roomOf(n));
                a.type = 'button';
                a.addEventListener('click', function () { d.close(); showComputerDetailModal(n); });
                li.appendChild(a);
                if (detail) li.appendChild(element('small', '', ' — ' + detail(n)));
                ul.appendChild(li);
            });
            if (nodes.length > 12) ul.appendChild(element('li', 'scp-extra-muted', (thai ? 'และอีก ' : 'and ') + (nodes.length - 12) + (thai ? ' เครื่อง' : ' more')));
            s.appendChild(ul);
            body.appendChild(s);
            sections.push({ title: title, nodes: nodes, detail: detail });
        };
        section(thai ? '🔴 ดับ/หลุดภายใน 24 ชม.' : '🔴 Went offline in the last 24 h', wentDown, function (n) { return (thai ? 'เห็นล่าสุด ' : 'last seen ') + fmtTime(lastSeen[n._id]); });
        section(thai ? '⚪ ไม่ได้เปิดเกิน 1 วัน' : '⚪ Off for more than a day', longOff, function (n) { var a = daysAway(n); return a > 0 ? a + (thai ? ' วัน' : ' days') : (thai ? 'ไม่ทราบเวลาล่าสุด' : 'last seen unknown'); });
        section(thai ? '🛡️ ฐานข้อมูลไวรัสเก่า' : '🛡️ Old virus signatures', oldSig, function (n) { return signatureAge(n) + (thai ? ' วัน' : ' days'); });
        section(thai ? '💾 ดิสก์ใกล้เต็ม' : '💾 Disk almost full', diskLow, function (n) { return disksOf(n).filter(function (x) { return x.percent <= diskWarnPercent; }).map(function (x) { return x.letter + ': ' + x.percent + '%'; }).join(', '); });
        var notGenuine = list.filter(function (n) { return licenseVerdictOf(n).level; });
        section(thai ? '🪪 Windows ไม่แท้ / ยังไม่ Activate' : '🪪 Windows not genuine / not activated', notGenuine, function (n) { return licenseVerdictOf(n).text; });
        section(thai ? '📄 Office ไม่แท้ / ยังไม่ Activate' : '📄 Office not genuine / not activated', list.filter(function (n) { return officeVerdictOf(n).level; }), function (n) { return officeVerdictOf(n).text; });
        section(thai ? '🔎 ควรตรวจเอกสารสิทธิ์ (Digital License ด้วยคีย์ทั่วไป)' : '🔎 Check the licence paperwork (digital licence, generic key)', list.filter(function (n) { return licenseVerdictOf(n).review; }), function () { return thai ? 'ยืนยันด้วยใบสั่งซื้อหรือสิทธิ์อัปเกรด' : 'confirm with a purchase or upgrade record'; });
        section(thai ? '🧠 RAM ต่ำ (≤ 4 GB)' : '🧠 Low RAM (≤ 4 GB)', lowRam, function (n) { var s = specSummaryOf(n); return s && s.ram; });
        var partsOf = function (n) { var a = window.ScpFleetAssess && window.ScpFleetAssess.assessDevice(n); return ((a && a.maintenance) || []).filter(function (m) { return !m.optional; }); };
        section(thai ? '🔧 อะไหล่ที่ควรเปลี่ยน (ดิสก์ / ถ่าน BIOS / พัดลม)' : '🔧 Parts to replace (disk / BIOS battery / fan)', list.filter(function (n) { return partsOf(n).length; }),
            function (n) { return partsOf(n).map(function (m) { return m.note.split(' — ')[0]; }).join(', '); });

        var tickets = element('section', 'scp-extra-section');
        tickets.appendChild(element('h4', '', thai ? '🛠️ งานซ่อมค้าง' : '🛠️ Open repairs'));
        var tlist = element('ul', 'scp-extra-list');
        tlist.appendChild(element('li', 'scp-extra-muted', thai ? 'กำลังโหลด…' : 'Loading…'));
        tickets.appendChild(tlist);
        body.appendChild(tickets);
        var openTickets = [];
        if (window.ScpOperations) {
            window.ScpOperations.request('tickets').then(function (rows) {
                openTickets = (rows || []).filter(function (r) { return r.status !== 'closed'; });
                tlist.textContent = '';
                tickets.firstChild.textContent = (thai ? '🛠️ งานซ่อมค้าง (' : '🛠️ Open repairs (') + openTickets.length + ')';
                if (!openTickets.length) tlist.appendChild(element('li', 'scp-extra-muted', thai ? 'ไม่มี 👍' : 'None 👍'));
                var names = {}; list.forEach(function (n) { names[n._id] = n.name; });
                openTickets.slice(0, 12).forEach(function (r) {
                    tlist.appendChild(element('li', '', (names[r.nodeid] || '-') + ' · ' + r.title + ' (' + r.status + ')'));
                });
            }).catch(function () { tlist.textContent = ''; tlist.appendChild(element('li', 'scp-extra-muted', '-')); });
        }

        // Plain text for pasting into a chat, and a printable page.
        var asText = function () {
            var lines = [(thai ? 'สรุปประจำวัน SCP-Remote ' : 'SCP-Remote daily summary ') + new Date().toLocaleDateString(thai ? 'th-TH' : undefined),
                (thai ? 'ทั้งหมด ' : 'Total ') + list.length + (thai ? ' · เปิด ' : ' · online ') + online.length + (thai ? ' · ปิด ' : ' · offline ') + offline.length + (thai ? ' · เสี่ยงสูง ' : ' · serious ') + serious.length];
            sections.forEach(function (s) {
                lines.push('');
                lines.push(s.title + ' (' + s.nodes.length + ')');
                s.nodes.slice(0, 10).forEach(function (n) { lines.push('- ' + n.name + ' · ' + roomOf(n) + (s.detail ? ' — ' + (s.detail(n) || '') : '')); });
                if (s.nodes.length > 10) lines.push((thai ? '…และอีก ' : '…and ') + (s.nodes.length - 10));
            });
            lines.push('');
            lines.push((thai ? 'งานซ่อมค้าง ' : 'Open repairs ') + openTickets.length);
            return lines.join('\n');
        };
        var actionsRow = element('div', 'scp-extra-actions');
        actionsRow.appendChild(button(thai ? '📋 คัดลอกข้อความ (วางในไลน์ได้)' : '📋 Copy as text', 'scp-dash-refresh', function (e) {
            var txt = asText(), btn = e.target;
            var done = function () { btn.textContent = thai ? '✓ คัดลอกแล้ว' : '✓ Copied'; };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { window.prompt('', txt); });
            else window.prompt('', txt);
        }));
        actionsRow.appendChild(button(thai ? '🖨️ พิมพ์' : '🖨️ Print', 'scp-dash-refresh', function () {
            printHtml(thai ? 'สรุปประจำวัน' : 'Daily summary', '<pre style="font-family:inherit;font-size:13px;white-space:pre-wrap">' + esc(asText()) + '</pre>');
        }));
        d.box.appendChild(actionsRow);
    }

    /* ---- QR stickers: scan with a phone to open that computer's card ---- */
    function qrLink(node) {
        return window.location.origin + window.location.pathname + '?scpnode=' + encodeURIComponent(String(node._id).split('/').pop());
    }
    function openQrSheet() {
        var d = overlayDialog(thai ? '🏷️ พิมพ์สติกเกอร์ QR ติดเครื่อง' : '🏷️ Print QR stickers');
        var body = element('div', 'scp-extra-body');
        d.box.appendChild(body);
        body.appendChild(element('p', 'scp-extra-muted', thai
            ? 'สแกนด้วยมือถือ (ล็อกอินแล้ว) เพื่อเปิดสเปก ประวัติ และแจ้งซ่อมของเครื่องนั้นทันที'
            : 'Scan with a signed-in phone to open that computer\'s specs, history and repairs.'));
        var pick = document.createElement('select');
        pick.className = 'scp-map-floor-select';
        var rooms = {};
        allNodes().forEach(function (n) { rooms[roomOf(n)] = true; });
        [['', thai ? 'ทุกแผนก' : 'All departments']].concat(Object.keys(rooms).sort().map(function (r) { return [r, r]; })).forEach(function (o) {
            var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; pick.appendChild(op);
        });
        body.appendChild(pick);
        var grid = element('div', 'scp-qr-grid');
        body.appendChild(grid);
        var paint = function () {
            grid.textContent = '';
            var list = allNodes().filter(function (n) { return !pick.value || roomOf(n) === pick.value; })
                .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
            list.slice(0, 120).forEach(function (n) {
                var card = element('div', 'scp-qr-card');
                var q = element('div', 'scp-qr-code');
                card.appendChild(q);
                card.appendChild(element('b', '', n.name || '-'));
                var asset = (window.ScpCachedAssets && window.ScpCachedAssets[n._id]) || {};
                card.appendChild(element('small', '', roomOf(n) + (asset.assetNumber ? ' · ' + asset.assetNumber : '')));
                grid.appendChild(card);
                if (window.QRCode) { try { new window.QRCode(q, { text: qrLink(n), width: 110, height: 110, correctLevel: window.QRCode.CorrectLevel.M }); } catch (e) { q.textContent = 'QR'; } }
                card.dataset.name = n.name || '-';
                card.dataset.sub = roomOf(n) + (asset.assetNumber ? ' · ' + asset.assetNumber : '');
            });
            if (list.length > 120) grid.appendChild(element('p', 'scp-extra-muted', thai ? 'แสดง 120 เครื่องแรก เลือกแผนกเพื่อพิมพ์ทีละแผนก' : 'First 120 shown; pick a department.'));
        };
        pick.addEventListener('change', paint);
        paint();
        var actionsRow = element('div', 'scp-extra-actions');
        actionsRow.appendChild(button(thai ? '🖨️ พิมพ์สติกเกอร์' : '🖨️ Print stickers', 'scp-dash-refresh', function () {
            var html = '<h1>' + esc(thai ? 'สติกเกอร์ QR ติดเครื่อง' : 'Computer QR stickers') + '</h1><div class="grid">';
            Array.prototype.forEach.call(grid.querySelectorAll('.scp-qr-card'), function (c) {
                var cv = c.querySelector('canvas'), img = c.querySelector('img');
                var src = cv ? cv.toDataURL('image/png') : (img ? img.src : '');
                html += '<div class="card"><img src="' + src + '" alt=""><b>' + esc(c.dataset.name) + '</b>' + esc(c.dataset.sub) + '</div>';
            });
            printHtml(thai ? 'สติกเกอร์ QR' : 'QR stickers', html + '</div>');
        }));
        d.box.appendChild(actionsRow);
    }

    /* ---- One computer's history, for its detail card ---- */
    function historySection(node) {
        var sec = element('section', 'scp-cm-section');
        sec.appendChild(element('h4', 'scp-cm-section-title', thai ? '🕘 ประวัติเครื่อง' : '🕘 History'));
        var list = element('ul', 'scp-history-list');
        list.appendChild(element('li', 'scp-extra-muted', thai ? 'กำลังโหลด…' : 'Loading…'));
        sec.appendChild(list);
        if (!window.ScpOperations) { list.textContent = ''; return sec; }
        var floorName = function (id) {
            var doc = window.__scpHosMapData, f = doc && (doc.floors || []).find(function (x) { return x.id === id; });
            var b = f && (doc.buildings || []).find(function (x) { return x.id === f.building_id; });
            return b ? b.name + (f.level > 1 ? ' ชั้น ' + f.level : '') : (id === 'flr_campus' ? (thai ? 'ภาพรวม รพ.' : 'campus') : id);
        };
        window.ScpOperations.request('deviceHistory', { nodeid: node._id }).then(function (rows) {
            list.textContent = '';
            if (!rows || !rows.length) { list.appendChild(element('li', 'scp-extra-muted', thai ? 'ยังไม่มีประวัติ' : 'No history yet')); return; }
            rows.forEach(function (e) {
                var icon = { ticket: '🛠️', driver: '🧩', cleanup: '🧹', care: '🛡️', moved: '📍', asset: '🏷️', health: '🩺' }[e.kind] || '•';
                var text = '';
                if (e.kind === 'ticket') text = (thai ? 'งานซ่อม: ' : 'Repair: ') + e.title + ' — ' + e.status + (e.note && e.note !== 'Created' ? ' (' + e.note + ')' : '');
                else if (e.kind === 'driver') text = (thai ? 'ติดตั้งไดรเวอร์: ' : 'Drivers: ') + (e.progress ? (thai ? 'กำลังทำ' : 'running') : (e.note || '-'));
                else if (e.kind === 'cleanup') text = (thai ? 'ล้างไฟล์ขยะ: ' : 'Clean-up: ') + (e.progress ? (thai ? 'กำลังทำ' : 'running') : (e.note || '-'));
                else if (e.kind === 'care') text = (thai ? 'ดูแลอัตโนมัติ: ' : 'Safe auto-care: ') + (e.state || '') + (e.result ? ' · ' + Object.keys(e.result).map(function (k) { return k + ' ' + e.result[k]; }).join(', ') : '');
                else if (e.kind === 'moved') text = (thai ? 'ย้ายตำแหน่งบนแผนที่ → ' : 'Moved on the map → ') + floorName(e.floor);
                else if (e.kind === 'asset') text = (thai ? 'แก้ข้อมูลครุภัณฑ์ ' : 'Asset record ') + (e.note || '');
                else if (e.kind === 'health') text = (e.ok ? '✓ ' : '✗ ') + ({ printer_fix: thai ? 'แก้ปริ้นไม่ออก (ล้างคิว)' : 'Fixed printing (cleared queue)', spooler_restart: thai ? 'รีสตาร์ท Print Spooler' : 'Restarted spooler', printer_test: thai ? 'พิมพ์หน้าทดสอบ' : 'Test page', printer_resume: thai ? 'สั่งเครื่องพิมพ์ทำงานต่อ' : 'Resumed printer', dns_flush: thai ? 'ล้าง DNS' : 'Flushed DNS', svc_start: thai ? 'เปิดบริการ' : 'Started service', trim: 'TRIM SSD', power_balanced: thai ? 'ตั้งโหมดพลังงาน Balanced' : 'Balanced power plan', synapse_hosts: thai ? 'ตั้งชื่อเครื่อง PACS (hosts)' : 'PACS hosts entry', startup: thai ? 'เปลี่ยนโปรแกรมเปิดพร้อมเครื่อง' : 'Start-up program', fonts: thai ? 'ติดตั้งฟอนต์ไทย' : 'Thai fonts' }[e.action] || e.action) +
                    (e.result && e.action === 'printer_fix' ? (thai ? ' · งานค้าง ' : ' · jobs ') + e.result.before + ' → ' + e.result.after : '') + (e.result && e.action === 'fonts' ? (thai ? ' · ใหม่ ' : ' · new ') + (e.result.installed || 0) : '');
                var li = element('li');
                li.appendChild(element('span', 'scp-history-icon', icon));
                var body = element('div');
                body.appendChild(element('b', '', text));
                body.appendChild(element('small', '', fmtTime(e.at) + (e.by ? ' · ' + e.by : '')));
                li.appendChild(body);
                list.appendChild(li);
            });
        }).catch(function () { list.textContent = ''; list.appendChild(element('li', 'scp-extra-muted', thai ? 'โหลดประวัติไม่ได้ (เซิร์ฟเวอร์อาจต้องรีสตาร์ท)' : 'Could not load history')); });
        return sec;
    }

    /* ---- Live offline alerts on the map ---- */
    var mapLastOnline = null, mapAlerts = [], mapAlertFeed = null, mapAudio = null;
    function mapSoundOn() { return pref('scpMapSound', '1') !== '0'; }
    function beep() {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            mapAudio = mapAudio || new Ctx();
            [0, 0.22].forEach(function (offset) {
                var o = mapAudio.createOscillator(), g = mapAudio.createGain();
                o.type = 'sine'; o.frequency.value = 880;
                g.gain.setValueAtTime(0.0001, mapAudio.currentTime + offset);
                g.gain.exponentialRampToValueAtTime(0.18, mapAudio.currentTime + offset + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, mapAudio.currentTime + offset + 0.18);
                o.connect(g); g.connect(mapAudio.destination);
                o.start(mapAudio.currentTime + offset); o.stop(mapAudio.currentTime + offset + 0.2);
            });
        } catch (e) { /* no sound */ }
    }
    function paintAlertFeed() {
        var feed = mapAlertFeed;
        if (!feed || !feed.isConnected) return;
        feed.textContent = '';
        feed.hidden = !mapAlerts.length;
        mapAlerts.slice(0, 4).forEach(function (a) {
            var row = element('div', 'scp-map-alert-item');
            row.appendChild(element('span', '', '🔴 ' + a.name + (thai ? ' หลุดออฟไลน์ · ' : ' went offline · ') + a.room + ' · ' + new Date(a.at).toLocaleTimeString(thai ? 'th-TH' : undefined, { timeStyle: 'short' })));
            row.appendChild(button(thai ? 'ดูตำแหน่ง' : 'Show', 'scp-map-alert-go', function () { if (currentIsoMap) currentIsoMap.focusNode(a.id); }));
            row.appendChild(button('✕', 'scp-map-alert-close', function () { mapAlerts = mapAlerts.filter(function (x) { return x !== a; }); paintAlertFeed(); }));
            feed.appendChild(row);
        });
    }
    // Called every refresh while the map is open; the first call only takes a baseline.
    function checkOfflineTransitions() {
        var list = allNodes(), first = mapLastOnline === null, gone = [];
        if (first) mapLastOnline = {};
        list.forEach(function (n) {
            var now = isOnline(n);
            if (!first && mapLastOnline[n._id] === true && !now) gone.push(n);
            mapLastOnline[n._id] = now;
        });
        if (!gone.length) return;
        var hour = new Date().getHours(), workHours = hour >= 7 && hour < 18, sound = false;
        gone.forEach(function (n) {
            mapAlerts.unshift({ id: n._id, name: n.name || '-', room: roomOf(n), at: Date.now() });
            if (currentIsoMap) currentIsoMap.pingNode(n._id, 120000);
            if (watched[n._id] === true || workHours) sound = true;
        });
        mapAlerts = mapAlerts.slice(0, 20);
        paintAlertFeed();
        if (sound && mapSoundOn()) beep();
    }

    /* ---- Search that flies the map to a computer or a room ---- */
    function buildMapSearch() {
        var wrap = element('div', 'scp-map-search');
        var input = document.createElement('input');
        input.type = 'search';
        input.placeholder = thai ? '🔎 ค้นหาเครื่อง ชื่อคน IP หรือห้อง แล้วบินไปหา' : '🔎 Find a computer, person, IP or room';
        var results = element('div', 'scp-map-search-results');
        results.hidden = true;
        wrap.appendChild(input);
        wrap.appendChild(results);
        var go = function (item) {
            results.hidden = true;
            input.value = item.label;
            if (campusViewMode !== 'map' || selectedCampusDept) { campusViewMode = 'map'; selectedCampusDept = null; renderMapPage(); }
            var fly = function () {
                if (!currentIsoMap || !currentIsoMap.doc) { window.setTimeout(fly, 200); return; }
                if (item.node) { if (!currentIsoMap.focusNode(item.node._id)) showComputerDetailModal(item.node); }
                else currentIsoMap.focusRoom(item.roomId);
            };
            fly();
        };
        var current = [];
        var search = function () {
            var q = input.value.trim().toLowerCase();
            results.textContent = '';
            current = [];
            if (q.length < 1) { results.hidden = true; return; }
            allNodes().forEach(function (n) {
                var hay = [n.name, n.rname, n.host, n.ip, signedInUser(n), roomOf(n)].join(' ').toLowerCase();
                if (hay.indexOf(q) >= 0) current.push({ node: n, label: n.name || '-', sub: roomOf(n) + (signedInUser(n) ? ' · 👤 ' + signedInUser(n) : '') });
            });
            var doc = window.__scpHosMapData;
            (doc && doc.rooms || []).forEach(function (r) {
                if (r.name && r.kind !== 'corridor' && String(r.name).toLowerCase().indexOf(q) >= 0) current.push({ roomId: r.id, label: r.name, sub: thai ? 'ห้อง / อาคาร' : 'Room / building' });
            });
            current.slice(0, 8).forEach(function (item, i) {
                var b = element('button', 'scp-map-search-item' + (i === 0 ? ' first' : ''));
                b.type = 'button';
                b.appendChild(element('b', '', (item.node ? '🖥 ' : '📍 ') + item.label));
                b.appendChild(element('small', '', item.sub));
                b.addEventListener('mousedown', function (e) { e.preventDefault(); go(item); });
                results.appendChild(b);
            });
            if (!current.length) results.appendChild(element('div', 'scp-extra-muted', thai ? 'ไม่พบ' : 'No match'));
            results.hidden = false;
        };
        input.addEventListener('input', search);
        input.addEventListener('focus', search);
        input.addEventListener('blur', function () { window.setTimeout(function () { results.hidden = true; }, 150); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && current.length) { e.preventDefault(); go(current[0]); }
            if (e.key === 'Escape') { results.hidden = true; input.blur(); }
        });
        return wrap;
    }

    // ?scpnode=<id> (from a QR sticker) opens that computer's card once the list has loaded.
    function openDeepLink() {
        var m = /[?&]scpnode=([^&#]+)/.exec(window.location.search);
        if (!m) return;
        var id = decodeURIComponent(m[1]), tries = 0;
        var attempt = function () {
            var node = nodeByShortId(id);
            if (node) { showDashboard(); showComputerDetailModal(node); return; }
            if (++tries < 60) window.setTimeout(attempt, 500);
        };
        attempt();
    }

    // Fetch the shared computer positions for the map. Skipped while someone is arranging,
    // so a slow reply can never jump a computer back from where it was just dropped.
    function loadMapPlacements() {
        if (!window.ScpOperations || mapEditMode) return;
        window.ScpOperations.request('mapPlacements').then(function (map) {
            if (mapEditMode) return;
            mapPlacements = map || {};
            if (currentIsoMap && !currentIsoMap._destroyed) currentIsoMap.setPlacements(Object.assign({}, mapPlacements));
        }).catch(function () { /* the map still works with automatic positions */ });
    }

    function renderMapPage() {
        if (!mapPanel || mapPanel.hidden) return;
        loadFleetAssessment();
        while (mapPanel.firstChild) mapPanel.removeChild(mapPanel.firstChild);

        var list = allNodes();
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

        var topBar = element('div', 'scp-map-standalone-bar');
        var breadcrumb = element('span', 'scp-eyebrow', thai ? 'โรงพยาบาลสีชมพู / ผังแผนที่ & จุดบริการ' : 'Sichomphu Hospital / Campus Map');
        topBar.appendChild(breadcrumb);

        var topActions = element('div', 'scp-map-standalone-actions');
        topBar.appendChild(buildMapSearch());
        topActions.appendChild(button(thai ? '📰 สรุปประจำวัน' : '📰 Daily summary', 'scp-dash-refresh', openMorningSummary));
        topActions.appendChild(button(thai ? '🔄 รีเฟรชสถานะ' : '🔄 Refresh', 'scp-dash-refresh', function () {
            loadFleetAssessment(true);
            renderMapPage();
        }));
        topActions.appendChild(button(thai ? '📊 ไปยังแดชบอร์ด' : '📊 Go to Dashboard', 'scp-dash-refresh', function () {
            showDashboard();
        }));
        topBar.appendChild(topActions);
        mapPanel.appendChild(topBar);

        mapPanel.appendChild(renderHospitalCampus(rooms, list, everyRoom));
        document.body.classList.remove('scp-map-full-open');
        fitHeight();
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
        navButton.addEventListener('click', function () {
            if (typeof window.go === 'function') { window.go(1); } else { show('overview'); }
        });
        navButton.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') { if (typeof window.go === 'function') { window.go(1); } else { show('overview'); } }
        });

        var mapNavButton = element('div', 'lbbutton');
        mapNavButton.id = 'LeftMenuScpHosMap';
        mapNavButton.tabIndex = 0;
        mapNavButton.title = thai ? 'ผังแผนที่ รพ.' : 'Hospital Map';
        mapNavButton.setAttribute('role', 'button');
        mapNavButton.setAttribute('aria-label', thai ? 'ผังแผนที่ รพ.' : 'Hospital Map');
        var mapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        mapSvg.setAttribute('viewBox', '0 0 24 24');
        mapSvg.setAttribute('aria-hidden', 'true');
        mapSvg.classList.add('scp-nav-icon');
        var mapPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        mapPath.setAttribute('d', 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z');
        mapSvg.appendChild(mapPath);
        mapNavButton.appendChild(mapSvg);
        mapNavButton.appendChild(element('span', 'scp-nav-label', thai ? 'ผังแผนที่ รพ.' : 'Hospital Map'));
        mapNavButton.addEventListener('click', function () {
            showMap();
        });
        mapNavButton.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') { showMap(); }
        });

        var first = document.getElementById('LeftMenuMyDevices');
        if (first) {
            bar.insertBefore(navButton, first);
            bar.insertBefore(mapNavButton, first);
        } else {
            bar.appendChild(navButton);
            bar.appendChild(mapNavButton);
        }

        panel = element('div', 'scp-dash');
        panel.id = 'scpDashboard';
        panel.hidden = true;
        var heading = element('section', 'scp-dash-heading');
        heading.appendChild(element('span', 'scp-eyebrow', t('eyebrow')));
        heading.appendChild(element('h2', '', t('title')));
        heading.appendChild(element('p', '', t('intro')));
        var actions = element('div', 'scp-dash-heading-actions');
        liveToggle = button(t('liveOn'), 'scp-dash-live', function () { setLive(!liveOn); });
        liveToggle.hidden = true;
        actions.appendChild(liveToggle);
        actions.appendChild(button(thai ? 'เกณฑ์ประเมิน' : 'Criteria', 'scp-dash-refresh', function () { if (window.ScpOperations) window.ScpOperations.openCriteria(); }));
        actions.appendChild(button(t('exportCsv'), 'scp-dash-refresh', exportInventory));
        actions.appendChild(button(t('exportUsage'), 'scp-dash-refresh', exportUsage));
        actions.appendChild(button(t('refresh'), 'scp-dash-refresh', render));
        if (window.ScpReport) { actions.appendChild(button(thai ? 'รายงานและชาร์ต (พิมพ์)' : 'Reports & Print', 'scp-dash-refresh', function () { window.ScpReport.open(); })); }
        actions.appendChild(button(thai ? '📰 สรุปประจำวัน' : '📰 Daily summary', 'scp-dash-refresh', openMorningSummary));
        actions.appendChild(button(thai ? '🏷️ QR ติดเครื่อง' : '🏷️ QR stickers', 'scp-dash-refresh', openQrSheet));
        actions.appendChild(button(thai ? '🔍 ตรวจเครื่อง (ชนิด / Windows แท้)' : '🔍 Check type / genuine Windows', 'scp-dash-refresh', probeChassis));
        if (window.ScpHealth) {
            actions.appendChild(button(thai ? '🩺 ตรวจสุขภาพทุกเครื่อง' : '🩺 Health check all', 'scp-dash-refresh', function () { window.ScpHealth.openFleet(allNodes(), overlayDialog); }));
            actions.appendChild(button(thai ? '🖨️ เครื่องพิมพ์ทั้ง รพ.' : '🖨️ All printers', 'scp-dash-refresh', function () { window.ScpHealth.openPrinters(allNodes(), overlayDialog); }));
            actions.appendChild(button(thai ? '🔤 ติดตั้งฟอนต์ไทย' : '🔤 Install Thai fonts', 'scp-dash-refresh', function () { window.ScpHealth.openFonts(allNodes(), overlayDialog); }));
        }
        actions.appendChild(button(document.documentElement.lang === 'th' ? 'แจ้งซ่อม / ตรวจระบบ' : 'Repairs / system checks', 'scp-dash-refresh', function () { window.ScpOperations.open(); }));
        var libraryButton=button(thai?'คลังไดรเวอร์':'Driver library','scp-dash-refresh',function(){window.ScpOperations.openLibrary();});libraryButton.id='scpDriverLibraryButton';libraryButton.hidden=true;actions.appendChild(libraryButton);
            actions.appendChild(button(thai ? '🧰 งานช่างค้างทั้ง รพ.' : '🧰 Work waiting', 'scp-dash-refresh', function () { window.ScpHealth.openBacklog(allNodes(), overlayDialog); }));
            actions.appendChild(button(thai ? '💽 สุขภาพดิสก์ทั้ง รพ.' : '💽 Disk health', 'scp-dash-refresh', function () { window.ScpHealth.openDisks(allNodes(), overlayDialog); }));
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
        panelAnchor = document.createComment('SCP dashboard location');
        panel.parentNode.insertBefore(panelAnchor, panel);

        mapPanel = element('div', 'scp-map-page');
        mapPanel.id = 'scpHosMapPage';
        mapPanel.hidden = true;
        devices.parentElement.insertBefore(mapPanel, devices);

        // Leaving through other menu buttons closes dashboard, but My Devices (1) opens dashboard.
        if (typeof window.go === 'function') {
            var original = window.go;
            window.go = function (page) {
                if (page === 1) {
                    if (original) original.call(this, 1);
                    show();
                    return;
                }
                if (page === 9 || page === 12 || page === 13 || page === 14 || page === 15 || page === 18 || page === 19) {
                    page = 10;
                }
                hide();
                var res = original.call(this, page);
                stripUnwantedNav();
                return res;
            };
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
        window.ScpDashboard = { show: show, showDashboard: showDashboard, showMap: showMap, hide: hide, render: render, fitHeight: fitHeight, receiveSoftware: receiveSoftware, setLive: setLive, roomShown: roomShown, toggleRoom: toggleRoom,
            exportInventory: exportInventory, nodes: allNodes, specLine: specLine, disksOf: disksOf,
            hoursPoweredOn: hoursPoweredOn, usageOf: usageOf, daysAway: daysAway,
            hoursByDay: hoursByDay, exportUsage: exportUsage, faultsOf: faultsOf,
            fixDrivers: fixDrivers, driverScript: driverScript, snapshot: snapshot,
            reloadAssessment: function () { loadFleetAssessment(true); render(); },
            openMorningSummary: openMorningSummary, openQrSheet: openQrSheet, showComputer: showComputerDetailModal };
        openDeepLink();
        setTimeout(show, 50);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
