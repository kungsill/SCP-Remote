/* SCP-Remote: health check and one-press fixes, taken from the hospital's own SCPclear tool.

   SCPclear is a program the IT officer runs at a computer. This brings its checks to the
   dashboard so they run from anywhere, on one computer or all of them at once:

   - The check only reads: uptime and pending restarts, updates, memory, processor, disk space
     and health, problem devices, crashes, the network (adapter, gateway, DNS), printers and
     stuck print jobs, core services, start-up programs, temporary files, the power plan and
     which Thai fonts are installed. Nothing on the computer is changed by checking.
   - Each fix is its own short command, asked for by name and confirmed first: clear a stuck
     print queue, restart the print spooler, print a test page, resume a paused printer, flush
     DNS, start a stopped core service, TRIM an SSD, turn a start-up program off or back on
     (the same switch Task Manager uses, so it is undone as easily), and install Thai fonts.
   - Left out on purpose, because they cut the remote connection, take a long time or cannot be
     undone: resetting the network stack or Windows Update, emptying the Recycle Bin, removing
     apps. SCPclear at the computer is still the place for those.

   Commands go through MeshCentral's own Run Commands, so they need that right on the computer,
   and the server records who asked for each fix. */
(function (root) {
    'use strict';
    var th = document.documentElement.lang === 'th';
    function t(en, thai) { return th ? thai : en; }
    function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
    function btn(text, cls, fn) { var b = el('button', text, cls || 'scp-health-btn'); b.type = 'button'; b.onclick = fn; return b; }
    function b64(s) { return btoa(unescape(encodeURIComponent(String(s)))); }
    function online(n) { return !!(n && (n.conn & 1)); }
    function windowsAgent(n) { var id = n && n.agent && n.agent.id; return (id > 0 && id < 5) || (id > 41 && id < 44); }

    var results = {}, jobs = {}, fixes = {}, mounts = {}, seq = 0, manifest = null, loaded = false;

    // Core services that should always run on a hospital computer. Only these can be started
    // from here; the name is never taken from the computer's answer.
    var CORE_SERVICES = ['Spooler', 'Dnscache', 'Dhcp', 'LanmanWorkstation', 'LanmanServer', 'BITS', 'EventLog', 'W32Time', 'AudioSrv', 'Winmgmt'];
    var SCOPES = {
        HKLM: "'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'",
        HKLM32: "'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32'",
        HKCU: "('Registry::HKEY_USERS\\' + $sid + '\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run')",
        FolderAll: "'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'",
        FolderUser: "('Registry::HKEY_USERS\\' + $sid + '\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder')"
    };

    function fontsWanted() { return (manifest && manifest.fonts) || []; }
    function loadManifest() {
        if (manifest) return Promise.resolve(manifest);
        return fetch((root.domainUrl || '/') + 'fonts/thai/manifest.json', { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw Error('NO_MANIFEST'); return r.json(); })
            .then(function (m) { manifest = m; return m; });
    }
    function psList(arr) { return '@(' + arr.map(function (s) { return "'" + String(s).replace(/'/g, "''") + "'"; }).join(',') + ')'; }

    /* ---------- the check: read only, one statement per line (the agent feeds PowerShell line by line) ---------- */
    function healthScript() {
        var who = [
            "$own = Get-CimInstance Win32_Process -Filter \"Name='explorer.exe'\" | Select-Object -First 1",
            "$sid = if ($own) { [string]($own | Invoke-CimMethod -MethodName GetOwnerSid).Sid } else { '' }",
            "$uname = if ($own) { [string]($own | Invoke-CimMethod -MethodName GetOwner).User } else { '' }"
        ];
        return ["$ErrorActionPreference = 'SilentlyContinue'"].concat(who, [
            "$os = Get-CimInstance Win32_OperatingSystem; $cs = Get-CimInstance Win32_ComputerSystem",
            "$up = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 1)",
            "$pend = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired')",
            "$hf = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1",
            "$lu = if ($hf) { [int]((Get-Date) - $hf.InstalledOn).TotalDays } else { -1 }",
            "$ramT = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1); $ramU = [int](100 - ($os.FreePhysicalMemory * 1KB / $cs.TotalPhysicalMemory * 100))",
            "$cpu = [int](Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average",
            "$c = Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\"",
            "$part = Get-Partition -DriveLetter C | Select-Object -First 1; $pd = Get-PhysicalDisk | Where-Object { [string]$_.DeviceId -eq [string]$part.DiskNumber } | Select-Object -First 1",
            "$smart = @(Get-CimInstance -Namespace root\\wmi -ClassName MSStorageDriver_FailurePredictStatus | Where-Object { $_.PredictFailure }).Count",
            // Every physical disk, not just C:: Windows' own counters plus the raw SMART table
            // (reallocated / pending / uncorrectable sectors, hours on, temperature, SSD life left).
            "$dd = @(Get-CimInstance Win32_DiskDrive); $fpd = @(Get-CimInstance -Namespace root\\wmi -ClassName MSStorageDriver_FailurePredictData); $fpt = @(Get-CimInstance -Namespace root\\wmi -ClassName MSStorageDriver_FailurePredictThresholds); $fps = @(Get-CimInstance -Namespace root\\wmi -ClassName MSStorageDriver_FailurePredictStatus)",
            "function ScpSmart($pnp) { $d = $fpd | Where-Object { $_.InstanceName -like ($pnp + '*') } | Select-Object -First 1; if (-not $d) { return $null }; $v = $d.VendorSpecific; $th = @{}; $t = $fpt | Where-Object { $_.InstanceName -eq $d.InstanceName } | Select-Object -First 1; if ($t) { $tv = $t.VendorSpecific; for ($i = 2; $i -lt 362; $i += 12) { if ($tv[$i]) { $th[[int]$tv[$i]] = [int]$tv[$i + 1] } } }; $r = @{}; for ($i = 2; $i -lt 362; $i += 12) { $id = [int]$v[$i]; if ($id -eq 0) { continue }; $raw = [long]0; for ($b = 5; $b -ge 0; $b--) { $raw = $raw * 256 + [int]$v[$i + 5 + $b] }; $r[$id] = @([int]$v[$i + 3], [int]$v[$i + 4], $raw, [int]$th[$id]) }; return $r }",
            "function ScpRaw($s, $id) { if ($s -and $s.ContainsKey($id)) { [long]$s[$id][2] } else { -1 } }",
            "function ScpLife($s) { foreach ($id in 231, 233, 177, 202, 169) { if ($s -and $s.ContainsKey($id) -and $s[$id][0] -le 100 -and $s[$id][0] -gt 0) { return @($s[$id][0], $id) } }; return @(-1, 0) }",
            "$cdisk = (Get-Partition -DriveLetter C | Select-Object -First 1).DiskNumber",
            "$disks = @(Get-PhysicalDisk | Sort-Object { [int]$_.DeviceId } | ForEach-Object { $p = $_; $w = $dd | Where-Object { $_.Index -eq [int]$p.DeviceId } | Select-Object -First 1; $rc = $p | Get-StorageReliabilityCounter; $s = if ($w) { ScpSmart $w.PNPDeviceID } else { $null }; $lf = ScpLife $s; $below = if ($s) { @($s.Keys | Where-Object { $s[$_][3] -gt 0 -and $s[$_][3] -lt 254 -and $s[$_][0] -le $s[$_][3] }).Count } else { 0 }; $fail = [bool]($w -and ($fps | Where-Object { $_.InstanceName -like ($w.PNPDeviceID + '*') -and $_.PredictFailure })); $tmp194 = ScpRaw $s 194; $tmp190 = ScpRaw $s 190; @{ n = [string]$p.FriendlyName; type = [string]$p.MediaType; bus = [string]$p.BusType; gb = [math]::Round($p.Size / 1GB); health = [string]$p.HealthStatus; sys = [bool]([string]$p.DeviceId -eq [string]$cdisk); smart = [bool]$s; wear = if ($rc.Wear -ne $null) { [int]$rc.Wear } else { -1 }; temp = if ($rc.Temperature) { [int]$rc.Temperature } elseif ($tmp194 -ge 0) { [int]($tmp194 -band 255) } elseif ($tmp190 -ge 0) { [int]($tmp190 -band 255) } else { -1 }; poh = if ($rc.PowerOnHours) { [int]$rc.PowerOnHours } elseif ((ScpRaw $s 9) -ge 0) { [int]((ScpRaw $s 9) -band 0xFFFFFFFF) } else { -1 }; rdErr = if ($rc.ReadErrorsUncorrected -ne $null) { [int]$rc.ReadErrorsUncorrected } else { -1 }; realloc = ScpRaw $s 5; pending = ScpRaw $s 197; uncorr = ScpRaw $s 198; reported = ScpRaw $s 187; crc = ScpRaw $s 199; life = $lf[0]; lifeId = $lf[1]; below = $below; fail = $fail } })",
            "$bad = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.ConfigManagerErrorCode -ne 22 } | Select-Object -First 6 | ForEach-Object { [string]$_.Name })",
            "$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2; StartTime = (Get-Date).AddDays(-1) } -MaxEvents 500).Count",
            // One unexpected shutdown leaves both a 41 and a 6008, so only 41 is counted. Blue screens
            // (BugCheck 1001) are counted on their own: power being cut is routine here, a crash is not.
            "$crash = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41; StartTime = (Get-Date).AddDays(-14) } -MaxEvents 100).Count",
            "$bsod = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'; Id = 1001; StartTime = (Get-Date).AddDays(-14) } -MaxEvents 50).Count",
            "$ad = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { [string]$_.Name })",
            "$ipc = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1",
            "$ip = [string]($ipc.IPv4Address | Select-Object -First 1).IPAddress; $gw = [string]($ipc.IPv4DefaultGateway | Select-Object -First 1).NextHop",
            "$gwOk = if ($gw) { [bool](Test-Connection -ComputerName $gw -Count 1 -Quiet) } else { $false }",
            "$dnsOk = [bool](Resolve-DnsName -Name www.google.com -Type A -QuickTimeout -ErrorAction SilentlyContinue)",
            "$netOk = [bool](Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet)",
            "$sp = Get-Service Spooler",
            "$defP = [string](Get-CimInstance Win32_Printer -Filter 'Default=TRUE' | Select-Object -First 1).Name",
            "$prn = @(Get-Printer | Select-Object -First 15 | ForEach-Object { @{ name = [string]$_.Name; port = [string]$_.PortName; shared = [bool]$_.Shared; status = [string]$_.PrinterStatus; jobs = [int]$_.JobCount; def = ([string]$_.Name -eq $defP) } })",
            "$pj = @(Get-CimInstance Win32_PrintJob)",
            "$old = if ($pj.Count) { [int](($pj | ForEach-Object { ((Get-Date) - $_.TimeSubmitted).TotalMinutes } | Measure-Object -Maximum).Maximum) } else { 0 }",
            "$spp = @{ running = [bool](Get-Process SCPPrint -ErrorAction SilentlyContinue); installed = [bool](Get-ChildItem 'C:\\Users\\*\\AppData\\Local\\SCPPrint\\config.json' -ErrorAction SilentlyContinue) }",
            "$svc = @(" + psList(CORE_SERVICES) + " | ForEach-Object { Get-Service -Name $_ -ErrorAction SilentlyContinue } | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' } | ForEach-Object { [string]$_.Name })",
            // start-up programs, with whether Task Manager's switch has them on (odd first byte = off)
            "function ScpOn($p, $n) { $v = (Get-ItemProperty -Path $p -Name $n -ErrorAction SilentlyContinue).$n; if ($v -is [byte[]] -and $v.Length) { return (($v[0] % 2) -eq 0) }; return $true }",
            "function ScpRun($key, $scope, $ap) { $k = Get-Item -Path $key -ErrorAction SilentlyContinue; if ($k) { $k.GetValueNames() | Where-Object { $_ } | ForEach-Object { @{ scope = $scope; name = [string]$_; cmd = ([string]$k.GetValue($_)).Substring(0, [math]::Min(160, ([string]$k.GetValue($_)).Length)); on = (ScpOn $ap $_) } } } }",
            "function ScpDir($dir, $scope, $ap) { Get-ChildItem -Path $dir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { @{ scope = $scope; name = [string]$_.Name; cmd = [string]$_.FullName; on = (ScpOn $ap $_.Name) } } }",
            "$st = @()",
            "$st += @(ScpRun 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run' 'HKLM' " + SCOPES.HKLM + ")",
            "$st += @(ScpRun 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run' 'HKLM32' " + SCOPES.HKLM32 + ")",
            "if ($sid) { $st += @(ScpRun ('Registry::HKEY_USERS\\' + $sid + '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run') 'HKCU' " + SCOPES.HKCU + ") }",
            "$st += @(ScpDir 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Startup' 'FolderAll' " + SCOPES.FolderAll + ")",
            "$prof = if ($sid) { [string](Get-CimInstance Win32_UserProfile | Where-Object { $_.SID -eq $sid } | Select-Object -First 1).LocalPath } else { '' }",
            "if ($prof) { $st += @(ScpDir (Join-Path $prof 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup') 'FolderUser' " + SCOPES.FolderUser + ") }",
            "$top = @(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 6 | ForEach-Object { @{ name = [string]$_.ProcessName; mb = [int]($_.WorkingSet64 / 1MB) } })",
            // Is it slow or hanging? What Windows itself recorded: programs that stopped responding,
            // programs that crashed, low-memory warnings and how long the last start-up took.
            "$hangEv = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Hang'; Id = 1002; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -ErrorAction SilentlyContinue)",
            "$hangApps = @($hangEv | ForEach-Object { [string]$_.Properties[0].Value } | Group-Object | Sort-Object Count -Descending | Select-Object -First 3 | ForEach-Object { @{ name = $_.Name; n = $_.Count } })",
            "$crashEv = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -ErrorAction SilentlyContinue)",
            "$crashApps = @($crashEv | ForEach-Object { [string]$_.Properties[0].Value } | Group-Object | Sort-Object Count -Descending | Select-Object -First 3 | ForEach-Object { @{ name = $_.Name; n = $_.Count } })",
            "$lowMem = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Resource-Exhaustion-Detector'; Id = 2004; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 100 -ErrorAction SilentlyContinue).Count",
            "$bootEv = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 100 } -MaxEvents 1 -ErrorAction SilentlyContinue",
            "$bootSec = if ($bootEv) { [int](([xml]$bootEv.ToXml()).Event.EventData.Data | Where-Object { $_.Name -eq 'BootTime' } | ForEach-Object { [double]$_.'#text' / 1000 }) } else { -1 }",
            "$slow = @{ hangs7d = $hangEv.Count; hangApps = $hangApps; crashes7d = $crashEv.Count; crashApps = $crashApps; lowMem30d = $lowMem; bootSec = $bootSec }",
            "$tmp = [int]((@(Get-ChildItem -Path ($env:SystemRoot + '\\Temp'), 'C:\\Users\\*\\AppData\\Local\\Temp' -File -Recurse -Force -ErrorAction SilentlyContinue) | Measure-Object Length -Sum).Sum / 1MB)",
            "$pp = [string](powercfg /getactivescheme)",
            "$fk = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'; $fnames = @($fk.PSObject.Properties | ForEach-Object { $_.Name })",
            // A font put in by hand or another installer is registered under another name: the same file (by SHA-256) counts too.
            "$want = @(" + fontsWanted().map(function (f) { return "@{ n = '" + f.name.replace(/'/g, "''") + "'; h = '" + f.sha256 + "'; s = " + (+f.size || 0) + " }"; }).join(', ') + ")",
            "$sizes = @($want | ForEach-Object { $_.s }); $fhash = @{}",
            "Get-ChildItem ($env:SystemRoot + '\\Fonts') -File -ErrorAction SilentlyContinue | Where-Object { $sizes -contains $_.Length } | ForEach-Object { $fhash[(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash] = $true }",
            "$miss = @($want | Where-Object { ($fnames -notcontains $_.n) -and -not $fhash[$_.h] } | ForEach-Object { $_.n })",
            "$thsb = [bool]($fnames | Where-Object { $_ -match 'TH ?Sarabun' })",
            "$syn = [bool](Select-String -Path ($env:SystemRoot + '\\System32\\drivers\\etc\\hosts') -Pattern 'syn5scph' -Quiet)",
            // How Windows was installed: the switches people use to get past the Windows 11 checks,
            // and the marks a modified build (tiny11, Lite, TeamOS...) leaves. Only reads.
            "$lab = Get-ItemProperty 'HKLM:\\SYSTEM\\Setup\\LabConfig' -ErrorAction SilentlyContinue; $labOn = @('BypassCPUCheck','BypassTPMCheck','BypassSecureBootCheck','BypassRAMCheck','BypassStorageCheck') | Where-Object { $lab -and $lab.$_ -eq 1 }",
            "$moSet = [bool]((Get-ItemProperty 'HKLM:\\SYSTEM\\Setup\\MoSetup' -ErrorAction SilentlyContinue).AllowUpgradesWithUnsupportedTPMOrCPU -eq 1)",
            "$unat = @(($env:SystemRoot + '\\Panther\\unattend.xml'), ($env:SystemRoot + '\\Panther\\Unattend\\unattend.xml'), ($env:SystemRoot + '\\System32\\Sysprep\\unattend.xml')) | Where-Object { Test-Path $_ } | Where-Object { Select-String -Path $_ -Pattern 'Bypass(CPU|TPM|SecureBoot|RAM)Check|AllowUpgradesWithUnsupported' -Quiet }",
            "$cv = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'; $oem = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\OEMInformation' -ErrorAction SilentlyContinue",
            "$ident = (@([string]$cv.RegisteredOwner, [string]$cv.RegisteredOrganization, [string]$cv.ProductName, [string]$oem.Manufacturer, [string]$oem.Model, [string]$oem.SupportURL) | Where-Object { $_ }) -join ' / '",
            "$brand = if ($ident -match '\\b(tiny ?1[01]|nano ?1[01]|lite|teamos|team ?os|ghost ?spectre|xtreme|revi ?os|atlas ?os|superlite|modded)\\b') { $Matches[0] } else { '' }",
            "$wd = Get-Service WinDefend -ErrorAction SilentlyContinue; $wu = Get-Service wuauserv -ErrorAction SilentlyContinue",
            "$edge = (Test-Path (${env:ProgramFiles(x86)} + '\\Microsoft\\Edge\\Application\\msedge.exe')) -or (Test-Path ($env:ProgramFiles + '\\Microsoft\\Edge\\Application\\msedge.exe'))",
            "$inst = @{ bypass = @($labOn); moSetup = $moSet; unattendBypass = (@($unat).Count -gt 0); brand = $brand; ident = $ident.Substring(0, [math]::Min(160, $ident.Length)); noDefender = (-not $wd); noUpdate = (-not $wu); updateDisabled = [bool]($wu -and $wu.StartType -eq 'Disabled'); noEdge = (-not $edge); installDate = [string]$cv.InstallDate }",
            "$o = @{ v = 1; os = [string]$os.Caption; build = [string]$os.BuildNumber; user = $uname; upDays = $up; pendingReboot = [bool]$pend; lastUpdateDays = $lu; ramGb = $ramT; ramPct = $ramU; cpu = $cpu; freeGb = [math]::Round($c.FreeSpace / 1GB, 1); diskGb = [math]::Round($c.Size / 1GB, 1); diskType = [string]$pd.MediaType; diskHealth = [string]$pd.HealthStatus; smart = $smart; disks = $disks;badDevices = $bad; errors24h = $ev; crashes14d = $crash; bsod14d = $bsod; adapters = $ad; ip = $ip; gw = $gw; gwOk = $gwOk; dnsOk = $dnsOk; netOk = $netOk; spooler = [string]$sp.Status; printers = $prn; jobs = $pj.Count; oldestJobMin = $old; scpprint = $spp; stoppedServices = $svc; startup = @($st | Select-Object -First 40); top = $top; tempMb = $tmp; power = $pp; fontsMissing = $miss; thSarabun = $thsb; synapseHost = $syn; install = $inst; slow = $slow }",
            "$json = [regex]::Replace(($o | ConvertTo-Json -Compress -Depth 4), '[^\\x00-\\x7F]', { param($c) '\\u{0:x4}' -f [int][char]$c.Value })",
            "Write-Output ('SCP_HEALTH:' + $json)"
        ]).join('\r\n');
    }

    /* ---------- fixes: each one short and named; every one reports SCP_FIX:{...} ---------- */
    function out(action, body) { return "Write-Output ('SCP_FIX:' + (@{ action = '" + action + "'; " + body + " } | ConvertTo-Json -Compress))"; }
    var FIX = {
        printer_fix: function () {
            return ["$ErrorActionPreference = 'SilentlyContinue'",
                "$before = @(Get-CimInstance Win32_PrintJob).Count",
                "Stop-Service Spooler -Force; Start-Sleep -Seconds 2",
                "$files = @(Get-ChildItem ($env:SystemRoot + '\\System32\\spool\\PRINTERS') -File -Force); $files | Remove-Item -Force",
                "Start-Service Spooler; Start-Sleep -Seconds 3",
                "$after = @(Get-CimInstance Win32_PrintJob).Count; $st = [string](Get-Service Spooler).Status",
                out('printer_fix', "ok = ($st -eq 'Running'); before = $before; removed = $files.Count; after = $after; spooler = $st")].join('\r\n');
        },
        spooler_restart: function () {
            return ["$ErrorActionPreference = 'SilentlyContinue'", "Restart-Service Spooler -Force; Start-Sleep -Seconds 2",
                "$st = [string](Get-Service Spooler).Status", out('spooler_restart', "ok = ($st -eq 'Running'); spooler = $st")].join('\r\n');
        },
        printer_test: function (arg) {
            return ["$ErrorActionPreference = 'SilentlyContinue'", "$n = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + b64(arg) + "'))",
                "$p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $n } | Select-Object -First 1",
                "$r = if ($p) { [int]($p | Invoke-CimMethod -MethodName PrintTestPage).ReturnValue } else { -1 }",
                out('printer_test', "ok = ($r -eq 0); code = $r")].join('\r\n');
        },
        printer_resume: function (arg) {
            return ["$ErrorActionPreference = 'SilentlyContinue'", "$n = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + b64(arg) + "'))",
                "$p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $n } | Select-Object -First 1",
                "$r = if ($p) { [int]($p | Invoke-CimMethod -MethodName Resume).ReturnValue } else { -1 }",
                out('printer_resume', "ok = ($r -eq 0); code = $r")].join('\r\n');
        },
        dns_flush: function () {
            return ["$ErrorActionPreference = 'SilentlyContinue'", "Clear-DnsClientCache; ipconfig /flushdns | Out-Null",
                "$ok = [bool](Resolve-DnsName -Name www.google.com -Type A -QuickTimeout -ErrorAction SilentlyContinue)", out('dns_flush', 'ok = $true; resolves = $ok')].join('\r\n');
        },
        svc_start: function (arg) {
            if (CORE_SERVICES.indexOf(arg) < 0) throw Error('NOT_ALLOWED');
            return ["$ErrorActionPreference = 'SilentlyContinue'", "Start-Service -Name '" + arg + "'; Start-Sleep -Seconds 2",
                "$st = [string](Get-Service -Name '" + arg + "').Status", out('svc_start', "ok = ($st -eq 'Running'); service = '" + arg + "'; status = $st")].join('\r\n');
        },
        trim: function () {
            return ["$ErrorActionPreference = 'SilentlyContinue'", "$e = $null; Optimize-Volume -DriveLetter C -ReTrim -ErrorVariable e",
                out('trim', 'ok = (-not $e); error = [string]($e | Select-Object -First 1)')].join('\r\n');
        },
        power_balanced: function () {
            return ["$ErrorActionPreference = 'SilentlyContinue'", "powercfg /setactive SCHEME_BALANCED", "$pp = [string](powercfg /getactivescheme)",
                out('power_balanced', "ok = ($pp -match '381b4222-f694-41f0-9685-ff5bb260df2e'); plan = $pp")].join('\r\n');
        },
        synapse_hosts: function () {
            return ["$ErrorActionPreference = 'SilentlyContinue'", "$h = $env:SystemRoot + '\\System32\\drivers\\etc\\hosts'",
                "if (-not (Select-String -Path $h -Pattern '\\ssyn5scph(\\s|$)' -Quiet)) { Add-Content -Path $h -Value ([Environment]::NewLine + '192.168.30.83' + [char]9 + 'syn5scph') -Encoding ASCII }",
                "$ok = [bool](Select-String -Path $h -Pattern 'syn5scph' -Quiet)", out('synapse_hosts', 'ok = $ok')].join('\r\n');
        },
        startup: function (arg) {
            // arg = { scope, name, on }; the scope picks one of five fixed registry paths
            if (!SCOPES[arg.scope]) throw Error('NOT_ALLOWED');
            return ["$ErrorActionPreference = 'SilentlyContinue'",
                "$own = Get-CimInstance Win32_Process -Filter \"Name='explorer.exe'\" | Select-Object -First 1",
                "$sid = if ($own) { [string]($own | Invoke-CimMethod -MethodName GetOwnerSid).Sid } else { '' }",
                "$n = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + b64(arg.name) + "'))",
                "$p = " + SCOPES[arg.scope],
                "if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }",
                "New-ItemProperty -Path $p -Name $n -PropertyType Binary -Value ([byte[]](" + (arg.on ? 2 : 3) + ",0,0,0,0,0,0,0,0,0,0,0)) -Force | Out-Null",
                "$v = (Get-ItemProperty -Path $p -Name $n).$n",
                out('startup', "ok = ($v -and $v[0] -eq " + (arg.on ? 2 : 3) + "); on = $" + (arg.on ? 'true' : 'false'))].join('\r\n');
        },
        fonts: function (arg) {
            // arg = { base, list }: downloaded from this server, checked against the SHA-256 in
            // the manifest before anything is copied, so a file changed on the way is refused.
            var list = '@(' + arg.list.map(function (f) { return "@{ f = '" + f.file + "'; n = '" + f.name.replace(/'/g, "''") + "'; h = '" + f.sha256 + "'; s = " + (+f.size || 0) + " }"; }).join(', ') + ')';
            return ["$ErrorActionPreference = 'SilentlyContinue'",
                "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
                "$base = '" + arg.base.replace(/'/g, "''") + "'; $list = " + list,
                "$fk = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'; $dir = $env:SystemRoot + '\\Fonts'",
                "$tmp = Join-Path $env:SystemRoot ('Temp\\scpfonts' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $tmp -Force | Out-Null",
                "$wc = New-Object Net.WebClient; $res = @{ installed = 0; skipped = 0; failed = @(); unverifiedTls = $false }",
                // the same file already in Windows\Fonts under another name (installed by hand or another script) is left alone
                "$sizes = @($list | ForEach-Object { $_.s }); $fhash = @{}",
                "Get-ChildItem $dir -File -ErrorAction SilentlyContinue | Where-Object { $sizes -contains $_.Length } | ForEach-Object { $fhash[(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash] = $true }",
                "foreach ($x in $list) { if ($fhash[$x.h] -or ((Get-ItemProperty $fk -Name $x.n -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $dir $x.f)))) { $res.skipped++; continue }; $t = Join-Path $tmp $x.f; try { $wc.DownloadFile($base + $x.f, $t) } catch { [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }; $res.unverifiedTls = $true; try { $wc.DownloadFile($base + $x.f, $t) } catch { } }; if ((Test-Path $t) -and ((Get-FileHash $t -Algorithm SHA256).Hash -eq $x.h)) { Copy-Item $t (Join-Path $dir $x.f) -Force; New-ItemProperty -Path $fk -Name $x.n -Value $x.f -PropertyType String -Force | Out-Null; $res.installed++ } else { $res.failed += $x.f } }",
                "Remove-Item $tmp -Recurse -Force",
                "Write-Output ('SCP_FIX:' + (@{ action = 'fonts'; ok = ($res.failed.Count -eq 0); installed = $res.installed; skipped = $res.skipped; failed = @($res.failed); unverifiedTls = $res.unverifiedTls } | ConvertTo-Json -Compress))"].join('\r\n');
        }
    };

    function send(nodeids, ticket, cmds) {
        root.meshserver.send({ action: 'runcommands', nodeids: nodeids, type: 2, runAsUser: 0, reply: true, responseid: ticket, cmds: cmds });
    }

    /* ---------- running the check ---------- */
    // A computer runs one command at a time and answers "busy" to a second one. So each computer
    // has a queue here: a check or a fix waits for the one before it to answer (or time out).
    var queue = {}, active = {};
    function enqueue(nodeid, run) { (queue[nodeid] = queue[nodeid] || []).push(run); next(nodeid); }
    function next(nodeid) {
        if (active[nodeid] || !queue[nodeid] || !queue[nodeid].length) return;
        active[nodeid] = true;
        queue[nodeid].shift()();
    }
    function finished(nodeid) { active[nodeid] = false; next(nodeid); }
    function waiting(nodeid) { return !!active[nodeid] || !!(queue[nodeid] && queue[nodeid].length); }

    function check(node) {
        if (!online(node) || !windowsAgent(node)) return;
        if (jobs[node._id] && jobs[node._id].state === 'working') return;
        var ticket = 'scphealth' + Date.now() + '_' + (++seq);
        jobs[node._id] = { state: 'working', ticket: ticket, started: Date.now() };
        paint(node._id);
        enqueue(node._id, function () {
            loadManifest().catch(function () { }).then(function () {
                try { send([node._id], ticket, healthScript()); } catch (e) { jobs[node._id] = { state: 'failed', text: t('Could not send', 'ส่งคำสั่งไม่ได้') }; paint(node._id); finished(node._id); return; }
                jobs[node._id].timer = setTimeout(function () {
                    var j = jobs[node._id];
                    if (j && j.ticket === ticket && j.state === 'working') { j.state = 'failed'; j.text = t('No answer within 2 minutes', 'ไม่ได้คำตอบภายใน 2 นาที'); paint(node._id); finished(node._id); }
                }, 120000);
            });
        });
    }

    var fleet = null;
    function checkAll(nodes, done) {
        var list = (nodes || []).filter(function (n) { return online(n) && windowsAgent(n); });
        if (!list.length) { if (done) done(null); return null; }
        var ticket = 'scphealth' + Date.now() + '_' + (++seq);
        fleet = { ticket: ticket, pending: {}, got: [], total: list.length, done: done, failed: 0 };
        list.forEach(function (n) { fleet.pending[n._id] = true; jobs[n._id] = { state: 'working', ticket: ticket, started: Date.now() }; });
        loadManifest().catch(function () { }).then(function () {
            try { send(list.map(function (n) { return n._id; }), ticket, healthScript()); } catch (e) { fleet.failed = list.length; finishFleet(); return; }
            fleet.timer = setTimeout(function () { if (fleet && fleet.ticket === ticket) { fleet.failed += Object.keys(fleet.pending).length; fleet.pending = {}; finishFleet(); } }, 150000);
        });
        return fleet;
    }
    function finishFleet() {
        var f = fleet;
        if (!f || f.finished) return;
        f.finished = true;
        clearTimeout(f.timer);
        if (f.done) f.done(f);
    }

    function save(items) {
        if (!items.length || !root.ScpOperations) return;
        root.ScpOperations.request('healthSave', { items: items }).catch(function () { /* server not restarted yet: results stay on this page */ });
    }

    /* ---------- running a fix ---------- */
    var FIX_LABEL = {
        printer_fix: t('clear stuck print jobs and restart the print spooler', 'ล้างงานพิมพ์ที่ค้างและรีสตาร์ท Print Spooler'),
        spooler_restart: t('restart the print spooler', 'รีสตาร์ท Print Spooler'),
        printer_test: t('print a test page', 'พิมพ์หน้าทดสอบ'),
        printer_resume: t('resume the paused printer', 'สั่งให้เครื่องพิมพ์ที่หยุดไว้ทำงานต่อ'),
        dns_flush: t('flush the DNS cache', 'ล้างแคช DNS'),
        svc_start: t('start the service', 'เปิดบริการ'),
        trim: t('TRIM the SSD (tells it which space is free, keeps it fast)', 'สั่ง TRIM ให้ SSD (บอกพื้นที่ว่าง ช่วยให้เร็วเหมือนใหม่)'),
        power_balanced: t('switch the power plan to Balanced', 'ตั้งโหมดพลังงานเป็น Balanced'),
        synapse_hosts: t('add the PACS name syn5scph (192.168.30.83) to the hosts file', 'เพิ่มชื่อเครื่อง PACS syn5scph (192.168.30.83) ในไฟล์ hosts'),
        startup: t('change the start-up program', 'เปลี่ยนการเปิดพร้อมเครื่อง'),
        fonts: t('install Thai fonts', 'ติดตั้งฟอนต์ไทย')
    };
    function fix(node, action, arg, opts) {
        opts = opts || {};
        if (!online(node)) return;
        if (!opts.noConfirm && !root.confirm((opts.question || (t('On ', 'ที่เครื่อง ') + node.name + ': ' + FIX_LABEL[action] + '?')) + (opts.note ? '\n\n' + opts.note : ''))) return;
        var go = function () {
            var cmds;
            try { cmds = FIX[action](arg); } catch (e) { return; }
            var label = opts.label || FIX_LABEL[action];
            if (waiting(node._id)) note(node._id, t('Queued (the computer is busy): ', 'รอคิว (เครื่องกำลังทำคำสั่งก่อนหน้า): ') + label, 'busy');
            enqueue(node._id, function () {
                var ticket = 'scphfix' + Date.now() + '_' + (++seq);
                fixes[ticket] = { nodeid: node._id, action: action, arg: arg, label: label, timer: setTimeout(function () {
                    var f = fixes[ticket];
                    if (f) { delete fixes[ticket]; note(node._id, t('No answer yet: ', 'ยังไม่ได้คำตอบ: ') + f.label, 'warn'); finished(node._id); }
                }, 180000) };
                note(node._id, t('Working: ', 'กำลังทำ: ') + label + '…', 'busy');
                try { send([node._id], ticket, cmds); } catch (e) { delete fixes[ticket]; note(node._id, t('Could not send', 'ส่งคำสั่งไม่ได้'), 'bad'); finished(node._id); }
            });
        };
        if (action === 'fonts' && !arg) {
            loadManifest().then(function (m) {
                arg = { base: new URL((root.domainUrl || '/') + 'fonts/thai/', location.href).href, list: m.fonts };
                go();
            }).catch(function () { note(node._id, t('Font list unavailable on the server', 'ไม่พบรายการฟอนต์บนเซิร์ฟเวอร์'), 'bad'); });
            return;
        }
        go();
    }
    function fixAll(nodes, action, done) {
        var list = (nodes || []).filter(function (n) { return online(n) && windowsAgent(n); });
        if (!list.length) return;
        loadManifest().then(function (m) {
            var arg = action === 'fonts' ? { base: new URL((root.domainUrl || '/') + 'fonts/thai/', location.href).href, list: m.fonts } : null;
            var ticket = 'scphfix' + Date.now() + '_' + (++seq);
            var job = { action: action, many: {}, got: 0, ok: 0, installed: 0, total: list.length, done: done };
            list.forEach(function (n) { job.many[n._id] = true; });
            fixes[ticket] = job;
            job.timer = setTimeout(function () { delete fixes[ticket]; if (done) done(job, true); }, 300000);
            send(list.map(function (n) { return n._id; }), ticket, FIX[action](arg));
        });
    }

    /* ---------- answers from the computers ---------- */
    function receive(m) {
        if (!m || m.action !== 'msg' || m.type !== 'runcommands' || typeof m.responseid !== 'string' || m.progress === true) return false;
        var id = m.responseid, text = String(m.result || '');
        if (id.indexOf('scphealth') === 0) {
            var job = jobs[m.nodeid];
            if (!job || job.ticket !== id) return true; // an older request this page no longer waits for
            clearTimeout(job.timer);
            var match = text.match(/SCP_HEALTH:(\{[^\r\n]*\})/);
            if (match) {
                try {
                    results[m.nodeid] = { data: JSON.parse(match[1]), at: Date.now() };
                    jobs[m.nodeid] = { state: 'done' };
                } catch (e) { jobs[m.nodeid] = { state: 'failed', text: t('Unreadable answer', 'อ่านคำตอบไม่ได้') }; }
            } else {
                jobs[m.nodeid] = { state: 'failed', text: /COMMAND_BUSY/.test(text) ? t('The computer is busy with another command', 'เครื่องกำลังทำคำสั่งอื่นอยู่') : t('No result', 'ไม่ได้ผลตรวจ') };
            }
            if (fleet && fleet.ticket === id) {
                // Saved as each computer answers, not when the last one does: leaving the page
                // while one computer is slow used to throw away every other answer.
                if (fleet.pending[m.nodeid]) { delete fleet.pending[m.nodeid]; if (results[m.nodeid] && jobs[m.nodeid].state === 'done') { fleet.got.push(m.nodeid); save([{ nodeid: m.nodeid, data: results[m.nodeid].data }]); } else fleet.failed++; }
                if (fleet.onProgress) fleet.onProgress(fleet);
                if (!Object.keys(fleet.pending).length) finishFleet();
            } else {
                if (results[m.nodeid] && jobs[m.nodeid].state === 'done') save([{ nodeid: m.nodeid, data: results[m.nodeid].data }]);
                finished(m.nodeid); // the computer is free for the next queued command
            }
            paint(m.nodeid);
            return true;
        }
        if (id.indexOf('scphfix') === 0) {
            var f = fixes[id];
            if (!f) return true;
            var fm = text.match(/SCP_FIX:(\{[^\r\n]*\})/), r = null;
            try { r = fm ? JSON.parse(fm[1]) : null; } catch (e) { r = null; }
            if (f.many) {
                if (!f.many[m.nodeid]) return true;
                delete f.many[m.nodeid]; f.got++;
                if (r && r.ok) f.ok++;
                if (r && r.installed) f.installed += r.installed;
                log(m.nodeid, f.action, r);
                if (f.onProgress) f.onProgress(f);
                if (!Object.keys(f.many).length) { clearTimeout(f.timer); delete fixes[id]; if (f.done) f.done(f, false); }
                return true;
            }
            clearTimeout(f.timer);
            delete fixes[id];
            note(f.nodeid, describe(f, r, text), r && r.ok ? 'ok' : 'bad');
            log(f.nodeid, f.action, r);
            // look again, so the list shows what the fix changed (queued behind any fix still waiting)
            var n = nodeById(f.nodeid);
            if (n && f.action !== 'printer_test' && !(queue[f.nodeid] && queue[f.nodeid].length)) check(n);
            finished(f.nodeid);
            return true;
        }
        return false;
    }
    function describe(f, r, text) {
        if (!r) return /COMMAND_BUSY/.test(text) ? t('The computer is busy with another command; nothing was done.', 'เครื่องกำลังทำคำสั่งอื่น ยังไม่ได้ทำ') : t('No valid answer: ', 'ไม่ได้คำตอบที่ถูกต้อง: ') + f.label;
        var head = (r.ok ? '✓ ' : '✗ ') + f.label;
        if (f.action === 'printer_fix') return head + ' · ' + t('jobs before ', 'งานค้างก่อน ') + r.before + t(', after ', ' · หลัง ') + r.after + ' · Spooler ' + r.spooler;
        if (f.action === 'fonts') return head + ' · ' + t('installed ', 'ติดตั้งใหม่ ') + r.installed + t(', already there ', ' · มีอยู่แล้ว ') + r.skipped + (r.failed && r.failed.length ? t(', failed ', ' · ไม่สำเร็จ ') + r.failed.length : '') + (r.installed ? t(' · reopen Word/Excel to see them', ' · ปิดเปิด Word/Excel ใหม่จึงจะเห็นฟอนต์') : '');
        if (f.action === 'dns_flush') return head + (r.resolves ? t(' · names resolve again', ' · แปลงชื่อเว็บได้แล้ว') : t(' · names still do not resolve', ' · ยังแปลงชื่อเว็บไม่ได้ (ตรวจเน็ต/DNS server)'));
        if (f.action === 'trim' && !r.ok) return head + ' · ' + (r.error || '');
        if (f.action === 'printer_test' && !r.ok) return head + ' · ' + t('code ', 'รหัส ') + r.code;
        return head;
    }
    function log(nodeid, action, r) {
        if (!root.ScpOperations) return;
        root.ScpOperations.request('healthLog', { nodeid: nodeid, fix: action, ok: !!(r && r.ok), result: r || null }).catch(function () { });
    }

    /* ---------- reading the answer ---------- */
    // Slow or hanging, from what Windows recorded; null when it keeps up. The reasons say what was
    // seen, the advice what usually fixes it on this kind of computer.
    function slowVerdict(d) {
        var s = d && d.slow;
        if (!s) return null;
        var reasons = [], advice = [];
        var apps = function (list) { return (list || []).map(function (a) { return a.name.replace(/\.exe$/i, '') + ' ' + a.n; }).join(', '); };
        if (s.hangs7d >= 5) reasons.push(t('programs stopped responding ', 'โปรแกรมค้าง (Not Responding) ') + s.hangs7d + t(' times in 7 days', ' ครั้งใน 7 วัน') + (s.hangApps && s.hangApps.length ? ' (' + apps(s.hangApps) + ')' : ''));
        if (s.crashes7d >= 5) reasons.push(t('programs crashed ', 'โปรแกรมเด้งปิดเอง ') + s.crashes7d + t(' times in 7 days', ' ครั้งใน 7 วัน') + (s.crashApps && s.crashApps.length ? ' (' + apps(s.crashApps) + ')' : ''));
        if (s.lowMem30d >= 1) reasons.push(t('Windows warned of low memory ', 'Windows เตือนหน่วยความจำไม่พอ ') + s.lowMem30d + t(' times in 30 days', ' ครั้งใน 30 วัน'));
        if (d.ramPct >= 90) reasons.push(t('memory ', 'แรมถูกใช้ ') + d.ramPct + '%');
        if (s.bootSec >= 120) reasons.push(t('start-up took ', 'เปิดเครื่องใช้เวลา ') + Math.round(s.bootSec / 60 * 10) / 10 + t(' min', ' นาที'));
        if (!reasons.length) return null;
        if (d.ramGb && d.ramGb <= 4.5) advice.push(t('add RAM to 8 GB (~1,200 baht)', 'เพิ่มแรมเป็น 8 GB (~1,200 บาท)'));
        else if (d.ramGb && d.ramGb <= 8.5 && (d.ramPct >= 85 || s.lowMem30d >= 1)) advice.push(t('add RAM to 16 GB', 'เพิ่มแรมเป็น 16 GB'));
        if (/HDD/i.test(d.diskType)) advice.push(t('replace the HDD with an SSD (~1,500 baht)', 'เปลี่ยน HDD เป็น SSD (~1,500 บาท)'));
        var big = (d.top || []).filter(function (p) { return p.mb >= 1500 && !/Memory Compression|System|MsMpEng/i.test(p.name); })[0];
        if (big) advice.push(t('check ', 'ตรวจโปรแกรม ') + big.name + ' (' + big.mb + ' MB)');
        if (d.upDays >= 7) advice.push(t('restart it', 'รีสตาร์ทเครื่อง'));
        if (!advice.length) advice.push(t('look at the programs listed', 'ตรวจโปรแกรมที่ระบุ'));
        return { reasons: reasons, advice: advice };
    }
    // How healthy one disk is, as a single percentage the staff can compare.
    // Start from what is left of its life: an SSD reports that itself (SMART 231/233/177/202/169,
    // or Windows' wear counter); a spinning disk is counted down after 30,000 hours on (~3.5 years
    // running all day). Bad sectors then take it down: ones already swapped for spares (5), ones
    // waiting to be swapped (197) and ones that could not be read at all (198) cost more each.
    // Windows or SMART saying it is about to fail caps it at 10%.
    function diskVerdict(k) {
        var n = function (v) { return typeof v === 'number' && v > 0 ? v : 0; };
        var ssd = /SSD/i.test(k.type) || /NVMe/i.test(k.bus);
        var life = 100, reasons = [];
        if (ssd && k.life > 0) life = k.life;
        if (ssd && k.wear > 0) life = Math.min(life, 100 - k.wear);
        if (!ssd && k.poh > 30000) life -= Math.min(30, Math.floor((k.poh - 30000) / 1000));
        var pct = life;
        if (n(k.realloc)) pct -= Math.min(30, 5 + Math.floor(k.realloc / 10));
        if (n(k.pending)) pct -= Math.min(30, 10 + k.pending);
        if (n(k.uncorr)) pct -= Math.min(30, 10 + k.uncorr);
        if (n(k.reported)) pct -= Math.min(30, 5 + k.reported);
        if (n(k.rdErr)) pct -= Math.min(15, 2 + k.rdErr);
        if (/Warning/i.test(k.health)) pct = Math.min(pct, 50);
        var failing = !!k.fail || n(k.below) > 0 || /Unhealthy/i.test(k.health);
        if (failing) pct = Math.min(pct, 10);
        pct = Math.max(0, Math.min(100, Math.round(pct)));
        var badSectors = n(k.realloc) + n(k.pending) + n(k.uncorr);
        var hot = k.temp >= (ssd ? 70 : 55);
        if (badSectors) reasons.push(t('bad sectors ', 'bad sector ') + badSectors + ' (' + [n(k.realloc) ? t('moved ', 'ย้ายแล้ว ') + k.realloc : '', n(k.pending) ? t('waiting ', 'รอย้าย ') + k.pending : '', n(k.uncorr) ? t('unreadable ', 'อ่านไม่ได้ ') + k.uncorr : ''].filter(Boolean).join(', ') + ')');
        if (failing) reasons.push(t('Windows/SMART predicts failure', 'Windows/SMART เตือนว่าใกล้เสีย'));
        if (n(k.reported) || n(k.rdErr)) reasons.push(t('read errors ', 'อ่านข้อมูลพลาด ') + Math.max(n(k.reported), n(k.rdErr)) + t(' times', ' ครั้ง'));
        if (!ssd && k.poh > 30000) reasons.push(t('old: spinning disks often fail after ~5 years', 'อายุมาก: ดิสก์จานหมุนมักเริ่มเสียหลัง ~5 ปี'));
        if (n(k.crc)) reasons.push(t('cable errors ', 'สายข้อมูลมีปัญหา ') + k.crc + t(' (check the SATA cable)', ' ครั้ง (ลองเปลี่ยนสาย SATA)'));
        if (hot) reasons.push(t('hot ', 'ร้อน ') + k.temp + '°C');
        var level = (failing || pct < 40) ? 'bad' : (pct < 80 || badSectors > 0 || n(k.reported) > 0 || hot) ? 'warn' : 'ok';
        return { pct: pct, level: level, ssd: ssd, badSectors: badSectors, years: k.poh > 0 ? Math.round(k.poh / 876) / 10 : null, known: !!k.smart || k.wear >= 0, reasons: reasons };
    }
    // The computer's own disks: a flash drive left in is not one of them.
    function ownDisks(disks) { return (disks || []).filter(function (k) { return !/USB/i.test(k.bus); }); }
    function diskMix(own) {
        var ssd = own.filter(function (k) { return diskVerdict(k).ssd; }).length, hdd = own.length - ssd;
        return [ssd ? 'SSD ' + ssd : '', hdd ? 'HDD ' + hdd : ''].filter(Boolean).join(' · ');
    }
    function diskLine(k, v) {
        var parts = [v.badSectors ? '' : t('no bad sectors', 'ไม่มี bad sector')];
        if (v.years != null) parts.push(t('on for ', 'เปิดใช้มาแล้ว ') + v.years + t(' years', ' ปี'));
        if (k.temp > 0) parts.push(k.temp + '°C');
        if (v.ssd && (k.life > 0 || k.wear > 0)) parts.push(t('SSD life left ', 'อายุ SSD เหลือ ') + (k.life > 0 ? k.life : 100 - k.wear) + '%');
        if (!v.known) parts.push(t('SMART not readable: estimate from Windows only', 'อ่าน SMART ไม่ได้ ประเมินจาก Windows อย่างเดียว'));
        return v.reasons.concat(parts.filter(Boolean)).join(' · ');
    }
    // Minutes as something a person reads: 45 min, 6 hours, 782 days.
    function age(min) {
        if (min < 120) return min + t(' min', ' นาที');
        if (min < 2880) return Math.round(min / 60) + t(' hours', ' ชั่วโมง');
        return Math.round(min / 1440) + t(' days', ' วัน');
    }
    function findings(d) {
        var out = [], add = function (cat, level, title, detail, fixes) { out.push({ cat: cat, level: level, title: title, detail: detail || '', fixes: fixes || [] }); };
        var SYS = t('System', 'ระบบ'), HW = t('Hardware', 'ฮาร์ดแวร์'), NET = t('Network', 'เครือข่าย'), PRN = t('Printers', 'เครื่องพิมพ์'), SPD = t('Speed and upkeep', 'ความเร็วและการดูแล'), FNT = t('Fonts', 'ฟอนต์');
        // Slow or hanging comes first: it is what the people using the computer feel, and the
        // hospital wants to hear about it before anything else. A computer that cannot take
        // Windows 11 stays on Windows 10; what matters is whether it still keeps up.
        var sv = slowVerdict(d);
        if (sv) {
            var f = { cat: t('Slow / hanging', 'ค้าง / ช้า'), level: 'bad', slow: true, title: t('This computer is slow or hangs', 'เครื่องนี้ค้าง/ช้า'), detail: sv.reasons.join(' · ') + (sv.advice.length ? t(' → ', ' → แนะนำ: ') + sv.advice.join(', ') : ''), fixes: [] };
            out.push(f);
        }
        // system
        if (d.upDays >= 14) add(SYS, 'bad', t('On for ', 'เปิดต่อเนื่อง ') + Math.floor(d.upDays) + t(' days', ' วัน'), t('A restart clears memory leaks and finishes updates.', 'ควรรีสตาร์ท ช่วยคืนหน่วยความจำและให้อัปเดตทำงานครบ'));
        else if (d.upDays >= 7) add(SYS, 'warn', t('On for ', 'เปิดต่อเนื่อง ') + Math.floor(d.upDays) + t(' days', ' วัน'), t('Restart when convenient.', 'ควรรีสตาร์ทเมื่อสะดวก'));
        else add(SYS, 'ok', t('Uptime ', 'เปิดมาแล้ว ') + d.upDays + t(' days', ' วัน'));
        if (d.pendingReboot) add(SYS, 'warn', t('Updates are waiting for a restart', 'มีอัปเดตรอรีสตาร์ท'));
        if (d.lastUpdateDays > 60) add(SYS, 'warn', t('Last update ', 'อัปเดตล่าสุด ') + d.lastUpdateDays + t(' days ago', ' วันก่อน'), t('Windows Update may be stuck.', 'Windows Update อาจค้าง ควรตรวจ'));
        else if (d.lastUpdateDays >= 0) add(SYS, 'ok', t('Last update ', 'อัปเดตล่าสุด ') + d.lastUpdateDays + t(' days ago', ' วันก่อน'));
        // Power cut without shutting down is routine at the end of the day here, so it is only noted;
        // a blue screen is a real fault.
        if (d.bsod14d > 0) add(SYS, 'bad', t('Blue screens: ', 'จอฟ้า (Windows ล่ม) ') + d.bsod14d + t(' in 14 days', ' ครั้งใน 14 วัน'), t('Usually a driver, RAM or the disk: check drivers and run a memory test.', 'มักเกิดจากไดรเวอร์ แรม หรือดิสก์ — ตรวจไดรเวอร์และทดสอบแรม'));
        if (d.crashes14d > 0) add(SYS, 'info', t('Switched off without shutting down: ', 'ปิดเครื่องโดยไม่ได้สั่ง Shut down ') + d.crashes14d + t(' times in 14 days', ' ครั้งใน 14 วัน'), t('Power cut, power button held, or the power strip switched off. Frequent cuts during working hours point to the UPS.', 'ไฟดับ กดปุ่มค้าง หรือปิดสวิตช์ปลั๊กพ่วง ถ้าเกิดบ่อยระหว่างเวลาทำงานให้ตรวจ UPS'));
        if (d.errors24h > 50) add(SYS, 'bad', t('System errors (24 h): ', 'Error ในระบบ 24 ชม.: ') + d.errors24h);
        else if (d.errors24h > 10) add(SYS, 'warn', t('System errors (24 h): ', 'Error ในระบบ 24 ชม.: ') + d.errors24h);
        (d.stoppedServices || []).forEach(function (s) { add(SYS, 'bad', t('Service stopped: ', 'บริการหยุดทำงาน: ') + s, '', [{ label: t('Start', 'เปิดบริการ'), action: 'svc_start', arg: s }]); });
        // hardware
        if (d.ramPct >= 90) add(HW, 'bad', 'RAM ' + d.ramPct + '% ' + t('used', 'ถูกใช้') + ' (' + d.ramGb + ' GB)', t('See the biggest programs below.', 'ดูโปรแกรมที่กินแรมมากสุดด้านล่าง'));
        else if (d.ramPct >= 80) add(HW, 'warn', 'RAM ' + d.ramPct + '% ' + t('used', 'ถูกใช้') + ' (' + d.ramGb + ' GB)');
        else add(HW, 'ok', 'RAM ' + d.ramPct + '% ' + t('used', 'ถูกใช้') + ' (' + d.ramGb + ' GB)');
        if (d.cpu >= 90) add(HW, 'bad', 'CPU ' + d.cpu + '%'); else if (d.cpu >= 75) add(HW, 'warn', 'CPU ' + d.cpu + '%');
        var freePct = d.diskGb ? Math.round(d.freeGb / d.diskGb * 100) : 100;
        var cleanFix = root.ScpCleanup ? [{ label: t('Clean temp files', 'ล้างไฟล์ชั่วคราว'), cleanup: true }] : [];
        if (freePct < 10) add(HW, 'bad', t('Drive C: ', 'ไดรฟ์ C: เหลือ ') + d.freeGb + ' GB (' + freePct + '%)', '', cleanFix);
        else if (freePct < 20) add(HW, 'warn', t('Drive C: ', 'ไดรฟ์ C: เหลือ ') + d.freeGb + ' GB (' + freePct + '%)', '', cleanFix);
        else add(HW, 'ok', t('Drive C: ', 'ไดรฟ์ C: เหลือ ') + d.freeGb + ' GB (' + freePct + '%)');
        var own = ownDisks(d.disks);
        if (own.length) add(HW, 'ok', t('Disks in this computer: ', 'ดิสก์ในเครื่องนี้ ') + own.length + t('', ' ลูก') + ' (' + diskMix(own) + ')',
            own.map(function (k, i) { return (i + 1) + '. ' + (k.sys ? 'C: ' : '') + k.n + ' ' + k.gb + 'GB ' + (diskVerdict(k).ssd ? 'SSD' : 'HDD'); }).join(' · '));
        own.forEach(function (k, i) {
            var v = diskVerdict(k), name = (own.length > 1 ? t('disk ', 'ลูกที่ ') + (i + 1) + '/' + own.length + ' ' : '') + (k.sys ? 'C: ' : '') + k.n + ' ' + k.gb + 'GB ' + (v.ssd ? 'SSD' : 'HDD');
            var advice = v.level === 'bad' ? t(' Back up now and replace this disk.', ' สำรองข้อมูลด่วนแล้วเปลี่ยนดิสก์') : v.badSectors ? t(' Back up and watch whether the count grows.', ' สำรองข้อมูลไว้ และดูว่าจำนวนเพิ่มขึ้นไหม') : '';
            add(HW, v.level, t('Disk health ', 'สุขภาพดิสก์ ') + v.pct + '% — ' + name, diskLine(k, v) + advice);
        });
        if (!d.disks && (d.smart > 0 || (d.diskHealth && !/^Healthy$/i.test(d.diskHealth) && !/Unknown/i.test(d.diskHealth)))) add(HW, 'bad', t('Disk is failing', 'ดิสก์เริ่มเสีย'), t('Back up now and replace it.', 'สำรองข้อมูลด่วนแล้วเปลี่ยนดิสก์'));
        if (/HDD/i.test(d.diskType)) add(HW, 'warn', t('Spinning hard disk (HDD)', 'ใช้ฮาร์ดดิสก์จานหมุน (HDD)'), t('An SSD (~1,500 baht) makes it start and open programs several times faster.', 'เปลี่ยนเป็น SSD (~1,500 บาท) เปิดเครื่องและโปรแกรมเร็วขึ้นหลายเท่า'));
        if ((d.badDevices || []).length) add(HW, 'warn', t('Devices with problems: ', 'อุปกรณ์มีปัญหา: ') + d.badDevices.length, d.badDevices.join(', '));
        // network
        if (!(d.adapters || []).length) add(NET, 'bad', t('No network adapter connected', 'ไม่พบการ์ดแลนที่เชื่อมต่อ'));
        if (/^169\.254\./.test(d.ip || '')) add(NET, 'bad', t('Self-assigned IP ', 'ได้ IP อัตโนมัติ ') + d.ip, t('DHCP did not answer.', 'DHCP ไม่ตอบ ตรวจสาย/สวิตช์'));
        // many routers simply ignore ping, so a silent gateway only matters when nothing else gets through either
        else if (d.ip) add(NET, d.gwOk || d.dnsOk || d.netOk ? 'ok' : 'bad', 'IP ' + d.ip + ' · Gateway ' + (d.gw || '-'), d.gwOk ? '' : (d.dnsOk || d.netOk ? t('The gateway ignores ping, but the network works.', 'Gateway ไม่ตอบ ping แต่เครือข่ายใช้งานได้ปกติ') : t('The gateway does not answer: check the cable and switch.', 'Gateway ไม่ตอบ ตรวจสายแลน/สวิตช์')));
        if (!d.dnsOk) add(NET, 'bad', t('Names do not resolve (DNS)', 'แปลงชื่อเว็บไม่ได้ (DNS)'), '', [{ label: t('Flush DNS', 'ล้าง DNS'), action: 'dns_flush' }]);
        if (!d.netOk && d.dnsOk) add(NET, 'warn', t('Ping to the internet blocked', 'ping ออกอินเทอร์เน็ตไม่ได้ (อาจถูกปิดไว้)'));
        // printers
        if (d.spooler && d.spooler !== 'Running') add(PRN, 'bad', t('Print spooler is ', 'Print Spooler ') + d.spooler, '', [{ label: t('Restart spooler', 'รีสตาร์ท Spooler'), action: 'spooler_restart' }]);
        if (d.jobs > 0) {
            var stuck = d.oldestJobMin >= 5;
            add(PRN, stuck ? 'bad' : 'warn', t('Print jobs waiting: ', 'งานพิมพ์รอคิว ') + d.jobs + (d.oldestJobMin ? t(' (oldest ', ' (นานสุด ') + age(d.oldestJobMin) + ')' : ''),
                stuck ? t('Jobs this old are stuck.', 'งานค้างนานขนาดนี้คือค้างแล้ว') : '', [{ label: t('Fix printing', 'แก้ปริ้นไม่ออก'), action: 'printer_fix' }]);
        } else if (d.spooler === 'Running') add(PRN, 'ok', t('Print queue empty', 'ไม่มีงานพิมพ์ค้าง'));
        (d.printers || []).forEach(function (p) {
            var st = String(p.status || 'Normal');
            if (/Paused/i.test(st)) add(PRN, 'warn', p.name + t(' is paused', ' ถูกหยุดไว้ (Paused)'), '', [{ label: t('Resume', 'ให้ทำงานต่อ'), action: 'printer_resume', arg: p.name }]);
            else if (/Error|Offline|Jam|PaperOut|NotAvailable|NoToner|DoorOpen/i.test(st)) add(PRN, 'bad', p.name + ' · ' + st, /Offline|NotAvailable/i.test(st) ? t('Check the printer is on and its cable/network.', 'ตรวจว่าเปิดเครื่องพิมพ์และสาย/เน็ตต่ออยู่') : /Jam/i.test(st) ? t('Paper jam: open the printer and clear it.', 'กระดาษติด เปิดเครื่องพิมพ์แล้วดึงกระดาษออก') : /PaperOut/i.test(st) ? t('Out of paper.', 'กระดาษหมด') : '');
            else if (/TonerLow|PaperProblem|UserIntervention/i.test(st)) add(PRN, 'warn', p.name + ' · ' + st, /Toner/i.test(st) ? t('Toner is low: order a cartridge.', 'หมึกใกล้หมด ควรเตรียมตลับใหม่') : '');
        });
        if (d.scpprint && d.scpprint.installed) add(PRN, d.scpprint.running ? 'ok' : 'bad', 'SCPPrint ' + (d.scpprint.running ? t('is running (shares printers)', 'ทำงานอยู่ (แชร์เครื่องพิมพ์)') : t('is installed but not running', 'ติดตั้งไว้แต่ไม่ได้เปิด')), d.scpprint.running ? '' : t('Other computers cannot print through it until it is opened.', 'เครื่องอื่นปริ้นผ่านเครื่องนี้ไม่ได้จนกว่าจะเปิด SCPPrint'));
        // speed and upkeep
        var on = (d.startup || []).filter(function (s) { return s.on; }).length;
        if (on > 8) add(SPD, 'warn', t('Start-up programs: ', 'โปรแกรมเปิดพร้อมเครื่อง ') + on, t('Turning off ones not needed makes start-up faster (list below).', 'ปิดตัวที่ไม่จำเป็นช่วยให้เปิดเครื่องเร็วขึ้น (รายการด้านล่าง)'));
        else add(SPD, 'ok', t('Start-up programs: ', 'โปรแกรมเปิดพร้อมเครื่อง ') + on);
        if (d.tempMb >= 2000) add(SPD, 'warn', t('Temporary files: ', 'ไฟล์ชั่วคราว ') + (d.tempMb / 1024).toFixed(1) + ' GB', '', cleanFix);
        else if (d.tempMb >= 0) add(SPD, 'ok', t('Temporary files: ', 'ไฟล์ชั่วคราว ') + d.tempMb + ' MB');
        var plan = (String(d.power || '').match(/\(([^)]+)\)/) || [])[1] || '';
        if (/saver|ประหยัด/i.test(plan)) add(SPD, 'warn', t('Power plan: ', 'โหมดพลังงาน: ') + plan, t('Power saver slows the processor; Balanced is better for work.', 'โหมดประหยัดพลังงานทำให้ CPU ช้า ควรใช้ Balanced'), [{ label: t('Set Balanced', 'ตั้งเป็น Balanced'), action: 'power_balanced' }]);
        if (/SSD/i.test(d.diskType)) add(SPD, 'ok', t('SSD drive', 'ใช้ SSD'), t('TRIM keeps an SSD as fast as new; Windows does it weekly, this does it now.', 'TRIM ช่วยให้ SSD เร็วเหมือนใหม่ (Windows ทำทุกสัปดาห์ กดเพื่อทำตอนนี้)'), [{ label: 'TRIM', action: 'trim' }]);
        // how Windows was installed
        var ins = d.install;
        if (ins) {
            var WIN = t('How Windows was installed', 'การติดตั้ง Windows');
            var strong = [];
            if (ins.brand) strong.push(t('named “', 'มีชื่อ “') + ins.brand + t('” in its system details', '” ในข้อมูลระบบ'));
            if (ins.noDefender) strong.push(t('Windows Defender has been removed', 'ไม่มี Windows Defender ในเครื่อง (ถูกถอดออก)'));
            if (ins.noUpdate) strong.push(t('Windows Update has been removed', 'ไม่มีบริการ Windows Update (ถูกถอดออก)'));
            var bypass = (ins.bypass || []).slice();
            if (ins.moSetup) bypass.push('AllowUpgradesWithUnsupportedTPMOrCPU');
            if (ins.unattendBypass) bypass.push(t('setup answer file', 'ไฟล์ unattend ตอนติดตั้ง'));
            // The hospital's rule: any Windows counts as working Windows, modified or not. These are
            // kept as plain notes (grey, never counted as problems) for when security is planned.
            if (strong.length) add(WIN, 'info', t('Modified Windows build', 'Windows ฉบับดัดแปลง'), strong.join(' · '));
            if (bypass.length) add(WIN, 'info', t('Installed past the Windows 11 checks', 'ลงแบบข้ามเกณฑ์ Windows 11'), bypass.join(', '));
            if (ins.updateDisabled) add(WIN, 'info', t('Windows Update is disabled', 'ปิด Windows Update ไว้'));
            if (!strong.length && !bypass.length) add(WIN, 'ok', t('Installed the normal way', 'ติดตั้งแบบปกติ (ไม่พบร่องรอยดัดแปลงหรือข้ามเกณฑ์)'));
            if (ins.noEdge && !strong.length) add(WIN, 'info', t('Microsoft Edge is not installed', 'ไม่มี Microsoft Edge'), t('Often removed by modified builds; on its own it may just have been uninstalled.', 'ฉบับดัดแปลงมักถอด Edge ออก แต่ถ้าเจอแค่ข้อนี้อาจเป็นการถอนการติดตั้งปกติ'));
        }
        // hospital programs
        if (d.synapseHost === false) add(t('Hospital programs', 'โปรแกรม รพ.'), 'info', t('PACS (Synapse) name not set', 'ยังไม่ได้ตั้งชื่อเครื่อง PACS (Synapse)'), t('Needed only where X-ray images are viewed: http://syn5scph/synapse', 'จำเป็นเฉพาะเครื่องที่ดูภาพเอกซเรย์: http://syn5scph/synapse'), [{ label: t('Add', 'เพิ่ม'), action: 'synapse_hosts' }]);
        else if (d.synapseHost) add(t('Hospital programs', 'โปรแกรม รพ.'), 'ok', t('PACS (Synapse) reachable by name', 'ตั้งชื่อเครื่อง PACS (Synapse) แล้ว'));
        // fonts
        var miss = d.fontsMissing || [];
        if (miss.length) add(FNT, 'warn', t('Thai fonts missing: ', 'ยังไม่มีฟอนต์ไทย ') + miss.length + t(' styles', ' แบบ'), miss.slice(0, 6).join(', ').replace(/ \(TrueType\)/g, '') + (miss.length > 6 ? '…' : ''), [{ label: t('Install Thai fonts', 'ติดตั้งฟอนต์ไทย'), action: 'fonts' }]);
        else if (fontsWanted().length) add(FNT, 'ok', t('Thai fonts installed (TH Sarabun New, national fonts, Sarabun…)', 'มีฟอนต์ไทยครบ (TH Sarabun New, ฟอนต์แห่งชาติ, Sarabun…)'));
        if (!d.thSarabun) add(FNT, 'warn', t('TH Sarabun (government documents) not installed', 'ยังไม่มีฟอนต์ TH Sarabun (ใช้ในหนังสือราชการ)'), t('Included in Install Thai fonts: TH Sarabun New, TH SarabunIT9, TH SarabunPSK.', 'มีในปุ่มติดตั้งฟอนต์ไทย: TH Sarabun New, TH SarabunIT๙, TH SarabunPSK'), miss.length ? [] : [{ label: t('Install Thai fonts', 'ติดตั้งฟอนต์ไทย'), action: 'fonts' }]);
        return out;
    }

    /* ---------- the technician's work order: what to do on this computer, most urgent first ---------- */
    // The findings say what is wrong; this says what to do about it, in the order to do it, with
    // the part and a rough price when one is needed, and whether it can be done from here or
    // someone has to go to the computer. 1 = now (data at risk or people cannot work),
    // 2 = soon, 3 = plan it (upgrade or tidy-up).
    var PRICE = { ssd: 1500, ram8: 1200 };
    function workOrder(d) {
        var out = [];
        var task = function (pri, title, why, o) { out.push(Object.assign({ pri: pri, title: title, why: why || '', steps: [], fix: null, part: null, onsite: false }, o || {})); };
        var own = ownDisks(d.disks), sysHdd = false;
        own.forEach(function (k, i) {
            var v = diskVerdict(k), name = (own.length > 1 ? t('disk ', 'ลูกที่ ') + (i + 1) + ' ' : '') + k.n + ' ' + k.gb + 'GB' + (k.sys ? ' (C:)' : '');
            if (k.sys && !v.ssd) sysHdd = true;
            if (v.level === 'bad') task(1, t('Replace ', 'เปลี่ยนดิสก์ ') + name, t('Health ', 'สุขภาพ ') + v.pct + '% · ' + v.reasons.join(' · '), {
                steps: [t('Back up the data on it today', 'สำรองข้อมูลในลูกนี้ออกวันนี้'), k.sys ? t('Fit an SSD and reinstall or clone Windows', 'ใส่ SSD ใหม่ แล้วลง Windows ใหม่หรือโคลนจากลูกเดิม') : t('Fit a new disk and copy the data back', 'ใส่ดิสก์ใหม่ แล้วคืนข้อมูลกลับ')],
                part: { name: 'SSD ' + (k.gb > 300 ? '512GB' : '256GB'), baht: PRICE.ssd }, onsite: true });
            else if (v.badSectors) task(2, t('Back up ', 'สำรองข้อมูลจาก') + name + t(' and watch it', ' แล้วเฝ้าดู'), v.reasons.join(' · '), { steps: [t('Copy important files off it', 'ก๊อปไฟล์สำคัญออก'), t('If bad sectors grow on the next check, replace it', 'ถ้า bad sector เพิ่มในการตรวจครั้งหน้า ให้เปลี่ยน')] });
            else if (v.level === 'warn') task(3, t('Plan to replace ', 'วางแผนเปลี่ยน ') + name, t('Health ', 'สุขภาพ ') + v.pct + '% · ' + v.reasons.join(' · '), { part: { name: 'SSD', baht: PRICE.ssd }, onsite: true });
        });
        if (!d.disks && (d.smart > 0 || (d.diskHealth && !/^Healthy$|Unknown/i.test(d.diskHealth)))) task(1, t('Replace the disk', 'เปลี่ยนดิสก์'), t('Windows says the disk is failing', 'Windows แจ้งว่าดิสก์ใกล้เสีย'), { part: { name: 'SSD', baht: PRICE.ssd }, onsite: true });
        if (d.bsod14d > 0) task(1, t('Find the cause of the blue screens', 'หาสาเหตุจอฟ้า'), d.bsod14d + t(' in 14 days', ' ครั้งใน 14 วัน'), { steps: [t('Update or roll back the newest driver', 'อัปเดต/ย้อนไดรเวอร์ตัวล่าสุด'), t('Run Windows Memory Diagnostic', 'รัน Windows Memory Diagnostic ทดสอบแรม'), t('Check the disk health above', 'ดูสุขภาพดิสก์ด้านบน')], onsite: true });
        (d.stoppedServices || []).forEach(function (s) { task(1, t('Start the service ', 'เปิดบริการ ') + s, t('It is set to start but is stopped', 'ตั้งให้ทำงานแต่หยุดอยู่'), { fix: { label: t('Start', 'เปิดบริการ'), action: 'svc_start', arg: s } }); });
        if (/^169\.254\./.test(d.ip || '') || !(d.adapters || []).length) task(1, t('Fix the network connection', 'แก้การเชื่อมต่อเครือข่าย'), d.ip ? t('Self-assigned IP ', 'ได้ IP อัตโนมัติ ') + d.ip : t('No network adapter connected', 'ไม่พบการ์ดแลนที่เชื่อมต่อ'), { steps: [t('Check the cable and the switch port', 'ตรวจสายแลนและพอร์ตสวิตช์')], onsite: true });
        else if (d.dnsOk === false) task(1, t('Fix name lookups (DNS)', 'แก้ DNS'), t('Web and server names do not resolve', 'แปลงชื่อเว็บ/เซิร์ฟเวอร์ไม่ได้'), { fix: { label: t('Flush DNS', 'ล้าง DNS'), action: 'dns_flush' } });
        if (d.spooler && d.spooler !== 'Running') task(1, t('Restart printing', 'เปิด Print Spooler'), 'Print Spooler ' + d.spooler, { fix: { label: t('Restart spooler', 'รีสตาร์ท Spooler'), action: 'spooler_restart' } });
        else if (d.jobs > 0 && d.oldestJobMin >= 5) task(1, t('Clear stuck printing', 'ล้างงานพิมพ์ค้าง'), d.jobs + t(' jobs, oldest ', ' งาน นานสุด ') + age(d.oldestJobMin), { fix: { label: t('Fix printing', 'แก้ปริ้นไม่ออก'), action: 'printer_fix' } });
        if (d.scpprint && d.scpprint.installed && !d.scpprint.running) task(1, t('Start SCPPrint', 'เปิด SCPPrint'), t('Other computers print through it', 'เครื่องอื่นปริ้นผ่านเครื่องนี้'), { onsite: true });
        var freePct = d.diskGb ? Math.round(d.freeGb / d.diskGb * 100) : 100;
        if (freePct < 20) task(freePct < 10 ? 1 : 2, t('Free up drive C:', 'เคลียร์พื้นที่ไดรฟ์ C:'), t('Free ', 'เหลือ ') + d.freeGb + ' GB (' + freePct + '%)', { fix: root.ScpCleanup ? { label: t('Clean temp files', 'ล้างไฟล์ชั่วคราว'), cleanup: true } : null });
        var sv = slowVerdict(d);
        if (sv) task(1, t('Sort out the slowness', 'แก้เครื่องค้าง/ช้า'), sv.reasons.join(' · '), { steps: sv.advice });
        if (d.ramGb && d.ramGb <= 4.5) task(sv || d.ramPct >= 80 ? 2 : 3, t('Add RAM to 8 GB', 'เพิ่มแรมเป็น 8 GB'), t('Has ', 'มี ') + d.ramGb + t(' GB, ', ' GB ใช้อยู่ ') + d.ramPct + '%', { part: { name: 'RAM 8GB', baht: PRICE.ram8 }, onsite: true });
        if (sysHdd || (!d.disks && /HDD/i.test(d.diskType))) task(sv ? 2 : 3, t('Swap the Windows disk for an SSD', 'เปลี่ยนดิสก์ Windows (C:) เป็น SSD'), t('A spinning disk is the slowest part of this computer', 'ดิสก์จานหมุนคือส่วนที่ช้าที่สุดของเครื่อง'), { part: { name: 'SSD 256GB', baht: PRICE.ssd }, onsite: true });
        if ((d.badDevices || []).length) task(2, t('Install missing drivers', 'ลงไดรเวอร์ที่ขาด/มีปัญหา'), d.badDevices.join(', '), { steps: [t('Look in the driver library', 'ดูใน คลังไดรเวอร์'), t('or the maker\'s site by model', 'หรือเว็บผู้ผลิตตามรุ่นเครื่อง')] });
        if (d.upDays >= 14 || d.pendingReboot) task(2, t('Restart the computer', 'รีสตาร์ทเครื่อง'), [d.upDays >= 14 ? t('on for ', 'เปิดต่อเนื่อง ') + Math.floor(d.upDays) + t(' days', ' วัน') : '', d.pendingReboot ? t('updates are waiting', 'มีอัปเดตรอรีสตาร์ท') : ''].filter(Boolean).join(' · '), { steps: [t('Ask the user first, at a quiet time', 'แจ้งผู้ใช้ก่อน ทำช่วงว่าง')] });
        if (d.lastUpdateDays > 60) task(2, t('Check Windows Update', 'ตรวจ Windows Update'), t('Last update ', 'อัปเดตล่าสุด ') + d.lastUpdateDays + t(' days ago', ' วันก่อน'));
        if (d.errors24h > 50) task(2, t('Look into system errors', 'ตรวจ Error ในระบบ'), d.errors24h + t(' in 24 h (Event Viewer → System)', ' ครั้งใน 24 ชม. (Event Viewer → System)'));
        (d.printers || []).forEach(function (p) {
            var st = String(p.status || '');
            if (/Paused/i.test(st)) task(2, t('Resume printer ', 'ให้เครื่องพิมพ์ทำงานต่อ: ') + p.name, st, { fix: { label: t('Resume', 'ให้ทำงานต่อ'), action: 'printer_resume', arg: p.name } });
            else if (/Offline|NotAvailable|Error|Jam|PaperOut|DoorOpen|NoToner/i.test(st)) task(2, t('Check printer ', 'ตรวจเครื่องพิมพ์ ') + p.name, st, { steps: [t('Power, cable/network, paper, door', 'ไฟ สาย/เน็ต กระดาษ ฝาเครื่อง')], onsite: true });
            else if (/TonerLow/i.test(st)) task(3, t('Order toner for ', 'เตรียมหมึกให้ ') + p.name, st, { part: { name: t('Toner for ', 'หมึก ') + p.name, baht: 0 } });
        });
        // Switching off at the wall at the end of the day is routine here: a note in the findings, never a task.
        if ((d.fontsMissing || []).length || d.thSarabun === false) task(3, t('Install Thai fonts', 'ลงฟอนต์ไทย'), (d.fontsMissing || []).length + t(' styles missing', ' แบบที่ยังไม่มี'), { fix: { label: t('Install Thai fonts', 'ติดตั้งฟอนต์ไทย'), action: 'fonts' } });
        var on = (d.startup || []).filter(function (s) { return s.on; }).length;
        if (on > 8) task(3, t('Trim start-up programs', 'ลดโปรแกรมเปิดพร้อมเครื่อง'), on + t(' start with Windows', ' ตัว'), { steps: [t('Turn off the ones not needed (list in the health check)', 'ปิดตัวที่ไม่จำเป็น (รายการอยู่ในผลตรวจ)')] });
        if (d.tempMb >= 2000 && freePct >= 20) task(3, t('Clean temporary files', 'ล้างไฟล์ชั่วคราว'), (d.tempMb / 1024).toFixed(1) + ' GB', { fix: root.ScpCleanup ? { label: t('Clean temp files', 'ล้างไฟล์ชั่วคราว'), cleanup: true } : null });
        if (/saver|ประหยัด/i.test(String(d.power || ''))) task(3, t('Set power plan to Balanced', 'ตั้งโหมดพลังงานเป็น Balanced'), String(d.power || '').replace(/^.*\(|\).*$/g, ''), { fix: { label: 'Balanced', action: 'power_balanced' } });
        out.forEach(function (x, i) { x.order = i; });
        // within a priority the order above stands: data at risk before people who cannot work before the rest
        out.sort(function (a, b) { return a.pri - b.pri || a.order - b.order; });
        var baht = out.reduce(function (s, x) { return s + (x.part && x.part.baht || 0); }, 0);
        return { tasks: out, now: out.filter(function (x) { return x.pri === 1; }).length, soon: out.filter(function (x) { return x.pri === 2; }).length, plan: out.filter(function (x) { return x.pri === 3; }).length, baht: baht, onsite: out.filter(function (x) { return x.onsite; }).length };
    }
    var PRI = { 1: ['🔴', t('Now', 'ด่วน')], 2: ['🟡', t('Soon', 'ควรทำเร็ว')], 3: ['🔵', t('Plan', 'วางแผน')] };
    function baht(n) { return n.toLocaleString('en-US') + t(' baht', ' บาท'); }
    function workOrderBlock(node, d) {
        var w = workOrder(d);
        var box = el('div', null, 'scp-health-wo');
        var head = el('div', null, 'scp-health-wo-head');
        head.appendChild(el('h5', '🧰 ' + t('Work order', 'ใบงานช่าง')));
        if (w.tasks.length) head.appendChild(btn('🖨️ ' + t('Print', 'พิมพ์ใบงาน'), 'scp-health-btn', function () { printWorkOrder(node, d, w); }));
        box.appendChild(head);
        if (!w.tasks.length) { box.appendChild(el('p', t('✓ Nothing to do on this computer', '✓ เครื่องนี้ไม่มีงานค้าง'), 'scp-health-sum')); return box; }
        box.appendChild(el('p', [PRI[1][0] + ' ' + PRI[1][1] + ' ' + w.now, PRI[2][0] + ' ' + PRI[2][1] + ' ' + w.soon, PRI[3][0] + ' ' + PRI[3][1] + ' ' + w.plan].join('   ') +
            (w.onsite ? t(' · at the computer: ', ' · ต้องไปหน้าเครื่อง ') + w.onsite : '') + (w.baht ? t(' · parts ~', ' · ค่าอะไหล่ประมาณ ') + baht(w.baht) : ''), 'scp-health-hint'));
        var ol = el('ol', null, 'scp-health-wo-list');
        w.tasks.forEach(function (x) {
            var li = el('li', null, 'scp-health-wo-item p' + x.pri);
            var top = el('div', null, 'scp-health-wo-top');
            top.appendChild(el('strong', PRI[x.pri][0] + ' ' + x.title));
            top.appendChild(el('span', x.onsite ? t('at the computer', 'ไปหน้าเครื่อง') : t('from here', 'ทำจากที่นี่ได้'), 'scp-health-wo-where' + (x.onsite ? ' onsite' : '')));
            li.appendChild(top);
            if (x.why) li.appendChild(el('small', x.why));
            if (x.steps.length) li.appendChild(el('small', '→ ' + x.steps.join(' → ')));
            if (x.part) li.appendChild(el('small', '🔧 ' + x.part.name + (x.part.baht ? t(' · ~', ' · ประมาณ ') + baht(x.part.baht) : '')));
            if (x.fix) li.appendChild(btn(x.fix.label, 'scp-health-btn', function () {
                if (x.fix.cleanup) { root.ScpCleanup.run(node); return; }
                fixOne(node, x.fix.action, x.fix.arg, d);
            }));
            ol.appendChild(li);
        });
        box.appendChild(ol);
        return box;
    }
    function printWorkOrder(node, d, w) {
        var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
        var rows = w.tasks.map(function (x, i) {
            return '<tr><td>' + (i + 1) + '</td><td>' + PRI[x.pri][0] + ' ' + esc(PRI[x.pri][1]) + '</td><td><b>' + esc(x.title) + '</b>' + (x.why ? '<br><small>' + esc(x.why) + '</small>' : '') + (x.steps.length ? '<br><small>→ ' + esc(x.steps.join(' → ')) + '</small>' : '') +
                '</td><td>' + esc(x.onsite ? t('at the computer', 'หน้าเครื่อง') : t('remote', 'ทางไกล')) + '</td><td>' + (x.part ? esc(x.part.name) + (x.part.baht ? '<br>~' + esc(baht(x.part.baht)) : '') : '') + '</td><td class="box"></td></tr>';
        }).join('');
        var html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>' + esc(t('Work order ', 'ใบงานช่าง ') + (node.name || '')) + '</title><style>' +
            'body{font-family:"TH Sarabun New","Sarabun",Tahoma,sans-serif;font-size:16pt;margin:16mm;color:#000}h1{font-size:22pt;margin:0}p{margin:4px 0}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{border:1px solid #444;padding:4px 6px;vertical-align:top;text-align:left}small{font-size:13pt;color:#333}td.box{width:16mm}.sign{margin-top:24px;display:flex;justify-content:space-between}' +
            '</style></head><body><h1>🧰 ' + esc(t('Work order', 'ใบงานช่าง')) + ' — ' + esc(node.name || '') + '</h1>' +
            '<p>' + esc(t('Checked ', 'ตรวจเมื่อ ')) + esc(new Date((results[node._id] || {}).at || Date.now()).toLocaleString(th ? 'th-TH' : undefined)) + ' · ' + esc(d.os || '') + (d.ip ? ' · IP ' + esc(d.ip) : '') + (d.user ? ' · ' + esc(t('user ', 'ผู้ใช้ ')) + esc(d.user) : '') + '</p>' +
            '<p>' + esc(PRI[1][1]) + ' ' + w.now + ' · ' + esc(PRI[2][1]) + ' ' + w.soon + ' · ' + esc(PRI[3][1]) + ' ' + w.plan + (w.baht ? ' · ' + esc(t('parts ~', 'ค่าอะไหล่ประมาณ ')) + esc(baht(w.baht)) : '') + '</p>' +
            '<table><tr><th>#</th><th>' + esc(t('Priority', 'ความด่วน')) + '</th><th>' + esc(t('Task', 'งาน')) + '</th><th>' + esc(t('Where', 'ทำที่')) + '</th><th>' + esc(t('Part', 'อะไหล่')) + '</th><th>' + esc(t('Done', 'เสร็จ')) + '</th></tr>' + rows + '</table>' +
            '<div class="sign"><span>' + esc(t('Technician', 'ช่างผู้ดำเนินการ')) + ' ....................................</span><span>' + esc(t('Date', 'วันที่')) + ' ....................</span></div>' +
            '<script>window.onload=function(){window.print();}<\/script></body></html>';
        var win = root.open('', '_blank');
        if (!win) { root.alert(t('Allow pop-ups to print', 'กรุณาอนุญาตป๊อปอัปเพื่อพิมพ์')); return; }
        win.document.open(); win.document.write(html); win.document.close();
    }

    /* ---------- the section in the computer's details ---------- */
    var notes = {};
    function note(nodeid, text, tone) { notes[nodeid] = { text: text, tone: tone, at: Date.now() }; paint(nodeid); }
    function nodeById(id) { var list = root.ScpDashboard && root.ScpDashboard.nodes ? root.ScpDashboard.nodes() : (root.nodes || []); for (var i = 0; i < list.length; i++) if (list[i]._id === id) return list[i]; return null; }

    function section(node) {
        var box = el('section', null, 'scp-cm-section scp-health');
        box.dataset.nodeid = node._id;
        mounts[node._id] = { box: box, node: node };
        if (!loaded) { loaded = true; load(); }
        draw(box, node);
        return box;
    }
    function paint(nodeid) {
        var m = mounts[nodeid];
        if (!m || !m.box.isConnected) { delete mounts[nodeid]; return; }
        draw(m.box, nodeById(nodeid) || m.node);
    }
    function draw(box, node) {
        box.textContent = '';
        var head = el('div', null, 'scp-health-head');
        head.appendChild(el('h4', '🩺 ' + t('Health check & quick fixes (SCPclear)', 'ตรวจสุขภาพ & แก้ปัญหา (SCPclear)'), 'scp-cm-section-title'));
        var job = jobs[node._id], res = results[node._id];
        var go = btn(job && job.state === 'working' ? t('Checking…', 'กำลังตรวจ…') : (res ? t('Check again', 'ตรวจอีกครั้ง') : t('Check now', 'ตรวจตอนนี้')), 'scp-health-btn primary', function () { check(node); });
        go.disabled = !online(node) || !windowsAgent(node) || !!(job && job.state === 'working');
        head.appendChild(go);
        box.appendChild(head);
        if (!online(node)) box.appendChild(el('p', t('The computer is off; the last result is shown if there is one.', 'เครื่องปิดอยู่ แสดงผลตรวจล่าสุด (ถ้ามี)'), 'scp-health-hint'));
        if (job && job.state === 'failed') box.appendChild(el('p', job.text, 'scp-health-note bad'));
        var n = notes[node._id];
        if (n && Date.now() - n.at < 10 * 60000) box.appendChild(el('p', n.text, 'scp-health-note ' + n.tone));
        if (!res) {
            box.appendChild(el('p', t('Reads uptime, updates, memory, disk, network, printers and stuck jobs, services, start-up programs and fonts. Changes nothing.', 'อ่านค่าเครื่อง: การเปิดใช้งาน อัปเดต แรม ดิสก์ เครือข่าย เครื่องพิมพ์/งานค้าง บริการ โปรแกรมเปิดพร้อมเครื่อง และฟอนต์ — ไม่เปลี่ยนแปลงอะไร'), 'scp-health-hint'));
            return;
        }
        var d = res.data;
        box.appendChild(el('p', t('Checked ', 'ตรวจเมื่อ ') + new Date(res.at).toLocaleString(th ? 'th-TH' : undefined, { dateStyle: 'short', timeStyle: 'short' }) + (d.user ? ' · ' + t('signed in: ', 'ผู้ใช้: ') + d.user : '') + ' · ' + d.os, 'scp-health-hint'));
        var list = findings(d), cats = [];
        list.forEach(function (f) { if (cats.indexOf(f.cat) < 0) cats.push(f.cat); });
        var bad = list.filter(function (f) { return f.level === 'bad'; }).length, warn = list.filter(function (f) { return f.level === 'warn'; }).length;
        box.appendChild(el('p', bad || warn ? ('🔴 ' + bad + '  🟡 ' + warn) : t('✓ Nothing needs attention', '✓ ไม่พบปัญหา'), 'scp-health-sum'));
        box.appendChild(workOrderBlock(node, d));
        var trend = trendBlock(node._id);
        if (trend) box.appendChild(trend);
        cats.forEach(function (cat) {
            var group = el('div', null, 'scp-health-group');
            group.appendChild(el('h5', cat));
            list.filter(function (f) { return f.cat === cat; }).sort(function (a, b) { return rank(a.level) - rank(b.level); }).forEach(function (f) {
                var row = el('div', null, 'scp-health-row ' + f.level);
                var txt = el('div', null, 'scp-health-txt');
                txt.appendChild(el('strong', f.title));
                if (f.detail) txt.appendChild(el('small', f.detail));
                row.appendChild(el('span', null, 'scp-health-dot'));
                row.appendChild(txt);
                f.fixes.forEach(function (x) {
                    row.appendChild(btn(x.label, 'scp-health-btn', function () {
                        if (x.cleanup) { root.ScpCleanup.run(node); return; }
                        fixOne(node, x.action, x.arg, d);
                    }));
                });
                group.appendChild(row);
            });
            box.appendChild(group);
        });
        // printers on this computer
        if ((d.printers || []).length) {
            var pr = el('details', null, 'scp-health-more');
            pr.appendChild(el('summary', t('Printers on this computer (', 'เครื่องพิมพ์ในเครื่องนี้ (') + d.printers.length + ')'));
            d.printers.forEach(function (p) {
                var row = el('div', null, 'scp-health-row ' + (/Normal|^$/i.test(p.status) ? 'ok' : 'warn'));
                row.appendChild(el('span', null, 'scp-health-dot'));
                var txt = el('div', null, 'scp-health-txt');
                txt.appendChild(el('strong', (p.def ? '★ ' : '') + p.name));
                txt.appendChild(el('small', (p.status || 'Normal') + ' · ' + p.port + (p.jobs ? ' · ' + t('jobs ', 'งาน ') + p.jobs : '') + (p.shared ? t(' · shared', ' · แชร์อยู่') : '')));
                row.appendChild(txt);
                // no test page for printers that only make files (PDF, OneNote, XPS, fax)
                if (!/PDF|OneNote|XPS|Fax|Evernote|Writer/i.test(p.name) && !/^(PORTPROMPT|nul|FILE|XPS)/i.test(p.port))
                    row.appendChild(btn(t('Test page', 'พิมพ์ทดสอบ'), 'scp-health-btn', function () { fixOne(node, 'printer_test', p.name, d); }));
                pr.appendChild(row);
            });
            pr.appendChild(btn(t('Fix printing (clear stuck jobs + restart spooler)', 'แก้ปริ้นไม่ออก (ล้างงานค้าง + รีสตาร์ท Spooler)'), 'scp-health-btn primary', function () { fixOne(node, 'printer_fix', null, d); }));
            box.appendChild(pr);
        }
        // start-up programs
        if ((d.startup || []).length) {
            var su = el('details', null, 'scp-health-more');
            su.appendChild(el('summary', t('Start-up programs (', 'โปรแกรมเปิดพร้อมเครื่อง (') + d.startup.length + ')'));
            su.appendChild(el('p', t('Off works like Task Manager: the program stays installed and can be turned back on here. Keep HOSxP, card readers and antivirus on.', 'ปิดแบบเดียวกับ Task Manager: โปรแกรมยังอยู่ เปิดกลับได้จากตรงนี้ · อย่าปิด HOSxP โปรแกรมอ่านบัตร และแอนตี้ไวรัส'), 'scp-health-hint'));
            d.startup.forEach(function (s) {
                var row = el('div', null, 'scp-health-row ' + (s.on ? 'ok' : 'off'));
                row.appendChild(el('span', null, 'scp-health-dot'));
                var txt = el('div', null, 'scp-health-txt');
                txt.appendChild(el('strong', s.name));
                txt.appendChild(el('small', s.cmd));
                row.appendChild(txt);
                row.appendChild(btn(s.on ? t('Turn off', 'ปิด') : t('Turn on', 'เปิด'), 'scp-health-btn', function () {
                    fix(node, 'startup', { scope: s.scope, name: s.name, on: !s.on }, { label: (s.on ? t('turn off at start-up: ', 'ปิดการเปิดพร้อมเครื่อง: ') : t('turn on at start-up: ', 'เปิดพร้อมเครื่อง: ')) + s.name });
                }));
                su.appendChild(row);
            });
            box.appendChild(su);
        }
        // biggest programs in memory
        if ((d.top || []).length) {
            var tp = el('details', null, 'scp-health-more');
            tp.appendChild(el('summary', t('Using the most memory', 'โปรแกรมที่ใช้แรมมากสุด')));
            d.top.forEach(function (p) { tp.appendChild(el('div', p.name + ' — ' + p.mb + ' MB', 'scp-health-line')); });
            box.appendChild(tp);
        }
    }
    function rank(l) { return { bad: 0, warn: 1, ok: 2, off: 3 }[l] || 4; }
    function fixOne(node, action, arg, d) {
        var opts = {};
        if (action === 'printer_fix') {
            opts.note = t('Stops the print spooler for a few seconds, deletes the jobs waiting in the queue, then starts it again. People will need to print those documents again.', 'Spooler จะหยุดไม่กี่วินาที งานพิมพ์ที่รอคิวทั้งหมดจะถูกลบ แล้วเปิด Spooler ใหม่ งานที่ค้างต้องสั่งพิมพ์ใหม่');
            if (d && ((d.scpprint && d.scpprint.running) || (d.printers || []).some(function (p) { return p.shared; })))
                opts.note += '\n\n⚠️ ' + t('This computer shares printers with others (SCPPrint / shared printer): their waiting jobs are cleared too.', 'เครื่องนี้แชร์เครื่องพิมพ์ให้เครื่องอื่น (SCPPrint / แชร์ปริ้นเตอร์) งานที่รอของเครื่องอื่นจะถูกล้างด้วย');
        }
        if (action === 'printer_test') opts.label = t('test page on ', 'พิมพ์หน้าทดสอบที่ ') + arg;
        if (action === 'fonts') opts.note = t('Copies Thai fonts (TH Sarabun New, TH SarabunIT9, TH SarabunPSK, the 13 national fonts, Sarabun, Kanit, Prompt, IBM Plex Sans Thai, Noto Sans Thai; all free to use) from this server into Windows\\Fonts. Each file is checked against its SHA-256 first. Fonts already there are skipped.', 'คัดลอกฟอนต์ไทย (TH Sarabun New, TH SarabunIT๙, TH SarabunPSK, ฟอนต์แห่งชาติ 13 แบบ, Sarabun, Kanit, Prompt, IBM Plex Sans Thai, Noto Sans Thai — ใช้ฟรีถูกกฎหมาย) จากเซิร์ฟเวอร์นี้ไปที่ Windows\\Fonts ตรวจ SHA-256 ทุกไฟล์ก่อนติดตั้ง ตัวที่มีอยู่แล้วจะข้าม');
        if (action === 'trim') opts.note = t('Safe and quick on an SSD; nothing is deleted.', 'ปลอดภัย ใช้เวลาไม่นาน ไม่ลบไฟล์ใด');
        fix(node, action, arg, opts);
    }

    /* ---------- trends: a few numbers from every morning check ---------- */
    var history = {};
    function loadHistory(nodeid) {
        var h = history[nodeid];
        if (h && (h.loading || Date.now() - h.at < 300000)) return;
        history[nodeid] = { loading: true, at: Date.now(), entries: h ? h.entries : [] };
        if (!root.ScpOperations) return;
        root.ScpOperations.request('healthHistory', { nodeid: nodeid }).then(function (rows) {
            history[nodeid] = { at: Date.now(), entries: Array.isArray(rows) ? rows : [] };
            paint(nodeid);
        }).catch(function () { history[nodeid] = { at: Date.now(), entries: [] }; });
    }
    // Days until drive C: is full, from the line through the last weeks of free space; null if not shrinking.
    function daysUntilFull(entries) {
        var pts = entries.filter(function (e) { return typeof e.freeGb === 'number'; }).slice(-30);
        if (pts.length < 5 || pts[pts.length - 1].at - pts[0].at < 3 * 86400000) return null;
        var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
        pts.forEach(function (p) { var x = (p.at - pts[0].at) / 86400000; sx += x; sy += p.freeGb; sxx += x * x; sxy += x * p.freeGb; });
        var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
        if (!(slope < -0.05)) return null; // losing less than 50 MB a day: not worth a warning
        return Math.max(0, Math.round(pts[n - 1].freeGb / -slope));
    }
    function spark(values, color) {
        var w = 160, h = 34, max = Math.max.apply(null, values.concat([1])), min = Math.min.apply(null, values.concat([0]));
        var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('class', 'scp-health-spark');
        var line = document.createElementNS(ns, 'polyline');
        line.setAttribute('points', values.map(function (v, i) { return (values.length < 2 ? w / 2 : i * w / (values.length - 1)).toFixed(1) + ',' + (h - 3 - (v - min) / ((max - min) || 1) * (h - 6)).toFixed(1); }).join(' '));
        line.setAttribute('fill', 'none'); line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2');
        svg.appendChild(line);
        return svg;
    }
    function trendBlock(nodeid) {
        loadHistory(nodeid);
        var entries = (history[nodeid] && history[nodeid].entries) || [];
        if (entries.length < 2) return null;
        var box = el('div', null, 'scp-health-trend');
        box.appendChild(el('h5', t('Trend (morning checks, ', 'แนวโน้ม (จากการตรวจเช้า ') + entries.length + t(' days)', ' วัน)')));
        var row = function (label, values, color, note) {
            var r = el('div', null, 'scp-health-trend-row');
            r.appendChild(el('span', label));
            r.appendChild(spark(values, color));
            r.appendChild(el('small', note || ''));
            box.appendChild(r);
        };
        var free = entries.map(function (e) { return e.freeGb; }).filter(function (v) { return typeof v === 'number'; });
        var full = daysUntilFull(entries);
        if (free.length > 1) row(t('Drive C: free', 'ที่ว่างไดรฟ์ C:'), free, full !== null && full < 60 ? '#dc2626' : '#168065',
            free[free.length - 1] + ' GB' + (full !== null ? (full < 60 ? t(' · full in ~', ' · จะเต็มในอีก ~') + full + t(' days', ' วัน') : '') : t(' · steady', ' · คงที่')));
        var crash = entries.map(function (e) { return e.crashes14d || 0; });
        if (crash.some(function (v) { return v > 0; })) row(t('Switched off without shut-down (14 d)', 'ปิดโดยไม่ได้ Shut down (14 วัน)'), crash, '#d97706',
            crash[crash.length - 1] > crash[0] ? t('rising: check UPS / power', 'เพิ่มขึ้น: ตรวจ UPS / ไฟ') : '');
        var dp = entries.filter(function (e) { return typeof e.diskPct === 'number'; });
        if (dp.length > 1) {
            var bs = dp.map(function (e) { return e.badSectors || 0; }), grew = bs[bs.length - 1] > bs[0];
            row(t('Disk health', 'สุขภาพดิสก์'), dp.map(function (e) { return e.diskPct; }), grew || dp[dp.length - 1].diskPct < 80 ? '#dc2626' : '#168065',
                dp[dp.length - 1].diskPct + '%' + (grew ? t(' · bad sectors growing: replace soon', ' · bad sector เพิ่มขึ้น: ควรเปลี่ยนเร็ว ๆ นี้') : ''));
        }
        var ram = entries.map(function (e) { return e.ramPct || 0; });
        row(t('Memory in use', 'แรมที่ใช้'), ram, '#568acc', ram[ram.length - 1] + '%');
        return box;
    }

    /* ---------- the fleet: check every computer, install fonts everywhere ---------- */
    function openFleet(nodes, overlay) {
        var list = (nodes || []).filter(function (n) { return online(n) && windowsAgent(n); });
        var d = overlay(t('🩺 Health check — all computers', '🩺 ตรวจสุขภาพทุกเครื่อง'));
        var body = el('div', null, 'scp-extra-body'), morning = el('div', null, 'scp-health-morning'), status = el('p'), table = el('div', null, 'scp-health-fleet');
        var runBtn = btn(t('Check now (', 'ตรวจใหม่ตอนนี้ (') + list.length + t(' online)', ' เครื่องที่ออนไลน์)'), 'scp-health-btn primary', function () { runBtn.disabled = true; start(); });
        runBtn.disabled = !list.length;
        body.appendChild(morning); body.appendChild(runBtn); body.appendChild(status); body.appendChild(table); d.box.appendChild(body);
        // the last morning check, run by the server on its own
        if (root.ScpOperations) root.ScpOperations.request('morningSummary').then(function (m) {
            morning.textContent = '';
            if (!m) { morning.appendChild(el('p', t('No morning check yet. The server checks every computer that is on at ', 'ยังไม่มีผลตรวจเช้า เซิร์ฟเวอร์จะตรวจทุกเครื่องที่เปิดอยู่เองทุกวันเวลา ') + '07:30', 'scp-health-hint')); return; }
            morning.appendChild(el('h4', t('Morning check ', 'ตรวจเช้า ') + new Date(m.at).toLocaleString(th ? 'th-TH' : undefined, { dateStyle: 'medium', timeStyle: 'short' })));
            morning.appendChild(el('p', t('Checked ', 'ตรวจ ') + m.checked + t(' · fine ', ' เครื่อง · ปกติ ') + m.ok + t(' · worth a look ', ' · ควรดู ') + m.warn + t(' · with problems ', ' · มีปัญหา ') + m.problems.length + (m.slow ? t(' · slow/hanging ', ' · 🐢 ค้าง/ช้า ') + m.slow : '') + (m.noAnswer ? t(' · no answer ', ' · ไม่ตอบ ') + m.noAnswer : ''), 'scp-health-sum'));
            m.problems.forEach(function (p) {
                var row = el('button', null, 'scp-health-fleet-row'); row.type = 'button';
                row.appendChild(el('strong', (p.slow ? '🐢 ' : '') + p.name)); row.appendChild(el('span', '🔴 ' + p.bad.length, 'scp-health-fleet-count'));
                row.appendChild(el('small', p.slow || p.bad.slice(0, 3).join(' · ')));
                row.onclick = function () { var n = nodeById(p.nodeid); if (n && root.showComputerDetailModal) { d.close(); root.showComputerDetailModal(n); } };
                morning.appendChild(row);
            });
            var where = m.schedule === 'off' ? t('Automatic morning check is off.', 'ปิดการตรวจเช้าอัตโนมัติอยู่') :
                t('Runs daily at ', 'ตรวจอัตโนมัติทุกวันเวลา ') + m.schedule + ' · ' + (m.delivery.telegram || m.delivery.webhook ? t('summary sent to ', 'ส่งสรุปไปที่ ') + [m.delivery.telegram ? 'Telegram' : '', m.delivery.webhook ? 'webhook' : ''].filter(Boolean).join(' + ') : t('summary kept on the server (no Telegram / webhook set)', 'สรุปเก็บไว้ในเซิร์ฟเวอร์ (ยังไม่ได้ตั้ง Telegram / webhook)'));
            morning.appendChild(el('p', where, 'scp-health-hint'));
            // administrators: run the server's morning check now (kept in the history, summary sent if set)
            var now = btn(m.running ? t('Morning check running…', 'กำลังตรวจเช้า…') : t('Run the morning check now', 'สั่งตรวจเช้าตอนนี้ (บันทึกประวัติ + ส่งสรุป)'), 'scp-health-btn', function () {
                now.disabled = true;
                root.ScpOperations.request('morningRun').then(function () { now.textContent = t('Started: results in a few minutes', 'เริ่มแล้ว ผลจะขึ้นในไม่กี่นาที (เปิดหน้านี้ใหม่)'); })
                    .catch(function (e) { now.textContent = /ACCESS_DENIED/.test(e && e.message) ? t('Administrators only', 'เฉพาะผู้ดูแลระบบ') : t('Could not start', 'เริ่มไม่ได้'); });
            });
            now.disabled = !!m.running;
            morning.appendChild(now);
        }).catch(function () { morning.appendChild(el('p', t('Morning check results need a server restart.', 'ผลตรวจเช้าต้องรีสตาร์ทเซิร์ฟเวอร์ก่อน'), 'scp-health-hint')); });
        var job = null;
        function start() {
            table.textContent = '';
            job = checkAll(list, function (f) { status.textContent = t('Done: ', 'เสร็จแล้ว: ') + f.got.length + ' / ' + f.total + (f.failed ? t(' · no answer ', ' · ไม่ตอบ ') + f.failed : ''); show(); });
            if (!job) return;
            job.onProgress = function (f) { status.textContent = t('Answered ', 'ได้คำตอบ ') + f.got.length + ' / ' + f.total + '…'; show(); };
            job.onProgress(job);
        }
        function show() {
            table.textContent = '';
            var rows = job.got.map(function (id) {
                var fl = findings(results[id].data);
                var slow = fl.filter(function (x) { return x.slow; })[0];
                return { id: id, node: nodeById(id), slow: slow, bad: fl.filter(function (x) { return x.level === 'bad'; }), warn: fl.filter(function (x) { return x.level === 'warn'; }) };
            // slow or hanging computers first, as the hospital asked; then by how much is wrong
            }).sort(function (a, b) { return (b.slow ? 1 : 0) - (a.slow ? 1 : 0) || b.bad.length - a.bad.length || b.warn.length - a.warn.length; });
            rows.forEach(function (r) {
                var row = el('button', null, 'scp-health-fleet-row' + (r.slow ? ' slow' : ''));
                row.type = 'button';
                row.appendChild(el('strong', (r.slow ? '🐢 ' : '') + ((r.node && r.node.name) || r.id)));
                row.appendChild(el('span', '🔴 ' + r.bad.length + '  🟡 ' + r.warn.length, 'scp-health-fleet-count'));
                row.appendChild(el('small', r.slow ? r.slow.detail : (r.bad.concat(r.warn).slice(0, 3).map(function (x) { return x.title; }).join(' · ') || t('All good', 'ปกติดี'))));
                row.onclick = function () { if (r.node && root.showComputerDetailModal) { d.close(); root.showComputerDetailModal(r.node); } };
                table.appendChild(row);
            });
        }
    }
    /* ---------- every printer in the hospital, from the last check of each computer ---------- */
    function openPrinters(nodes, overlay) {
        var d = overlay(t('🖨️ Printers across the hospital', '🖨️ เครื่องพิมพ์ทั้งโรงพยาบาล'));
        var body = el('div', null, 'scp-extra-body'), chips = el('div', null, 'scp-health-chips'), status = el('p', null, 'scp-health-hint'), table = el('div', null, 'scp-health-fleet');
        body.appendChild(chips); body.appendChild(status); body.appendChild(table); d.box.appendChild(body);
        var filter = 'problem';
        var VIRTUAL = /PDF|OneNote|XPS|Fax|Evernote|Writer/i;
        function rows() {
            var out = [];
            Object.keys(results).forEach(function (id) {
                var r = results[id], dd = r.data, n = nodeById(id);
                (dd.printers || []).forEach(function (p) {
                    if (VIRTUAL.test(p.name) || /^(PORTPROMPT|nul|FILE|XPS)/i.test(p.port)) return;
                    var st = String(p.status || 'Normal');
                    var level = /Error|Offline|Jam|PaperOut|NotAvailable|NoToner|DoorOpen/i.test(st) ? 'bad' : /TonerLow|Paused|PaperProblem|UserIntervention/i.test(st) ? 'warn' : 'ok';
                    if (dd.spooler && dd.spooler !== 'Running') level = 'bad';
                    out.push({ node: n, nodeid: id, pc: (n && n.name) || id.split('/').pop(), p: p, st: st, level: level, at: r.at, jobs: dd.jobs || 0, oldest: dd.oldestJobMin || 0, scpprint: dd.scpprint });
                });
                if (dd.jobs > 0 && dd.oldestJobMin >= 5) out.push({ node: n, nodeid: id, pc: (n && n.name) || id.split('/').pop(), p: { name: t('Stuck print jobs', 'งานพิมพ์ค้าง'), port: '' }, st: dd.jobs + t(' jobs, oldest ', ' งาน นานสุด ') + age(dd.oldestJobMin), level: 'bad', at: r.at, stuck: true });
                if (dd.scpprint && dd.scpprint.installed && !dd.scpprint.running) out.push({ node: n, nodeid: id, pc: (n && n.name) || id.split('/').pop(), p: { name: 'SCPPrint', port: '' }, st: t('installed but not running: others cannot print through it', 'ติดตั้งไว้แต่ไม่ได้เปิด เครื่องอื่นปริ้นผ่านไม่ได้'), level: 'bad', at: r.at });
            });
            return out;
        }
        function paintList() {
            var all = rows();
            chips.textContent = '';
            [['problem', t('Needs attention', 'มีปัญหา'), function (r) { return r.level !== 'ok'; }], ['toner', t('Toner low', 'หมึกใกล้หมด'), function (r) { return /Toner/i.test(r.st); }], ['all', t('All', 'ทั้งหมด'), function () { return true; }]].forEach(function (c) {
                var b = btn(c[1] + ' (' + all.filter(c[2]).length + ')', 'scp-health-btn' + (filter === c[0] ? ' primary' : ''), function () { filter = c[0]; paintList(); });
                chips.appendChild(b);
                if (filter === c[0]) c.match = c[2];
                if (filter === c[0]) all.show = all.filter(c[2]);
            });
            table.textContent = '';
            var shown = (all.show || all).sort(function (a, b) { return rank(a.level) - rank(b.level) || String(a.pc).localeCompare(String(b.pc)); });
            status.textContent = t('From each computer\'s last health check · ', 'จากผลตรวจล่าสุดของแต่ละเครื่อง · ') + Object.keys(results).length + t(' computers checked', ' เครื่องที่มีผลตรวจ');
            if (!shown.length) table.appendChild(el('p', t('Nothing here.', 'ไม่มีรายการ'), 'scp-health-hint'));
            shown.forEach(function (r) {
                var row = el('div', null, 'scp-health-row ' + r.level);
                row.appendChild(el('span', null, 'scp-health-dot'));
                var txt = el('div', null, 'scp-health-txt');
                txt.appendChild(el('strong', (r.p.def ? '★ ' : '') + r.p.name));
                txt.appendChild(el('small', r.pc + ' · ' + r.st + (r.p.port ? ' · ' + r.p.port : '') + (r.p.shared ? t(' · shared', ' · แชร์อยู่') : '') + ' · ' + new Date(r.at).toLocaleString(th ? 'th-TH' : undefined, { dateStyle: 'short', timeStyle: 'short' })));
                row.appendChild(txt);
                if (r.node && (r.stuck || r.level === 'bad') && !/SCPPrint/.test(r.p.name)) row.appendChild(btn(t('Fix printing', 'แก้ปริ้นไม่ออก'), 'scp-health-btn', function () { fixOne(r.node, 'printer_fix', null, results[r.nodeid] && results[r.nodeid].data); }));
                if (r.node) row.appendChild(btn(t('Details', 'ดูเครื่อง'), 'scp-health-btn', function () { d.close(); root.showComputerDetailModal(r.node); }));
                table.appendChild(row);
            });
        }
        status.textContent = t('Loading…', 'กำลังโหลด…');
        load().then(paintList, paintList);
    }

    // Every disk in the hospital from the last checks, weakest first, so the ones to replace
    // (or to back up before they go) are at the top. Computers checked before disk health
    // existed show up after their next check.
    function openDisks(nodes, overlay) {
        var d = overlay(t('💽 Disk health across the hospital', '💽 สุขภาพดิสก์ทั้งโรงพยาบาล'));
        var body = el('div', null, 'scp-extra-body'), chips = el('div', null, 'scp-health-chips'), status = el('p', null, 'scp-health-hint'), table = el('div', null, 'scp-health-fleet');
        var tools = el('div', null, 'scp-health-chips');
        body.appendChild(tools); body.appendChild(chips); body.appendChild(status); body.appendChild(table); d.box.appendChild(body);
        var filter = 'problem';
        var online_ = (nodes || []).filter(function (n) { return online(n) && windowsAgent(n); });
        var runBtn = btn(t('Check disks now (', 'ตรวจใหม่ตอนนี้ (') + online_.length + t(' online)', ' เครื่องที่ออนไลน์)'), 'scp-health-btn primary', function () {
            runBtn.disabled = true;
            var job = checkAll(online_, function () { runBtn.disabled = false; paintList(); });
            if (job) job.onProgress = function (f) { status.textContent = t('Answered ', 'ได้คำตอบ ') + f.got.length + ' / ' + f.total + '…'; paintList(true); };
        });
        tools.appendChild(runBtn);
        function rows() {
            var out = [], waiting = 0, perPc = {};
            Object.keys(results).forEach(function (id) {
                var r = results[id], n = nodeById(id);
                if (!r.data.disks) { waiting++; return; }
                var own = ownDisks(r.data.disks);
                perPc[own.length] = (perPc[own.length] || 0) + 1;
                own.forEach(function (k, i) {
                    out.push({ node: n, nodeid: id, pc: (n && n.name) || id.split('/').pop(), k: k, v: diskVerdict(k), at: r.at, idx: i + 1, count: own.length, mix: diskMix(own) });
                });
            });
            out.waiting = waiting;
            out.perPc = perPc;
            return out;
        }
        function paintList(keepStatus) {
            var all = rows();
            chips.textContent = '';
            [['problem', t('Needs attention', 'ควรดู/ควรเปลี่ยน'), function (r) { return r.v.level !== 'ok'; }], ['bad', t('Bad sectors', 'มี bad sector'), function (r) { return r.v.badSectors > 0; }], ['hdd', t('Spinning HDD', 'ยังเป็น HDD'), function (r) { return !r.v.ssd; }], ['many', t('2+ disks', 'เครื่องที่มีหลายลูก'), function (r) { return r.count > 1; }], ['all', t('All', 'ทั้งหมด'), function () { return true; }]].forEach(function (c) {
                chips.appendChild(btn(c[1] + ' (' + all.filter(c[2]).length + ')', 'scp-health-btn' + (filter === c[0] ? ' primary' : ''), function () { filter = c[0]; paintList(); }));
                if (filter === c[0]) all.show = all.filter(c[2]);
            });
            table.textContent = '';
            var shown = (all.show || all).sort(function (a, b) { return a.v.pct - b.v.pct || String(a.pc).localeCompare(String(b.pc)); });
            var pcs = Object.keys(all.perPc).reduce(function (s, c) { return s + all.perPc[c]; }, 0);
            var spread = Object.keys(all.perPc).sort().map(function (c) { return t('', 'มี ') + c + t(' disk(s): ', ' ลูก ') + all.perPc[c] + t(' PCs', ' เครื่อง'); }).join(', ');
            if (!keepStatus) status.textContent = t('From each computer\'s last health check · ', 'จากผลตรวจล่าสุดของแต่ละเครื่อง · ') + pcs + t(' computers, ', ' เครื่อง ') + all.length + t(' disks', ' ลูก') + (spread ? ' (' + spread + ')' : '') + (all.waiting ? t(' · ', ' · ') + all.waiting + t(' computers still need a new check to read their disks', ' เครื่องยังไม่มีข้อมูลดิสก์ (กดตรวจใหม่)') : '');
            if (!shown.length) table.appendChild(el('p', t('Nothing here.', 'ไม่มีรายการ'), 'scp-health-hint'));
            shown.forEach(function (r) {
                var row = el('div', null, 'scp-health-row ' + r.v.level);
                row.appendChild(el('span', null, 'scp-health-dot'));
                var txt = el('div', null, 'scp-health-txt');
                txt.appendChild(el('strong', r.v.pct + '% · ' + r.pc + t(' [', ' [ดิสก์ ') + r.count + t(' disk(s): ', ' ลูก: ') + r.mix + (r.count > 1 ? t(', this is no. ', ', นี่คือลูกที่ ') + r.idx : '') + '] — ' + r.k.n + ' ' + r.k.gb + 'GB ' + (r.v.ssd ? 'SSD' : 'HDD') + (r.k.sys ? ' (C:)' : '')));
                txt.appendChild(el('small', diskLine(r.k, r.v) + ' · ' + new Date(r.at).toLocaleString(th ? 'th-TH' : undefined, { dateStyle: 'short', timeStyle: 'short' })));
                row.appendChild(txt);
                if (r.node) row.appendChild(btn(t('Details', 'ดูเครื่อง'), 'scp-health-btn', function () { d.close(); root.showComputerDetailModal(r.node); }));
                table.appendChild(row);
            });
        }
        status.textContent = t('Loading…', 'กำลังโหลด…');
        load().then(function () { paintList(); }, function () { paintList(); });
    }

    function openFonts(nodes, overlay) {
        var list = (nodes || []).filter(function (n) { return online(n) && windowsAgent(n); });
        if (!list.length) { root.alert(t('No Windows computer is online right now', 'ตอนนี้ไม่มีเครื่อง Windows ที่ออนไลน์')); return; }
        loadManifest().then(function (m) {
            if (!root.confirm(t('Install ', 'ติดตั้งฟอนต์ไทย ') + m.fonts.length + t(' Thai font styles on ', ' แบบ (TH Sarabun New / IT๙ / PSK, ฟอนต์แห่งชาติ 13 แบบ, Sarabun, Kanit, Prompt ฯลฯ) ให้ ') + list.length + t(' online computers?\n\nFree licence (SIL OFL). Each file is checked by SHA-256. Fonts already installed are skipped. Programs that are open need reopening to see them.', ' เครื่องที่ออนไลน์?\n\nใช้ฟรีถูกลิขสิทธิ์ (SIL OFL) ตรวจ SHA-256 ทุกไฟล์ ตัวที่มีแล้วจะข้าม โปรแกรมที่เปิดอยู่ต้องปิดเปิดใหม่จึงจะเห็นฟอนต์'))) return;
            var d = overlay(t('🔤 Installing Thai fonts', '🔤 ติดตั้งฟอนต์ไทย'));
            var status = el('p'); d.box.appendChild(status);
            status.textContent = t('Sending…', 'กำลังส่ง…');
            fixAll(list, 'fonts', function (job, timedOut) {
                status.textContent = t('Done on ', 'เสร็จ ') + job.ok + ' / ' + job.total + t(' computers · font files installed ', ' เครื่อง · ติดตั้งไฟล์ฟอนต์ใหม่รวม ') + job.installed + (timedOut ? t(' · some did not answer', ' · บางเครื่องไม่ตอบ') : '');
            });
        }).catch(function () { root.alert(t('Font list unavailable on the server', 'ไม่พบรายการฟอนต์บนเซิร์ฟเวอร์')); });
    }

    function load() {
        if (!root.ScpOperations) return Promise.resolve();
        return root.ScpOperations.request('healthList').then(function (map) {
            Object.keys(map || {}).forEach(function (id) {
                var row = map[id];
                if (row && row.data && (!results[id] || results[id].at < row.updated)) results[id] = { data: row.data, at: row.updated };
                paint(id);
            });
        }).catch(function () { });
    }

    // The server runs the same check every morning (hospital/morning-check.js) and hands the font list in itself.
    function setManifest(m) { manifest = m; }

    root.ScpHealth = { setManifest: setManifest, daysUntilFull: daysUntilFull, slowVerdict: slowVerdict, section: section, receive: receive, check: check, fix: fix, openFleet: openFleet, openPrinters: openPrinters, openDisks: openDisks, diskVerdict: diskVerdict, workOrder: workOrder, openFonts: openFonts, findings: findings, healthScript: healthScript, FIX: FIX, results: results, load: load };
}(window));
