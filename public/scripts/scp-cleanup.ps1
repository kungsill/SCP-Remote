param([string]$TestRoot, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$report = [ordered]@{ version=1; state='completed'; deletedFiles=0; deletedBytes=[long]0; skipped=0; errors=0; dryRun=[bool]$DryRun; beforeFree=[long]0; afterFree=[long]0; limited=$false; processed=0; total=0 }
$mutex = New-Object System.Threading.Mutex($false, 'Global\SCPRemoteTempCleanup')
$owned = $false
$script:progressClock = [datetime]::MinValue
function Send-CleanupProgress([string]$stage, [int]$scanned, [switch]$Force) {
    if ($Force -or ((Get-Date)-$script:progressClock).TotalSeconds -ge 5) {
        $script:progressClock=Get-Date
        'SCP_CLEANUP_PROGRESS:' + (@{stage=$stage; scanned=$scanned; processed=$report.processed; total=$report.total; deletedFiles=$report.deletedFiles; deletedBytes=$report.deletedBytes; skipped=$report.skipped; errors=$report.errors} | ConvertTo-Json -Compress)
    }
}
Send-CleanupProgress 'preparing' 0 -Force
function Test-SafePath([string]$Path) {
    try {
        $cursor = [IO.Path]::GetFullPath($Path)
        while ($cursor) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
            $parent = [IO.Directory]::GetParent($cursor)
            if ($null -eq $parent) { break }
            $cursor = $parent.FullName
        }
        return $true
    } catch { return $false }
}
try {
    $owned = $mutex.WaitOne(0)
    if (-not $owned) { $report.state='busy' }
    else {
        $roots = @()
        if ($TestRoot) {
            $resolved = [IO.Path]::GetFullPath($TestRoot).TrimEnd('\')
            if ((Split-Path -Leaf $resolved) -notlike 'SCP-Cleanup-Test-*') { throw 'INVALID_TEST_ROOT' }
            $roots = @($resolved)
        } else {
            $roots += (Join-Path $env:windir 'Temp')
            Get-CimInstance Win32_UserProfile | Where-Object { -not $_.Special -and $_.LocalPath } | ForEach-Object {
                $roots += (Join-Path $_.LocalPath 'AppData\Local\Temp')
            }
        }
        $drive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot($env:windir))
        $report.beforeFree = $drive.AvailableFreeSpace
        $cutoff = (Get-Date).AddDays(-7)
        $deadline = (Get-Date).AddSeconds(120)
        $visited = 0
        $candidates=New-Object 'Collections.Generic.List[object]'
        foreach ($root in ($roots | Select-Object -Unique)) {
            if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
            $root = [IO.Path]::GetFullPath($root).TrimEnd('\')
            if (-not (Test-SafePath $root)) { $report.skipped++; continue }
            $phase = 'scanning'
            Send-CleanupProgress $phase $visited -Force
            $stack = New-Object 'Collections.Generic.Stack[string]'
            $stack.Push($root)
            while ($stack.Count -gt 0) {
                if ((Get-Date) -gt $deadline -or $visited -ge 100000) { $report.limited=$true; break }
                $dir = $stack.Pop()
                if (-not (Test-SafePath $dir)) { $report.skipped++; continue }
                try { $items = @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop) } catch { $report.errors++; continue }
                foreach ($item in $items) {
                    $visited++
                    Send-CleanupProgress $phase $visited
                    if ((Get-Date) -gt $deadline -or $visited -ge 100000) { $report.limited=$true; break }
                    $full = [IO.Path]::GetFullPath($item.FullName)
                    if (-not $full.StartsWith($root+'\', [StringComparison]::OrdinalIgnoreCase) -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $report.skipped++; continue }
                    if ($item.PSIsContainer) { $stack.Push($full); continue }
                    if ($item.LastWriteTime -ge $cutoff -or $item.CreationTime -ge $cutoff) { $report.skipped++; continue }
                    # Recheck the absolute path and every ancestor immediately before deletion.
                    if (-not (Test-SafePath $full)) { $report.skipped++; continue }
                    $candidates.Add(@{Path=$full;Root=$root})
                }
            }
            if ($report.limited) { break }
        }
        $report.total=$candidates.Count
        Send-CleanupProgress 'cleaning' $visited -Force
        foreach($candidate in $candidates) {
            if((Get-Date) -gt $deadline){$report.limited=$true;break}
            $full=[IO.Path]::GetFullPath($candidate.Path)
            if(-not $full.StartsWith($candidate.Root+'\', [StringComparison]::OrdinalIgnoreCase) -or -not (Test-SafePath $full)){$report.skipped++;$report.processed++;continue}
            try {
                $item=Get-Item -LiteralPath $full -Force -ErrorAction Stop
                if($item.PSIsContainer -or $item.LastWriteTime -ge $cutoff -or $item.CreationTime -ge $cutoff){$report.skipped++}
                else { $size=$item.Length;if(-not $DryRun){Remove-Item -LiteralPath $full -Force -ErrorAction Stop};$report.deletedFiles++;$report.deletedBytes+=$size }
            }catch{$report.errors++}
            $report.processed++
            Send-CleanupProgress 'cleaning' $visited
        }
        Send-CleanupProgress 'cleaning' $visited -Force
        if(-not $report.limited){Send-CleanupProgress 'summarizing' $visited -Force}
        $report.afterFree = $drive.AvailableFreeSpace
    }
} catch { $report.state='failed'; $report.errors++; }
finally { if ($owned) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
'SCP_CLEANUP_RESULT:' + ($report | ConvertTo-Json -Compress)
