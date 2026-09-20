/* SCP-Remote: observed connection stages and reported agent releases. */
(function (root) {
    'use strict';
    function releaseState(agent, expected, online) {
        if (!agent || !agent.scpRelease || !expected) return 'unknown';
        if (!online) return 'offline';
        return agent.scpRelease === expected ? 'current' : 'different';
    }
    function stage(state, messageId) {
        if (messageId === 2) return 'failed';
        if (messageId === 1) return 'consent';
        if (state === 3) return 'connected';
        if (state === 2) return 'agent';
        if (state === 1) return 'server';
        return 'ended';
    }
    if (typeof module !== 'undefined' && module.exports) { module.exports = { releaseState: releaseState, stage: stage }; return; }
    var th = document.documentElement.lang === 'th', active = null, timer = null, failure = '', target = null;
    function t(en, thai) { return th ? thai : en; }
    var labels = {
        server: t('Contacting the server…', 'กำลังติดต่อเซิร์ฟเวอร์…'),
        agent: t('Server connected; waiting for the remote computer…', 'ถึงเซิร์ฟเวอร์แล้ว กำลังรอเครื่องลูก…'),
        consent: t('Waiting for the person at the remote computer to allow access…', 'กำลังรอผู้ใช้เครื่องลูกกดอนุญาต…'),
        connected: t('Remote channel connected; waiting for the first image…', 'เชื่อมต่อแล้ว กำลังรอภาพแรก…'),
        ready: t('Remote image received · ready', 'ได้รับภาพจากเครื่องลูกแล้ว · พร้อมใช้งาน'),
        ended: t('Disconnected. Use Connect to try again.', 'ตัดการเชื่อมต่อแล้ว กดเชื่อมต่อเพื่อลองใหม่'),
        failed: t('Remote access could not proceed', 'ไม่สามารถดำเนินการรีโมตต่อได้'),
        slow: t('No progress for 90 seconds. Check the remote computer or retry.', 'ยังไม่มีความคืบหน้าภายใน 90 วินาที ตรวจเครื่องลูกหรือกดลองใหม่')
    };
    function panel() {
        var status = document.getElementById('deskstatus'); if (!status) return null;
        var box = document.getElementById('scpConnection');
        if (!box) {
            box = document.createElement('div'); box.id = 'scpConnection';
            box.style.cssText = 'padding:10px 14px;background:#edf7f6;color:#164e48;border:1px solid #c8e5e1;border-radius:8px;margin:6px 0;font-size:14px;white-space:normal';
            var text = document.createElement('span'); text.id = 'scpConnectionText'; text.setAttribute('role','status'); box.appendChild(text);
            var retry = document.createElement('button'); retry.id = 'scpConnectionRetry'; retry.type = 'button';
            retry.textContent = t('Retry connection','ลองเชื่อมต่อใหม่'); retry.style.cssText = 'margin-inline-start:12px;padding:5px 10px;cursor:pointer'; retry.hidden = true;
            retry.onclick = function (event) {
                if (!root.currentNode || root.currentNode._id !== target) return;
                if (root.desktop && root.desktop.contype !== 1) return;
                if (root.desktop) root.connectDesktop(event, 0);
                root.connectDesktop(event, 3);
            };
            box.appendChild(retry); status.parentNode.insertAdjacentElement('afterend',box);
        }
        return box;
    }
    function show(key, detail) {
        if (!panel()) return;
        document.getElementById('scpConnectionText').textContent = labels[key] + (detail ? ' · ' + detail : '');
        document.getElementById('scpConnectionRetry').hidden = !(['slow','failed','ended'].indexOf(key) >= 0 && (!active || active.contype === 1));
    }
    function arm(sender) {
        clearTimeout(timer);
        timer = setTimeout(function () { if (sender === active && root.currentNode && root.currentNode._id === target) show('slow'); }, 90000);
    }
    function state(sender, value) {
        if (value === 0 && sender !== active) return;
        if (sender !== active) { active = sender; failure = ''; target = root.currentNode && root.currentNode._id;
            if (sender.m) sender.m.onScpFrameDrawn = function () { if (active !== sender || !root.currentNode || root.currentNode._id !== target) return; sender.scpFrameReceived = true; clearTimeout(timer); show('ready'); };
        }
        clearTimeout(timer);
        show(failure ? 'failed' : (sender.scpFrameReceived && value === 3 ? 'ready' : stage(value, sender.consoleMessageId)), failure);
        if (value === 1 || value === 2 || (value === 3 && sender.contype === 1 && !sender.scpFrameReceived)) arm(sender);
    }
    function message(sender) {
        if (sender !== active) return;
        var id = sender.consoleMessageId;
        if (id === 2) {
            failure = t('The remote computer refused access or could not open the session.', 'เครื่องลูกปฏิเสธการเข้าถึง หรือเปิดการเชื่อมต่อไม่ได้');
            if (sender.consoleMessage) failure += ' (' + String(sender.consoleMessage).slice(0,300) + ')';
            clearTimeout(timer); show('failed',failure);
        } else if (id === 1) { show('consent'); arm(sender); }
        else if (id === 0) { show(sender.scpFrameReceived ? 'ready' : stage(sender.State)); clearTimeout(timer); if (!sender.scpFrameReceived) arm(sender); }
    }
    // quiet: say nothing when the answer is the one the reader already assumes. The
    // devices tab passes nothing, because there the version is the whole point.
    function releaseBadge(node, quiet) {
        var agent = node.agent || {}, expected = root.serverinfo && root.serverinfo.scpRelease;
        var online = (node.conn & 1) !== 0, kind = releaseState(agent,expected,online);
        if (quiet && (kind === 'current' || kind === 'offline')) { return null; }
        var names = {
            current: t('Latest reported release','รายงานเวอร์ชันล่าสุดแล้ว'),
            different: t('Release differs from server','เวอร์ชันไม่ตรงกับเซิร์ฟเวอร์'),
            offline: t('Offline · last reported release','ออฟไลน์ · เวอร์ชันที่รายงานล่าสุด'),
            unknown: t('Release not yet reported','ยังไม่มีรายงานเวอร์ชัน')
        };
        var badge = document.createElement('small'); badge.className = 'scp-dash-specs';
        badge.textContent = 'SCP-Remote: ' + names[kind] + (agent.scpRelease ? ' · ' + agent.scpRelease : '');
        badge.style.color = kind === 'current' ? '#16745c' : '#8a5a18';
        badge.title = t('Server release: ','เวอร์ชันเซิร์ฟเวอร์: ') + (expected || '—') +
            (agent.scpReportedAt ? '\n' + t('Last report: ','รายงานล่าสุด: ') + new Date(agent.scpReportedAt).toLocaleString(th ? 'th-TH' : 'en-GB') : '') +
            '\n' + t('Offline devices report after reconnecting. This is the SCP-Remote module release, not the Windows installer version.', 'เครื่องออฟไลน์จะรายงานเมื่อกลับมาเชื่อมต่อ เป็นเวอร์ชันโมดูล SCP-Remote ไม่ใช่เวอร์ชันตัวติดตั้ง Windows');
        return badge;
    }
    root.ScpConnection = { state: state, message: message, releaseBadge: releaseBadge };
}(typeof window === 'undefined' ? globalThis : window));
