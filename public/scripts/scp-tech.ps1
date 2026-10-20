# SCP-Remote technician tools (ported from SCPclear 2.3). Runs on the remote computer as SYSTEM.
# The agent feeds this file to "powershell -command -" through stdin, so: no blank lines anywhere
# (a blank line closes an open block early), ASCII only (stdin uses the OEM code page), and the
# caller prepends "$ScpTask = '...'" and "$ScpArg = '...'" before sending it.
# Every task writes exactly one line "SCP_TECH:{json}". Non-ASCII text in the JSON is escaped as \uXXXX.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (-not $ScpTask) { $ScpTask = 'inventory' }
if (-not $ScpArg) { $ScpArg = '' }
function ScpOut($obj) {
    $j = $obj | ConvertTo-Json -Compress -Depth 8
    $j = [regex]::Replace($j, '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
    Write-Output ('SCP_TECH:' + $j)
}
function ScpTail([string]$text, [int]$lines) {
    $t = ($text -replace "`0", '') -split "`r?`n" | Where-Object { $_.Trim() -and $_ -notmatch '^\s*[-\\|/]\s*$' -and $_ -notmatch ("[" + [char]0x2588 + [char]0x2592 + "]") }
    return (@($t) | Select-Object -Last $lines) -join "`n"
}
function ScpRun([string]$file, [string]$arguments, $encoding, [int]$timeoutSec) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo($file, $arguments)
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = $encoding; $psi.StandardErrorEncoding = $encoding
    $p = [System.Diagnostics.Process]::Start($psi)
    $outTask = $p.StandardOutput.ReadToEndAsync(); $errTask = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit($timeoutSec * 1000)) { try { $p.Kill() } catch { }; return @{ code = -999; text = 'TIMEOUT' } }
    $p.WaitForExit()
    return @{ code = $p.ExitCode; text = ($outTask.Result + "`n" + $errTask.Result) }
}
function ScpOem { return [System.Text.Encoding]::GetEncoding([System.Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage) }
function ScpAddMiniDump {
    if ('ScpTech.MiniDump' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
namespace ScpTech {
    public static class MiniDump {
        // Returns [code, driver]; driver is the module whose address range holds a bug check parameter.
        public static string[] Read(string path) {
            string[] r = new string[] { "0", "" };
            try {
                FileInfo fi = new FileInfo(path);
                if (fi.Length > 64L * 1024 * 1024 || fi.Length < 0x2100) return r;
                byte[] b = File.ReadAllBytes(path);
                if (Encoding.ASCII.GetString(b, 0, 8) != "PAGEDU64") return r;
                r[0] = BitConverter.ToUInt32(b, 0x38).ToString();
                ulong[] addrs = { BitConverter.ToUInt64(b, 0x58), BitConverter.ToUInt64(b, 0x50), BitConverter.ToUInt64(b, 0x48), BitConverter.ToUInt64(b, 0x40) };
                int t = 0x2000;
                uint drvOff = BitConverter.ToUInt32(b, t + 0x30), cnt = BitConverter.ToUInt32(b, t + 0x34);
                uint spOff = BitConverter.ToUInt32(b, t + 0x38), spSize = BitConverter.ToUInt32(b, t + 0x3C);
                if (cnt == 0 || cnt > 4000 || drvOff >= b.Length || spOff >= b.Length) return r;
                int size = 0;
                for (int cand = 0x80; cand <= 0x200; cand += 8) {
                    bool ok = true;
                    for (int k = 0; k < Math.Min(6, (int)cnt); k++) {
                        long pos = drvOff + (long)k * cand;
                        if (pos + 4 > b.Length) { ok = false; break; }
                        uint no = BitConverter.ToUInt32(b, (int)pos);
                        if (no < spOff || no >= spOff + spSize) { ok = false; break; }
                    }
                    if (ok) { size = cand; break; }
                }
                if (size == 0) return r;
                string fallback = "";
                for (int k = 0; k < cnt; k++) {
                    long e = drvOff + (long)k * size;
                    if (e + 0x4C > b.Length) break;
                    uint no = BitConverter.ToUInt32(b, (int)e);
                    if (no + 4 > b.Length) continue;
                    int len = (int)Math.Min(BitConverter.ToUInt32(b, (int)no), 260);
                    if (no + 4 + 2 * len > b.Length) continue;
                    string name = Encoding.Unicode.GetString(b, (int)no + 4, 2 * len);
                    ulong bas = BitConverter.ToUInt64(b, (int)e + 0x38);
                    uint sz = BitConverter.ToUInt32(b, (int)e + 0x48);
                    foreach (ulong a in addrs) {
                        if (a >= bas && a < bas + sz) {
                            string ln = name.ToLowerInvariant();
                            if (ln == "ntoskrnl.exe" || ln == "hal.dll") { if (fallback == "") fallback = name; }
                            else { r[1] = name; return r; }
                        }
                    }
                }
                r[1] = fallback;
            } catch { }
            return r;
        }
    }
}
'@
}
function ScpAddBench {
    if ('ScpTech.DiskBench' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace ScpTech {
    public static class DiskBench {
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool WriteFile(SafeFileHandle h, IntPtr buf, uint n, out uint written, IntPtr ovl);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool ReadFile(SafeFileHandle h, IntPtr buf, uint n, out uint read, IntPtr ovl);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetFilePointerEx(SafeFileHandle h, long dist, out long newPos, uint method);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr VirtualAlloc(IntPtr addr, UIntPtr size, uint type, uint protect);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool VirtualFree(IntPtr addr, UIntPtr size, uint type);
        static SafeFileHandle Open(string path, uint access, uint disp, uint flags) {
            SafeFileHandle h = CreateFile(path, access, 0, IntPtr.Zero, disp, flags, IntPtr.Zero);
            if (h.IsInvalid) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            return h;
        }
        // Returns [seqWriteMBs, seqReadMBs, rand4kMBs, rand4kIops]. Unbuffered + write-through, so the
        // Windows cache does not flatter the numbers. The test file is always deleted.
        public static double[] Run(string dir, long sizeBytes) {
            const uint GR = 0x80000000, GW = 0x40000000, NOBUF = 0x20000000, WTHRU = 0x80000000;
            const int block = 4 * 1024 * 1024;
            string path = Path.Combine(dir, "SCP-Remote-speedtest.tmp");
            long size = Math.Max(block, (sizeBytes / block) * block);
            double[] res = new double[4];
            IntPtr buf = VirtualAlloc(IntPtr.Zero, (UIntPtr)block, 0x3000, 4);
            if (buf == IntPtr.Zero) throw new OutOfMemoryException();
            try {
                Random rnd = new Random();
                byte[] tmp = new byte[block]; rnd.NextBytes(tmp); Marshal.Copy(tmp, 0, buf, block);
                uint n; long done; Stopwatch sw;
                using (SafeFileHandle h = Open(path, GW, 2, NOBUF | WTHRU)) {
                    sw = Stopwatch.StartNew(); done = 0;
                    while (done < size) { if (!WriteFile(h, buf, block, out n, IntPtr.Zero)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); done += n; }
                    res[0] = done / 1048576.0 / Math.Max(0.001, sw.Elapsed.TotalSeconds);
                }
                using (SafeFileHandle h = Open(path, GR, 3, NOBUF)) {
                    sw = Stopwatch.StartNew(); done = 0;
                    while (done < size) { if (!ReadFile(h, buf, block, out n, IntPtr.Zero) || n == 0) break; done += n; }
                    res[1] = done / 1048576.0 / Math.Max(0.001, sw.Elapsed.TotalSeconds);
                }
                using (SafeFileHandle h = Open(path, GR, 3, NOBUF)) {
                    int blocks = (int)Math.Min(int.MaxValue, size / 4096);
                    sw = Stopwatch.StartNew(); long ops = 0; long np;
                    while (sw.Elapsed.TotalSeconds < 5) {
                        SetFilePointerEx(h, (long)rnd.Next(blocks) * 4096, out np, 0);
                        if (!ReadFile(h, buf, 4096, out n, IntPtr.Zero)) break;
                        ops++;
                    }
                    double sec = Math.Max(0.001, sw.Elapsed.TotalSeconds);
                    res[3] = ops / sec; res[2] = ops * 4096 / 1048576.0 / sec;
                }
            } finally {
                VirtualFree(buf, UIntPtr.Zero, 0x8000);
                try { File.Delete(path); } catch { }
            }
            return res;
        }
    }
}
'@
}
function ScpAddLan {
    if ('ScpTech.LanScan' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
namespace ScpTech {
    public class LanHost { public string ip; public string mac; public string name; public string ports; public long ms; }
    public static class LanScan {
        static readonly int[] PortList = { 80, 443, 9100, 631, 515, 554, 445, 3389, 22 };
        public static List<LanHost> Run(string prefix3) {
            ConcurrentDictionary<string, LanHost> hosts = new ConcurrentDictionary<string, LanHost>();
            List<string> ips = new List<string>();
            for (int i = 1; i < 255; i++) ips.Add(prefix3 + "." + i);
            ParallelOptions po = new ParallelOptions(); po.MaxDegreeOfParallelism = 64;
            Parallel.ForEach(ips, po, ip => {
                try {
                    using (var p = new System.Net.NetworkInformation.Ping()) {
                        var r = p.Send(ip, 700);
                        if (r.Status == System.Net.NetworkInformation.IPStatus.Success) { LanHost h = new LanHost(); h.ip = ip; h.ms = r.RoundtripTime; h.mac = ""; hosts[ip] = h; }
                    }
                } catch { }
            });
            try {
                ProcessStartInfo psi = new ProcessStartInfo("arp.exe", "-a");
                psi.UseShellExecute = false; psi.CreateNoWindow = true; psi.RedirectStandardOutput = true;
                using (Process pr = Process.Start(psi)) {
                    string all = pr.StandardOutput.ReadToEnd(); pr.WaitForExit(5000);
                    foreach (Match m in Regex.Matches(all, @"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5})")) {
                        string ip = m.Groups[1].Value, mac = m.Groups[2].Value.ToUpperInvariant();
                        if (!ip.StartsWith(prefix3 + ".") || mac.StartsWith("FF-FF") || mac.StartsWith("01-00-5E")) continue;
                        LanHost h;
                        if (!hosts.TryGetValue(ip, out h)) { h = new LanHost(); h.ip = ip; h.ms = -1; hosts[ip] = h; }
                        h.mac = mac;
                    }
                }
            } catch { }
            List<LanHost> list = new List<LanHost>(hosts.Values);
            Parallel.ForEach(list, po, h => {
                List<string> open = new List<string>();
                foreach (int port in PortList) {
                    try {
                        using (var c = new System.Net.Sockets.TcpClient()) {
                            var ar = c.BeginConnect(h.ip, port, null, null);
                            if (ar.AsyncWaitHandle.WaitOne(250) && c.Connected) open.Add(port.ToString());
                        }
                    } catch { }
                }
                h.ports = string.Join(",", open.ToArray());
                h.name = "";
                try { var t = System.Net.Dns.GetHostEntryAsync(h.ip); if (t.Wait(900) && t.Result.HostName != h.ip) h.name = t.Result.HostName; } catch { }
            });
            list.Sort((a, b) => Version.Parse(a.ip).CompareTo(Version.Parse(b.ip)));
            return list;
        }
    }
}
'@
}
function ScpInventory {
    $days = 180; if ($ScpArg -match '^[0-9]+$') { $days = [math]::Min(730, [math]::Max(7, [int]$ScpArg)) }
    $since = (Get-Date).AddDays(-$days)
    $crash = @()
    $dumps = @(Get-ChildItem "$env:SystemRoot\Minidump" -Filter *.dmp -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $since } | Sort-Object LastWriteTime -Descending | Select-Object -First 30)
    if ($dumps.Count) { ScpAddMiniDump }
    foreach ($f in $dumps) {
        $r = [ScpTech.MiniDump]::Read($f.FullName)
        $crash += @{ at = $f.LastWriteTime.ToString('s'); code = [uint32]$r[0]; driver = [string]$r[1]; src = 'dump' }
    }
    try {
        foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 1001; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'; StartTime = $since } -ErrorAction Stop)) {
            $m = [regex]::Match($e.Message, '0x[0-9a-fA-F]{8}')
            if (-not $m.Success) { continue }
            $near = $crash | Where-Object { [math]::Abs(([datetime]$_.at - $e.TimeCreated).TotalMinutes) -lt 10 }
            if (-not $near) { $crash += @{ at = $e.TimeCreated.ToString('s'); code = [Convert]::ToUInt32($m.Value.Substring(2), 16); driver = ''; src = 'event' } }
        }
    } catch { }
    $power = @()
    try {
        foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 41; ProviderName = 'Microsoft-Windows-Kernel-Power'; StartTime = $since } -ErrorAction Stop)) {
            $code = 0; try { $code = [uint32]$e.Properties[0].Value } catch { }
            if ($code -eq 0) { $power += $e.TimeCreated.ToString('s') }
        }
    } catch { }
    $owners = @{}
    foreach ($d in @($crash | Where-Object { $_.driver } | ForEach-Object { $_.driver } | Select-Object -Unique)) {
        $owner = ''
        try {
            $sd = Get-CimInstance Win32_SystemDriver | Where-Object { $_.PathName -and ([IO.Path]::GetFileName(($_.PathName -replace '^\\\?\?\\', '').Trim('"')) -ieq $d) } | Select-Object -First 1
            $p = if ($sd) { ($sd.PathName -replace '^\\\?\?\\', '').Trim('"') -replace '^\\SystemRoot', $env:SystemRoot } else { Join-Path "$env:SystemRoot\System32\drivers" $d }
            if (Test-Path -LiteralPath $p) { $v = (Get-Item -LiteralPath $p).VersionInfo; $owner = (@($v.CompanyName, $v.FileDescription) | Where-Object { $_ }) -join ' - ' }
        } catch { }
        $owners[$d] = $owner
    }
    $mem = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue)
    $arr = @(Get-CimInstance Win32_PhysicalMemoryArray -ErrorAction SilentlyContinue | Where-Object { $_.Use -eq 3 -or -not $_.Use }) | Select-Object -First 1
    $board = Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue | Select-Object -First 1
    $cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
    $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
    $maxKB = 0; if ($arr) { if ($arr.MaxCapacityEx) { $maxKB = [double]$arr.MaxCapacityEx } elseif ($arr.MaxCapacity) { $maxKB = [double]$arr.MaxCapacity } }
    $ram = @{
        slots = [math]::Max([int]$(if ($arr) { $arr.MemoryDevices } else { 0 }), $mem.Count)
        maxGb = [math]::Round($maxKB / 1MB)
        totalGb = [math]::Round(($mem | Measure-Object -Property Capacity -Sum).Sum / 1GB)
        sticks = @($mem | ForEach-Object { @{ gb = [math]::Round($_.Capacity / 1GB); speed = [int]$_.Speed; type = [int]$_.SMBIOSMemoryType; form = [int]$_.FormFactor; maker = ([string]$_.Manufacturer).Trim(); part = ([string]$_.PartNumber).Trim(); slot = [string]$_.DeviceLocator } })
        board = if ($board) { ('{0} {1}' -f $board.Manufacturer, $board.Product).Trim() } else { '' }
        cpu = if ($cpu) { ([string]$cpu.Name).Trim() } else { '' }
        socket = if ($cpu) { [string]$cpu.SocketDesignation } else { '' }
        model = if ($cs) { ('{0} {1}' -f $cs.Manufacturer, $cs.Model).Trim() } else { '' }
    }
    $battery = $null
    $b = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)
    if ($b.Count) {
        $design = 0; $full = 0; $cycles = -1
        try { $design = [double](Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData -ErrorAction Stop | Select-Object -First 1).DesignedCapacity } catch { }
        try { $full = [double](Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity -ErrorAction Stop | Select-Object -First 1).FullChargedCapacity } catch { }
        try { $cycles = [int](Get-CimInstance -Namespace root\wmi -ClassName BatteryCycleCount -ErrorAction Stop | Select-Object -First 1).CycleCount } catch { }
        $battery = @{ charge = [int]$b[0].EstimatedChargeRemaining; status = [int]$b[0].BatteryStatus; design = $design; full = $full; cycles = $cycles; health = $(if ($design -gt 0 -and $full -gt 0) { [math]::Min(100, [math]::Round($full / $design * 100)) } else { -1 }) }
    }
    return @{ days = $days; crash = @($crash); owners = $owners; power = @($power); ram = $ram; battery = $battery }
}
$ScpAvRe = '(?i)\beset\b|nod32|kaspersky|mcafee|norton|symantec|avast|\bavg\b|bitdefender|trend micro|sophos|forticlient|f-secure|\bpanda\b|avira|webroot|comodo|malwarebytes|360 total|quick heal'
function ScpAvEntries {
    $out = @()
    foreach ($base in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
        foreach ($k in @(Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue)) {
            $p = Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction SilentlyContinue
            if (-not $p -or -not $p.DisplayName -or ([string]$p.DisplayName -notmatch $ScpAvRe)) { continue }
            $out += @{ key = $k.PSChildName; name = [string]$p.DisplayName; version = [string]$p.DisplayVersion; publisher = [string]$p.Publisher; uninstall = [string]$p.UninstallString; quiet = [string]$p.QuietUninstallString; wow = ($base -match 'Wow6432Node') }
        }
    }
    return $out
}
function ScpDefender {
    try { $m = Get-MpComputerStatus -ErrorAction Stop; return @{ present = $true; enabled = [bool]$m.AntivirusEnabled; mode = [string]$m.AMRunningMode; sigAge = [int]$m.AntivirusSignatureAge } } catch { return @{ present = $false } }
}
function ScpSecurityCenter {
    return @(Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue | ForEach-Object { @{ name = [string]$_.displayName; on = (($_.productState -band 0x1000) -ne 0); old = (($_.productState -band 0x10) -ne 0) } })
}
function ScpServerBase {
    # The address the agent itself uses, so the download works however the browser reached the server.
    try {
        $svc = Get-CimInstance Win32_Service | Where-Object { $_.PathName -match 'MeshAgent' -or $_.Name -match 'Mesh ?Agent' } | Select-Object -First 1
        if ($svc) {
            $exe = ($svc.PathName -replace '^"([^"]+)".*$', '$1')
            $msh = Get-ChildItem -LiteralPath (Split-Path $exe) -Filter *.msh -ErrorAction Stop | Select-Object -First 1
            $line = Get-Content -LiteralPath $msh.FullName | Where-Object { $_ -match '^MeshServer=' } | Select-Object -First 1
            if ($line -match 'wss://([^/]+)/') { return 'https://' + $Matches[1] + '/' }
        }
    } catch { }
    return ''
}
try {
    switch ($ScpTask) {
        'inventory' { $r = ScpInventory; $r.task = 'inventory'; $r.ok = $true; ScpOut $r }
        'bench' {
            $mb = 256; if ($ScpArg -match '^\d+$') { $mb = [math]::Min(2048, [math]::Max(64, [int]$ScpArg)) }
            $dir = Join-Path $env:SystemRoot 'Temp'
            $free = (Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'").FreeSpace
            if ($free -lt ($mb + 1024) * 1MB) { ScpOut @{ task = 'bench'; ok = $false; error = 'NO_SPACE'; freeGb = [math]::Round($free / 1GB, 1) } }
            else {
                ScpAddBench
                $res = [ScpTech.DiskBench]::Run($dir, [long]$mb * 1MB)
                $disk = ''
                try { $part = Get-Partition -DriveLetter ($env:SystemDrive.TrimEnd(':')) | Select-Object -First 1; $pd = Get-PhysicalDisk | Where-Object { [string]$_.DeviceId -eq [string]$part.DiskNumber } | Select-Object -First 1; if ($pd) { $disk = ('{0} ({1} {2})' -f $pd.FriendlyName, $pd.MediaType, $pd.BusType).Trim() } } catch { }
                ScpOut @{ task = 'bench'; ok = $true; mb = $mb; write = [math]::Round($res[0]); read = [math]::Round($res[1]); rand = [math]::Round($res[2], 1); iops = [math]::Round($res[3]); disk = $disk }
            }
        }
        'sfc' {
            $exe = Join-Path $env:SystemRoot 'System32\sfc.exe'
            $r = ScpRun $exe '/verifyonly' ([System.Text.Encoding]::Unicode) 1680
            $txt = ($r.text -replace "`0", '')
            $thFound = -join [char[]](0x0e1e, 0x0e1a, 0x0e01, 0x0e32, 0x0e23, 0x0e25, 0x0e30, 0x0e40, 0x0e21, 0x0e34, 0x0e14)
            $thNone = ([string][char]0x0e44) + [char]0x0e21 + [char]0x0e48 + $thFound
            $bad = $txt -match ('found integrity violations|' + $thFound) -and $txt -notmatch ('did not find any integrity violations|' + $thNone)
            $clean = $txt -match ('did not find any integrity violations|' + $thNone)
            ScpOut @{ task = 'sfc'; ok = ($r.code -ne -999); code = $r.code; verdict = $(if ($bad) { 'violations' } elseif ($clean) { 'clean' } else { 'unknown' }); tail = (ScpTail $txt 8) }
        }
        'dism' {
            $exe = Join-Path $env:SystemRoot 'System32\dism.exe'
            $r = ScpRun $exe '/Online /Cleanup-Image /CheckHealth' (ScpOem) 900
            $txt = $r.text
            $verdict = if ($txt -match 'No component store corruption detected') { 'clean' } elseif ($txt -match 'not repairable') { 'broken' } elseif ($txt -match 'repairable') { 'repairable' } elseif ($r.code -eq 0) { 'ok' } else { 'unknown' }
            ScpOut @{ task = 'dism'; ok = ($r.code -ne -999); code = $r.code; verdict = $verdict; tail = (ScpTail $txt 6) }
        }
        'lan' {
            $cfgs = @(Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' })
            $nets = @($cfgs | ForEach-Object { $a = [string](@($_.IPv4Address)[0].IPAddress); $g = ''; if ($_.IPv4DefaultGateway) { $g = [string](@($_.IPv4DefaultGateway)[0].NextHop) }; @{ ip = $a; gw = $g; prefix = (($a -split '\.')[0..2] -join '.'); alive = $false } } | Where-Object { $_.ip -notmatch '^169\.254\.' })
            foreach ($n in $nets) { if ($n.gw) { try { $n.alive = (New-Object System.Net.NetworkInformation.Ping).Send($n.gw, 800).Status -eq 'Success' } catch { } } }
            $pick = $null
            if ($ScpArg -match '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$') { $pick = @{ ip = ''; gw = ''; prefix = $ScpArg } }
            if (-not $pick) { $pick = @($nets | Where-Object { $_.alive }) + @($nets | Where-Object { $_.gw }) + $nets | Select-Object -First 1 }
            if (-not $pick) { ScpOut @{ task = 'lan'; ok = $false; error = 'NO_NETWORK' } }
            else {
                ScpAddLan
                $hosts = [ScpTech.LanScan]::Run($pick.prefix)
                ScpOut @{ task = 'lan'; ok = $true; self = $pick.ip; gateway = $pick.gw; prefix = $pick.prefix; subnets = @($nets | ForEach-Object { $_.prefix }); hosts = @($hosts | ForEach-Object { @{ ip = $_.ip; mac = $_.mac; name = $_.name; ports = $_.ports; ms = $_.ms } }) }
            }
        }
        'wurepair' {
            Write-Output 'SCP_PROGRAM_STEP:{"n":1,"of":6,"what":"space"}'
            $drive = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='" + $env:SystemDrive + "'")
            $freeGb = [math]::Round($drive.FreeSpace / 1GB, 1)
            $pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' -ErrorAction SilentlyContinue
            $wuSvc = Get-Service wuauserv -ErrorAction SilentlyContinue
            if ($freeGb -lt 8) { ScpOut @{ task = 'wurepair'; ok = $false; error = 'NO_SPACE'; freeGb = $freeGb } }
            elseif (-not $wuSvc) { ScpOut @{ task = 'wurepair'; ok = $false; error = 'NO_WU_SERVICE' } }
            elseif (($pol -and $pol.NoAutoUpdate -eq 1) -or $wuSvc.StartType -eq 'Disabled') { ScpOut @{ task = 'wurepair'; ok = $false; error = 'WU_DISABLED' } }
            else {
                $log = @()
                Write-Output 'SCP_PROGRAM_STEP:{"n":2,"of":6,"what":"services"}'
                foreach ($n in @('cryptsvc', 'bits', 'wuauserv')) { $s = Get-Service $n -ErrorAction SilentlyContinue; if ($s -and $s.Status -ne 'Running') { try { Start-Service $n -ErrorAction Stop; $log += ('started ' + $n) } catch { $log += ('could not start ' + $n) } } }
                Write-Output 'SCP_PROGRAM_STEP:{"n":3,"of":6,"what":"stop"}'
                foreach ($n in @('wuauserv', 'bits')) { try { Stop-Service $n -Force -ErrorAction Stop } catch { $log += ('could not stop ' + $n) } }
                Start-Sleep -Seconds 2
                Write-Output 'SCP_PROGRAM_STEP:{"n":4,"of":6,"what":"cache"}'
                $dl = Join-Path $env:SystemRoot 'SoftwareDistribution\Download'
                $freed = [double]0; $left = 0
                if (Test-Path -LiteralPath $dl) { foreach ($f in @(Get-ChildItem -LiteralPath $dl -Force -ErrorAction SilentlyContinue)) { $sz = [double]0; if ($f.PSIsContainer) { $sz = [double](Get-ChildItem -LiteralPath $f.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum } else { $sz = [double]$f.Length }; try { Remove-Item -LiteralPath $f.FullName -Recurse -Force -ErrorAction Stop; $freed += $sz } catch { $left++ } } }
                Write-Output 'SCP_PROGRAM_STEP:{"n":5,"of":6,"what":"dism"}'
                foreach ($n in @('bits', 'wuauserv')) { try { Start-Service $n -ErrorAction Stop } catch { $log += ('could not start ' + $n) } }
                $d = ScpRun (Join-Path $env:SystemRoot 'System32\dism.exe') '/Online /Cleanup-Image /CheckHealth' (ScpOem) 600
                $dv = if ($d.text -match 'No component store corruption detected') { 'clean' } elseif ($d.text -match 'not repairable') { 'broken' } elseif ($d.text -match 'repairable') { 'repairable' } elseif ($d.code -eq 0) { 'ok' } else { 'unknown' }
                Write-Output 'SCP_PROGRAM_STEP:{"n":6,"of":6,"what":"scan"}'
                $titles = @(); $scan = 'done'
                $job = Start-Job -ScriptBlock { $s = New-Object -ComObject Microsoft.Update.Session; $r = $s.CreateUpdateSearcher().Search('IsInstalled=0 and IsHidden=0'); @($r.Updates | ForEach-Object { [string]$_.Title }) }
                if (Wait-Job $job -Timeout 360) { try { $titles = @(Receive-Job $job -ErrorAction Stop) } catch { $scan = 'error' } } else { $scan = 'timeout'; Stop-Job $job }
                Remove-Job $job -Force
                $reboot = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
                ScpOut @{ task = 'wurepair'; ok = $true; freedMb = [math]::Round($freed / 1MB); left = $left; log = @($log); dism = $dv; scan = $scan; pending = $titles.Count; titles = @($titles | Select-Object -First 12); reboot = [bool]$reboot; freeGb = $freeGb }
            }
        }
        'wuinstall' {
            Write-Output 'SCP_PROGRAM_STEP:{"n":1,"of":5,"what":"space"}'
            $drive = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='" + $env:SystemDrive + "'")
            $freeGb = [math]::Round($drive.FreeSpace / 1GB, 1)
            $pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' -ErrorAction SilentlyContinue
            $wuSvc = Get-Service wuauserv -ErrorAction SilentlyContinue
            if ($freeGb -lt 8) { ScpOut @{ task = 'wuinstall'; ok = $false; error = 'NO_SPACE'; freeGb = $freeGb } }
            elseif (-not $wuSvc) { ScpOut @{ task = 'wuinstall'; ok = $false; error = 'NO_WU_SERVICE' } }
            elseif (($pol -and $pol.NoAutoUpdate -eq 1) -or $wuSvc.StartType -eq 'Disabled') { ScpOut @{ task = 'wuinstall'; ok = $false; error = 'WU_DISABLED' } }
            else {
                if ($wuSvc.Status -ne 'Running') { try { Start-Service wuauserv -ErrorAction Stop } catch { } }
                $prog = Join-Path $env:SystemRoot 'Temp\scp-wuinstall-step.txt'
                Remove-Item -LiteralPath $prog -Force -ErrorAction SilentlyContinue
                $sb = {
                    param($prog)
                    $ErrorActionPreference = 'Stop'
                    function P($n, $w) { [IO.File]::WriteAllText($prog, ([string]$n + '|' + $w)) }
                    P 2 'search'
                    $s = New-Object -ComObject Microsoft.Update.Session
                    $r = $s.CreateUpdateSearcher().Search("IsInstalled=0 and IsHidden=0 and Type='Software'")
                    $list = New-Object -ComObject Microsoft.Update.UpdateColl
                    $skipped = @()
                    foreach ($u in $r.Updates) {
                        if ($u.Title -match 'Feature update|Upgrade to Windows|Windows 1[01], version') { $skipped += [string]$u.Title; continue }
                        if ($u.InstallationBehavior.CanRequestUserInput) { $skipped += [string]$u.Title; continue }
                        if ($list.Count -ge 10) { $skipped += [string]$u.Title; continue }
                        if (-not $u.EulaAccepted) { $u.AcceptEula() }
                        [void]$list.Add($u)
                    }
                    $out = @{ found = [int]$r.Updates.Count; installed = @(); failed = @(); skipped = @($skipped); reboot = $false }
                    if ($list.Count -gt 0) {
                        P 3 'download'
                        $d = $s.CreateUpdateDownloader(); $d.Updates = $list; [void]$d.Download()
                        $ready = New-Object -ComObject Microsoft.Update.UpdateColl
                        foreach ($u in $list) { if ($u.IsDownloaded) { [void]$ready.Add($u) } else { $out.failed += [string]$u.Title } }
                        if ($ready.Count -gt 0) {
                            P 4 'install'
                            $i = $s.CreateUpdateInstaller(); $i.Updates = $ready; $i.AllowSourcePrompts = $false
                            $ir = $i.Install()
                            P 5 'verify'
                            for ($k = 0; $k -lt $ready.Count; $k++) { $rc = $ir.GetUpdateResult($k).ResultCode; if ($rc -eq 2 -or $rc -eq 3) { $out.installed += [string]$ready.Item($k).Title } else { $out.failed += [string]$ready.Item($k).Title } }
                            $out.reboot = [bool]$ir.RebootRequired
                        }
                    }
                    return $out
                }
                $job = Start-Job -ScriptBlock $sb -ArgumentList $prog
                $last = ''; $deadline = (Get-Date).AddSeconds(1500)
                while ($job.State -eq 'Running' -and (Get-Date) -lt $deadline) {
                    Start-Sleep -Seconds 3
                    if (Test-Path -LiteralPath $prog) { $cur = [string](Get-Content -LiteralPath $prog -Raw -ErrorAction SilentlyContinue); if ($cur -and $cur -ne $last) { $last = $cur; $a = $cur.Trim().Split('|'); Write-Output ('SCP_PROGRAM_STEP:{"n":' + [int]$a[0] + ',"of":5,"what":"' + ($a[1] -replace '[^a-z]', '') + '"}') } }
                }
                if ($job.State -eq 'Running') { ScpOut @{ task = 'wuinstall'; ok = $true; state = 'timeout'; found = 0; installed = @(); failed = @(); skipped = @(); reboot = $false } }
                else {
                    try { $res = Receive-Job $job -ErrorAction Stop; ScpOut @{ task = 'wuinstall'; ok = $true; state = 'done'; found = [int]$res.found; installed = @($res.installed); failed = @($res.failed); skipped = @($res.skipped); reboot = [bool]$res.reboot } }
                    catch { ScpOut @{ task = 'wuinstall'; ok = $true; state = 'error'; message = $_.Exception.Message; found = 0; installed = @(); failed = @(); skipped = @(); reboot = $false } }
                }
                Remove-Job $job -Force -ErrorAction SilentlyContinue
                Remove-Item -LiteralPath $prog -Force -ErrorAction SilentlyContinue
            }
        }
        'wurestart' {
            $parts = $ScpArg -split '\|'
            $sd = Join-Path $env:SystemRoot 'System32\shutdown.exe'
            if ($parts[0] -eq 'cancel') {
                $r = ScpRun $sd '/a' (ScpOem) 30
                ScpOut @{ task = 'wurestart'; ok = $true; action = 'cancel'; none = ($r.code -eq 1116) }
            }
            elseif ($parts[0] -eq 'restart' -and $parts[1] -match '^[A-Za-z0-9+/=]{1,700}$') {
                $msg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1]))
                $r = ScpRun $sd ('/r /t 300 /c "' + ($msg -replace '"', "'") + '"') (ScpOem) 30
                ScpOut @{ task = 'wurestart'; ok = ($r.code -eq 0); error = $(if ($r.code -eq 1190) { 'ALREADY_SCHEDULED' } elseif ($r.code -ne 0) { 'FAILED' } else { '' }); action = 'restart'; seconds = 300 }
            }
            else { ScpOut @{ task = 'wurestart'; ok = $false; error = 'BAD_ARGUMENT' } }
        }
        'avscan' {
            $ents = @(ScpAvEntries | ForEach-Object { @{ key = $_.key; name = $_.name; version = $_.version; publisher = $_.publisher; guid = [bool]($_.key -match '^\{[0-9A-Fa-f-]{36}\}$'); silent = [bool]($_.quiet -or ($_.uninstall -match 'msiexec')); wow = $_.wow } })
            ScpOut @{ task = 'avscan'; ok = $true; products = @(ScpSecurityCenter); defender = (ScpDefender); entries = $ents }
        }
        'avremove' {
            $e = $null
            if ($ScpArg -match '^[A-Za-z0-9{}_. -]{1,120}$') { $e = @(ScpAvEntries | Where-Object { $_.key -eq $ScpArg }) | Select-Object -First 1 }
            $guidRe = '\{[0-9A-Fa-f-]{36}\}'
            if (-not $e) { ScpOut @{ task = 'avremove'; ok = $false; error = 'NOT_FOUND' } }
            elseif ($e.name -match '(?i)mesh ?agent|meshcentral|scp[- ]?remote') { ScpOut @{ task = 'avremove'; ok = $false; error = 'REFUSED_REMOTE_AGENT' } }
            elseif (@(ScpSecurityCenter | Where-Object { $_.on -and -not $_.old -and $_.name -and ($e.name -like ('*' + $_.name + '*')) }).Count) { ScpOut @{ task = 'avremove'; ok = $false; error = 'REFUSED_ACTIVE_ANTIVIRUS' } }
            else {
                $file = ''; $cmdArgs = ''
                if ($e.key -match ('^' + $guidRe + '$')) { $file = Join-Path $env:SystemRoot 'System32\msiexec.exe'; $cmdArgs = '/x ' + $e.key + ' /qn /norestart' }
                elseif ($e.uninstall -match ('(?i)msiexec.*(' + $guidRe + ')')) { $file = Join-Path $env:SystemRoot 'System32\msiexec.exe'; $cmdArgs = '/x ' + $Matches[1] + ' /qn /norestart' }
                elseif ($e.quiet) { $file = $env:ComSpec; $cmdArgs = '/c ' + $e.quiet }
                if (-not $file) { ScpOut @{ task = 'avremove'; ok = $false; error = 'NO_SILENT_UNINSTALLER'; message = $e.uninstall } }
                else {
                    $r = ScpRun $file $cmdArgs (ScpOem) 1200
                    $gone = -not @(ScpAvEntries | Where-Object { $_.key -eq $e.key }).Count
                    ScpOut @{ task = 'avremove'; ok = ($r.code -ne -999); error = $(if ($r.code -eq -999) { 'TIMEOUT' } else { '' }); name = $e.name; code = $r.code; gone = $gone; restart = ($r.code -eq 3010 -or $r.code -eq 1641); defender = (ScpDefender); products = @(ScpSecurityCenter); tail = (ScpTail $r.text 4) }
                }
            }
        }
        'winget' {
            $dir = Get-ChildItem "$env:ProgramFiles\WindowsApps" -Filter 'Microsoft.DesktopAppInstaller_*_x64__8wekyb3d8bbwe' -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
            $wg = if ($dir) { Join-Path $dir.FullName 'winget.exe' } else { '' }
            if (-not $wg -or -not (Test-Path -LiteralPath $wg)) { ScpOut @{ task = 'winget'; ok = $false; error = 'NO_WINGET' } }
            else {
                $results = @()
                foreach ($id in @($ScpArg -split ',' | Where-Object { $_ -match '^[A-Za-z0-9][A-Za-z0-9.+_-]*$' })) {
                    $common = "install --id $id -e --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity"
                    $r = ScpRun $wg ($common + ' --scope machine') ([System.Text.Encoding]::UTF8) 900
                    if ($r.code -eq -1978335216 -or $r.code -eq -1978335212) { $r = ScpRun $wg $common ([System.Text.Encoding]::UTF8) 900 }
                    $results += @{ id = $id; code = $r.code; tail = (ScpTail $r.text 3) }
                }
                ScpOut @{ task = 'winget'; ok = $true; results = @($results) }
            }
        }
        'deploy' {
            $parts = $ScpArg -split '\|'
            $rel = $parts[0]; $want = ([string]$parts[1]).ToUpperInvariant(); $fallback = [string]$parts[2]
            if ($rel -notmatch '^[A-Za-z0-9/_.-]+$' -or $want -notmatch '^[0-9A-F]{64}$') { ScpOut @{ task = 'deploy'; ok = $false; error = 'BAD_ARGUMENT' } }
            else {
                $base = ScpServerBase; if (-not $base) { $base = $fallback }
                $url = $base + $rel
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                # The hospital server uses its own certificate; the SHA-256 check below is what proves the file.
                [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
                $dir = Join-Path $env:ProgramData 'SCPclear'
                New-Item -ItemType Directory -Path $dir -Force | Out-Null
                $tmp = Join-Path $dir 'SCPclear.exe.download'; $dst = Join-Path $dir 'SCPclear.exe'
                (New-Object Net.WebClient).DownloadFile($url, $tmp)
                $sha = [System.Security.Cryptography.SHA256]::Create(); $fs = [IO.File]::OpenRead($tmp)
                try { $got = ([BitConverter]::ToString($sha.ComputeHash($fs)) -replace '-', '') } finally { $fs.Close(); $sha.Dispose() }
                if ($got -ne $want) { Remove-Item -LiteralPath $tmp -Force; ScpOut @{ task = 'deploy'; ok = $false; error = 'HASH_MISMATCH'; url = $url } }
                else {
                    Move-Item -LiteralPath $tmp -Destination $dst -Force
                    $lnk = Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'SCPclear.lnk'
                    try { $ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut($lnk); $s.TargetPath = $dst; $s.WorkingDirectory = $dir; $s.Description = 'SCPclear'; $s.Save() } catch { $lnk = '' }
                    ScpOut @{ task = 'deploy'; ok = $true; path = $dst; shortcut = $lnk; size = (Get-Item -LiteralPath $dst).Length }
                }
            }
        }
        default { ScpOut @{ task = $ScpTask; ok = $false; error = 'UNKNOWN_TASK' } }
    }
} catch {
    ScpOut @{ task = $ScpTask; ok = $false; error = 'FAILED'; message = $_.Exception.Message }
}
