# SCP-Remote: put a new SCPclear.exe on the server for "Send SCPclear" (hospital/SCPCLEAR-TOOLS.md).
# Usage: powershell -ExecutionPolicy Bypass -File scripts\update-scpclear.ps1 -Exe "C:\path\SCPclear.exe"
# Copies the file to public\tools and rewrites public\tools\scpclear.json (version, size, SHA-256).
# No server restart is needed: the dashboard reads the JSON each time.
param([Parameter(Mandatory = $true)][string]$Exe)
$ErrorActionPreference = 'Stop'
$dir = Join-Path (Split-Path -Parent $PSScriptRoot) 'public\tools'
$src = (Resolve-Path -LiteralPath $Exe).Path
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$dst = Join-Path $dir 'SCPclear.exe'
Copy-Item -LiteralPath $src -Destination $dst -Force
$sha = [System.Security.Cryptography.SHA256]::Create()
$fs = [IO.File]::OpenRead($dst)
try { $hash = ([BitConverter]::ToString($sha.ComputeHash($fs)) -replace '-', '') } finally { $fs.Close(); $sha.Dispose() }
$info = (Get-Item -LiteralPath $dst).VersionInfo
$ver = if ($info.ProductVersion) { $info.ProductVersion } else { $info.FileVersion }
if ($ver -match '^(\d+\.\d+\.\d+)') { $ver = $Matches[1] }
$json = [ordered]@{ name = 'SCPclear'; version = [string]$ver; file = 'SCPclear.exe'; size = (Get-Item -LiteralPath $dst).Length; sha256 = $hash; source = 'scripts/update-scpclear.ps1' } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $dir 'scpclear.json'), $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('SCPclear ' + $ver + ' -> ' + $dst + ' (SHA-256 ' + $hash + ')')
