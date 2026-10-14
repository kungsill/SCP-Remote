# SCP-Remote Suite: one run sets everything up.
#   1. checks Node.js (offers to install it with winget)
#   2. installs packages, builds the Thai pages and starts the SCP-Remote server
#   3. opens https://127.0.0.1:8443 in the browser (the first account made is the administrator)
#   4. asks whether to run SCP-Remote as a Windows service (starts with Windows)
#   5. puts shortcuts on the desktop: SCP-Remote, SCPclear, SCPPrint setup
# Run START-HERE.cmd (it opens this as administrator). -NoStart builds without starting (for testing).
param([switch]$NoStart, [switch]$Yes, [switch]$NoShortcuts)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $here 'server'
function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Ask($q) { if ($Yes) { return $true }; $a = Read-Host "$q (Y/N)"; return $a -match '^(y|yes|ใช่|ตกลง)' }

Say ''
Say '=== SCP-Remote Suite: ติดตั้ง ===' 'Magenta'

# 1. Node.js 20 or newer
$node = Get-Command node -ErrorAction SilentlyContinue
$major = 0
if ($node) { $major = [int]((& node -v) -replace '^v(\d+).*', '$1') }
if ($major -lt 20) {
    Say 'ต้องใช้ Node.js 20 ขึ้นไป (ยังไม่มีในเครื่องนี้ หรือรุ่นเก่าเกินไป)' 'Yellow'
    if ((Get-Command winget -ErrorAction SilentlyContinue) -and (Ask 'ติดตั้ง Node.js LTS ด้วย winget ตอนนี้เลยไหม')) {
        winget install -e --id OpenJS.NodeJS.LTS
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    } else {
        Say 'ดาวน์โหลดได้ที่ https://nodejs.org (เลือกรุ่น LTS) ติดตั้งแล้วเปิด START-HERE.cmd อีกครั้ง' 'Yellow'
        exit 1
    }
}
Say ('Node.js ' + (& node -v)) 'Green'

# 2. packages + Thai pages
Push-Location $server
try {
    if (-not (Test-Path 'node_modules')) { Say 'กำลังติดตั้งแพ็กเกจ (ครั้งแรกใช้เวลา 1–3 นาที)...'; & npm ci --no-audit --no-fund --loglevel=error; if ($LASTEXITCODE) { throw 'npm ci ไม่สำเร็จ' } }
    Say 'กำลังสร้างหน้าเว็บภาษาไทย...'
    & npm run -s build:hospital; if ($LASTEXITCODE) { throw 'build ไม่สำเร็จ' }
} finally { Pop-Location }
Say 'ติดตั้งระบบเสร็จ' 'Green'

# 5. desktop shortcuts (before starting, so they are there even if the server window is closed)
if (-not $NoShortcuts) {
$desk = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
function Shortcut($name, $target, $arg, $dir) { $s = $ws.CreateShortcut((Join-Path $desk "$name.lnk")); $s.TargetPath = $target; if ($arg) { $s.Arguments = $arg }; if ($dir) { $s.WorkingDirectory = $dir }; $s.Save() }
$url = Join-Path $desk 'SCP-Remote.url'
Set-Content $url "[InternetShortcut]`r`nURL=https://127.0.0.1:8443/" -Encoding ASCII
$clear = Join-Path $here 'tools\SCPclear-plus'
Shortcut 'SCPclear' (Join-Path $clear 'RUN.bat') $null $clear
$printSetup = Join-Path $here 'tools\SCPPrint\bin\SCPPrint_Setup.exe'
if (Test-Path $printSetup) { Shortcut 'ติดตั้ง SCPPrint' $printSetup $null (Split-Path $printSetup) }
Say 'สร้างทางลัดบนเดสก์ท็อปแล้ว: SCP-Remote, SCPclear, ติดตั้ง SCPPrint' 'Green'
}

if ($NoStart) { Say 'ข้ามการเปิดเซิร์ฟเวอร์ (-NoStart)'; exit 0 }

# 4. as a Windows service, or just this once
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')
if ($isAdmin -and (Ask 'ให้ SCP-Remote เปิดเองทุกครั้งที่เปิดเครื่อง (ติดตั้งเป็นบริการ Windows) ไหม')) {
    Push-Location $server
    try { & npm run -s service:install } finally { Pop-Location }
} else {
    Say 'กำลังเปิดเซิร์ฟเวอร์ในหน้าต่างใหม่ (ปิดหน้าต่างนั้น = ปิดระบบ)...'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'title SCP-Remote server && npm run start:hospital' -WorkingDirectory $server
}

# 3. wait for the port, then open the browser
Say 'รอเซิร์ฟเวอร์พร้อม...'
for ($i = 0; $i -lt 60; $i++) {
    if ((Test-NetConnection 127.0.0.1 -Port 8443 -WarningAction SilentlyContinue).TcpTestSucceeded) { break }
    Start-Sleep -Seconds 2
}
Start-Process 'https://127.0.0.1:8443/'
Say ''
Say 'เสร็จแล้ว: เปิด https://127.0.0.1:8443 สร้างบัญชีแรก (จะเป็นผู้ดูแลระบบ)' 'Green'
Say 'เบราว์เซอร์จะเตือนเรื่องใบรับรอง เป็นปกติของใบรับรองที่สร้างเอง กด Advanced > Continue' 'Gray'
