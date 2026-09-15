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
        shutdown: ['Shut down', 'ปิดเครื่อง'],
        scan: ['Check programs', 'ตรวจโปรแกรม'],
        refresh: ['Refresh', 'รีเฟรช'],
        none: ['Nothing to flag', 'ไม่พบสิ่งผิดปกติ'],
        empty: ['No computers yet. Install the agent on a computer to see it here.', 'ยังไม่มีเครื่องในระบบ ติดตั้งเอเจนต์บนเครื่องลูกแล้วจะขึ้นที่นี่'],
        noUser: ['No one signed in', 'ไม่มีผู้ใช้ล็อกอิน'],
        confirmOff: ['Shut down this computer now?', 'สั่งปิดเครื่องนี้เดี๋ยวนี้หรือไม่?'],
        offlineAction: ['This computer is not connected.', 'เครื่องนี้ไม่ได้เชื่อมต่ออยู่'],
        scanning: ['Checking installed programs…', 'กำลังตรวจโปรแกรมที่ติดตั้ง…'],
        scanDone: ['Programs checked', 'ตรวจโปรแกรมแล้ว'],
        scanFail: ['Could not read the program list', 'อ่านรายการโปรแกรมไม่ได้'],
        scanClean: ['No watched programs found', 'ไม่พบโปรแกรมที่เฝ้าระวัง'],
        programs: ['programs', 'โปรแกรม'],
        avOff: ['Antivirus turned off', 'แอนติไวรัสถูกปิด'],
        avOld: ['Virus signatures out of date', 'ฐานข้อมูลไวรัสเก่า'],
        firewallOff: ['Firewall not protecting', 'ไฟร์วอลล์ไม่ทำงาน'],
        updateOff: ['Windows Update not protecting', 'Windows Update ไม่ทำงาน'],
        rebootDue: ['Waiting for a restart', 'รอการรีสตาร์ต'],
        uptimeLong: ['Not restarted for {0} days', 'ไม่ได้รีสตาร์ตมา {0} วัน'],
        watched: ['Watched program: {0}', 'โปรแกรมเฝ้าระวัง: {0}'],
        days: ['days', 'วัน'],
        roomEmpty: ['No computers in this room yet. Install the agent, or move a computer here.', 'ห้องนี้ยังไม่มีเครื่อง ติดตั้งเอเจนต์เพิ่ม หรือย้ายเครื่องเข้ามาได้'],
        scanBusy: ['A program check is already running. Wait for it to finish.', 'กำลังตรวจโปรแกรมของอีกเครื่องอยู่ กรุณารอให้เสร็จก่อน'],
        liveCol: ['Screen', 'หน้าจอ'],
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
    function format(value, arg) { return value.replace('{0}', arg); }

    /* Programs the hospital wants to know about when they appear on a computer.
       Match is a lowercase substring of the program name. Edit this list to suit. */
    var watchlist = [
        'teamviewer', 'anydesk', 'ultraviewer', 'ammyy', 'radmin', 'supremo',
        'vnc', 'logmein', 'splashtop', 'hamachi', 'ngrok', 'zerotier',
        'utorrent', 'bittorrent', 'qbittorrent', 'thunder', 'tor browser'
    ];
    /* A computer with no keyboard or mouse activity for this long counts as idle
       rather than in use. */
    var idleSeconds = 300;
    var staleSignatureDays = 7;
    var longUptimeDays = 14;

    var panel, body, scanState = {}, pending = null, timer = null;
    var liveToggle = null, liveHint = null, liveNote = null;

    /* Live screen tiles. Small, slow and look-only: no mouse or keyboard handler is
       ever attached to these canvases, so a tile cannot touch the computer it shows.
       Watching starts only when someone presses the button, and never resumes by
       itself on a later visit. */
    var tiles = {}, liveOn = false, liveSkipped = 0;
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
        (node.av || []).forEach(function (product) {
            if (product && product.enabled === false) { found.push({ level: 'high', text: t('avOff') + ': ' + (product.product || '') }); }
        });
        var age = signatureAge(node);
        if (age != null && age > staleSignatureDays) { found.push({ level: 'warn', text: t('avOld') + ' (' + age + ' ' + t('days') + ')' }); }
        if (node.wsc) {
            if (node.wsc.firewall && node.wsc.firewall !== 'OK') found.push({ level: 'high', text: t('firewallOff') });
            if (node.wsc.autoUpdate && node.wsc.autoUpdate !== 'OK') found.push({ level: 'warn', text: t('updateOff') });
        }
        var uptime = daysSince(node.lastbootuptime);
        if (uptime != null && uptime > longUptimeDays) { found.push({ level: 'warn', text: format(t('uptimeLong'), uptime) }); }
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
        scanState[nodeid] = { state: 'done', count: list.length, hits: hits };
        render();
        return true;
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
        } else if (!state || state.state !== 'scanning') {
            risk.appendChild(element('span', 'scp-dash-note ok', t('none')));
        }
        if (state && state.state === 'done') {
            risk.appendChild(element('span', 'scp-dash-note', t('scanDone') + ': ' + state.count + ' ' + t('programs') + (state.hits.length ? '' : ' · ' + t('scanClean'))));
        }
        row.appendChild(risk);

        row.appendChild(actionCell(node));
        return row;
    }

    function render() {
        if (!body || panel.hidden) return;
        // This redraws every ten seconds. Without keeping the scroll position, anyone
        // reading a room further down the page is thrown back to the top each time.
        var scrollTop = panel.scrollTop;
        body.textContent = '';
        liveSkipped = 0;
        var list = allNodes();

        // Close the tiles that should no longer be running — the feature switched off,
        // or a computer powered down or removed — before the rows below hand out the
        // remaining slots. Each tile is a live desktop session against someone's screen,
        // so none may outlive the row that shows it.
        var watchable = {};
        if (liveOn) { list.forEach(function (node) { if (isOnline(node)) { watchable[node._id] = true; } }); }
        Object.keys(tiles).forEach(function (nodeid) { if (!watchable[nodeid]) { stopTile(nodeid); } });

        if (!list.length) { body.appendChild(element('div', 'scp-dash-empty', t('empty'))); return; }

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

        // Filled in at the end of this pass, once the rows are built and it is known
        // whether the screen cap was reached.
        liveNote = element('div', 'scp-dash-live-note');
        liveNote.hidden = true;
        body.appendChild(liveNote);

        // Group by device group, which is how rooms and departments are organised here.
        // Start from the groups themselves so a room that has no computer yet is still
        // listed, rather than looking as though it does not exist.
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
        Object.keys(rooms).sort().forEach(function (room) {
            var group = rooms[room];
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
            body.appendChild(section);
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
        render();
        fitHeight();
        if (!timer) timer = window.setInterval(render, 10000);
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
        actions.appendChild(button(t('refresh'), 'scp-dash-refresh', render));
        heading.appendChild(actions);
        liveHint = element('p', 'scp-dash-live-hint');
        heading.appendChild(liveHint);
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
        window.addEventListener('resize', fitHeight);
        window.ScpDashboard = { show: show, hide: hide, render: render, fitHeight: fitHeight, receiveSoftware: receiveSoftware, setLive: setLive };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
