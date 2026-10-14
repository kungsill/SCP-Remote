param([string]$SourcePath)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $SourcePath) { $SourcePath=Join-Path $projectRoot '.local/build/MeshAgent' }
$sourceRoot=(Resolve-Path -LiteralPath $SourcePath).Path
$revision=& git -C $sourceRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $revision -ne 'b82cbde6136e699ba240cd8f38220ee3264da337') { throw 'Unexpected upstream revision. Use the pinned revision in README.md.' }
$patchPath=Join-Path $PSScriptRoot 'ecdsa-dtls.patch'
$ErrorActionPreference='Continue'
& git -C $sourceRoot apply --reverse --check $patchPath 2>$null
$patchAlreadyApplied=($LASTEXITCODE -eq 0)
$ErrorActionPreference='Stop'
if (-not $patchAlreadyApplied) {
 & git -C $sourceRoot apply --check $patchPath
 if ($LASTEXITCODE -ne 0) { throw 'Patch does not apply cleanly.' }
 & git -C $sourceRoot apply $patchPath
 if ($LASTEXITCODE -ne 0) { throw 'Patch failed.' }
}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$buildTools=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $buildTools) { throw 'Visual C++ Build Tools are required.' }
$msbuild=Join-Path $buildTools 'MSBuild/Current/Bin/MSBuild.exe'
& $msbuild (Join-Path $sourceRoot 'meshservice/MeshService-2022.vcxproj') /p:Configuration=Release /p:Platform=x64 /p:PlatformToolset=v142 /p:WindowsTargetPlatformVersion=10.0.19041.0 /m:2 /v:minimal
if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
$artifact=Join-Path $sourceRoot 'meshservice/Release/MeshService64.exe'
$output=Join-Path $PSScriptRoot ('release/preview-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $output | Out-Null
Copy-Item -LiteralPath $artifact -Destination (Join-Path $output 'SCP-Remote-Agent-preview.exe')
Copy-Item -LiteralPath $patchPath -Destination $output
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination $output
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination (Join-Path $output 'LICENSE-Apache-2.0.txt')
$hash=(Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
@{upstream=$revision;sha256=$hash;status='preview-not-installed';architecture='x64';feature='P-256 DTLS identity; existing server TLS identity retained'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'manifest.json') -Encoding UTF8
Write-Output $output
