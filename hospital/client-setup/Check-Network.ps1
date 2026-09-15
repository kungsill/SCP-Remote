<#
    SCP-Remote network check for a client machine.
    Reports this machine's addresses and whether it can reach the server, so the IT
    team knows whether the machine only needs permission on the server or whether the
    network route itself is missing. Read-only: changes nothing on this machine.
#>
[CmdletBinding()]
param()

# The server address. Change this line if the server ever moves.
$serverAddress = '192.168.2.25'
$serverPort = 8443

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('เครื่อง: ' + $env:COMPUTERNAME)
$lines.Add('')
$lines.Add('ที่อยู่ IP ของเครื่องนี้')

$addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' })
if ($addresses.Count -eq 0) {
    $lines.Add('  ไม่พบที่อยู่ IP เครื่องนี้อาจยังไม่ได้ต่อสายหรือ Wi-Fi')
} else {
    foreach ($a in $addresses) {
        # The network range is what the server has to allow, so work it out here
        # instead of asking someone to calculate it by hand.
        $bytes = ([System.Net.IPAddress]::Parse($a.IPAddress)).GetAddressBytes()
        $maskBits = [uint32]0
        if ($a.PrefixLength -gt 0) { $maskBits = [uint32]::MaxValue -shl (32 - $a.PrefixLength) }
        $maskBytes = [BitConverter]::GetBytes($maskBits)
        [array]::Reverse($maskBytes)
        $network = (0..3 | ForEach-Object { $bytes[$_] -band $maskBytes[$_] }) -join '.'
        $lines.Add('  ' + $a.IPAddress + '/' + $a.PrefixLength + '   (' + $a.InterfaceAlias + ')')
        $lines.Add('     วงของเครื่องนี้คือ  ' + $network + '/' + $a.PrefixLength)
    }
}

$lines.Add('')
$lines.Add('ทดสอบการเชื่อมต่อไปยังเซิร์ฟเวอร์ ' + $serverAddress + ' พอร์ต ' + $serverPort)
$reachable = $false
try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect($serverAddress, $serverPort, $null, $null)
    $reachable = $async.AsyncWaitHandle.WaitOne(5000, $false) -and $client.Connected
    if ($client.Connected) { $client.EndConnect($async) }
    $client.Close()
} catch { $reachable = $false }

if ($reachable) {
    $lines.Add('  ผลลัพธ์: เชื่อมต่อได้')
    $lines.Add('')
    $lines.Add('สรุป เส้นทางเครือข่ายถึงเซิร์ฟเวอร์แล้ว')
    $lines.Add('ถ้าติดตั้งแล้วเครื่องยังไม่ขึ้นในระบบ ให้แจ้งฝ่ายไอทีว่าต้องเปิดสิทธิ์ให้วงของเครื่องนี้')
} else {
    $lines.Add('  ผลลัพธ์: เชื่อมต่อไม่ได้')
    $lines.Add('')
    $lines.Add('สรุป เครื่องนี้ยังวิ่งไปไม่ถึงเซิร์ฟเวอร์')
    $lines.Add('สาเหตุมักเป็นเส้นทางระหว่างวงเครือข่าย ต้องแจ้งผู้ดูแลระบบเครือข่ายของโรงพยาบาล')
    $lines.Add('ไม่ใช่ปัญหาของตัวติดตั้ง และแก้ที่เครื่องนี้เองไม่ได้')
}

$report = $lines -join [Environment]::NewLine
try { Set-Clipboard -Value $report } catch { }

$form = New-Object System.Windows.Forms.Form
$form.Text = 'SCP-Remote ตรวจเครือข่าย'
$form.ClientSize = New-Object System.Drawing.Size(560, 400)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true
$box.ReadOnly = $true
$box.ScrollBars = 'Vertical'
$box.Location = New-Object System.Drawing.Point(18, 18)
$box.Size = New-Object System.Drawing.Size(524, 310)
$box.BackColor = [System.Drawing.Color]::FromArgb(247, 249, 249)
$box.BorderStyle = 'FixedSingle'
$box.Text = $report
$form.Controls.Add($box)

$note = New-Object System.Windows.Forms.Label
$note.Text = 'คัดลอกข้อความนี้ไว้ในคลิปบอร์ดแล้ว วางส่งให้ฝ่ายไอทีได้เลย'
$note.Location = New-Object System.Drawing.Point(18, 336)
$note.Size = New-Object System.Drawing.Size(420, 24)
$note.ForeColor = [System.Drawing.Color]::FromArgb(110, 110, 110)
$form.Controls.Add($note)

$close = New-Object System.Windows.Forms.Button
$close.Text = 'ปิด'
$close.Location = New-Object System.Drawing.Point(442, 332)
$close.Size = New-Object System.Drawing.Size(100, 34)
$close.FlatStyle = 'Flat'
$close.Add_Click({ $form.Close() })
$form.Controls.Add($close)

[void]$form.ShowDialog()
