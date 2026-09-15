<#
    SCP-Remote client setup wizard.
    Walks the person at the keyboard through consent, naming the computer, and the
    install itself, then registers the name so the machine is recognisable on the
    server. Windows PowerShell 5.1, run as administrator.
#>
[CmdletBinding()]
param()

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Colours sampled from the hospital logo so the window matches the printed identity.
$brand = [System.Drawing.Color]::FromArgb(230, 72, 155)
$brandDark = [System.Drawing.Color]::FromArgb(176, 42, 114)
$brandSoft = [System.Drawing.Color]::FromArgb(249, 189, 192)
$muted = [System.Drawing.Color]::FromArgb(105, 105, 105)
$logoPath = Join-Path $scriptDir 'logo.png'

function Show-Message($text, $icon) {
    [System.Windows.Forms.MessageBox]::Show($text, 'SCP-Remote', [System.Windows.Forms.MessageBoxButtons]::OK, $icon) | Out-Null
}

# The agent installer is downloaded per device group from the server, so it is not
# shipped with this script. Look for it next to the script.
function Find-AgentInstaller {
    $candidates = @(Get-ChildItem -Path $scriptDir -Filter '*.exe' -File -ErrorAction SilentlyContinue)
    $preferred = @($candidates | Where-Object { $_.Name -match 'agent' })
    if ($preferred.Count -gt 0) { return $preferred[0] }
    if ($candidates.Count -gt 0) { return $candidates[0] }
    return $null
}

# Match on the executable path rather than the service name, which changes if agent
# branding is ever customised on the server.
function Get-AgentService {
    return Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
        Where-Object { $_.PathName -match 'meshagent\.exe' } |
        Select-Object -First 1
}

function Get-AgentExePath($service) {
    if ($null -eq $service) { return $null }
    # A service path is either "C:\...\MeshAgent.exe" -args or an unquoted path, and
    # the quoted form is the usual one because the folder name contains a space.
    $match = [regex]::Match($service.PathName, '^\s*(?:"(?<exe>[^"]+)"|(?<exe>\S+))')
    if ($match.Success) { return $match.Groups['exe'].Value }
    return $null
}

# Write the name where the agent reads it. The .tag file is the documented source for
# the server-side device name; the same value goes into the agent settings file so the
# two never disagree if one of them is rebuilt.
function Write-DeviceCode($agentExePath, $code) {
    $dir = Split-Path -Parent $agentExePath
    $base = [System.IO.Path]::GetFileNameWithoutExtension($agentExePath)
    # Invariant culture keeps the year Gregorian, so it matches the server's own logs
    # instead of switching to the Buddhist era on a Thai-locale machine.
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm', [System.Globalization.CultureInfo]::InvariantCulture)
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $tagLines = @("~ServerName:$code", "~ServerDesc:$code (ติดตั้ง $stamp)")

    $tagFile = Join-Path $dir ($base + '.tag')
    [System.IO.File]::WriteAllText($tagFile, ($tagLines -join "`r`n") + "`r`n", $utf8)

    $mshFile = Join-Path $dir ($base + '.msh')
    if (Test-Path -LiteralPath $mshFile) {
        # The server writes this file as UTF-8, so read it the same way or a device
        # group named in Thai would come back mangled and be written back broken.
        $kept = @(Get-Content -LiteralPath $mshFile -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*Tag\s*=' })
        $kept += ('Tag=' + ($tagLines -join '\n'))
        [System.IO.File]::WriteAllLines($mshFile, $kept, $utf8)
    }
}

# ---------------------------------------------------------------- window ----

$form = New-Object System.Windows.Forms.Form
$form.Text = 'ติดตั้ง SCP-Remote'
$form.ClientSize = New-Object System.Drawing.Size(660, 470)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$banner = New-Object System.Windows.Forms.Panel
$banner.Location = New-Object System.Drawing.Point(0, 0)
$banner.Size = New-Object System.Drawing.Size(180, 410)
# The logo is pink on a transparent ground, so it needs a light panel to read well.
$banner.BackColor = [System.Drawing.Color]::FromArgb(252, 246, 249)
$form.Controls.Add($banner)

$bannerEdge = New-Object System.Windows.Forms.Panel
$bannerEdge.Location = New-Object System.Drawing.Point(177, 0)
$bannerEdge.Size = New-Object System.Drawing.Size(3, 410)
$bannerEdge.BackColor = $brandSoft
$banner.Controls.Add($bannerEdge)

$logoTop = 16
$logoBox = New-Object System.Windows.Forms.PictureBox
$logoBox.Location = New-Object System.Drawing.Point(20, $logoTop)
$logoBox.Size = New-Object System.Drawing.Size(138, 138)
$logoBox.SizeMode = 'Zoom'
$logoBox.BackColor = [System.Drawing.Color]::Transparent
# Track this separately: a control reports Visible as false until its form is shown,
# so reading it back here would always place the text as if there were no logo.
$hasLogo = $false
if (Test-Path -LiteralPath $logoPath) {
    # Read through a stream copy so the file is not left locked while the window is open.
    try {
        $bytes = [System.IO.File]::ReadAllBytes($logoPath)
        $stream = New-Object System.IO.MemoryStream(, $bytes)
        $logoBox.Image = [System.Drawing.Image]::FromStream($stream)
        $hasLogo = $true
    } catch { $hasLogo = $false }
}
$logoBox.Visible = $hasLogo
$banner.Controls.Add($logoBox)

$textTop = 164
if (-not $hasLogo) { $textTop = 40 }

$bannerTitle = New-Object System.Windows.Forms.Label
$bannerTitle.Text = 'SCP-Remote'
$bannerTitle.Font = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$bannerTitle.ForeColor = $brand
$bannerTitle.Location = New-Object System.Drawing.Point(18, $textTop)
$bannerTitle.Size = New-Object System.Drawing.Size(152, 30)
$banner.Controls.Add($bannerTitle)

$bannerSub = New-Object System.Windows.Forms.Label
$bannerSub.Text = "ระบบช่วยเหลือ`r`nคอมพิวเตอร์ระยะไกล`r`nฝ่ายไอทีโรงพยาบาล"
$bannerSub.ForeColor = $muted
$bannerSub.Location = New-Object System.Drawing.Point(20, ($textTop + 32))
$bannerSub.Size = New-Object System.Drawing.Size(150, 70)
$banner.Controls.Add($bannerSub)

$stepList = New-Object System.Windows.Forms.Label
$stepList.Location = New-Object System.Drawing.Point(20, ($textTop + 108))
$stepList.Size = New-Object System.Drawing.Size(150, 130)
$stepList.ForeColor = $brandDark
$banner.Controls.Add($stepList)

$stepTitle = New-Object System.Windows.Forms.Label
$stepTitle.Font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
$stepTitle.ForeColor = $brandDark
$stepTitle.Location = New-Object System.Drawing.Point(206, 28)
$stepTitle.Size = New-Object System.Drawing.Size(430, 32)
$form.Controls.Add($stepTitle)

$separator = New-Object System.Windows.Forms.Label
$separator.BorderStyle = 'Fixed3D'
$separator.AutoSize = $false
$separator.Location = New-Object System.Drawing.Point(206, 64)
$separator.Size = New-Object System.Drawing.Size(430, 2)
$form.Controls.Add($separator)

function New-Page {
    $page = New-Object System.Windows.Forms.Panel
    $page.Location = New-Object System.Drawing.Point(206, 80)
    $page.Size = New-Object System.Drawing.Size(436, 320)
    $page.Visible = $false
    $form.Controls.Add($page)
    return $page
}

# --- page 1, welcome
$pageWelcome = New-Page
$welcomeText = New-Object System.Windows.Forms.Label
$welcomeText.Location = New-Object System.Drawing.Point(0, 6)
$welcomeText.Size = New-Object System.Drawing.Size(430, 300)
$welcomeText.Text = @"
ตัวช่วยนี้จะติดตั้งโปรแกรมของฝ่ายไอทีลงในเครื่องนี้ เพื่อให้เจ้าหน้าที่ช่วยแก้ปัญหาได้โดยไม่ต้องเดินมาที่เครื่อง

มี 3 ขั้นตอน ใช้เวลาประมาณ 1 นาที

    1  อ่านคำขออนุญาต แล้วกดยินยอม
    2  ตั้งชื่อเครื่อง
    3  ติดตั้ง

ระหว่างติดตั้งไม่ต้องปิดโปรแกรมอื่น และไม่ต้องรีสตาร์ตเครื่อง

กด ถัดไป เพื่อเริ่ม
"@
$pageWelcome.Controls.Add($welcomeText)

# --- page 2, consent
$pageConsent = New-Page
$consentLead = New-Object System.Windows.Forms.Label
$consentLead.Location = New-Object System.Drawing.Point(0, 2)
$consentLead.Size = New-Object System.Drawing.Size(430, 22)
$consentLead.Text = 'โปรดอ่านก่อน แล้วกดยินยอมที่ด้านล่าง'
$consentLead.ForeColor = $muted
$pageConsent.Controls.Add($consentLead)

$consent = New-Object System.Windows.Forms.TextBox
$consent.Multiline = $true
$consent.ReadOnly = $true
$consent.ScrollBars = 'Vertical'
$consent.BackColor = [System.Drawing.Color]::FromArgb(247, 249, 249)
$consent.BorderStyle = 'FixedSingle'
$consent.Location = New-Object System.Drawing.Point(0, 26)
$consent.Size = New-Object System.Drawing.Size(430, 232)
$consent.Text = @"
สิ่งที่เจ้าหน้าที่ทำได้ และการขออนุญาต

- ขอดูและควบคุมหน้าจอ ขอใช้หน้าต่างคำสั่ง และขอเข้าถึงไฟล์บนเครื่องนี้
- ทุกครั้งที่ขอเข้าใช้งาน จะมีหน้าต่างขึ้นที่เครื่องนี้ให้กดอนุญาตก่อนเสมอ และปฏิเสธได้
- ถ้าไม่มีผู้กดอนุญาต ระบบจะไม่เข้าใช้งานเอง และจะไม่ยอมรับอัตโนมัติเมื่อหมดเวลา
- ขณะถูกรีโมต จะมีสัญลักษณ์แจ้งเตือนแสดงบนหน้าจอ

การทำงานของโปรแกรม

- ทำงานเบื้องหลังและเริ่มเองตั้งแต่เปิดเครื่อง เพื่อให้ขอความช่วยเหลือได้ทันที
- ขณะไม่มีการรีโมต โปรแกรมเพียงรอรับงาน ไม่บันทึกหน้าจอ ไม่ส่งไฟล์ออกไปเอง
- เชื่อมต่อเฉพาะเซิร์ฟเวอร์ภายในโรงพยาบาล ไม่ส่งข้อมูลออกอินเทอร์เน็ต
- ถอนการติดตั้งได้ที่ ตั้งค่า > แอป หรือแจ้งฝ่ายไอที

หากไม่ต้องการติดตั้ง ให้กดยกเลิก และแจ้งฝ่ายไอทีได้ตามปกติ
"@
$pageConsent.Controls.Add($consent)

$agree = New-Object System.Windows.Forms.CheckBox
$agree.Text = 'ข้าพเจ้าอ่านแล้ว และอนุญาตให้ติดตั้งโปรแกรมนี้'
$agree.Location = New-Object System.Drawing.Point(0, 268)
$agree.Size = New-Object System.Drawing.Size(430, 26)
$pageConsent.Controls.Add($agree)

# --- page 3, name
$pageName = New-Page
$nameLead = New-Object System.Windows.Forms.Label
$nameLead.Location = New-Object System.Drawing.Point(0, 6)
$nameLead.Size = New-Object System.Drawing.Size(430, 70)
$nameLead.Text = "ตั้งชื่อที่ฝ่ายไอทีจะเห็นในระบบ เช่น เลขครุภัณฑ์ ห้อง หรือชื่อจุดบริการ`r`n`r`nชื่อที่สื่อว่าเครื่องอยู่ที่ไหน จะช่วยให้ตามหาเครื่องได้เร็วตอนมีปัญหา"
$pageName.Controls.Add($nameLead)

$nameLabel = New-Object System.Windows.Forms.Label
$nameLabel.Location = New-Object System.Drawing.Point(0, 92)
$nameLabel.Size = New-Object System.Drawing.Size(430, 22)
$nameLabel.Text = 'ชื่อเครื่อง'
$pageName.Controls.Add($nameLabel)

$nameBox = New-Object System.Windows.Forms.TextBox
$nameBox.Location = New-Object System.Drawing.Point(0, 116)
$nameBox.Size = New-Object System.Drawing.Size(430, 30)
$nameBox.MaxLength = 0
$nameBox.Font = New-Object System.Drawing.Font('Segoe UI', 12)
$pageName.Controls.Add($nameBox)

$nameHint = New-Object System.Windows.Forms.Label
$nameHint.Location = New-Object System.Drawing.Point(0, 152)
$nameHint.Size = New-Object System.Drawing.Size(430, 60)
$nameHint.Text = "พิมพ์ภาษาไทยได้ และไม่จำกัดความยาว`r`n`r`nตอนนี้ใส่ชื่อเครื่องของ Windows ไว้ให้แล้ว ถ้าพอใจกดถัดไปได้เลย"
$nameHint.ForeColor = $muted
$pageName.Controls.Add($nameHint)

# --- page 4, installing
$pageInstall = New-Page
$installText = New-Object System.Windows.Forms.Label
$installText.Location = New-Object System.Drawing.Point(0, 20)
$installText.Size = New-Object System.Drawing.Size(430, 60)
$installText.Text = 'กำลังติดตั้ง โปรดรอสักครู่ และอย่าปิดหน้าต่างนี้'
$pageInstall.Controls.Add($installText)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(0, 80)
$progress.Size = New-Object System.Drawing.Size(430, 22)
$progress.Style = 'Marquee'
$progress.MarqueeAnimationSpeed = 30
$pageInstall.Controls.Add($progress)

$installStatus = New-Object System.Windows.Forms.Label
$installStatus.Location = New-Object System.Drawing.Point(0, 112)
$installStatus.Size = New-Object System.Drawing.Size(430, 60)
$installStatus.ForeColor = $muted
$pageInstall.Controls.Add($installStatus)

# --- page 5, done
$pageDone = New-Page
$doneMark = New-Object System.Windows.Forms.Label
$doneMark.Text = 'ติดตั้งเรียบร้อย'
$doneMark.Font = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
$doneMark.ForeColor = $brand
$doneMark.Location = New-Object System.Drawing.Point(0, 10)
$doneMark.Size = New-Object System.Drawing.Size(430, 30)
$pageDone.Controls.Add($doneMark)

$doneText = New-Object System.Windows.Forms.Label
$doneText.Location = New-Object System.Drawing.Point(0, 50)
$doneText.Size = New-Object System.Drawing.Size(430, 240)
$pageDone.Controls.Add($doneText)

# ---------------------------------------------------------------- buttons ----

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = 'ยกเลิก'
$btnCancel.Location = New-Object System.Drawing.Point(206, 420)
$btnCancel.Size = New-Object System.Drawing.Size(104, 36)
$btnCancel.FlatStyle = 'Flat'
$form.Controls.Add($btnCancel)

$btnBack = New-Object System.Windows.Forms.Button
$btnBack.Text = 'ย้อนกลับ'
$btnBack.Location = New-Object System.Drawing.Point(404, 420)
$btnBack.Size = New-Object System.Drawing.Size(112, 36)
$btnBack.FlatStyle = 'Flat'
$form.Controls.Add($btnBack)

$btnNext = New-Object System.Windows.Forms.Button
$btnNext.Text = 'ถัดไป'
$btnNext.Location = New-Object System.Drawing.Point(524, 420)
$btnNext.Size = New-Object System.Drawing.Size(118, 36)
$btnNext.FlatStyle = 'Flat'
$btnNext.BackColor = $brand
$btnNext.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($btnNext)

$script:step = 1
$script:deviceName = ''

function Update-Step {
    $pages = @($pageWelcome, $pageConsent, $pageName, $pageInstall, $pageDone)
    for ($i = 0; $i -lt $pages.Count; $i++) { $pages[$i].Visible = ($i -eq ($script:step - 1)) }

    $titles = @('ยินดีต้อนรับ', 'คำขออนุญาต', 'ตั้งชื่อเครื่อง', 'กำลังติดตั้ง', 'เสร็จสิ้น')
    $stepTitle.Text = $titles[$script:step - 1]

    $names = @('อ่านคำขออนุญาต', 'ตั้งชื่อเครื่อง', 'ติดตั้ง')
    $shown = $script:step - 1
    if ($shown -lt 1) { $shown = 1 }
    if ($shown -gt 3) { $shown = 3 }
    $listText = ''
    for ($i = 1; $i -le 3; $i++) {
        $mark = '   '
        if ($i -lt $shown -or $script:step -eq 5) { $mark = ' * ' } elseif ($i -eq $shown -and $script:step -ne 1) { $mark = ' > ' }
        $listText += $mark + $i + '  ' + $names[$i - 1] + "`r`n`r`n"
    }
    $stepList.Text = $listText

    $btnBack.Visible = ($script:step -eq 2 -or $script:step -eq 3)
    $btnCancel.Visible = ($script:step -le 3)
    $btnNext.Visible = ($script:step -ne 4)
    switch ($script:step) {
        2 { $btnNext.Text = 'ถัดไป'; $btnNext.Enabled = $agree.Checked }
        3 { $btnNext.Text = 'ติดตั้ง'; $btnNext.Enabled = $true }
        5 { $btnNext.Text = 'เสร็จสิ้น'; $btnNext.Enabled = $true }
        default { $btnNext.Text = 'ถัดไป'; $btnNext.Enabled = $true }
    }
}

function Wait-Process-Alive($proc) {
    # Keep the window painting while the agent installer runs.
    while (-not $proc.HasExited) {
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 150
    }
}

function Start-Install {
    $script:step = 4
    Update-Step
    $form.Refresh()

    $service = Get-AgentService
    if ($null -eq $service) {
        $installer = Find-AgentInstaller
        if ($null -eq $installer) {
            $steps = @(
                'ยังไม่พบไฟล์ตัวติดตั้งเอเจนต์ในโฟลเดอร์นี้',
                '',
                'ชุดติดตั้งนี้ต้องมีไฟล์ .exe ของกลุ่มอุปกรณ์วางอยู่ด้วย ให้ฝ่ายไอทีทำตามนี้',
                '',
                '1. เข้าเว็บของเซิร์ฟเวอร์ด้วยบัญชีผู้ดูแลระบบ',
                '2. สร้างกลุ่มอุปกรณ์ โดยเลือกประเภท "จัดการด้วยเอเจนต์ซอฟต์แวร์"',
                '3. เปิดกลุ่มนั้น ไปที่ "เพิ่มอุปกรณ์" แล้วดาวน์โหลด "บริการ Windows 64 บิต"',
                '4. วางไฟล์ .exe ที่ได้ ไว้ในโฟลเดอร์เดียวกับไฟล์ติดตั้งนี้',
                '5. เปิด Setup-SCP-Remote.cmd อีกครั้ง',
                '',
                'โฟลเดอร์ปลายทาง',
                $scriptDir
            )
            Show-Message ($steps -join [Environment]::NewLine) ([System.Windows.Forms.MessageBoxIcon]::Warning)
            $script:step = 3
            Update-Step
            return
        }
        $installStatus.Text = 'กำลังติดตั้งโปรแกรม'
        $form.Refresh()
        try {
            $proc = Start-Process -FilePath $installer.FullName -ArgumentList '-fullinstall' -PassThru -ErrorAction Stop
            Wait-Process-Alive $proc
        } catch {
            Show-Message ('ติดตั้งไม่สำเร็จ' + [Environment]::NewLine + [Environment]::NewLine + $_.Exception.Message) ([System.Windows.Forms.MessageBoxIcon]::Error)
            $script:step = 3
            Update-Step
            return
        }
        # The installer returns before the service is registered, so wait for it.
        $installStatus.Text = 'กำลังเริ่มบริการ'
        $form.Refresh()
        $deadline = (Get-Date).AddSeconds(90)
        while ($null -eq (Get-AgentService) -and (Get-Date) -lt $deadline) {
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 500
        }
        $service = Get-AgentService
        if ($null -eq $service) {
            Show-Message 'ติดตั้งแล้ว แต่ยังไม่พบบริการของโปรแกรม กรุณาแจ้งฝ่ายไอที' ([System.Windows.Forms.MessageBoxIcon]::Warning)
            $script:step = 3
            Update-Step
            return
        }
    } else {
        $installStatus.Text = 'พบโปรแกรมติดตั้งอยู่แล้ว กำลังตั้งชื่อเครื่องเป็นค่าใหม่'
        $form.Refresh()
    }

    $installStatus.Text = 'กำลังบันทึกชื่อเครื่อง'
    $form.Refresh()
    try {
        Write-DeviceCode (Get-AgentExePath $service) $script:deviceName
        Restart-Service -Name $service.Name -Force -ErrorAction Stop
    } catch {
        Show-Message ('ตั้งชื่อเครื่องไม่สำเร็จ' + [Environment]::NewLine + [Environment]::NewLine + $_.Exception.Message) ([System.Windows.Forms.MessageBoxIcon]::Warning)
        $script:step = 3
        Update-Step
        return
    }

    $doneText.Text = "ชื่อเครื่องนี้ในระบบคือ`r`n`r`n        $($script:deviceName)`r`n`r`nเครื่องนี้จะแสดงให้ฝ่ายไอทีเห็นภายในไม่กี่นาที และโปรแกรมจะเริ่มทำงานเองทุกครั้งที่เปิดเครื่อง`r`n`r`nทุกครั้งที่เจ้าหน้าที่ขอเข้าใช้งาน จะมีหน้าต่างขึ้นที่เครื่องนี้ให้กดอนุญาตก่อนเสมอ`r`n`r`nกด เสร็จสิ้น เพื่อปิดหน้าต่างนี้"
    $script:step = 5
    Update-Step
}

$agree.Add_CheckedChanged({ if ($script:step -eq 2) { $btnNext.Enabled = $agree.Checked } })
$btnCancel.Add_Click({ $form.Close() })
$btnBack.Add_Click({ $script:step = $script:step - 1; Update-Step })
$btnNext.Add_Click({
    switch ($script:step) {
        1 { $script:step = 2; Update-Step }
        2 { $script:step = 3; Update-Step; $nameBox.Focus(); $nameBox.SelectAll() }
        3 {
            $entered = $nameBox.Text.Trim()
            if ($entered -eq '') { $entered = $env:COMPUTERNAME }
            $script:deviceName = $entered
            Start-Install
        }
        5 { $form.Close() }
    }
})

$nameBox.Text = $env:COMPUTERNAME
Update-Step
[void]$form.ShowDialog()
