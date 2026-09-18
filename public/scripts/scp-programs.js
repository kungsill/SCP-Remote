// SCP-Remote: removing a program that will not leave.
//
// The ordinary uninstaller is the right tool and this is not it. This is for the case the
// hospital keeps meeting: the entry is in the list, Add/Remove Programs does nothing, and
// whatever was deleted is back by the morning. Something is putting it back -- a scheduled
// task, a service, a Run key -- so those go first, before anything is deleted, or the
// deletion is just another round of the same argument.
//
// It refuses three things whatever it is asked, because being asked is not evidence that
// asking was right: the remote agent itself (removing it ends every way back into that
// computer), the antivirus Windows currently has protecting the machine, and anything
// installed into a Windows system folder.
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

    var jobs = {}, serial = 0, dialog, listBox, notice, current = null, programs = [], ticker = null;
    function elapsed(since) {
        var total = Math.max(0, Math.round((Date.now() - since) / 1000));
        return Math.floor(total / 60) + ':' + ('0' + (total % 60)).slice(-2);
    }
    // There is no percentage to be had here: the agent streams nothing back for this kind of
    // job, and the uninstaller in the middle of it reports nothing at all. A clock at least
    // says the difference between working and hung, which a frozen 0% never did.
    function tick() {
        if (ticker) { return; }
        ticker = root.setInterval(function () {
            var working = Object.keys(jobs).some(function (id) { return jobs[id].state === 'working'; });
            if (!working || !dialog || !dialog.open) { root.clearInterval(ticker); ticker = null; return; }
            draw();
        }, 1000);
    }

    // Eight steps, each announced as it begins so the dialog can count them, and a real
    // check at the end rather than an assumption. What "removed" means here is that the
    // entry, the folder and the services are all gone -- an uninstaller returning zero has
    // been known to mean nothing at all.
    var STEPS = 8;
    var script = [
        "$ErrorActionPreference='Continue'; $ProgressPreference='SilentlyContinue'",
        "$name=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__NAME__'))",
        "$loc=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__LOC__'))",
        "$un=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__UN__'))",
        "$did=@(); $ok=$true; $err=''; $svc=@(); $restart=$false",
        "function Step($n,$what){ Write-Output ('SCP_PROGRAM_STEP:'+(@{n=$n;of=" + 8 + ";what=$what}|ConvertTo-Json -Compress)) }",
        "function Listed($n){ foreach ($base in @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall')) {",
        "  foreach ($sub in @(Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue)) {",
        "    if ((Get-ItemProperty -LiteralPath $sub.PSPath -ErrorAction SilentlyContinue).DisplayName -eq $n) { return $sub.PSPath } } }; return $null }",
        "try {",
        "  Step 1 'checks'",
        "  if ($name -match '(?i)mesh ?agent|meshcentral|scp[- ]?remote') { throw 'REFUSED_REMOTE_AGENT' }",
        "  $win=$env:windir.TrimEnd('\\'); $trimmed=$loc.TrimEnd('\\')",
        "  if ($trimmed -and (($trimmed -ieq $win) -or ($trimmed -ieq $env:SystemDrive) -or ($trimmed -ieq ($env:SystemDrive+'\\')) -or ($trimmed -ieq \"$win\\System32\"))) { throw 'REFUSED_SYSTEM_LOCATION' }",
        "  foreach ($p in @(Get-CimInstance -Namespace root\\SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue)) {",
        "    $on = ($p.productState -band 0x1000) -ne 0; $stale = ($p.productState -band 0x10) -ne 0",
        "    if ($p.displayName -and $on -and (-not $stale) -and ($name -like ('*'+$p.displayName+'*'))) { throw 'REFUSED_ACTIVE_ANTIVIRUS' }",
        "  }",
        "  $under = { param($p) $trimmed -and $p -and ($p -ilike ($trimmed+'*')) }",
        "  Step 2 'tasks'",
        "  foreach ($task in @(Get-ScheduledTask -ErrorAction SilentlyContinue)) {",
        "    $hit=$false; foreach ($a in @($task.Actions)) { if (& $under $a.Execute) { $hit=$true } }",
        "    if ($hit) { Unregister-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -Confirm:$false -ErrorAction SilentlyContinue; $did+=('task: '+$task.TaskName) }",
        "  }",
        "  Step 3 'services'",
        "  foreach ($s in @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue)) {",
        "    if (& $under ($s.PathName -replace '^\"?([^\"]*).*$','$1')) {",
        "      $svc += $s.Name",
        "      Stop-Service -Name $s.Name -Force -ErrorAction SilentlyContinue",
        "      & \"$env:windir\\System32\\sc.exe\" delete $s.Name | Out-Null",
        "      $did+=('service: '+$s.Name)",
        "    }",
        "  }",
        "  Step 4 'startup'",
        "  foreach ($key in @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce','HKLM:\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run')) {",
        "    $item = Get-Item -LiteralPath $key -ErrorAction SilentlyContinue",
        "    if ($item) { foreach ($value in $item.GetValueNames()) { if (& $under $item.GetValue($value)) { Remove-ItemProperty -LiteralPath $key -Name $value -ErrorAction SilentlyContinue; $did+=('startup: '+$value) } } }",
        "  }",
        "  Step 5 'processes'",
        "  foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue)) {",
        "    $path=$null; try { $path=$proc.Path } catch {}",
        "    if (& $under $path) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; $did+=('process: '+$proc.ProcessName) }",
        "  }",
        "  Step 6 'uninstaller'",
        "  if ($un) {",
        "    $quiet = $un; if ($quiet -notmatch '(?i)/quiet|/silent|/S\\b|/qn') { if ($quiet -match '(?i)msiexec') { $quiet = ($quiet -replace '(?i)/I','/X') + ' /qn /norestart' } else { $quiet = $quiet + ' /S' } }",
        "    try { $p = Start-Process -FilePath $env:ComSpec -ArgumentList ('/c ' + $quiet) -PassThru -WindowStyle Hidden -ErrorAction Stop",
        "      if (-not $p.WaitForExit(300000)) { $p.Kill(); $did+='uninstaller: timed out' } else { $did+=('uninstaller: exit ' + $p.ExitCode) } } catch { $did+='uninstaller: could not run' }",
        "  } else { $did+='uninstaller: none registered' }",
        "  Step 7 'leftovers'",
        "  if ($trimmed -and (Test-Path -LiteralPath $trimmed)) { Remove-Item -LiteralPath $trimmed -Recurse -Force -ErrorAction SilentlyContinue }",
        "  $entry = Listed $name",
        "  if ($entry) { Remove-Item -LiteralPath $entry -Recurse -Force -ErrorAction SilentlyContinue }",
        "  Step 8 'verify'",
        // What is still there decides whether this worked, and what to try next.
        "  $stillListed = [bool](Listed $name)",
        "  $stillFolder = [bool]($trimmed -and (Test-Path -LiteralPath $trimmed))",
        "  $stillSvc = @($svc | Where-Object { Get-Service -Name $_ -ErrorAction SilentlyContinue })",
        "  $did += ('listed: ' + $(if ($stillListed) { 'still there' } else { 'gone' }))",
        "  if ($trimmed) { $did += ('folder: ' + $(if ($stillFolder) { 'still there' } else { 'gone' })) }",
        "  if ($svc.Count) { $did += ('services: ' + $(if ($stillSvc.Count) { ($stillSvc -join ',') + ' still there' } else { 'gone' })) }",
        // Self-protection is what survives all of the above. A driver cannot defend itself
        // while it is not running, so take away its right to start and say a restart is owed.
        "  if ($stillListed -or $stillFolder -or $stillSvc.Count) {",
        "    foreach ($s in $stillSvc) {",
        "      $key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\' + $s",
        "      if (Test-Path -LiteralPath $key) { Set-ItemProperty -LiteralPath $key -Name Start -Value 4 -ErrorAction SilentlyContinue; $restart=$true; $did+=('disabled at boot: '+$s) }",
        "    }",
        "    $ok = $false; $err = 'STILL_PRESENT'",
        "  }",
        "} catch { $ok=$false; $err=$_.Exception.Message }",
        "Write-Output ('SCP_PROGRAM_REMOVE:'+(@{ok=$ok;error=$err;steps=$did;restart=$restart}|ConvertTo-Json -Compress))"
    ].join('\n');

    // Program names carry Thai, so the bytes have to be UTF-8 before they are base64. Doing
    // it this way rather than with TextEncoder keeps it working wherever btoa exists.
    function encode(value) {
        var utf8 = encodeURIComponent(String(value == null ? '' : value))
            .replace(/%([0-9A-F]{2})/g, function (whole, hex) { return String.fromCharCode(parseInt(hex, 16)); });
        return btoa(utf8);
    }

    // An antivirus carries a kernel driver whose whole job is to stop software doing what
    // this tool does. Stopping its services and deleting its files can half-succeed, and a
    // half-removed antivirus is worse than either state. Worth trying, not worth pretending
    // about: the maker's own removal tool in Safe Mode is the reliable way.
    var AV = /eset|kaspersky|mcafee|norton|symantec|avast|avg|bitdefender|trend ?micro|sophos|forticlient|f-secure|panda|360 ?total|avira|webroot/i;
    function refusalText(code) {
        return {
            REFUSED_REMOTE_AGENT: t('Refused: this is the remote-support agent. Removing it would end every way back into that computer.',
                'ไม่ดำเนินการ: นี่คือเอเจนต์ที่ใช้รีโมต ถอดออกแล้วจะเข้าเครื่องนั้นจากที่นี่ไม่ได้อีกเลย'),
            REFUSED_ACTIVE_ANTIVIRUS: t('Refused: this antivirus is switched on and up to date, so it is the one protecting the computer.',
                'ไม่ดำเนินการ: แอนตี้ไวรัสตัวนี้เปิดอยู่และอัปเดตล่าสุด คือตัวที่กำลังป้องกันเครื่องอยู่'),
            STILL_PRESENT: t('Every step ran, and it is still there. A program that survives this is defending itself, so its services have been stopped from starting.', 'ทำครบทุกขั้นแล้วแต่มันยังอยู่ โปรแกรมที่รอดมาได้คือโปรแกรมที่ป้องกันตัวเอง ระบบจึงสั่งไม่ให้เซอร์วิสของมันเริ่มทำงานอีก'),
            REFUSED_SYSTEM_LOCATION: t('Refused: this is installed into a Windows system folder.',
                'ไม่ดำเนินการ: โปรแกรมนี้ติดตั้งอยู่ในโฟลเดอร์ระบบของ Windows')
        }[code];
    }

    var WHAT = {
        checks: t('checking what must not be removed', '\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e2b\u0e49\u0e32\u0e21\u0e16\u0e2d\u0e14'),
        tasks: t('removing scheduled tasks', '\u0e25\u0e1a\u0e07\u0e32\u0e19\u0e15\u0e31\u0e49\u0e07\u0e40\u0e27\u0e25\u0e32'),
        services: t('stopping services', '\u0e2b\u0e22\u0e38\u0e14\u0e40\u0e0b\u0e2d\u0e23\u0e4c\u0e27\u0e34\u0e2a'),
        startup: t('removing startup entries', '\u0e25\u0e1a\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e40\u0e23\u0e34\u0e48\u0e21\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34'),
        processes: t('closing its processes', '\u0e1b\u0e34\u0e14\u0e42\u0e1b\u0e23\u0e40\u0e0b\u0e2a\u0e02\u0e2d\u0e07\u0e21\u0e31\u0e19'),
        uninstaller: t('running its own uninstaller', '\u0e40\u0e23\u0e35\u0e22\u0e01\u0e15\u0e31\u0e27\u0e16\u0e2d\u0e19\u0e02\u0e2d\u0e07\u0e21\u0e31\u0e19'),
        leftovers: t('removing what is left', '\u0e25\u0e1a\u0e2a\u0e48\u0e27\u0e19\u0e17\u0e35\u0e48\u0e40\u0e2b\u0e25\u0e37\u0e2d'),
        verify: t('checking whether it is really gone', '\u0e15\u0e23\u0e27\u0e08\u0e27\u0e48\u0e32\u0e2b\u0e32\u0e22\u0e44\u0e1b\u0e08\u0e23\u0e34\u0e07\u0e2b\u0e23\u0e37\u0e2d\u0e44\u0e21\u0e48')
    };
    function stepText(step) {
        var parts = String(step).split(': ');
        var names = {
            task: t('scheduled task removed', 'ลบงานตั้งเวลา'), service: t('service removed', 'ลบเซอร์วิส'),
            startup: t('startup entry removed', 'ลบรายการเริ่มอัตโนมัติ'), process: t('process stopped', 'ปิดโปรเซส'),
            uninstaller: t('uninstaller', 'ตัวถอนการติดตั้ง'), folder: t('folder', 'โฟลเดอร์'),
            'registry entry': t('registry entry', 'รายการในรีจิสทรี'), listed: t('in Add/Remove Programs', 'ในรายการโปรแกรม')
        };
        return (names[parts[0]] || parts[0]) + (parts[1] ? ': ' + parts[1] : '');
    }

    function send(node, program) {
        var ticket = 'scpprog' + (++serial) + '_' + Date.now();
        jobs[node._id] = { ticket: ticket, name: program.name, state: 'working', started: Date.now() };
        draw();
        tick();
        try {
            root.meshserver.send({
                action: 'runcommands', nodeids: [node._id], type: 2, runAsUser: 0, reply: true, responseid: ticket,
                cmds: script.replace('__NAME__', encode(program.name)).replace('__LOC__', encode(program.location)).replace('__UN__', encode(program.uninstall))
            });
        } catch (error) { jobs[node._id] = { ticket: ticket, name: program.name, state: 'failed', text: String(error) }; draw(); return; }
        root.setTimeout(function () {
            var job = jobs[node._id];
            if (job && job.ticket === ticket && job.state === 'working') {
                job.state = 'unknown';
                job.text = t('No reply after 10 minutes. The removal may still be running.', 'ไม่มีคำตอบเกิน 10 นาที งานอาจยังทำอยู่');
                draw();
            }
        }, 600000);
    }

    // Only a reply to the question this dialog asked is read as an answer to it.
    function receive(message) {
        if (!message || message.action !== 'msg' || message.type !== 'runcommands' || !message.nodeid) { return false; }
        var job = jobs[message.nodeid];
        if (!job || job.ticket !== message.responseid) { return false; }
        var text = String(message.result == null ? '' : message.result);
        if (message.progress === true) {
            var step = text.match(/SCP_PROGRAM_STEP:(\{[^\r\n]*\})/);
            if (step) { try { var at = JSON.parse(step[1]); job.step = at.n; job.of = at.of; job.what = at.what; draw(); } catch (error) { /* a step we cannot read changes nothing */ } }
            return true;
        }
        if (/COMMAND_BUSY/.test(text)) {
            job.state = 'failed';
            job.text = t('The computer is busy with another command; nothing was removed.', 'เครื่องกำลังทำคำสั่งอื่นอยู่ ยังไม่ได้ถอดอะไร');
            draw(); return true;
        }
        var match = text.match(/SCP_PROGRAM_REMOVE:(\{[\s\S]*?\})\s*$/m) || text.match(/SCP_PROGRAM_REMOVE:(\{.*\})/);
        if (!match) {
            job.state = 'unknown';
            job.text = t('A reply came back that does not say what happened.', 'ได้รับคำตอบ แต่ยังบอกไม่ได้ว่าเกิดอะไรขึ้น');
            draw(); return true;
        }
        try {
            var result = JSON.parse(match[1]);
            job.steps = [].concat(result.steps || []);
            job.restart = result.restart === true;
            job.state = result.ok ? 'done' : 'failed';
            job.text = result.ok ? '' : (refusalText(result.error) || String(result.error || ''));
        } catch (error) {
            job.state = 'unknown';
            job.text = t('The reply could not be read.', 'อ่านคำตอบไม่ได้');
        }
        draw(); return true;
    }

    function draw() {
        if (!dialog || !dialog.open || !current) { return; }
        listBox.textContent = '';
        var job = jobs[current._id];
        var filter = (dialog.querySelector('#scpProgramFilter') || {}).value || '';
        var needle = filter.trim().toLowerCase();
        var shown = programs.filter(function (p) {
            return !needle || (p.name + ' ' + (p.publisher || '')).toLowerCase().indexOf(needle) >= 0;
        });
        if (!shown.length) { listBox.appendChild(el('p', t('Nothing matches.', 'ไม่พบรายการที่ตรงกับคำค้น'))); }
        shown.slice(0, 400).forEach(function (program) {
            var row = el('article', null, 'scp-program-row');
            var label = el('div');
            label.appendChild(el('strong', program.name));
            var meta = [program.version, program.publisher].filter(Boolean).join(' · ');
            if (meta) { label.appendChild(el('small', meta)); }
            if (!program.uninstall) { label.appendChild(el('small', t('No uninstaller registered', 'ไม่มีตัวถอนการติดตั้งลงทะเบียนไว้'))); }
            row.appendChild(label);
            var go = button(t('Remove', 'ถอดออก'), 'scp-program-remove', function () {
                var warning = t('Force-remove this program from ', 'บังคับถอดโปรแกรมนี้ออกจากเครื่อง ') + (current.name || '') + '?\n\n' + program.name +
                    '\n\n' + t('This stops its services, scheduled tasks and startup entries first, then removes its files. It cannot be undone from here.',
                        'ระบบจะหยุดเซอร์วิส งานตั้งเวลา และรายการเริ่มอัตโนมัติของมันก่อน แล้วจึงลบไฟล์ทิ้ง เลิกทำจากที่นี่ไม่ได้');
                if (AV.test(program.name)) { warning += '\n\n' + t('This is an antivirus, and it defends itself against being removed this way. The attempt may only half-succeed and leave the computer worse off than it is now. The maker\u2019s own removal tool, run in Safe Mode, is the reliable way.', 'นี่คือแอนตี้ไวรัส ซึ่งมีกลไกป้องกันตัวเองจากการถูกถอดด้วยวิธีนี้ อาจถอดได้ไม่หมดและทำให้เครื่องแย่กว่าเดิม ทางที่ได้ผลแน่นอนคือเครื่องมือถอนของผู้ผลิต รันใน Safe Mode'); }
                if (!root.confirm(warning)) { return; }
                send(current, program);
            });
            go.disabled = !!(job && job.state === 'working');
            row.appendChild(go);
            listBox.appendChild(row);
        });
        notice.textContent = '';
        if (shown.length > 400) { notice.appendChild(el('p', t('Showing the first 400. Use the filter to narrow it.', 'แสดง 400 รายการแรก ใช้ช่องค้นหาเพื่อจำกัดให้แคบลง'))); }
        if (job) {
            var states = {
                working: t('Removing…', 'กำลังถอด…'), done: t('Finished', 'ทำงานเสร็จแล้ว'),
                failed: t('Did not run', 'ไม่ได้ดำเนินการ'), unknown: t('Result not confirmed', 'ยังยืนยันผลไม่ได้')
            };
            var box = el('div', null, 'scp-program-result');
            var percent = (job.of && job.step) ? Math.round(job.step / job.of * 100) : null;
            box.appendChild(el('strong', job.name + ' · ' + (states[job.state] || job.state) +
                ((job.state === 'working' && percent !== null) ? ' · ' + percent + '%' : '') +
                ((job.state === 'working' && job.started) ? ' · ' + elapsed(job.started) : '')));
            if (job.state === 'working' && percent !== null) {
                var bar = el('progress'); bar.max = 100; bar.value = percent;
                bar.setAttribute('aria-label', percent + '%'); box.appendChild(bar);
                box.appendChild(el('small', t('Step ', '\u0e02\u0e31\u0e49\u0e19\u0e17\u0e35\u0e48 ') + job.step + '/' + job.of +
                    (WHAT[job.what] ? ' · ' + WHAT[job.what] : '')));
            }
            if (job.state === 'working') { box.appendChild(el('small', t('Each step is reported when it finishes. The uninstaller in the middle of it can take several minutes.', 'แต่ละขั้นจะรายงานเมื่อทำเสร็จ ช่วงที่ตัวถอนของโปรแกรมทำงานอาจใช้เวลาหลายนาที'))); }
            if (job.text) { box.appendChild(el('p', job.text)); }
            (job.steps || []).forEach(function (step) { box.appendChild(el('small', '· ' + stepText(step))); });
            if (job.restart) {
                box.appendChild(el('p', t('Restart that computer, then remove it again from here. With its services stopped from starting, the second attempt has nothing defending against it. If it survives that too, only the maker’s own removal tool in Safe Mode will shift it.',
                    'รีสตาร์ตเครื่องนั้น แล้วสั่งถอดจากที่นี่อีกครั้ง เมื่อเซอร์วิสของมันไม่ได้เริ่มทำงาน รอบสองจะไม่มีอะไรคอยป้องกัน ถ้ายังไม่ออกอีก ต้องใช้เครื่องมือถอนของผู้ผลิตรันใน Safe Mode เท่านั้น')));
            }
            if (job.state === 'done') {
                box.appendChild(el('p', t('Check the list again to confirm it is gone, and after a restart to confirm it stays gone.',
                    'กดตรวจโปรแกรมอีกครั้งเพื่อยืนยันว่าหายไปแล้ว และตรวจซ้ำหลังรีสตาร์ตเพื่อยืนยันว่าไม่กลับมา')));
            }
            notice.appendChild(box);
        }
    }

    function open(node, list) {
        current = node;
        programs = (list || []).filter(function (p) { return p && p.name; })
            .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), th ? 'th' : 'en'); });
        if (!dialog) {
            dialog = el('dialog'); dialog.id = 'scpPrograms';
            var head = el('header');
            head.appendChild(el('h2', t('Installed programs', 'โปรแกรมที่ติดตั้ง')));
            head.appendChild(button(t('Close', 'ปิด'), '', function () { dialog.close(); }));
            dialog.appendChild(head);
            dialog.appendChild(el('p', t('For a program the ordinary uninstaller will not remove, or that comes back on its own. The remote-support agent, the antivirus currently protecting this computer, and anything in a Windows system folder are refused.',
                'สำหรับโปรแกรมที่ตัวถอนปกติถอดไม่ออก หรือถอดแล้วกลับมาเอง ระบบจะไม่ยอมถอดเอเจนต์รีโมต แอนตี้ไวรัสที่กำลังป้องกันเครื่องอยู่ และโปรแกรมในโฟลเดอร์ระบบของ Windows')));
            var filter = el('input'); filter.id = 'scpProgramFilter'; filter.type = 'search';
            filter.placeholder = t('Filter by name or publisher', 'ค้นหาจากชื่อหรือผู้ผลิต');
            filter.oninput = draw;
            dialog.appendChild(filter);
            notice = el('div'); notice.setAttribute('role', 'status'); dialog.appendChild(notice);
            listBox = el('div', null, 'scp-program-list'); dialog.appendChild(listBox);
            document.body.appendChild(dialog);
        }
        dialog.querySelector('#scpProgramFilter').value = '';
        if (!dialog.open) { dialog.showModal(); }
        draw();
    }

    root.ScpPrograms = { open: open, receive: receive, _script: script, _jobs: jobs };
}(typeof window === 'undefined' ? globalThis : window));
