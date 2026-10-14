$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
function Get-DriverUrls($update, $depth=0) {
    if ($depth -gt 4) { return }
    foreach ($content in $update.DownloadContents) { if ($content.DownloadUrl) { [string]$content.DownloadUrl } }
    foreach ($bundle in $update.BundledUpdates) { Get-DriverUrls $bundle ($depth+1) }
}
try {
    $computer=Get-CimInstance Win32_ComputerSystem
    $os=Get-CimInstance Win32_OperatingSystem
    $session=New-Object -ComObject Microsoft.Update.Session
    $session.ClientApplicationID='SCP-Remote Driver Library'
    $search=$session.CreateUpdateSearcher().Search("IsInstalled=0 and IsHidden=0 and Type='Driver'")
    if ($search.ResultCode -ne 2) { throw "Search result code $($search.ResultCode)" }
    $updates=@()
    foreach ($update in $search.Updates) {
        if ($updates.Count -ge 150) { throw 'TOO_MANY_UPDATES' }
        # Firmware and BIOS are outside this driver installation workflow.
        if ($update.DriverClass -eq 'Firmware' -or $update.Title -match '\b(BIOS|Firmware)\b') { continue }
        $updates+=@{id=[string]$update.Identity.UpdateID;revision=[int]$update.Identity.RevisionNumber;title=[string]$update.Title;hardwareId=[string]$update.DriverHardwareID;manufacturer=[string]$update.DriverManufacturer;driverDate=[string]$update.DriverVerDate;urls=@(Get-DriverUrls $update | Select-Object -Unique)}
    }
    $report=@{manufacturer=[string]$computer.Manufacturer;model=[string]$computer.Model;os=[string]$os.Caption;architecture=[string]$os.OSArchitecture;updates=$updates}
    Write-Output ('SCP_LIBRARY_RESULT:'+($report|ConvertTo-Json -Depth 8 -Compress))
} catch { Write-Output ('SCP_LIBRARY_ERROR:'+ $_.Exception.Message) }
