// SCP-Remote: one press that only turns protection on.
//
// Half of what the attention panel flags is a guard that is simply switched off -- a
// firewall disabled, signatures that stopped updating, Windows Defender parked with
// nothing else in front of it. Those share a property the rest of the panel does not:
// the fix is always to enable, never to remove, restart or delete, so pressing it on a
// healthy computer changes nothing and pressing it on every computer at once is safe.
//
// What this never touches: it does not remove a program, restart a machine, delete a
// file, or install a driver. Each of those is a decision about one computer and keeps
// its own button. Nor does it switch on Windows Defender where another antivirus is
// actually guarding the machine -- two real-time engines at once is the fault, not the
// cure -- it only fills a gap where nothing is guarding at all.
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

    var jobs = {}, serial = 0, dialog, listBox, notice, names = {};

    var script = [
        "$ErrorActionPreference='Continue'; $did=@{}",
        // Firewall on, across all three profiles. Instant, so it goes first.
        "try { Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True -ErrorAction Stop; $did['firewall']='on' } catch { $did['firewall']='failed' }",
        // Defender's real-time protection, but only where nothing else is actually guarding.
        // Before signatures, so the slow step below can never gate this important one.
        "try {",
        "  $av = @(Get-CimInstance -Namespace root\\SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue)",
        "  $guard = @($av | Where-Object { (($_.productState -band 0x1000) -ne 0) -and (($_.productState -band 0x10) -eq 0) -and ($_.displayName -notmatch 'Defender') })",
        "  if ($guard.Count -eq 0) { Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction SilentlyContinue; $did['defender']='on' }",
        "  else { $did['defender']='left off, '+$guard[0].displayName+' is guarding' }",
        "} catch { $did['defender']='unchanged' }",
        // Signatures last, and time-bounded. On a machine with no route out Update-MpSignature
        // blocks on the download until it times out on its own, which held the whole reply and
        // made the panel look stuck. Run it in a child process we can give up on after 90s.
        "try { $p = Start-Process powershell -ArgumentList '-NoProfile','-Command','Update-MpSignature' -PassThru -WindowStyle Hidden -ErrorAction Stop; if ($p.WaitForExit(90000)) { $did['signatures'] = $(if ($p.ExitCode -eq 0) {'updated'} else {'failed'}) } else { try { $p.Kill() } catch {}; $did['signatures']='timed out' } } catch { $did['signatures']='failed' }",
        "Write-Output ('SCP_CARE:'+($did|ConvertTo-Json -Compress))"
    ].join('\n');

    function labelFor(key, value) {
        var name = {
            firewall: t('Firewall', 'ไฟร์วอลล์'),
            signatures: t('Virus signatures', 'ลายเซ็นไวรัส'),
            defender: t('Windows Defender', 'Windows Defender')
        }[key] || key;
        var said = {
            on: t('turned on', 'เปิดแล้ว'),
            updated: t('updated', 'อัปเดตแล้ว'),
            failed: t('could not (the computer may have no route out)', 'ไม่สำเร็จ (เครื่องอาจออกเน็ตไม่ได้)'),
            'timed out': t('timed out (no route out)', 'หมดเวลา (ออกเน็ตไม่ได้)'),
            unchanged: t('left unchanged', 'คงเดิม')
        }[value] || value;
        return name + ': ' + said;
    }

    // Only a reply to a request this panel sent is read as an answer to it.
    function receive(message) {
        if (!message || message.action !== 'msg' || message.type !== 'runcommands' || !message.nodeid) { return false; }
        var job = jobs[message.nodeid];
        if (!job || job.ticket !== message.responseid || message.progress === true) { return false; }
        var text = String(message.result == null ? '' : message.result);
        if (/COMMAND_BUSY/.test(text)) {
            job.state = 'busy';
        } else {
            var match = text.match(/SCP_CARE:(\{[\s\S]*?\})\s*$/m) || text.match(/SCP_CARE:(\{.*\})/);
            try { job.result = match ? JSON.parse(match[1]) : null; job.state = match ? 'done' : 'unknown'; }
            catch (error) { job.state = 'unknown'; }
        }
        draw();
        return true;
    }

    function run(nodes) {
        var online = nodes.filter(function (n) { return n && (n.conn & 1); });
        if (!online.length) { root.alert(t('None of these computers are connected right now.', 'ตอนนี้ไม่มีเครื่องไหนเชื่อมต่ออยู่')); return; }
        if (!root.confirm(t('Turn firewall on, update virus signatures, and switch on Windows Defender where a computer has no protection -- on ', 'เปิดไฟร์วอลล์ อัปเดตลายเซ็นไวรัส และเปิด Windows Defender เฉพาะเครื่องที่ไม่มีการป้องกัน — กับ ') + online.length + t(' computers?\n\nNothing is removed, restarted or deleted.', ' เครื่อง?\n\nไม่มีการถอด รีสตาร์ต หรือลบอะไร'))) { return; }

        var ticket = 'scpcare' + (++serial) + '_' + Date.now();
        names = {};
        online.forEach(function (n) { names[n._id] = n.name || n._id; jobs[n._id] = { ticket: ticket, state: 'working' }; });
        open();
        try {
            root.meshserver.send({ action: 'runcommands', nodeids: online.map(function (n) { return n._id; }),
                type: 2, runAsUser: 0, reply: true, responseid: ticket, cmds: script });
        } catch (error) {
            online.forEach(function (n) { jobs[n._id] = { ticket: ticket, state: 'failed' }; });
            draw(); return;
        }
        root.setTimeout(function () {
            var changed = false;
            online.forEach(function (n) { var j = jobs[n._id]; if (j && j.ticket === ticket && j.state === 'working') { j.state = 'unknown'; changed = true; } });
            if (changed) { draw(); }
        }, 300000);
    }

    function draw() {
        if (!dialog || !dialog.open) { return; }
        listBox.textContent = '';
        var ids = Object.keys(jobs), waiting = 0, done = 0;
        ids.forEach(function (id) {
            var job = jobs[id];
            var row = el('article', null, 'scp-care-row');
            row.appendChild(el('strong', names[id] || id));
            var states = {
                working: t('Working…', 'กำลังทำ…'),
                done: t('Done', 'เสร็จ'),
                busy: t('Busy with another command; skipped', 'ติดคำสั่งอื่นอยู่ ข้ามไป'),
                failed: t('Could not send', 'ส่งคำสั่งไม่ได้'),
                unknown: t('No reply yet', 'ยังไม่มีคำตอบ')
            };
            if (job.state === 'working') { waiting++; }
            if (job.state === 'done') { done++; }
            row.appendChild(el('span', states[job.state] || job.state, 'scp-care-state'));
            if (job.result) {
                Object.keys(job.result).forEach(function (key) { row.appendChild(el('small', '· ' + labelFor(key, job.result[key]))); });
            }
            listBox.appendChild(row);
        });
        notice.textContent = waiting
            ? format(t('Working on {0}, done {1} of {2}', 'กำลังทำ {0} — เสร็จแล้ว {1} จาก {2}'), waiting, done, ids.length)
            : format(t('Finished. {0} of {1} computers done.', 'เสร็จแล้ว {0} จาก {1} เครื่อง'), done, ids.length);
    }

    function format(s, a, b, c) { return s.replace('{0}', a).replace('{1}', b).replace('{2}', c); }

    function open() {
        if (!dialog) {
            dialog = el('dialog'); dialog.id = 'scpCare';
            var head = el('header');
            head.appendChild(el('h2', t('Safe maintenance', 'ดูแลอัตโนมัติ (ปลอดภัย)')));
            head.appendChild(button(t('Close', 'ปิด'), '', function () { dialog.close(); }));
            dialog.appendChild(head);
            dialog.appendChild(el('p', t('Turns protection on where it is off. Nothing is removed, restarted or deleted.', 'เปิดการป้องกันที่ถูกปิดไว้ ไม่มีการถอด รีสตาร์ต หรือลบอะไร')));
            notice = el('p'); notice.setAttribute('role', 'status'); dialog.appendChild(notice);
            listBox = el('div', null, 'scp-care-list'); dialog.appendChild(listBox);
            document.body.appendChild(dialog);
        }
        if (!dialog.open) { dialog.showModal(); }
        draw();
    }

    root.ScpCare = { run: run, receive: receive, _script: script };
}(typeof window === 'undefined' ? globalThis : window));
