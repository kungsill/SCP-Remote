$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
try {
    # Pin the hospital server certificate, including when it uses a private CA.
    Add-Type @'
using System; using System.Net; using System.Security.Cryptography; using System.Net.Security;
public static class ScpDriverTls {
 public static void Enable() { ServicePointManager.ServerCertificateValidationCallback=Verify; }
 public static bool Verify(object sender, System.Security.Cryptography.X509Certificates.X509Certificate cert, System.Security.Cryptography.X509Certificates.X509Chain chain, SslPolicyErrors errors) {
  if(cert==null)return false;
  using(var sha=SHA256.Create()) { return BitConverter.ToString(sha.ComputeHash(cert.GetRawCertData())).Replace("-","")=="__PIN__"; }
 }
}
'@
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    [ScpDriverTls]::Enable()
    $files=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__FILES__'))|ConvertFrom-Json
    $root=Join-Path $env:ProgramData ('SCP-Remote\DriverCache\__PACKAGE__\'+[guid]::NewGuid().ToString())
    $null=New-Item -ItemType Directory -Path $root -Force
    $client=New-Object Net.WebClient
    foreach($file in $files) {
        $cab=Join-Path $root $file.name
        $client.DownloadFile($file.url,$cab)
        if((Get-FileHash -LiteralPath $cab -Algorithm SHA256).Hash -ne $file.sha256) { throw 'HASH_MISMATCH' }
        if($file.kind -eq 'zip') {
            Expand-Archive -LiteralPath $cab -DestinationPath $root -Force
        } else {
            & "$env:windir\System32\expand.exe" '-F:*' $cab $root | Out-Null
            if($LASTEXITCODE -ne 0){throw 'EXTRACT_FAILED'}
        }
    }
    $infs=@(Get-ChildItem -LiteralPath $root -Filter '*.inf' -Recurse)
    if(!$infs.Count){throw 'NO_DRIVER_INF'}
    $reboot=$false; $ok=0; $failed=@()
    foreach($inf in $infs){
        & "$env:windir\System32\pnputil.exe" /add-driver $inf.FullName /install | Out-Null
        if($LASTEXITCODE -eq 0){$ok++}
        elseif($LASTEXITCODE -eq 3010){$ok++; $reboot=$true}
        else{$failed+=("{0}={1}" -f $inf.Name,$LASTEXITCODE)}
    }
    # A vendor pack usually carries one driver per chipset generation and only the one
    # matching this machine can apply. The job has failed only when nothing would stage.
    if($ok -eq 0){throw ('INSTALL_EXIT_'+($failed -join ','))}
    Write-Output ('SCP_LIBRARY_INSTALL:'+(@{ok=$true;reboot=$reboot;applied=$ok;skipped=$failed.Count;note='Driver package processed by Windows. Verify device status; Windows may retain a higher-ranked driver.'}|ConvertTo-Json -Compress))
} catch { Write-Output ('SCP_LIBRARY_INSTALL:'+(@{ok=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress)) }
