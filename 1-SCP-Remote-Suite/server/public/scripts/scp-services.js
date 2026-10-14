// SCP-Remote: start, stop and restart Windows services on a computer from the dashboard.
//
// The everyday case is a service that has wedged -- a stuck print spooler, a reporting service
// that stopped and no one noticed -- where the fix is simply to start or restart it without
// walking to the machine or opening a remote screen. It lists what is installed, its state and
// start type, and offers the three actions, each run as SYSTEM through the agent.
//
// One thing it will not do, whatever it is asked: touch the remote-support agent's own service.
// Stopping it would cut the only way back into that computer, and restarting it from a command
// the agent itself is running cannot be relied on to come back. That service is refused here.
(function (root) {
    'use strict';
    var th = document.documentElement.lang === 'th';
    function t(en, thai) { return th ? thai : en; }
    function el(tag, text, className) {
        var n = document.createElement(tag);
        if (text != null) { n.textContent = text; }
        if (className) { n.className = className; }
        return n;
    }
    function button(text, className, fn) { var b = el('button', text, className); b.type = 'button'; b.onclick = fn; return b; }

    // The agent's own service. Named in the code, not read from the list, so a computer cannot
    // rename its way past the guard.
    var AGENT = /^mesh ?agent$/i;
    var serial = 0, dialog, listBox, notice, current = null, services = null, listTicket = null, actions = {}, loading = false;

    function encode(value) {
        var utf8 = encodeURIComponent(String(value == null ? '' : value))
            .replace(/%([0-9A-F]{2})/g, function (whole, hex) { return String.fromCharCode(parseInt(hex, 16)); });
        return btoa(utf8);
    }

    // Ask the computer for its services. Returns name, display name, current state and start type.
    var listScript = [
        "$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'",
        "$s = Get-Service | ForEach-Object { [pscustomobject]@{ n=$_.Name; d=$_.DisplayName; s=\"$($_.Status)\"; t=\"$($_.StartType)\" } }",
        "Write-Output ('SCP_SERVICES:'+(@($s)|ConvertTo-Json -Compress))"
    ].join('\n');

    // Do one action to one service, then read its state back so the answer is what happened, not
    // what was asked. The agent guard is repeated here so the command refuses even if the browser
    // is bypassed.
    var actionScript = [
        "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'",
        "$svc=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__SVC__')); $act='__ACT__'",
        "$out=@{svc=$svc; ok=$true; error=''}",
        "try {",
        "  if ($svc -match '(?i)^mesh ?agent$') { throw 'REFUSED_AGENT' }",
        "  if ($act -eq 'start') { Start-Service -Name $svc }",
        "  elseif ($act -eq 'stop') { Stop-Service -Name $svc -Force }",
        "  elseif ($act -eq 'restart') { Restart-Service -Name $svc -Force }",
        "  Start-Sleep -Milliseconds 500",
        "  $out.status = \"$((Get-Service -Name $svc).Status)\"",
        "} catch { $out.ok=$false; $out.error=\"$($_.Exception.Message)\"; try { $out.status=\"$((Get-Service -Name $svc -ErrorAction SilentlyContinue).Status)\" } catch {} }",
        "Write-Output ('SCP_SERVICE_ACT:'+($out|ConvertTo-Json -Compress))"
    ].join('\n');

    function errorText(code) {
        return {
            REFUSED_AGENT: t('Refused: this is the remote-support agent. Stopping it would cut the way back into this computer.',
                'ไม่ดำเนินการ: นี่คือเซอร์วิสของเอเจนต์รีโมต หยุดแล้วจะขาดการติดต่อกับเครื่องนี้')
        }[code] || code;
    }

    function requestList(node) {
        current = node; services = null; loading = true; actions = {};
        listTicket = 'scpsvclist' + (++serial) + '_' + Date.now();
        try {
            root.meshserver.send({ action: 'runcommands', nodeids: [node._id], type: 2, runAsUser: 0, reply: true, responseid: listTicket, cmds: listScript });
        } catch (error) { loading = false; services = []; draw(); return; }
        root.setTimeout(function () {
            if (loading && listTicket) { loading = false; if (services === null) { services = []; } draw(); }
        }, 60000);
        draw();
    }

    function act(name, action) {
        var ticket = 'scpsvcact' + (++serial) + '_' + Date.now();
        actions[name] = { ticket: ticket, action: action, state: 'working' };
        draw();
        try {
            root.meshserver.send({ action: 'runcommands', nodeids: [current._id], type: 2, runAsUser: 0, reply: true, responseid: ticket,
                cmds: actionScript.replace('__SVC__', encode(name)).replace('__ACT__', action) });
        } catch (error) { actions[name] = { ticket: ticket, action: action, state: 'failed', text: String(error) }; draw(); return; }
        root.setTimeout(function () {
            var a = actions[name];
            if (a && a.ticket === ticket && a.state === 'working') { a.state = 'unknown'; a.text = t('No reply yet.', 'ยังไม่มีคำตอบ'); draw(); }
        }, 120000);
    }

    function receive(message) {
        if (!message || message.action !== 'msg' || message.type !== 'runcommands' || !message.nodeid) { return false; }
        if (message.nodeid !== (current && current._id)) { return false; }
        var text = String(message.result == null ? '' : message.result);
        if (message.responseid === listTicket) {
            if (message.progress === true) { return true; }
            loading = false;
            var m = text.match(/SCP_SERVICES:(\[[\s\S]*?\])\s*$/m) || text.match(/SCP_SERVICES:(\[[\s\S]*\])/);
            if (/COMMAND_BUSY/.test(text)) { services = []; notice && (notice.textContent = t('The computer is busy with another command. Try again.', 'เครื่องกำลังทำคำสั่งอื่นอยู่ ลองใหม่อีกครั้ง')); draw(); return true; }
            try { services = m ? JSON.parse(m[1]) : []; } catch (error) { services = []; }
            if (!Array.isArray(services)) { services = services ? [services] : []; }
            draw(); return true;
        }
        var owner = null;
        for (var name in actions) { if (actions[name].ticket === message.responseid) { owner = name; break; } }
        if (owner) {
            if (message.progress === true) { return true; }
            var a = actions[owner];
            var mm = text.match(/SCP_SERVICE_ACT:(\{[\s\S]*?\})\s*$/m) || text.match(/SCP_SERVICE_ACT:(\{.*\})/);
            if (/COMMAND_BUSY/.test(text)) { a.state = 'failed'; a.text = t('Busy with another command.', 'ติดคำสั่งอื่นอยู่'); draw(); return true; }
            try {
                var r = mm ? JSON.parse(mm[1]) : null;
                if (r) {
                    a.state = r.ok ? 'done' : 'failed';
                    a.text = r.ok ? '' : errorText(r.error);
                    if (r.status && services) { services.forEach(function (s) { if (s.n === owner) { s.s = r.status; } }); }
                } else { a.state = 'unknown'; a.text = t('A reply came back that does not say what happened.', 'ได้รับคำตอบ แต่บอกไม่ได้ว่าเกิดอะไรขึ้น'); }
            } catch (error) { a.state = 'unknown'; a.text = t('The reply could not be read.', 'อ่านคำตอบไม่ได้'); }
            draw(); return true;
        }
        return false;
    }

    function badge(state) {
        var s = String(state || '').toLowerCase();
        var label = { running: t('Running', 'ทำงานอยู่'), stopped: t('Stopped', 'หยุด'), paused: t('Paused', 'พัก') }[s] || state;
        var b = el('span', label, 'scp-svc-badge scp-svc-' + (s === 'running' ? 'on' : s === 'stopped' ? 'off' : 'other'));
        return b;
    }

    function draw() {
        if (!dialog || !dialog.open) { return; }
        listBox.textContent = '';
        if (loading) { listBox.appendChild(el('p', t('Loading services…', 'กำลังโหลดรายการเซอร์วิส…'))); return; }
        if (services === null) { return; }
        var filter = (dialog.querySelector('#scpServiceFilter') || {}).value || '';
        var needle = filter.trim().toLowerCase();
        var shown = services.filter(function (s) { return s && s.n && (!needle || ((s.n + ' ' + (s.d || '')).toLowerCase().indexOf(needle) >= 0)); })
            .sort(function (a, b) { return String(a.d || a.n).localeCompare(String(b.d || b.n), th ? 'th' : 'en'); });
        if (!shown.length) { listBox.appendChild(el('p', t('Nothing matches.', 'ไม่พบรายการที่ตรงกับคำค้น'))); return; }
        shown.slice(0, 500).forEach(function (s) {
            var row = el('article', null, 'scp-svc-row');
            var label = el('div');
            var head = el('strong'); head.appendChild(document.createTextNode((s.d || s.n) + ' ')); head.appendChild(badge(s.s));
            label.appendChild(head);
            label.appendChild(el('small', s.n + (s.t ? ' · ' + t('start', 'เริ่ม') + ': ' + s.t : '')));
            var a = actions[s.n];
            if (a && a.text) { label.appendChild(el('small', a.text)); }
            row.appendChild(label);
            var isAgent = AGENT.test(s.n) || /^mesh ?agent$/i.test(s.d || '');
            var busy = !!(a && a.state === 'working');
            var acts = el('div', null, 'scp-svc-actions');
            if (isAgent) {
                acts.appendChild(el('small', t('remote agent — protected', 'เอเจนต์รีโมต — ป้องกันไว้')));
            } else {
                var running = String(s.s).toLowerCase() === 'running';
                var start = button(t('Start', 'เริ่ม'), 'scp-svc-start', function () { act(s.n, 'start'); });
                var stop = button(t('Stop', 'หยุด'), 'scp-svc-stop', function () { if (root.confirm(t('Stop this service on ', 'หยุดเซอร์วิสนี้บนเครื่อง ') + (current.name || '') + '?\n\n' + (s.d || s.n))) { act(s.n, 'stop'); } });
                var restart = button(t('Restart', 'รีสตาร์ต'), 'scp-svc-restart', function () { act(s.n, 'restart'); });
                start.disabled = busy || running;
                stop.disabled = busy || !running;
                restart.disabled = busy;
                if (busy) { acts.appendChild(el('small', t('working…', 'กำลังทำ…'))); }
                acts.appendChild(start); acts.appendChild(stop); acts.appendChild(restart);
            }
            row.appendChild(acts);
            listBox.appendChild(row);
        });
        notice.textContent = '';
        notice.appendChild(el('small', t('Showing ', 'แสดง ') + Math.min(shown.length, 500) + t(' of ', ' จาก ') + services.length + t(' services', ' เซอร์วิส')));
    }

    function open(node) {
        if (!dialog) {
            dialog = el('dialog'); dialog.id = 'scpServices';
            var head = el('header');
            head.appendChild(el('h2', t('Windows services', 'เซอร์วิส Windows')));
            head.appendChild(button(t('Refresh', 'รีเฟรช'), '', function () { if (current) { requestList(current); } }));
            head.appendChild(button(t('Close', 'ปิด'), '', function () { dialog.close(); }));
            dialog.appendChild(head);
            dialog.appendChild(el('p', t('Start, stop or restart a Windows service on this computer. The remote-support agent’s own service is protected and cannot be stopped from here.',
                'เริ่ม หยุด หรือรีสตาร์ตเซอร์วิส Windows บนเครื่องนี้ เซอร์วิสของเอเจนต์รีโมตถูกป้องกันไว้ หยุดจากที่นี่ไม่ได้')));
            var filter = el('input'); filter.id = 'scpServiceFilter'; filter.type = 'search';
            filter.placeholder = t('Filter by name', 'ค้นหาจากชื่อ'); filter.oninput = draw;
            dialog.appendChild(filter);
            notice = el('div'); notice.setAttribute('role', 'status'); dialog.appendChild(notice);
            listBox = el('div', null, 'scp-svc-list'); dialog.appendChild(listBox);
            document.body.appendChild(dialog);
        }
        dialog.querySelector('#scpServiceFilter').value = '';
        if (!dialog.open) { dialog.showModal(); }
        requestList(node);
    }

    root.ScpServices = { open: open, receive: receive, _listScript: listScript, _actionScript: actionScript };
}(typeof window === 'undefined' ? globalThis : window));
