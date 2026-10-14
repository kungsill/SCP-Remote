<#
============================================================
  SCPclear  |  ปรับเครื่องให้ลื่น + ลบ AI/Bloatware + จัดการระบบ
  UI: WPF (มินิมอล ธีมส้ม) - พกพาได้ ไม่ต้องติดตั้ง
============================================================
#>

$admin = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe "-NoProfile -Sta -NoExit -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$ErrorActionPreference = "Stop"
try {

# ---------- ตรวจสเปก ----------
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$isHDD = $false
try {
    $sysLetter = ($env:SystemDrive).TrimEnd(':')
    $part = Get-Partition -DriveLetter $sysLetter -ErrorAction Stop
    $pd = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq (Get-Disk -Number $part.DiskNumber).Number }
    if ($pd.MediaType -eq 'HDD' -or $pd.MediaType -eq 'Unspecified') { $isHDD = $true }
} catch { $isHDD = $true }
$diskType = if ($isHDD) { "HDD" } else { "SSD" }

# ---------- ฟอนต์ (Sarabun แบบพกพา, fallback = Segoe UI) ----------
$ScriptDir = if($PSScriptRoot){ $PSScriptRoot } elseif($PSCommandPath){ Split-Path -Parent $PSCommandPath } else { (Get-Location).Path }
$SettingsPath = Join-Path $ScriptDir "SCPclear-settings.json"
$HistoryPath = Join-Path $ScriptDir "SCPclear-history.json"
$FontDir = Join-Path $ScriptDir "Fonts"
if(Test-Path (Join-Path $FontDir "Sarabun-Regular.ttf")){
    $FontUriPath = ($FontDir -replace '\\','/') -replace ' ','%20'
    $FontFamilyValue = "file:///$FontUriPath/#Sarabun, Segoe UI"
} else {
    $FontFamilyValue = "Sarabun, Segoe UI"
}

# ---------- ธีม (รองรับ Dark Mode ตามธีมเครื่อง) ----------
$isDark = $false
try{
    $v = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" -Name "AppsUseLightTheme" -ErrorAction Stop).AppsUseLightTheme
    $isDark = ($v -eq 0)
}catch{}

if($isDark){
    $Theme = @{
        WindowBg="#202020"; CardBg="#2B2B2B"; CardBgHover="#333333"; CardBorder="#3A3A3A"
        TitleFg="#F5F5F5"; BodyFg="#E4E4E4"; MutedFg="#9A9A9A"; SectionFg="#8B8FA0"
        ChipBg="#2B2B2B"; ChipBorder="#454545"; ChipHover="#383838"; ChipFg="#E4E4E4"
        OutlineBg="#3A2A1F"; OutlineBorder="#6B4226"; OutlineHover="#4A3527"
        LogBg="#242424"; LogBorder="#3A3A3A"; LogFg="#C7C7C7"
        ToggleTrackOff="#4A4A4A"; LinkFg="#9A9A9A"; SecondaryBg="#3A3A3A"; ProgTrack="#3A3A3A"
    }
} else {
    $Theme = @{
        WindowBg="#F4F5F7"; CardBg="#FFFFFF"; CardBgHover="#FBF9F7"; CardBorder="#ECEEF1"
        TitleFg="#111827"; BodyFg="#1F2937"; MutedFg="#9AA1AC"; SectionFg="#AAB0B8"
        ChipBg="#FFFFFF"; ChipBorder="#DDE1E6"; ChipHover="#EEF1F5"; ChipFg="#374151"
        OutlineBg="#FFF6F0"; OutlineBorder="#F3C6A8"; OutlineHover="#FDEBDF"
        LogBg="#FBFBFC"; LogBorder="#ECEEF1"; LogFg="#556072"
        ToggleTrackOff="#D5D9DF"; LinkFg="#6B7280"; SecondaryBg="#E6E9EE"; ProgTrack="#E6E9EE"
    }
}

# ---------- Windows 11 chrome (มุมโค้ง + title bar เข้ม) ----------
try{
    Add-Type -Name DwmHelper -Namespace Win32 -MemberDefinition @'
[DllImport("dwmapi.dll")]
public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
'@ -ErrorAction SilentlyContinue
}catch{}
function Set-ModernChrome($winObj){
    $winObj.Add_SourceInitialized({
        try{
            $hwnd = (New-Object System.Windows.Interop.WindowInteropHelper($winObj)).Handle
            $corner = 2
            [Win32.DwmHelper]::DwmSetWindowAttribute($hwnd, 33, [ref]$corner, 4) | Out-Null
            if($isDark){ $darkFlag = 1; [Win32.DwmHelper]::DwmSetWindowAttribute($hwnd, 20, [ref]$darkFlag, 4) | Out-Null }
        }catch{}
    }.GetNewClosure())
}

# ---------- XAML ----------
$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="SCPclear" Height="850" Width="480"
        WindowStartupLocation="CenterScreen" ResizeMode="NoResize"
        Background="##WINDOWBG##" FontFamily="##FONTFAMILY##">
  <Window.Resources>
    <Style x:Key="Toggle" TargetType="CheckBox">
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="CheckBox">
            <Border x:Name="track" Width="46" Height="26" CornerRadius="13" Background="##TOGGLEOFF##">
              <Border x:Name="knob" Width="20" Height="20" CornerRadius="10" Background="White"
                      HorizontalAlignment="Left" Margin="3,0,0,0">
                <Border.Effect><DropShadowEffect BlurRadius="4" ShadowDepth="0.5" Opacity="0.3"/></Border.Effect>
              </Border>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsChecked" Value="True">
                <Setter TargetName="track" Property="Background" Value="#EE6C2B"/>
                <Setter TargetName="knob" Property="HorizontalAlignment" Value="Right"/>
                <Setter TargetName="knob" Property="Margin" Value="0,0,3,0"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="Card" TargetType="Border">
      <Setter Property="Background" Value="##CARDBG##"/>
      <Setter Property="CornerRadius" Value="16"/>
      <Setter Property="BorderBrush" Value="##CARDBORDER##"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="Padding" Value="16,13"/>
      <Setter Property="Margin" Value="0,0,0,9"/>
      <Setter Property="Effect">
        <Setter.Value><DropShadowEffect BlurRadius="12" ShadowDepth="1" Direction="270" Opacity="0.05" Color="#000000"/></Setter.Value>
      </Setter>
      <Style.Triggers>
        <Trigger Property="IsMouseOver" Value="True">
          <Setter Property="Background" Value="##CARDBGHOVER##"/>
          <Setter Property="BorderBrush" Value="#EE6C2B"/>
        </Trigger>
      </Style.Triggers>
    </Style>
    <Style x:Key="RowTitle" TargetType="TextBlock">
      <Setter Property="FontSize" Value="13.5"/><Setter Property="FontWeight" Value="SemiBold"/><Setter Property="Foreground" Value="##BODYFG##"/>
    </Style>
    <Style x:Key="RowDesc" TargetType="TextBlock">
      <Setter Property="FontSize" Value="11.5"/><Setter Property="Foreground" Value="##MUTEDFG##"/><Setter Property="Margin" Value="0,2,0,0"/><Setter Property="TextWrapping" Value="Wrap"/>
    </Style>
    <Style x:Key="Section" TargetType="TextBlock">
      <Setter Property="FontSize" Value="11.5"/><Setter Property="FontWeight" Value="Bold"/><Setter Property="Foreground" Value="##SECTIONFG##"/><Setter Property="Margin" Value="2,14,0,8"/>
    </Style>
    <Style x:Key="Chip" TargetType="Button">
      <Setter Property="Cursor" Value="Hand"/><Setter Property="Foreground" Value="##CHIPFG##"/><Setter Property="FontSize" Value="12"/><Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="Template"><Setter.Value>
        <ControlTemplate TargetType="Button">
          <Border x:Name="b" Background="##CHIPBG##" BorderBrush="##CHIPBORDER##" BorderThickness="1" CornerRadius="10" Padding="14,7">
            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
          </Border>
          <ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="b" Property="Background" Value="##CHIPHOVER##"/></Trigger></ControlTemplate.Triggers>
        </ControlTemplate>
      </Setter.Value></Setter>
    </Style>
    <Style x:Key="Primary" TargetType="Button">
      <Setter Property="Cursor" Value="Hand"/><Setter Property="Foreground" Value="White"/><Setter Property="FontSize" Value="14"/><Setter Property="FontWeight" Value="Bold"/>
      <Setter Property="Template"><Setter.Value>
        <ControlTemplate TargetType="Button">
          <Border x:Name="b" Background="#EE6C2B" CornerRadius="14" Padding="0,13">
            <Border.Effect><DropShadowEffect BlurRadius="14" ShadowDepth="2" Direction="270" Opacity="0.25" Color="#EE6C2B"/></Border.Effect>
            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
          </Border>
          <ControlTemplate.Triggers>
            <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="b" Property="Background" Value="#DD5F20"/></Trigger>
            <Trigger Property="IsPressed" Value="True"><Setter TargetName="b" Property="Background" Value="#C8531A"/></Trigger>
            <Trigger Property="IsEnabled" Value="False"><Setter TargetName="b" Property="Background" Value="#F1B694"/></Trigger>
          </ControlTemplate.Triggers>
        </ControlTemplate>
      </Setter.Value></Setter>
    </Style>
    <Style x:Key="Link" TargetType="Button">
      <Setter Property="Cursor" Value="Hand"/><Setter Property="Foreground" Value="##LINKFG##"/><Setter Property="FontSize" Value="12.5"/><Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="Template"><Setter.Value>
        <ControlTemplate TargetType="Button">
          <Border Background="Transparent" Padding="8,6"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
          <ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter Property="Foreground" Value="#EE6C2B"/></Trigger></ControlTemplate.Triggers>
        </ControlTemplate>
      </Setter.Value></Setter>
    </Style>
    <Style x:Key="MiniBar" TargetType="ProgressBar">
      <Setter Property="Height" Value="6"/>
      <Setter Property="Template"><Setter.Value>
        <ControlTemplate TargetType="ProgressBar">
          <Grid><Border Background="##PROGTRACK##" CornerRadius="3"/><Border x:Name="PART_Track"/><Border x:Name="PART_Indicator" HorizontalAlignment="Left" Background="#EE6C2B" CornerRadius="3"/></Grid>
        </ControlTemplate>
      </Setter.Value></Setter>
    </Style>
    <Style x:Key="Outline" TargetType="Button">
      <Setter Property="Cursor" Value="Hand"/><Setter Property="Foreground" Value="#EE6C2B"/><Setter Property="FontSize" Value="13"/><Setter Property="FontWeight" Value="Bold"/>
      <Setter Property="Template"><Setter.Value>
        <ControlTemplate TargetType="Button">
          <Border x:Name="b" Background="##OUTLINEBG##" BorderBrush="##OUTLINEBORDER##" BorderThickness="1.4" CornerRadius="14" Padding="0,11"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
          <ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="b" Property="Background" Value="##OUTLINEHOVER##"/></Trigger></ControlTemplate.Triggers>
        </ControlTemplate>
      </Setter.Value></Setter>
    </Style>
    <Style x:Key="SectionHdr" TargetType="Button">
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="HorizontalContentAlignment" Value="Left"/>
      <Setter Property="Foreground" Value="##SECTIONFG##"/>
      <Setter Property="FontSize" Value="11.5"/>
      <Setter Property="FontWeight" Value="Bold"/>
      <Setter Property="Template"><Setter.Value>
        <ControlTemplate TargetType="Button">
          <Border x:Name="hb" Background="Transparent" CornerRadius="8" Padding="4,14,4,8">
            <ContentPresenter HorizontalAlignment="Left"/>
          </Border>
          <ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="hb" Property="TextElement.Foreground" Value="#EE6C2B"/></Trigger></ControlTemplate.Triggers>
        </ControlTemplate>
      </Setter.Value></Setter>
    </Style>
  </Window.Resources>

  <Grid Margin="22,20,22,18">
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/>
      <RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>

    <StackPanel Grid.Row="0">
      <StackPanel Orientation="Horizontal" VerticalAlignment="Bottom">
        <TextBlock Text="SCPclear" FontSize="24" FontWeight="Bold" Foreground="##TITLEFG##"/>
        <TextBlock x:Name="VersionText" FontSize="12" Foreground="##MUTEDFG##" FontWeight="SemiBold" Margin="6,0,0,4" VerticalAlignment="Bottom"/>
      </StackPanel>
      <TextBlock x:Name="SpecText" FontSize="12.5" Foreground="#EE6C2B" FontWeight="SemiBold" Margin="0,2,0,0"/>
    </StackPanel>

    <StackPanel Grid.Row="1" Margin="0,14,0,0">
      <StackPanel Orientation="Horizontal">
        <Button x:Name="BtnRec"  Content="แนะนำ" Style="{StaticResource Chip}" Margin="0,0,8,0"/>
        <Button x:Name="BtnAll"  Content="เลือกทั้งหมด" Style="{StaticResource Chip}" Margin="0,0,8,0"/>
        <Button x:Name="BtnNone" Content="ล้างทั้งหมด" Style="{StaticResource Chip}"/>
      </StackPanel>
      <Button x:Name="BtnDiag" Content="🔍  ตรวจสอบเครื่อง — วิเคราะห์ว่าทำไมช้า" Style="{StaticResource Outline}" Margin="0,10,0,0"/>
      <Button x:Name="BtnHealth" Content="🩺  ตรวจสุขภาพเครื่อง (IT) — สำหรับช่าง" Style="{StaticResource Outline}" Margin="0,8,0,0"/>
    </StackPanel>

    <ScrollViewer Grid.Row="2" VerticalScrollBarVisibility="Auto" Margin="0,8,0,0">
      <StackPanel x:Name="Content">
        <Button x:Name="hdrSpeed" Style="{StaticResource SectionHdr}" Content="▾  ปรับความเร็ว / ล้างขยะ"/>
        <StackPanel x:Name="secSpeed">
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="สร้าง Restore Point ก่อน" Style="{StaticResource RowTitle}"/><TextBlock Text="จุดสำรองไว้ย้อนกลับได้ถ้ามีปัญหา" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_restore" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ตั้ง Virtual Memory ให้เหมาะกับแรม" Style="{StaticResource RowTitle}"/><TextBlock Text="ระบบคำนวณค่าให้อัตโนมัติตามแรม" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_pagefile" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ปรับ Visual Effects เน้นความเร็ว" Style="{StaticResource RowTitle}"/><TextBlock Text="ปิดเอฟเฟกต์ที่กินทรัพยากร" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_visual" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ปิด Transparency (ความโปร่งใส)" Style="{StaticResource RowTitle}"/><TextBlock Text="ลดภาระการ์ดจอ" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_transp" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ปิด SysMain (SuperFetch)" Style="{StaticResource RowTitle}"/><TextBlock Text="ตัวการทำให้ HDD ทำงาน 100%" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_sysmain" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ล้างไฟล์ Temp / ขยะ" Style="{StaticResource RowTitle}"/><TextBlock Text="ลบไฟล์ชั่วคราว ปลอดภัย" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_temp" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ล้าง Windows Update cache" Style="{StaticResource RowTitle}"/><TextBlock Text="คืนพื้นที่ดิสก์" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_wucache" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ล้าง Recycle Bin + Flush DNS" Style="{StaticResource RowTitle}"/><TextBlock Text="ล้างถังขยะและแคช DNS" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_recycledns" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ปิด Hibernation (คืนพื้นที่ดิสก์)" Style="{StaticResource RowTitle}"/><TextBlock Text="ลบไฟล์ hiberfil.sys (มักกิน 3-8 GB)" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_hibernate" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="Power Plan = High Performance" Style="{StaticResource RowTitle}"/><TextBlock Text="โน้ตบุ๊กจะเปลืองแบตขึ้น" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_power" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="Defrag ไดรฟ์ C (เฉพาะ HDD)" Style="{StaticResource RowTitle}"/><TextBlock Text="ข้ามอัตโนมัติถ้าเป็น SSD" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_defrag" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="เปิดหน้าจัดการ Startup ตอนจบ" Style="{StaticResource RowTitle}"/><TextBlock Text="เปิด Task Manager แท็บ Startup (หรือใช้ปุ่มจัดการในตัวด้านล่าง)" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_startup" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center"/></Grid></Border>

        </StackPanel>
        <Button x:Name="hdrWin" Style="{StaticResource SectionHdr}" Content="▾  ปรับแต่ง WINDOWS"/>
        <StackPanel x:Name="secWin">
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ปิดโฆษณา/คำแนะนำใน Windows" Style="{StaticResource RowTitle}"/><TextBlock Text="ปิดโฆษณาใน Start, Lock screen, การแนะนำแอป" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_ads" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="คืนเมนูคลิกขวาแบบเก่า (Win11)" Style="{StaticResource RowTitle}"/><TextBlock Text="ไม่ต้องกด Show more options" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_rightclick" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ปิด Widgets + Chat บน taskbar" Style="{StaticResource RowTitle}"/><TextBlock Text="เอาไอคอน Widgets/Chat ออกจากแถบงาน" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_widgets" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center"/></Grid></Border>

        </StackPanel>
        <Button x:Name="hdrAI" Style="{StaticResource SectionHdr}" Content="▸  ลบ AI / BLOATWARE / ความเป็นส่วนตัว"/>
        <StackPanel x:Name="secAI" Visibility="Collapsed">
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ถามยืนยันก่อนลบแต่ละอย่าง" Style="{StaticResource RowTitle}"/><TextBlock Text="เด้งถาม Yes/No ก่อนลบทีละตัว (ปลอดภัย)" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_confirm" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ลบ Windows AI (Copilot + Recall)" Style="{StaticResource RowTitle}"/><TextBlock Text="ปิด/ลบ Copilot และ Recall ออกจากเครื่อง" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_removeai" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ลบ Bloatware (Xbox, News ฯลฯ)" Style="{StaticResource RowTitle}"/><TextBlock Text="ลบแอปที่ไม่จำเป็น (ไม่มีในเครื่องจะข้ามให้)" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_bloat" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ปิด Telemetry (ส่งข้อมูลกลับ MS)" Style="{StaticResource RowTitle}"/><TextBlock Text="ปิดการเก็บ/ส่งข้อมูลการใช้งาน" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_telemetry" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center" IsChecked="True"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ถอนการติดตั้ง OneDrive" Style="{StaticResource RowTitle}"/><TextBlock Text="ปิด+ถอน OneDrive (ไฟล์ยังอยู่ ลงกลับได้)" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_onedrive" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center"/></Grid></Border>

        </StackPanel>
        <Button x:Name="hdrSys" Style="{StaticResource SectionHdr}" Content="▸  จัดการระบบ"/>
        <StackPanel x:Name="secSys" Visibility="Collapsed">
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ตรวจสอบ &amp; ติดตั้ง Windows Update" Style="{StaticResource RowTitle}"/><TextBlock Text="เช็คอัปเดตระบบปฏิบัติการล่าสุดและติดตั้งให้ (อาจใช้เวลานาน)" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_winupdate" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center"/></Grid></Border>
        <Border Style="{StaticResource Card}"><Grid><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel VerticalAlignment="Center"><TextBlock Text="ซ่อมไฟล์ระบบ (SFC + DISM)" Style="{StaticResource RowTitle}"/><TextBlock Text="ตรวจสอบและซ่อมไฟล์ระบบที่เสียหาย (อาจใช้เวลานาน)" Style="{StaticResource RowDesc}"/></StackPanel><CheckBox x:Name="cb_sfcdism" Grid.Column="1" Style="{StaticResource Toggle}" VerticalAlignment="Center"/></Grid></Border>
        </StackPanel>
      </StackPanel>
    </ScrollViewer>

    <StackPanel Grid.Row="3" Margin="0,10,0,10">
      <Grid>
        <Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
        <TextBlock x:Name="StatusText" Grid.Column="0" Text="พร้อมทำงาน" FontSize="12.5" FontWeight="SemiBold" Foreground="##LOGFG##" VerticalAlignment="Center" TextTrimming="CharacterEllipsis"/>
        <TextBlock x:Name="StepText" Grid.Column="1" Text="" FontSize="11" Foreground="##MUTEDFG##" VerticalAlignment="Center" Margin="8,0,0,0"/>
      </Grid>
      <ProgressBar x:Name="Pb" Style="{StaticResource MiniBar}" Minimum="0" Maximum="20" Value="0" Margin="0,6,0,0"/>
      <Button x:Name="BtnToggleLog" Content="ดูรายละเอียด ▾" Style="{StaticResource Link}" HorizontalAlignment="Left" Margin="-8,2,0,0"/>
      <Border x:Name="LogBox" Background="##LOGBG##" BorderBrush="##LOGBORDER##" BorderThickness="1" CornerRadius="9" Margin="0,4,0,0" Visibility="Collapsed">
        <TextBox x:Name="Log" IsReadOnly="True" BorderThickness="0" Background="Transparent" Foreground="##LOGFG##" FontFamily="Consolas" FontSize="11" Height="88" VerticalScrollBarVisibility="Auto" TextWrapping="Wrap" Padding="10,8"/>
      </Border>
    </StackPanel>

    <Button Grid.Row="4" x:Name="BtnRun" Content="เริ่มทำงาน" Style="{StaticResource Primary}"/>

    <StackPanel Grid.Row="5" Orientation="Horizontal" HorizontalAlignment="Center" Margin="0,6,0,0">
      <Button x:Name="BtnRevert" Content="ย้อนกลับการปรับแต่ง" Style="{StaticResource Link}"/>
      <TextBlock Text="•" Foreground="#C7CBD2" VerticalAlignment="Center" Margin="4,0"/>
      <Button x:Name="BtnStartup" Content="จัดการ Startup" Style="{StaticResource Link}"/>
      <TextBlock Text="•" Foreground="#C7CBD2" VerticalAlignment="Center" Margin="4,0"/>
      <Button x:Name="BtnCheckUpdate" Content="ตรวจสอบอัปเดต SCPclear" Style="{StaticResource Link}"/>
    </StackPanel>
  </Grid>
</Window>
'@

foreach($tk in @{
    "##WINDOWBG##"=$Theme.WindowBg; "##CARDBG##"=$Theme.CardBg; "##CARDBGHOVER##"=$Theme.CardBgHover; "##CARDBORDER##"=$Theme.CardBorder
    "##TITLEFG##"=$Theme.TitleFg; "##BODYFG##"=$Theme.BodyFg; "##MUTEDFG##"=$Theme.MutedFg; "##SECTIONFG##"=$Theme.SectionFg
    "##CHIPBG##"=$Theme.ChipBg; "##CHIPBORDER##"=$Theme.ChipBorder; "##CHIPHOVER##"=$Theme.ChipHover; "##CHIPFG##"=$Theme.ChipFg
    "##OUTLINEBG##"=$Theme.OutlineBg; "##OUTLINEBORDER##"=$Theme.OutlineBorder; "##OUTLINEHOVER##"=$Theme.OutlineHover
    "##LOGBG##"=$Theme.LogBg; "##LOGBORDER##"=$Theme.LogBorder; "##LOGFG##"=$Theme.LogFg
    "##TOGGLEOFF##"=$Theme.ToggleTrackOff; "##LINKFG##"=$Theme.LinkFg; "##PROGTRACK##"=$Theme.ProgTrack
    "##FONTFAMILY##"=$FontFamilyValue
}.GetEnumerator()){ $xaml = $xaml.Replace($tk.Key, $tk.Value) }

$reader = New-Object System.Xml.XmlNodeReader ([xml]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)
Set-ModernChrome $window

$ScriptVersion = "1.4.0"
$GitHubRepo = "adventdevinc/SCPclear"

$keys = @("restore","pagefile","visual","transp","sysmain","temp","wucache","recycledns","hibernate","power","defrag","startup","ads","rightclick","widgets","confirm","removeai","bloat","telemetry","onedrive","winupdate","sfcdism")
$checkboxes = @{}
foreach($k in $keys){ $checkboxes[$k] = $window.FindName("cb_$k") }
$SpecText=$window.FindName("SpecText"); $Pb=$window.FindName("Pb"); $Log=$window.FindName("Log")
$VersionText=$window.FindName("VersionText"); $VersionText.Text="v$ScriptVersion"
$StatusText=$window.FindName("StatusText"); $StepText=$window.FindName("StepText")
$BtnToggleLog=$window.FindName("BtnToggleLog"); $LogBox=$window.FindName("LogBox")
$BtnRun=$window.FindName("BtnRun"); $BtnRec=$window.FindName("BtnRec"); $BtnAll=$window.FindName("BtnAll"); $BtnNone=$window.FindName("BtnNone")
$BtnRevert=$window.FindName("BtnRevert"); $BtnStartup=$window.FindName("BtnStartup"); $BtnDiag=$window.FindName("BtnDiag"); $BtnCheckUpdate=$window.FindName("BtnCheckUpdate")
$BtnHealth=$window.FindName("BtnHealth")

# ---------- หมวดหมู่ (สำหรับหน้าสรุปย่อ) ----------
$categoryOf = @{
  restore="ความเร็ว";pagefile="ความเร็ว";visual="ความเร็ว";transp="ความเร็ว";sysmain="ความเร็ว";temp="ความเร็ว";wucache="ความเร็ว";recycledns="ความเร็ว";hibernate="ความเร็ว";power="ความเร็ว";defrag="ความเร็ว";startup="ความเร็ว"
  ads="Windows";rightclick="Windows";widgets="Windows"
  removeai="AI/Bloat";bloat="AI/Bloat";telemetry="AI/Bloat";onedrive="AI/Bloat"
  winupdate="ระบบ";sfcdism="ระบบ"
}
$categoryIcon = @{ "ความเร็ว"="⚡"; "Windows"="🪟"; "AI/Bloat"="🗑️"; "ระบบ"="🖥️" }

# ---------- หมวดที่พับ/กางได้ ----------
$sections = @(
  @{Hdr="hdrSpeed"; Panel="secSpeed"; Title="ปรับความเร็ว / ล้างขยะ"; Expanded=$true}
  @{Hdr="hdrWin";   Panel="secWin";   Title="ปรับแต่ง WINDOWS";       Expanded=$true}
  @{Hdr="hdrAI";    Panel="secAI";    Title="ลบ AI / BLOATWARE / ความเป็นส่วนตัว"; Expanded=$false}
  @{Hdr="hdrSys";   Panel="secSys";   Title="จัดการระบบ";             Expanded=$false}
)
foreach($s in $sections){
  $h=$window.FindName($s.Hdr); $p=$window.FindName($s.Panel)
  $h.Add_Click({
    if($p.Visibility -eq 'Visible'){ $p.Visibility='Collapsed'; $h.Content="▸  $($s.Title)" }
    else{ $p.Visibility='Visible'; $h.Content="▾  $($s.Title)" }
  }.GetNewClosure())
}

$BtnToggleLog.Add_Click({
  if($LogBox.Visibility -eq 'Visible'){ $LogBox.Visibility='Collapsed'; $BtnToggleLog.Content="ดูรายละเอียด ▾" }
  else{ $LogBox.Visibility='Visible'; $BtnToggleLog.Content="ซ่อนรายละเอียด ▴" }
})

$SpecText.Text = "RAM $ramGB GB   •   ไดรฟ์ C = $diskType"
$checkboxes["sysmain"].IsChecked=$isHDD
$checkboxes["defrag"].IsChecked=$isHDD

# ---------- tooltips (อธิบาย + ความเสี่ยง) ----------
$tips=@{
  restore   ="สร้างจุดสำรองระบบก่อนปรับแต่ง • ไม่มีความเสี่ยง แนะนำเปิดไว้"
  pagefile  ="ตั้งขนาด Virtual Memory ตามแรม ช่วยเครื่องแรมน้อย • ย้อนกลับได้"
  visual    ="ปิดแอนิเมชัน/เงาเพื่อความเร็ว หน้าตาจะเรียบขึ้น • ย้อนกลับได้"
  transp    ="ปิดความโปร่งใสหน้าต่าง/taskbar ลดภาระการ์ดจอ • ย้อนกลับได้"
  sysmain   ="ปิดบริการ SuperFetch ที่ทำให้ HDD ทำงานหนัก บน SSD ไม่จำเป็น • ย้อนกลับได้"
  temp      ="ลบไฟล์ชั่วคราวใน %TEMP% • ปลอดภัย ไม่กระทบระบบ (กู้ไฟล์ temp ไม่ได้)"
  wucache   ="ลบไฟล์ติดตั้งอัปเดตเก่าที่ค้าง คืนพื้นที่ • ปลอดภัย"
  recycledns="ล้างถังขยะ + แคช DNS • ระวัง: ไฟล์ในถังขยะหายถาวร"
  hibernate ="ลบ hiberfil.sys คืนพื้นที่ 3-8GB • แลกกับใช้ Hibernate/Fast Startup ไม่ได้ • ย้อนกลับได้"
  power     ="ตั้งแผนพลังงาน High Performance เครื่องแรงขึ้น • โน้ตบุ๊กเปลืองแบตขึ้น • ย้อนกลับได้"
  defrag    ="จัดเรียงข้อมูล HDD ให้อ่านเร็วขึ้น • อย่าใช้กับ SSD (โปรแกรมข้ามให้อยู่แล้ว)"
  startup   ="เปิดหน้าจัดการโปรแกรมที่เปิดตอนบูต ปิดตัวไม่จำเป็นช่วยบูตเร็ว • ปลอดภัย"
  ads       ="ปิดโฆษณา/แอปแนะนำใน Start และ Lock screen • ไม่กระทบการใช้งาน • ย้อนกลับได้"
  rightclick="คืนเมนูคลิกขวาเต็มแบบ Win10 (เฉพาะ Win11) จะรีสตาร์ท explorer • ย้อนกลับได้"
  widgets   ="ซ่อนไอคอน Widgets/Chat บน taskbar (เฉพาะ Win11) • ย้อนกลับได้"
  confirm   ="ให้ถามยืนยันก่อนลบทุกอย่าง • แนะนำเปิดไว้เพื่อความปลอดภัย"
  removeai  ="ปิด/ลบ Copilot และ Recall (เฉพาะ Win11) • ลงกลับผ่าน Store/Windows Update"
  bloat     ="ถอนแอปติดเครื่องที่ไม่ค่อยใช้ • ลงกลับได้จาก Microsoft Store"
  telemetry ="ปิดบริการส่งข้อมูลการใช้งานกลับ Microsoft เพิ่มความเป็นส่วนตัว • ย้อนกลับได้"
  onedrive  ="ถอน OneDrive • ไฟล์ในเครื่องไม่หาย แต่หยุดซิงค์คลาวด์ • ลงกลับได้"
  winupdate ="เช็คและติดตั้ง Windows Update ล่าสุดผ่าน Windows Update Agent • ต้องมีเน็ต อาจใช้เวลานาน"
  sfcdism   ="รัน sfc /scannow และ DISM /RestoreHealth เพื่อซ่อมไฟล์ระบบที่เสียหาย • ปลอดภัย แต่ใช้เวลานาน"
}
foreach($k in $keys){ $g=$checkboxes[$k].Parent; if($g -and $g.Parent -and $tips.ContainsKey($k)){ $g.Parent.ToolTip = $tips[$k] } }

# ---------- helper ----------
$script:logLines = New-Object System.Collections.Generic.List[string]
function Flush-UI { $window.Dispatcher.Invoke([Windows.Threading.DispatcherPriority]::Render, [action]{}) }
function Write-Log($m){
    $Log.AppendText("$m`r`n"); $Log.ScrollToEnd(); $script:logLines.Add($m)
    $icon = if($m -match '^\[OK\]'){'✓'} elseif($m -match '^\[!\]'){'⚠'} elseif($m -match '^\[\.\.\]'){'🔄'} elseif($m -match '^\[i\]'){'ℹ'} elseif($m -match '^\[ข้าม\]'){'⏭'} else{'▸'}
    $clean = $m -replace '^(\[(OK|!|i|\.\.|ข้าม)\]|>>)\s*',''
    $StatusText.Text = "$icon  $clean"
    Flush-UI
}
function Step { if($Pb.Value -lt $Pb.Maximum){ $Pb.Value++ }; $StepText.Text = "$([int]$Pb.Value)/$([int]$Pb.Maximum)"; Flush-UI }
function Set-Reg($path,$name,$value){ if(-not(Test-Path $path)){ New-Item -Path $path -Force | Out-Null }; New-ItemProperty -Path $path -Name $name -Value $value -PropertyType DWord -Force | Out-Null }
function DW($p,$n){ try{ (Get-ItemProperty -Path $p -Name $n -ErrorAction Stop).$n }catch{ $null } }
function Get-FreeMB { [math]::Round((Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'").FreeSpace/1MB) }
function Confirm-Remove($name){
    if(-not $checkboxes["confirm"].IsChecked){ return $true }
    $r=[System.Windows.MessageBox]::Show("ต้องการลบ / ปิด:`n`n$name ?","ยืนยัน",[System.Windows.MessageBoxButton]::YesNo,[System.Windows.MessageBoxImage]::Question)
    return ($r -eq [System.Windows.MessageBoxResult]::Yes)
}
function Save-Log {
    try{ $p=Join-Path ([Environment]::GetFolderPath('Desktop')) 'SCPclear-log.txt'
         Add-Content -Path $p -Value ("===== $(Get-Date) =====") -Encoding UTF8
         Add-Content -Path $p -Value $script:logLines -Encoding UTF8
         Write-Log ">> บันทึก log ที่ Desktop\SCPclear-log.txt" }catch{}
}
function Save-Settings {
    try{
        $obj=[ordered]@{}
        foreach($k in $keys){ $obj[$k] = [bool]$checkboxes[$k].IsChecked }
        ($obj | ConvertTo-Json) | Set-Content -Path $SettingsPath -Encoding UTF8
    }catch{}
}
function Get-HistoryEntries {
    if(-not (Test-Path $HistoryPath)){ return @() }
    try{
        $raw = Get-Content $HistoryPath -Raw -ErrorAction Stop
        if([string]::IsNullOrWhiteSpace($raw)){ return @() }
        $arr = @(ConvertFrom-Json $raw)
        return $arr
    }catch{ return @() }
}
function Add-HistoryEntry($problem,$action,$result){
    try{
        $entries = @(Get-HistoryEntries)
        $entries += [ordered]@{
            Time      = (Get-Date).ToString("dd/MM/yyyy HH:mm")
            Computer  = $env:COMPUTERNAME
            User      = $env:USERNAME
            Problem   = $problem
            Action    = $action
            Result    = $result
        }
        ($entries | ConvertTo-Json -Depth 4) | Set-Content -Path $HistoryPath -Encoding UTF8
    }catch{}
}

# ---------- presets ----------
$BtnAll.Add_Click({  foreach($k in $keys){ $checkboxes[$k].IsChecked=$true } })
$BtnNone.Add_Click({ foreach($k in $keys){ $checkboxes[$k].IsChecked=$false } })
$BtnRec.Add_Click({
    $rec=@{restore=$true;pagefile=$true;visual=$true;transp=$true;sysmain=$isHDD;temp=$true;wucache=$true;recycledns=$true;hibernate=$false;power=$true;defrag=$isHDD;startup=$false;ads=$true;rightclick=$false;widgets=$true;confirm=$true;removeai=$true;bloat=$true;telemetry=$true;onedrive=$false;winupdate=$false;sfcdism=$false}
    foreach($k in $keys){ $checkboxes[$k].IsChecked=$rec[$k] }
})

# ---------- โหลดค่าที่ติ๊กไว้ล่าสุด ----------
if(Test-Path $SettingsPath){
    try{
        $saved = Get-Content $SettingsPath -Raw | ConvertFrom-Json
        foreach($k in $keys){
            if($saved.PSObject.Properties.Name -contains $k){ $checkboxes[$k].IsChecked = [bool]$saved.$k }
        }
    }catch{}
}

# ---------- ตรวจสถานะปัจจุบัน ----------
$applied=@{}
$applied.sysmain  = ((Get-Service SysMain -ErrorAction SilentlyContinue).StartType -eq 'Disabled')
$applied.transp   = ((DW "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "EnableTransparency") -eq 0)
$applied.visual   = ((DW "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" "VisualFXSetting") -eq 2)
$applied.pagefile = (-not (Get-CimInstance Win32_ComputerSystem).AutomaticManagedPagefile)
$applied.power    = ([bool]((powercfg /getactivescheme) -match '8c5e7fda'))
$applied.telemetry= ((DW "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection" "AllowTelemetry") -eq 0)
$applied.hibernate= ((DW "HKLM:\SYSTEM\CurrentControlSet\Control\Power" "HibernateEnabled") -eq 0)
$applied.widgets  = ((DW "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "TaskbarDa") -eq 0)
$applied.ads      = ((DW "HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager" "SubscribedContent-338388Enabled") -eq 0)
$applied.rightclick=(Test-Path "HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32")
$applied.removeai = ((DW "HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot" "TurnOffWindowsCopilot") -eq 1)
$done=@()
foreach($k in @('sysmain','transp','visual','pagefile','power','telemetry','hibernate','widgets','ads','rightclick','removeai')){
    if($applied[$k]){ $checkboxes[$k].IsChecked=$false; $done+=$k }
}
Write-Log "ตรวจสอบเครื่อง: RAM $ramGB GB, ดิสก์ $diskType"
if($done.Count){ Write-Log ("ทำไปแล้ว: " + ($done -join ', ')) } else { Write-Log "ยังไม่เคยปรับแต่ง (เริ่มได้เลย)" }

# ============================================================
#   ปุ่มเริ่มทำงาน
# ============================================================
$BtnRun.Add_Click({
  $BtnRun.IsEnabled=$false; $BtnRun.Content="กำลังทำงาน..."
  $Log.Clear(); $script:logLines.Clear(); $Pb.Value=0; $StepText.Text="0/$([int]$Pb.Maximum)"
  $script:checkedKeys = @($keys | Where-Object { $_ -ne 'confirm' -and $checkboxes[$_].IsChecked })
  $freeBefore=Get-FreeMB
  Write-Log ">> เริ่มทำงาน..."
  $ErrorActionPreference="Continue"

  if($checkboxes["restore"].IsChecked){
    try{ Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
         Checkpoint-Computer -Description "SCPclear" -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
         Write-Log "[OK] สร้าง Restore Point แล้ว" }catch{ Write-Log "[!] Restore Point ไม่ได้ (ข้าม)" }
  }; Step

  if($checkboxes["pagefile"].IsChecked){
    try{ if($ramGB -le 4){ $init=6144;$max=8192 }elseif($ramGB -le 8){ $init=8192;$max=12288 }else{ $init=8192;$max=16384 }
         $cs=Get-CimInstance Win32_ComputerSystem
         if($cs.AutomaticManagedPagefile){ Set-CimInstance -InputObject $cs -Property @{AutomaticManagedPagefile=$false} }
         $pf=Get-CimInstance Win32_PageFileSetting -ErrorAction SilentlyContinue
         if($pf){ Set-CimInstance -InputObject $pf -Property @{InitialSize=$init;MaximumSize=$max} }
         else{ New-CimInstance -ClassName Win32_PageFileSetting -Property @{Name="$env:SystemDrive\pagefile.sys";InitialSize=$init;MaximumSize=$max} -ErrorAction SilentlyContinue | Out-Null }
         Write-Log "[OK] Virtual Memory = $init-$max MB" }catch{ Write-Log "[!] Virtual Memory ไม่สำเร็จ" }
  }; Step

  if($checkboxes["visual"].IsChecked){
    try{ $vfx="HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects"
         if(-not(Test-Path $vfx)){ New-Item -Path $vfx -Force | Out-Null }
         Set-ItemProperty $vfx "VisualFXSetting" 2 -Type DWord; Write-Log "[OK] ปรับ Visual Effects แล้ว" }catch{ Write-Log "[!] Visual Effects ไม่สำเร็จ" }
  }; Step

  if($checkboxes["transp"].IsChecked){
    try{ Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "EnableTransparency" 0 -Type DWord; Write-Log "[OK] ปิด Transparency แล้ว" }catch{ Write-Log "[!] Transparency ไม่สำเร็จ" }
  }; Step

  if($checkboxes["sysmain"].IsChecked){
    try{ Stop-Service "SysMain" -Force -ErrorAction SilentlyContinue; Set-Service "SysMain" -StartupType Disabled -ErrorAction Stop; Write-Log "[OK] ปิด SysMain แล้ว" }catch{ Write-Log "[!] SysMain ไม่สำเร็จ" }
  }; Step

  if($checkboxes["temp"].IsChecked){
    try{ Remove-Item "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
         Remove-Item "$env:SystemRoot\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue
         Write-Log "[OK] ล้างไฟล์ Temp แล้ว" }catch{ Write-Log "[!] ล้าง Temp บางไฟล์ไม่ได้" }
  }; Step

  if($checkboxes["wucache"].IsChecked){
    try{ Stop-Service "wuauserv" -Force -ErrorAction SilentlyContinue; Stop-Service "bits" -Force -ErrorAction SilentlyContinue
         Remove-Item "$env:SystemRoot\SoftwareDistribution\Download\*" -Recurse -Force -ErrorAction SilentlyContinue
         Start-Service "wuauserv" -ErrorAction SilentlyContinue; Start-Service "bits" -ErrorAction SilentlyContinue
         Write-Log "[OK] ล้าง Windows Update cache แล้ว" }catch{ Write-Log "[!] Update cache ไม่สำเร็จ" }
  }; Step

  if($checkboxes["recycledns"].IsChecked){
    try{ Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Clear-DnsClientCache -ErrorAction SilentlyContinue; ipconfig /flushdns | Out-Null
         Write-Log "[OK] ล้าง Recycle Bin + DNS แล้ว" }catch{ Write-Log "[!] Recycle/DNS ผิดพลาด" }
  }; Step

  if($checkboxes["hibernate"].IsChecked){
    try{ powercfg /hibernate off 2>$null; Write-Log "[OK] ปิด Hibernation แล้ว" }catch{ Write-Log "[!] Hibernation ผิดพลาด" }
  }; Step

  if($checkboxes["power"].IsChecked){
    try{ powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null; Write-Log "[OK] Power Plan = High Performance" }catch{ Write-Log "[!] Power Plan ไม่สำเร็จ" }
  }; Step

  if($checkboxes["defrag"].IsChecked){
    if($isHDD){ try{ Write-Log "[..] กำลัง Defrag ไดรฟ์ C..."; Optimize-Volume -DriveLetter ($env:SystemDrive.TrimEnd(':')) -Defrag -ErrorAction Stop; Write-Log "[OK] Defrag เสร็จแล้ว" }catch{ Write-Log "[!] Defrag ไม่สำเร็จ" } }
    else{ Write-Log "[i] ข้าม Defrag (เป็น SSD)" }
  }; Step

  if($checkboxes["ads"].IsChecked){
    try{ $cdm="HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"
         foreach($n in "SubscribedContent-338388Enabled","SubscribedContent-338389Enabled","SubscribedContent-310093Enabled","SubscribedContent-338387Enabled","SystemPaneSuggestionsEnabled","RotatingLockScreenOverlayEnabled","SoftLandingEnabled"){ Set-Reg $cdm $n 0 }
         Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "Start_IrisRecommendations" 0
         Write-Log "[OK] ปิดโฆษณา/คำแนะนำแล้ว" }catch{ Write-Log "[!] ปิดโฆษณาผิดพลาด" }
  }; Step

  if($checkboxes["rightclick"].IsChecked){
    try{ $p="HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32"
         New-Item $p -Force | Out-Null; Set-ItemProperty $p -Name "(Default)" -Value ""
         Write-Log "[OK] คืนเมนูคลิกขวาแบบเก่าแล้ว" }catch{ Write-Log "[!] เมนูคลิกขวาผิดพลาด" }
  }; Step

  if($checkboxes["widgets"].IsChecked){
    try{ Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "TaskbarDa" 0
         Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "TaskbarMn" 0
         Write-Log "[OK] ปิด Widgets + Chat แล้ว" }catch{ Write-Log "[!] Widgets ผิดพลาด" }
  }; Step

  if($checkboxes["removeai"].IsChecked){
    if(Confirm-Remove "Windows Copilot"){
      try{ Get-AppxPackage -AllUsers "*Copilot*" | Remove-AppxPackage -ErrorAction SilentlyContinue
           Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -like "*Copilot*" } | ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue } | Out-Null
           Set-Reg "HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot" "TurnOffWindowsCopilot" 1
           Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot" "TurnOffWindowsCopilot" 1
           Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "ShowCopilotButton" 0
           Write-Log "[OK] ปิด/ลบ Copilot แล้ว" }catch{ Write-Log "[!] Copilot ผิดพลาด" }
    }else{ Write-Log "[ข้าม] Copilot" }
    if(Confirm-Remove "Windows Recall"){
      try{ Disable-WindowsOptionalFeature -Online -FeatureName "Recall" -NoRestart -ErrorAction SilentlyContinue | Out-Null
           Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI" "DisableAIDataAnalysis" 1
           Set-Reg "HKCU:\Software\Policies\Microsoft\Windows\WindowsAI" "DisableAIDataAnalysis" 1
           Write-Log "[OK] ปิด Recall แล้ว" }catch{ Write-Log "[!] Recall ผิดพลาด" }
    }else{ Write-Log "[ข้าม] Recall" }
  }; Step

  if($checkboxes["bloat"].IsChecked){
    $bloatApps=@(
      @{N="Xbox (เกม)";P="*Xbox*"},@{N="Bing News (ข่าว)";P="Microsoft.BingNews"},@{N="Bing Weather (อากาศ)";P="Microsoft.BingWeather"},
      @{N="Solitaire (เกมไพ่)";P="*SolitaireCollection*"},@{N="Maps (แผนที่)";P="Microsoft.WindowsMaps"},@{N="Clipchamp (ตัดต่อวิดีโอ)";P="Clipchamp.Clipchamp"},
      @{N="People (รายชื่อผู้ติดต่อ)";P="Microsoft.People"},@{N="To Do (สิ่งที่ต้องทำ)";P="Microsoft.Todos"},@{N="Power Automate";P="Microsoft.PowerAutomateDesktop"},
      @{N="Office Hub";P="Microsoft.MicrosoftOfficeHub"},@{N="Get Help (ขอความช่วยเหลือ)";P="Microsoft.GetHelp"},@{N="Feedback Hub";P="Microsoft.WindowsFeedbackHub"}
    )
    foreach($a in $bloatApps){
      $exist=Get-AppxPackage -AllUsers $a.P -ErrorAction SilentlyContinue
      if(-not $exist){ continue }
      if(Confirm-Remove $a.N){
        try{ Get-AppxPackage -AllUsers $a.P | Remove-AppxPackage -ErrorAction SilentlyContinue
             Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -like $a.P } | ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue } | Out-Null
             Write-Log "[OK] ลบ $($a.N)" }catch{ Write-Log "[!] $($a.N) ลบไม่ได้" }
      }else{ Write-Log "[ข้าม] $($a.N)" }
    }
  }; Step

  if($checkboxes["telemetry"].IsChecked){
    if(Confirm-Remove "ปิด Telemetry (การส่งข้อมูลกลับ Microsoft)"){
      try{ Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection" "AllowTelemetry" 0
           Stop-Service "DiagTrack" -Force -ErrorAction SilentlyContinue; Set-Service "DiagTrack" -StartupType Disabled -ErrorAction SilentlyContinue
           Set-Service "dmwappushservice" -StartupType Disabled -ErrorAction SilentlyContinue
           Disable-ScheduledTask -TaskPath "\Microsoft\Windows\Application Experience\" -TaskName "Microsoft Compatibility Appraiser" -ErrorAction SilentlyContinue | Out-Null
           Disable-ScheduledTask -TaskPath "\Microsoft\Windows\Customer Experience Improvement Program\" -TaskName "Consolidator" -ErrorAction SilentlyContinue | Out-Null
           Write-Log "[OK] ปิด Telemetry แล้ว" }catch{ Write-Log "[!] Telemetry ผิดพลาด" }
    }else{ Write-Log "[ข้าม] Telemetry" }
  }; Step

  if($checkboxes["onedrive"].IsChecked){
    if(Confirm-Remove "OneDrive (ถอนการติดตั้ง)"){
      try{ Stop-Process -Name "OneDrive" -Force -ErrorAction SilentlyContinue
           $od64="$env:SystemRoot\SysWOW64\OneDriveSetup.exe"; $od32="$env:SystemRoot\System32\OneDriveSetup.exe"
           if(Test-Path $od64){ Start-Process $od64 "/uninstall" -Wait -ErrorAction SilentlyContinue }elseif(Test-Path $od32){ Start-Process $od32 "/uninstall" -Wait -ErrorAction SilentlyContinue }
           Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\OneDrive" "DisableFileSyncNGSC" 1
           Remove-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" "OneDrive" -ErrorAction SilentlyContinue
           Write-Log "[OK] ถอน OneDrive แล้ว" }catch{ Write-Log "[!] OneDrive ผิดพลาด" }
    }else{ Write-Log "[ข้าม] OneDrive" }
  }; Step

  if($checkboxes["winupdate"].IsChecked){
    try{ Write-Log "[..] กำลังตรวจสอบ Windows Update... (อาจใช้เวลาหลายนาที)"
         $uSession=New-Object -ComObject Microsoft.Update.Session
         $uSearcher=$uSession.CreateUpdateSearcher()
         $uResult=$uSearcher.Search("IsInstalled=0 and IsHidden=0")
         if($uResult.Updates.Count -eq 0){ Write-Log "[i] ไม่มีอัปเดตใหม่ ระบบเป็นปัจจุบันแล้ว" }
         else{
           Write-Log "[..] พบอัปเดต $($uResult.Updates.Count) รายการ กำลังดาวน์โหลด..."
           $uColl=New-Object -ComObject Microsoft.Update.UpdateColl
           foreach($u in $uResult.Updates){ $uColl.Add($u) | Out-Null }
           $uDownloader=$uSession.CreateUpdateDownloader(); $uDownloader.Updates=$uColl; $uDownloader.Download() | Out-Null
           $uToInstall=New-Object -ComObject Microsoft.Update.UpdateColl
           foreach($u in $uResult.Updates){ if($u.IsDownloaded){ $uToInstall.Add($u) | Out-Null } }
           Write-Log "[..] กำลังติดตั้งอัปเดต $($uToInstall.Count) รายการ..."
           $uInstaller=$uSession.CreateUpdateInstaller(); $uInstaller.Updates=$uToInstall
           $uInstallResult=$uInstaller.Install()
           Write-Log "[OK] ติดตั้ง Windows Update แล้ว (ผลลัพธ์รหัส $($uInstallResult.ResultCode)) — อาจต้องรีสตาร์ทเพื่อให้มีผล"
         }
    }catch{ Write-Log "[!] Windows Update ไม่สำเร็จ: $($_.Exception.Message)" }
  }; Step

  if($checkboxes["sfcdism"].IsChecked){
    try{ Write-Log "[..] กำลังตรวจสอบไฟล์ระบบ (sfc /scannow)... อาจใช้เวลานาน"
         & sfc.exe /scannow *>&1 | ForEach-Object { } | Out-Null
         Write-Log "[OK] sfc /scannow เสร็จแล้ว"
         Write-Log "[..] กำลังซ่อมระบบ (DISM RestoreHealth)..."
         & dism.exe /Online /Cleanup-Image /RestoreHealth *>&1 | ForEach-Object { } | Out-Null
         Write-Log "[OK] DISM RestoreHealth เสร็จแล้ว"
    }catch{ Write-Log "[!] ซ่อมไฟล์ระบบไม่สำเร็จ: $($_.Exception.Message)" }
  }; Step

  $Pb.Value=$Pb.Maximum
  $freed=(Get-FreeMB)-$freeBefore
  if($freed -ge 50){ if($freed -ge 1024){ Write-Log (">> คืนพื้นที่ดิสก์ ~{0:N1} GB" -f ($freed/1024)) }else{ Write-Log ">> คืนพื้นที่ดิสก์ ~$freed MB" } }
  Write-Log ">> เสร็จเรียบร้อย! แนะนำให้รีสตาร์ทเครื่อง"

  if($checkboxes["rightclick"].IsChecked -or $checkboxes["widgets"].IsChecked){
    try{ Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Process explorer }catch{}
  }
  Save-Log
  if($checkboxes["startup"].IsChecked){ Write-Log ">> เปิด Task Manager แท็บ Startup..."; Start-Process "taskmgr.exe" "/0 /startup" }
  Show-Summary $freed
  $BtnRun.IsEnabled=$true; $BtnRun.Content="เริ่มทำงาน"
})

# ============================================================
#   ปุ่มย้อนกลับ
# ============================================================
$BtnRevert.Add_Click({
  $r=[System.Windows.MessageBox]::Show("คืนค่าการปรับแต่งกลับเป็นค่าเริ่มต้นของ Windows?`n`n(ไฟล์ที่ลบไป / แอปที่ถอนไป จะคืนไม่ได้ ต้องลงใหม่เอง)","ย้อนกลับ",[System.Windows.MessageBoxButton]::YesNo,[System.Windows.MessageBoxImage]::Warning)
  if($r -ne [System.Windows.MessageBoxResult]::Yes){ return }
  $BtnRevert.IsEnabled=$false; $Log.Clear(); $script:logLines.Clear(); $Pb.Value=0
  Write-Log ">> กำลังย้อนกลับ..."; $ErrorActionPreference="Continue"
  try{ $cs=Get-CimInstance Win32_ComputerSystem; if(-not $cs.AutomaticManagedPagefile){ Set-CimInstance -InputObject $cs -Property @{AutomaticManagedPagefile=$true} }; Write-Log "[OK] Virtual Memory = อัตโนมัติ" }catch{}
  try{ Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" "VisualFXSetting" 0 -Type DWord; Write-Log "[OK] Visual Effects = อัตโนมัติ" }catch{}
  try{ Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "EnableTransparency" 1 -Type DWord; Write-Log "[OK] เปิด Transparency" }catch{}
  try{ Set-Service "SysMain" -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service "SysMain" -ErrorAction SilentlyContinue; Write-Log "[OK] เปิด SysMain" }catch{}
  try{ powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e 2>$null; Write-Log "[OK] Power Plan = Balanced" }catch{}
  try{ powercfg /hibernate on 2>$null; Write-Log "[OK] เปิด Hibernation" }catch{}
  try{ Remove-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection" "AllowTelemetry" -ErrorAction SilentlyContinue
       Set-Service "DiagTrack" -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service "DiagTrack" -ErrorAction SilentlyContinue
       Set-Service "dmwappushservice" -StartupType Manual -ErrorAction SilentlyContinue
       Enable-ScheduledTask -TaskPath "\Microsoft\Windows\Application Experience\" -TaskName "Microsoft Compatibility Appraiser" -ErrorAction SilentlyContinue | Out-Null
       Write-Log "[OK] เปิด Telemetry กลับ" }catch{}
  try{ Remove-ItemProperty "HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot" "TurnOffWindowsCopilot" -ErrorAction SilentlyContinue
       Remove-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot" "TurnOffWindowsCopilot" -ErrorAction SilentlyContinue
       Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "ShowCopilotButton" 1
       Remove-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI" "DisableAIDataAnalysis" -ErrorAction SilentlyContinue
       Write-Log "[OK] เปิด Copilot กลับ" }catch{}
  try{ $cdm="HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"
       foreach($n in "SubscribedContent-338388Enabled","SubscribedContent-338389Enabled","SubscribedContent-310093Enabled","SubscribedContent-338387Enabled","SystemPaneSuggestionsEnabled","RotatingLockScreenOverlayEnabled","SoftLandingEnabled"){ Set-Reg $cdm $n 1 }
       Write-Log "[OK] เปิดคำแนะนำกลับ" }catch{}
  try{ Remove-Item "HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}" -Recurse -ErrorAction SilentlyContinue; Write-Log "[OK] คืนเมนูคลิกขวาแบบ Win11" }catch{}
  try{ Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "TaskbarDa" 1
       Set-Reg "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "TaskbarMn" 1; Write-Log "[OK] เปิด Widgets กลับ" }catch{}
  try{ Remove-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\OneDrive" "DisableFileSyncNGSC" -ErrorAction SilentlyContinue }catch{}
  try{ Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Process explorer }catch{}
  Write-Log ">> ย้อนกลับเสร็จ! (แอป/ไฟล์ที่ลบไปต้องลงใหม่เอง)"
  Save-Log
  [System.Windows.MessageBox]::Show("ย้อนกลับค่าระบบเรียบร้อย`n`nหมายเหตุ: แอปที่ถอนไป (Copilot/bloatware/OneDrive) และไฟล์ที่ลบ ต้องติดตั้ง/กู้เองจาก Store","ย้อนกลับ",[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Information) | Out-Null
  $BtnRevert.IsEnabled=$true
})

# ============================================================
#   จัดการ Startup (หน้าต่างในตัว)
# ============================================================
function NewBrush($hex){ New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.ColorConverter]::ConvertFromString($hex)) }
function Get-StartupEnabled($scope,$name){
  $base= if($scope -eq 'HKCU'){"HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"}else{"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"}
  try{ $v=(Get-ItemProperty $base -Name $name -ErrorAction Stop).$name; return (($v[0] -band 1) -eq 0) }catch{ return $true }
}
function Set-StartupState($scope,$name,$enabled){
  $base= if($scope -eq 'HKCU'){"HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"}else{"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"}
  if(-not(Test-Path $base)){ New-Item $base -Force | Out-Null }
  $bytes= if($enabled){ [byte[]](2,0,0,0,0,0,0,0,0,0,0,0) }else{ [byte[]](3,0,0,0,0,0,0,0,0,0,0,0) }
  New-ItemProperty -Path $base -Name $name -Value $bytes -PropertyType Binary -Force | Out-Null
}
function Get-RunEntries($scope){
  $p= if($scope -eq 'HKCU'){"HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"}else{"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"}
  $out=@()
  if(Test-Path $p){ $item=Get-ItemProperty $p
    foreach($pr in $item.PSObject.Properties){
      if($pr.Name -match '^PS(Path|ParentPath|ChildName|Drive|Provider)$'){ continue }
      $out += @{Name=$pr.Name;Cmd=[string]$pr.Value;Scope=$scope;Enabled=(Get-StartupEnabled $scope $pr.Name)}
    }
  }
  return $out
}
$BtnStartup.Add_Click({
  $entries=@(); $entries+=Get-RunEntries 'HKCU'; $entries+=Get-RunEntries 'HKLM'
  $sw=New-Object System.Windows.Window
  $sw.Title="จัดการ Startup"; $sw.Width=470; $sw.Height=560; $sw.WindowStartupLocation="CenterScreen"
  $sw.Background=(NewBrush $Theme.WindowBg); $sw.FontFamily=$FontFamilyValue; $sw.Owner=$window
  Set-ModernChrome $sw
  $root=New-Object System.Windows.Controls.Grid; $root.Margin="18"
  $r0=New-Object System.Windows.Controls.RowDefinition; $r0.Height="Auto"
  $r1=New-Object System.Windows.Controls.RowDefinition; $r1.Height="*"
  $r2=New-Object System.Windows.Controls.RowDefinition; $r2.Height="Auto"
  $root.RowDefinitions.Add($r0); $root.RowDefinitions.Add($r1); $root.RowDefinitions.Add($r2)
  $hd=New-Object System.Windows.Controls.TextBlock; $hd.Text="โปรแกรมที่เปิดตอนเปิดเครื่อง"; $hd.FontSize=16; $hd.FontWeight="Bold"; $hd.Foreground=(NewBrush $Theme.TitleFg); $hd.Margin="2,0,0,10"
  [System.Windows.Controls.Grid]::SetRow($hd,0); $root.Children.Add($hd)|Out-Null
  $sv=New-Object System.Windows.Controls.ScrollViewer; $sv.VerticalScrollBarVisibility="Auto"
  [System.Windows.Controls.Grid]::SetRow($sv,1)
  $sp=New-Object System.Windows.Controls.StackPanel; $sv.Content=$sp; $root.Children.Add($sv)|Out-Null
  $rows=@()
  if($entries.Count -eq 0){
    $t=New-Object System.Windows.Controls.TextBlock; $t.Text="ไม่พบโปรแกรมใน Startup (registry Run)"; $t.Foreground=(NewBrush $Theme.MutedFg); $sp.Children.Add($t)|Out-Null
  }
  foreach($e in $entries){
    $card=New-Object System.Windows.Controls.Border; $card.Background=(NewBrush $Theme.CardBg); $card.CornerRadius="12"; $card.BorderBrush=(NewBrush $Theme.CardBorder); $card.BorderThickness="1"; $card.Padding="14,10"; $card.Margin="0,0,0,8"
    $g=New-Object System.Windows.Controls.Grid
    $c0=New-Object System.Windows.Controls.ColumnDefinition; $c0.Width="*"
    $c1=New-Object System.Windows.Controls.ColumnDefinition; $c1.Width="Auto"
    $g.ColumnDefinitions.Add($c0); $g.ColumnDefinitions.Add($c1)
    $stk=New-Object System.Windows.Controls.StackPanel; $stk.VerticalAlignment="Center"
    $nm=New-Object System.Windows.Controls.TextBlock; $nm.Text=$e.Name; $nm.FontWeight="SemiBold"; $nm.FontSize=13; $nm.Foreground=(NewBrush $Theme.BodyFg)
    $cm=New-Object System.Windows.Controls.TextBlock; $cm.Text=("[$($e.Scope)] "+$e.Cmd); $cm.FontSize=10.5; $cm.Foreground=(NewBrush $Theme.MutedFg); $cm.TextTrimming="CharacterEllipsis"; $cm.Margin="0,2,0,0"
    $stk.Children.Add($nm)|Out-Null; $stk.Children.Add($cm)|Out-Null
    [System.Windows.Controls.Grid]::SetColumn($stk,0); $g.Children.Add($stk)|Out-Null
    $cb=New-Object System.Windows.Controls.CheckBox; $cb.IsChecked=$e.Enabled; $cb.VerticalAlignment="Center"; $cb.Cursor="Hand"
    [System.Windows.Controls.Grid]::SetColumn($cb,1); $g.Children.Add($cb)|Out-Null
    $card.Child=$g; $sp.Children.Add($card)|Out-Null
    $rows += @{Entry=$e;Cb=$cb}
  }
  $save=New-Object System.Windows.Controls.Button; $save.Content="บันทึก (ติ๊ก = เปิด, ไม่ติ๊ก = ปิดตอนบูต)"; $save.Margin="0,12,0,0"; $save.Padding="0,10"; $save.Cursor="Hand"
  $save.Background=(NewBrush "#EE6C2B"); $save.Foreground=(NewBrush "#FFFFFF"); $save.FontWeight="Bold"; $save.BorderThickness="0"
  [System.Windows.Controls.Grid]::SetRow($save,2); $root.Children.Add($save)|Out-Null
  $save.Add_Click({
    foreach($row in $rows){ try{ Set-StartupState $row.Entry.Scope $row.Entry.Name ([bool]$row.Cb.IsChecked) }catch{} }
    [System.Windows.MessageBox]::Show("บันทึกแล้ว (มีผลรอบเปิดเครื่องถัดไป)","Startup",[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Information)|Out-Null
    $sw.Close()
  }.GetNewClosure())
  $sw.Content=$root
  $sw.ShowDialog() | Out-Null
})

# ============================================================
#   ตรวจสอบอัปเดต SCPclear (จาก GitHub Releases)
# ============================================================
$BtnCheckUpdate.Add_Click({
  $BtnCheckUpdate.IsEnabled=$false
  try{
    $rel=Invoke-RestMethod -Uri "https://api.github.com/repos/$GitHubRepo/releases/latest" -Headers @{ "User-Agent"="SCPclear" } -ErrorAction Stop
    $latest=($rel.tag_name -replace '^v','')
    if([version]$latest -gt [version]$ScriptVersion){
      $r=[System.Windows.MessageBox]::Show("มีเวอร์ชันใหม่: v$latest (ตอนนี้ใช้ v$ScriptVersion)`n`n$($rel.name)`n`nเปิดหน้าดาวน์โหลดเลยไหม?","พบอัปเดตใหม่",[System.Windows.MessageBoxButton]::YesNo,[System.Windows.MessageBoxImage]::Information)
      if($r -eq [System.Windows.MessageBoxResult]::Yes){ Start-Process $rel.html_url }
    } else {
      [System.Windows.MessageBox]::Show("คุณใช้ SCPclear เวอร์ชันล่าสุดแล้ว (v$ScriptVersion)","ตรวจสอบอัปเดต",[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Information) | Out-Null
    }
  }catch{
    [System.Windows.MessageBox]::Show("ตรวจสอบอัปเดตไม่สำเร็จ (ต้องมีอินเทอร์เน็ต หรือยังไม่มี release บน GitHub)`n`n$($_.Exception.Message)","ตรวจสอบอัปเดต",[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Warning) | Out-Null
  }
  $BtnCheckUpdate.IsEnabled=$true
})

# ============================================================
#   การ์ดสรุปผลหลังรัน
# ============================================================
function Show-Summary($freedMB){
  $ok=($script:logLines | Where-Object { $_ -like '`[OK`]*' })
  $catCounts=[ordered]@{}
  foreach($k in $script:checkedKeys){
    $c=$categoryOf[$k]; if(-not $c){ continue }
    if(-not $catCounts.Contains($c)){ $catCounts[$c]=0 }
    $catCounts[$c]++
  }
  $win=New-Object System.Windows.Window
  $win.Title="สรุปผล"; $win.Width=420; $win.WindowStartupLocation="CenterScreen"; $win.ResizeMode="NoResize"; $win.SizeToContent="Height"
  $win.Background=(NewBrush $Theme.WindowBg); $win.FontFamily=$FontFamilyValue; $win.Owner=$window
  Set-ModernChrome $win
  $root=New-Object System.Windows.Controls.Grid; $root.Margin="22"
  foreach($h in "Auto","Auto","Auto","Auto","Auto","Auto") { $rd=New-Object System.Windows.Controls.RowDefinition; $rd.Height=$h; $root.RowDefinitions.Add($rd) }
  $t1=New-Object System.Windows.Controls.TextBlock; $t1.Text="เสร็จเรียบร้อย"; $t1.FontSize=22; $t1.FontWeight="Bold"; $t1.Foreground=(NewBrush "#22A06B")
  [System.Windows.Controls.Grid]::SetRow($t1,0); $root.Children.Add($t1)|Out-Null
  $stat=New-Object System.Windows.Controls.TextBlock
  $freedTxt = if($freedMB -ge 1024){ "{0:N1} GB" -f ($freedMB/1024) } elseif($freedMB -ge 1){ "$freedMB MB" } else { "0 MB" }
  $stat.Text="ทำสำเร็จ $($ok.Count) รายการ   •   คืนพื้นที่ $freedTxt"; $stat.FontSize=13; $stat.Foreground=(NewBrush $Theme.LogFg); $stat.Margin="0,4,0,12"
  [System.Windows.Controls.Grid]::SetRow($stat,1); $root.Children.Add($stat)|Out-Null
  # การ์ดหมวดหมู่แบบย่อ
  $chipCard=New-Object System.Windows.Controls.Border; $chipCard.Background=(NewBrush $Theme.CardBg); $chipCard.CornerRadius="14"; $chipCard.BorderBrush=(NewBrush $Theme.CardBorder); $chipCard.BorderThickness="1"; $chipCard.Padding="16,12"; $chipCard.Margin="0,0,0,10"
  $chipWrap=New-Object System.Windows.Controls.WrapPanel; $chipCard.Child=$chipWrap
  if($catCounts.Count -eq 0){ $e=New-Object System.Windows.Controls.TextBlock; $e.Text="ไม่มีรายการที่ทำ"; $e.Foreground=(NewBrush $Theme.MutedFg); $chipWrap.Children.Add($e)|Out-Null }
  foreach($c in $catCounts.Keys){
    $ic = if($categoryIcon.ContainsKey($c)){ $categoryIcon[$c] } else { "•" }
    $tb=New-Object System.Windows.Controls.TextBlock; $tb.Text="$ic $c`: $($catCounts[$c])"; $tb.FontSize=12.5; $tb.Foreground=(NewBrush $Theme.BodyFg); $tb.Margin="0,0,16,4"
    $chipWrap.Children.Add($tb)|Out-Null
  }
  [System.Windows.Controls.Grid]::SetRow($chipCard,2); $root.Children.Add($chipCard)|Out-Null
  # ปุ่มดูรายละเอียดทั้งหมด (พับ/กาง)
  $bDetail=New-Object System.Windows.Controls.Button; $bDetail.Content="ดูรายละเอียดทั้งหมด ▾"; $bDetail.HorizontalAlignment="Left"; $bDetail.Cursor="Hand"
  $bDetail.Background=(NewBrush "Transparent"); $bDetail.Foreground=(NewBrush $Theme.LinkFg); $bDetail.FontSize=12.5; $bDetail.FontWeight="SemiBold"; $bDetail.BorderThickness="0"; $bDetail.Padding="0,4"; $bDetail.Margin="0,0,0,4"
  [System.Windows.Controls.Grid]::SetRow($bDetail,3); $root.Children.Add($bDetail)|Out-Null
  $sv=New-Object System.Windows.Controls.ScrollViewer; $sv.VerticalScrollBarVisibility="Auto"; $sv.MaxHeight=220; $sv.Visibility="Collapsed"
  $card=New-Object System.Windows.Controls.Border; $card.Background=(NewBrush $Theme.CardBg); $card.CornerRadius="14"; $card.BorderBrush=(NewBrush $Theme.CardBorder); $card.BorderThickness="1"; $card.Padding="16,12"
  $sp=New-Object System.Windows.Controls.StackPanel; $card.Child=$sp; $sv.Content=$card
  [System.Windows.Controls.Grid]::SetRow($sv,4); $root.Children.Add($sv)|Out-Null
  if($ok.Count -eq 0){ $e=New-Object System.Windows.Controls.TextBlock; $e.Text="ไม่มีรายการที่ทำ"; $e.Foreground=(NewBrush $Theme.MutedFg); $sp.Children.Add($e)|Out-Null }
  foreach($line in $ok){ $tb=New-Object System.Windows.Controls.TextBlock; $tb.Text=("✓ "+($line -replace '^\[OK\]\s*','')); $tb.FontSize=12.5; $tb.Foreground=(NewBrush $Theme.BodyFg); $tb.Margin="0,3,0,3"; $tb.TextWrapping="Wrap"; $sp.Children.Add($tb)|Out-Null }
  $bDetail.Add_Click({
    if($sv.Visibility -eq 'Visible'){ $sv.Visibility='Collapsed'; $bDetail.Content='ดูรายละเอียดทั้งหมด ▾' }
    else{ $sv.Visibility='Visible'; $bDetail.Content='ซ่อนรายละเอียด ▴' }
  }.GetNewClosure())
  $btns=New-Object System.Windows.Controls.StackPanel; $btns.Orientation="Horizontal"; $btns.HorizontalAlignment="Stretch"; $btns.Margin="0,14,0,0"
  [System.Windows.Controls.Grid]::SetRow($btns,5)
  $bRestart=New-Object System.Windows.Controls.Button; $bRestart.Content="รีสตาร์ทเดี๋ยวนี้"; $bRestart.Width=190; $bRestart.Height=44; $bRestart.Margin="0,0,10,0"; $bRestart.Cursor="Hand"; $bRestart.Background=(NewBrush "#EE6C2B"); $bRestart.Foreground=(NewBrush "#FFFFFF"); $bRestart.FontWeight="Bold"; $bRestart.BorderThickness="0"
  $bClose=New-Object System.Windows.Controls.Button; $bClose.Content="ปิด"; $bClose.Width=150; $bClose.Height=44; $bClose.Cursor="Hand"; $bClose.Background=(NewBrush $Theme.SecondaryBg); $bClose.Foreground=(NewBrush $Theme.BodyFg); $bClose.BorderThickness="0"
  $btns.Children.Add($bRestart)|Out-Null; $btns.Children.Add($bClose)|Out-Null; $root.Children.Add($btns)|Out-Null
  $bRestart.Add_Click({ $r=[System.Windows.MessageBox]::Show("รีสตาร์ทเครื่องตอนนี้?","ยืนยัน",[System.Windows.MessageBoxButton]::YesNo,[System.Windows.MessageBoxImage]::Question); if($r -eq [System.Windows.MessageBoxResult]::Yes){ Start-Process "shutdown.exe" "/r /t 3"; $win.Close() } }.GetNewClosure())
  $bClose.Add_Click({ $win.Close() }.GetNewClosure())
  $win.Content=$root; $win.ShowDialog() | Out-Null
}

# ============================================================
#   ตรวจสอบเครื่อง (วิเคราะห์ว่าทำไมช้า + แนะนำ)
# ============================================================
$BtnDiag.Add_Click({
  $cs=Get-CimInstance Win32_ComputerSystem
  $os=Get-CimInstance Win32_OperatingSystem
  $cpu=Get-CimInstance Win32_Processor | Select-Object -First 1
  $model=("{0} {1}" -f $cs.Manufacturer,$cs.Model).Trim()
  $disk=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'"
  $freeGB=[math]::Round($disk.FreeSpace/1GB,1); $totGB=[math]::Round($disk.Size/1GB,1)
  $freePct=[math]::Round($disk.FreeSpace/$disk.Size*100)
  $ramUsedPct=[math]::Round((($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/$os.TotalVisibleMemorySize)*100)
  $uptime=(Get-Date)-$os.LastBootUpTime
  $startupCount=(@(Get-RunEntries 'HKCU')+@(Get-RunEntries 'HKLM') | Where-Object { $_.Enabled }).Count
  $pagefileAuto=[bool]$cs.AutomaticManagedPagefile
  $topProc=Get-Process | Sort-Object WS -Descending | Select-Object -First 3 | ForEach-Object { "{0}  ({1:N0} MB)" -f $_.ProcessName,($_.WS/1MB) }

  # หา findings
  $find=@()  # @{lvl;txt;fix}
  if($isHDD){ $find+=@{lvl="สูง";txt="เครื่องใช้ HDD (จานหมุน) — นี่คือสาเหตุหลักที่ทำให้ช้า การเปลี่ยนเป็น SSD จะช่วยได้มากที่สุด ระหว่างนี้ปิด SysMain + Defrag ช่วยได้บ้าง";fix=@('sysmain','defrag')} }
  if($ramGB -le 4){ $find+=@{lvl="สูง";txt="แรมน้อย ($ramGB GB) เปิดหลายโปรแกรมพร้อมกันจะช้า — ตั้ง Virtual Memory + ปิดเอฟเฟกต์ + ลดโปรแกรมตอนบูต";fix=@('pagefile','visual','transp','startup')} }
  elseif($ramGB -le 8){ $find+=@{lvl="ต่ำ";txt="แรม $ramGB GB พอใช้งานทั่วไป แต่ควรตั้ง Virtual Memory ให้เหมาะ";fix=@('pagefile')} }
  if($ramUsedPct -ge 85){ $find+=@{lvl="สูง";txt="แรมใช้เกือบเต็มตอนนี้ ($ramUsedPct%) — ปิดโปรแกรมที่ไม่ใช้ และลดโปรแกรมที่เปิดตอนบูต";fix=@('startup')} }
  if($freePct -lt 12 -or $freeGB -lt 20){ $find+=@{lvl="สูง";txt="ดิสก์เกือบเต็ม (เหลือ $freeGB GB / $freePct%) — ล้างขยะ, ล้าง Update cache, ปิด Hibernation คืนพื้นที่";fix=@('temp','wucache','recycledns','hibernate')} }
  if($startupCount -gt 6){ $find+=@{lvl="กลาง";txt="โปรแกรมเปิดตอนบูตเยอะ ($startupCount ตัว) ทำให้เปิดเครื่องช้า — ปิดตัวที่ไม่จำเป็นในหน้าจัดการ Startup";fix=@('startup')} }
  if($pagefileAuto -and $ramGB -le 8){ $find+=@{lvl="กลาง";txt="ยังไม่ได้ตั้ง Virtual Memory เอง — ตั้งให้เหมาะกับแรมจะช่วยเครื่องแรมน้อย";fix=@('pagefile')} }
  if($uptime.Days -ge 3){ $find+=@{lvl="ต่ำ";txt="ไม่ได้รีสตาร์ทมา $($uptime.Days) วัน — ลองรีสตาร์ทเครื่องก่อน มักช่วยให้ลื่นขึ้นทันที";fix=@()} }
  if($find.Count -eq 0){ $find+=@{lvl="ดี";txt="เครื่องอยู่ในเกณฑ์ดี ไม่พบปัญหาใหญ่ กด แนะนำ แล้วเริ่มทำงานเพื่อดูแลรักษาได้เลย";fix=@()} }

  $colors=@{ "สูง"="#E5484D"; "กลาง"="#F5A623"; "ต่ำ"="#3B82F6"; "ดี"="#22A06B" }

  # สร้างหน้าต่าง
  $dw=New-Object System.Windows.Window
  $dw.Title="ตรวจสอบเครื่อง"; $dw.Width=470; $dw.Height=620; $dw.WindowStartupLocation="CenterScreen"; $dw.ResizeMode="NoResize"
  $dw.Background=(NewBrush $Theme.WindowBg); $dw.FontFamily=$FontFamilyValue; $dw.Owner=$window
  Set-ModernChrome $dw
  $g=New-Object System.Windows.Controls.Grid; $g.Margin="20"
  foreach($h in "Auto","Auto","*","Auto"){ $rd=New-Object System.Windows.Controls.RowDefinition; $rd.Height=$h; $g.RowDefinitions.Add($rd) }
  $h1=New-Object System.Windows.Controls.TextBlock; $h1.Text="ผลการตรวจสอบเครื่อง"; $h1.FontSize=18; $h1.FontWeight="Bold"; $h1.Foreground=(NewBrush $Theme.TitleFg)
  [System.Windows.Controls.Grid]::SetRow($h1,0); $g.Children.Add($h1)|Out-Null
  # การ์ดสเปก
  $specCard=New-Object System.Windows.Controls.Border; $specCard.Background=(NewBrush $Theme.CardBg); $specCard.CornerRadius="14"; $specCard.BorderBrush=(NewBrush $Theme.CardBorder); $specCard.BorderThickness="1"; $specCard.Padding="16,12"; $specCard.Margin="0,10,0,10"
  $specSp=New-Object System.Windows.Controls.StackPanel
  $specLines=@("รุ่น: $model","CPU: $($cpu.Name)","OS: $($os.Caption)","RAM: $ramGB GB (ใช้อยู่ $ramUsedPct%)","ดิสก์ C: $diskType — เหลือ $freeGB / $totGB GB ($freePct%)","โปรแกรมเปิดตอนบูต: $startupCount ตัว","เปิดเครื่องมาแล้ว: $($uptime.Days) วัน $($uptime.Hours) ชม.")
  foreach($l in $specLines){ $tb=New-Object System.Windows.Controls.TextBlock; $tb.Text=$l; $tb.FontSize=12; $tb.Foreground=(NewBrush $Theme.BodyFg); $tb.Margin="0,2,0,2"; $specSp.Children.Add($tb)|Out-Null }
  $tp=New-Object System.Windows.Controls.TextBlock; $tp.Text=("กินแรมสูงสุด: "+($topProc -join ", ")); $tp.FontSize=11; $tp.Foreground=(NewBrush $Theme.MutedFg); $tp.Margin="0,4,0,0"; $tp.TextWrapping="Wrap"; $specSp.Children.Add($tp)|Out-Null
  $specCard.Child=$specSp; [System.Windows.Controls.Grid]::SetRow($specCard,1); $g.Children.Add($specCard)|Out-Null
  # findings
  $sv=New-Object System.Windows.Controls.ScrollViewer; $sv.VerticalScrollBarVisibility="Auto"
  $fsp=New-Object System.Windows.Controls.StackPanel; $sv.Content=$fsp
  [System.Windows.Controls.Grid]::SetRow($sv,2); $g.Children.Add($sv)|Out-Null
  $recFix=@()
  foreach($f in $find){
    $recFix += $f.fix
    $c=New-Object System.Windows.Controls.Border; $c.Background=(NewBrush $Theme.CardBg); $c.CornerRadius="12"; $c.BorderBrush=(NewBrush $Theme.CardBorder); $c.BorderThickness="1"; $c.Padding="14,10"; $c.Margin="0,0,0,8"
    $row=New-Object System.Windows.Controls.StackPanel; $row.Orientation="Horizontal"
    $dot=New-Object System.Windows.Controls.Border; $dot.Width=10; $dot.Height=10; $dot.CornerRadius="5"; $dot.Background=(NewBrush $colors[$f.lvl]); $dot.VerticalAlignment="Top"; $dot.Margin="0,4,10,0"
    $tt=New-Object System.Windows.Controls.TextBlock; $tt.Text=$f.txt; $tt.FontSize=12.5; $tt.Foreground=(NewBrush $Theme.BodyFg); $tt.TextWrapping="Wrap"; $tt.Width=360
    $row.Children.Add($dot)|Out-Null; $row.Children.Add($tt)|Out-Null; $c.Child=$row; $fsp.Children.Add($c)|Out-Null
  }
  $recFix=$recFix | Select-Object -Unique
  # ปุ่ม
  $bp=New-Object System.Windows.Controls.StackPanel; $bp.Orientation="Horizontal"; $bp.Margin="0,12,0,0"
  [System.Windows.Controls.Grid]::SetRow($bp,3)
  $bApply=New-Object System.Windows.Controls.Button; $bApply.Content="ปรับตามคำแนะนำ"; $bApply.Width=200; $bApply.Height=44; $bApply.Margin="0,0,10,0"; $bApply.Cursor="Hand"; $bApply.Background=(NewBrush "#EE6C2B"); $bApply.Foreground=(NewBrush "#FFFFFF"); $bApply.FontWeight="Bold"; $bApply.BorderThickness="0"
  if($recFix.Count -eq 0){ $bApply.IsEnabled=$false }
  $bCloseD=New-Object System.Windows.Controls.Button; $bCloseD.Content="ปิด"; $bCloseD.Width=140; $bCloseD.Height=44; $bCloseD.Cursor="Hand"; $bCloseD.Background=(NewBrush $Theme.SecondaryBg); $bCloseD.Foreground=(NewBrush $Theme.BodyFg); $bCloseD.BorderThickness="0"
  $bp.Children.Add($bApply)|Out-Null; $bp.Children.Add($bCloseD)|Out-Null; $g.Children.Add($bp)|Out-Null
  $bApply.Add_Click({
    foreach($k in $keys){ $checkboxes[$k].IsChecked=$false }
    $checkboxes["restore"].IsChecked=$true; $checkboxes["confirm"].IsChecked=$true
    foreach($k in $recFix){ if($checkboxes.ContainsKey($k)){ $checkboxes[$k].IsChecked=$true } }
    [System.Windows.MessageBox]::Show("ติ๊กตัวเลือกที่แนะนำให้แล้ว`nกดปุ่ม เริ่มทำงาน สีส้มได้เลย","แนะนำ",[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Information)|Out-Null
    $dw.Close()
  }.GetNewClosure())
  $bCloseD.Add_Click({ $dw.Close() }.GetNewClosure())
  $dw.Content=$g; $dw.ShowDialog() | Out-Null
})

# ============================================================
#   ตรวจสุขภาพเครื่อง (IT) — สำหรับช่าง
# ============================================================
function Get-HealthReport {
    $report = New-Object System.Collections.Generic.List[object]
    function Add-Finding($cat,$title,$status,$detail,$fixKey,$fixLabel){
        $report.Add([ordered]@{Cat=$cat;Title=$title;Status=$status;Detail=$detail;FixKey=$fixKey;FixLabel=$fixLabel}) | Out-Null
    }

    $osInfo = Get-CimInstance Win32_OperatingSystem
    Add-Finding "ระบบปฏิบัติการ" "Windows Version" "Green" "$($osInfo.Caption) (Build $($osInfo.BuildNumber))" $null $null

    try{
        $lic = Get-CimInstance -Query "SELECT LicenseStatus FROM SoftwareLicensingProduct WHERE PartialProductKey IS NOT NULL AND ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f'" -ErrorAction Stop | Select-Object -First 1
        if($lic -and $lic.LicenseStatus -eq 1){ Add-Finding "ระบบปฏิบัติการ" "Activation" "Green" "เปิดใช้งาน (Activated)" $null $null }
        else{ Add-Finding "ระบบปฏิบัติการ" "Activation" "Red" "ยังไม่ได้ Activate Windows" $null $null }
    }catch{ Add-Finding "ระบบปฏิบัติการ" "Activation" "Yellow" "ตรวจสอบไม่ได้" $null $null }

    try{
        $wu = Get-Service wuauserv -ErrorAction Stop
        if($wu.Status -ne 'Running'){ Add-Finding "ระบบปฏิบัติการ" "Windows Update Service" "Red" "บริการ wuauserv ไม่ทำงาน (Status: $($wu.Status))" "wu_reset" "รีเซ็ต Windows Update" }
        else{
            $lastHotfix = Get-CimInstance Win32_QuickFixEngineering -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 1
            if($lastHotfix -and $lastHotfix.InstalledOn){
                $days = ((Get-Date) - [datetime]$lastHotfix.InstalledOn).Days
                if($days -gt 60){ Add-Finding "ระบบปฏิบัติการ" "Windows Update" "Yellow" "อัปเดตล่าสุดเมื่อ $days วันก่อน" "wu_reset" "รีเซ็ต Windows Update" }
                else{ Add-Finding "ระบบปฏิบัติการ" "Windows Update" "Green" "อัปเดตล่าสุดเมื่อ $days วันก่อน" $null $null }
            } else { Add-Finding "ระบบปฏิบัติการ" "Windows Update" "Yellow" "ไม่พบประวัติการอัปเดต" $null $null }
        }
    }catch{ Add-Finding "ระบบปฏิบัติการ" "Windows Update" "Yellow" "ตรวจสอบไม่ได้" $null $null }

    try{
        $mp = Get-MpComputerStatus -ErrorAction Stop
        if(-not $mp.AntivirusEnabled){ Add-Finding "ระบบปฏิบัติการ" "Windows Defender" "Red" "Antivirus ปิดอยู่" $null $null }
        elseif(-not $mp.RealTimeProtectionEnabled){ Add-Finding "ระบบปฏิบัติการ" "Windows Defender" "Red" "Real-time Protection ปิดอยู่" $null $null }
        elseif($mp.AntivirusSignatureAge -gt 7){ Add-Finding "ระบบปฏิบัติการ" "Windows Defender" "Yellow" "ฐานข้อมูลไวรัสเก่า $($mp.AntivirusSignatureAge) วัน" $null $null }
        else{ Add-Finding "ระบบปฏิบัติการ" "Windows Defender" "Green" "ทำงานปกติ (signature อายุ $($mp.AntivirusSignatureAge) วัน)" $null $null }
    }catch{ Add-Finding "ระบบปฏิบัติการ" "Windows Defender" "Yellow" "ตรวจสอบไม่ได้ (อาจใช้ Antivirus อื่น)" $null $null }

    try{
        $fw = Get-NetFirewallProfile -ErrorAction Stop
        $off = $fw | Where-Object { -not $_.Enabled }
        if($off){ Add-Finding "ระบบปฏิบัติการ" "Firewall" "Red" ("ปิดอยู่: " + (($off.Name) -join ', ')) "fw_enable" "เปิด Firewall" }
        else{ Add-Finding "ระบบปฏิบัติการ" "Firewall" "Green" "เปิดใช้งานทุกโปรไฟล์" $null $null }
    }catch{ Add-Finding "ระบบปฏิบัติการ" "Firewall" "Yellow" "ตรวจสอบไม่ได้" $null $null }

    try{ $errCount = @(Get-WinEvent -FilterHashtable @{LogName='System';Level=1,2;StartTime=(Get-Date).AddHours(-24)} -ErrorAction Stop).Count }catch{ $errCount = 0 }
    if($errCount -gt 50){ Add-Finding "ระบบปฏิบัติการ" "Event Log (System, 24 ชม.)" "Red" "พบ $errCount Critical/Error events" $null $null }
    elseif($errCount -gt 10){ Add-Finding "ระบบปฏิบัติการ" "Event Log (System, 24 ชม.)" "Yellow" "พบ $errCount Critical/Error events" $null $null }
    else{ Add-Finding "ระบบปฏิบัติการ" "Event Log (System, 24 ชม.)" "Green" "พบ $errCount Critical/Error events" $null $null }

    try{ $bsod = @(Get-WinEvent -FilterHashtable @{LogName='System';Id=41,1001;StartTime=(Get-Date).AddDays(-14)} -ErrorAction Stop) }catch{ $bsod = @() }
    if($bsod.Count -gt 0){ Add-Finding "ระบบปฏิบัติการ" "Unexpected Shutdown / BSOD" "Red" "พบ $($bsod.Count) ครั้งใน 14 วัน — ควรตรวจ RAM/PSU/Driver" $null $null }
    else{ Add-Finding "ระบบปฏิบัติการ" "Unexpected Shutdown / BSOD" "Green" "ไม่พบใน 14 วันล่าสุด" $null $null }

    $ramUsedPctH = [math]::Round((($osInfo.TotalVisibleMemorySize-$osInfo.FreePhysicalMemory)/$osInfo.TotalVisibleMemorySize)*100)
    if($ramUsedPctH -ge 90){ Add-Finding "ฮาร์ดแวร์" "RAM Usage" "Red" "ใช้อยู่ $ramUsedPctH%" $null $null }
    elseif($ramUsedPctH -ge 75){ Add-Finding "ฮาร์ดแวร์" "RAM Usage" "Yellow" "ใช้อยู่ $ramUsedPctH%" $null $null }
    else{ Add-Finding "ฮาร์ดแวร์" "RAM Usage" "Green" "ใช้อยู่ $ramUsedPctH%" $null $null }

    try{
        $cpuLoad = (Get-CimInstance Win32_Processor -ErrorAction Stop | Measure-Object -Property LoadPercentage -Average).Average
        if($cpuLoad -ge 90){ Add-Finding "ฮาร์ดแวร์" "CPU Usage" "Red" "ใช้อยู่ $cpuLoad%" $null $null }
        elseif($cpuLoad -ge 75){ Add-Finding "ฮาร์ดแวร์" "CPU Usage" "Yellow" "ใช้อยู่ $cpuLoad%" $null $null }
        else{ Add-Finding "ฮาร์ดแวร์" "CPU Usage" "Green" "ใช้อยู่ $cpuLoad%" $null $null }
    }catch{ Add-Finding "ฮาร์ดแวร์" "CPU Usage" "Yellow" "ตรวจสอบไม่ได้" $null $null }

    $diskH = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'"
    $freePctH = [math]::Round($diskH.FreeSpace/$diskH.Size*100)
    $freeGBH = [math]::Round($diskH.FreeSpace/1GB,1)
    if($freePctH -lt 10){ Add-Finding "ฮาร์ดแวร์" "พื้นที่ดิสก์ $env:SystemDrive" "Red" "เหลือ $freeGBH GB ($freePctH%)" "disk_clean" "ล้างไฟล์ชั่วคราว" }
    elseif($freePctH -lt 20){ Add-Finding "ฮาร์ดแวร์" "พื้นที่ดิสก์ $env:SystemDrive" "Yellow" "เหลือ $freeGBH GB ($freePctH%)" "disk_clean" "ล้างไฟล์ชั่วคราว" }
    else{ Add-Finding "ฮาร์ดแวร์" "พื้นที่ดิสก์ $env:SystemDrive" "Green" "เหลือ $freeGBH GB ($freePctH%)" $null $null }

    try{
        $failing = Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictStatus -ErrorAction Stop | Where-Object { $_.PredictFailure }
        if($failing){ Add-Finding "ฮาร์ดแวร์" "SMART / Disk Health" "Red" "ตรวจพบสัญญาณดิสก์ใกล้เสีย ($(@($failing).Count) ตัว) — สำรองข้อมูลด่วน" $null $null }
        else{ Add-Finding "ฮาร์ดแวร์" "SMART / Disk Health" "Green" "ไม่พบสัญญาณผิดปกติ" $null $null }
    }catch{ Add-Finding "ฮาร์ดแวร์" "SMART / Disk Health" "Yellow" "เครื่องนี้ไม่รองรับการอ่านค่า SMART ผ่าน WMI" $null $null }

    try{
        $badDrv = Get-CimInstance Win32_PNPEntity -ErrorAction Stop | Where-Object { $_.ConfigManagerErrorCode -ne 0 }
        if($badDrv){ Add-Finding "ฮาร์ดแวร์" "Driver / Device Manager" "Red" ("มีปัญหา: " + (($badDrv | Select-Object -First 5 -ExpandProperty Name) -join ', ')) $null $null }
        else{ Add-Finding "ฮาร์ดแวร์" "Driver / Device Manager" "Green" "ไม่พบอุปกรณ์ที่มีปัญหา" $null $null }
    }catch{ Add-Finding "ฮาร์ดแวร์" "Driver / Device Manager" "Yellow" "ตรวจสอบไม่ได้" $null $null }

    try{
        $badUsb = Get-PnpDevice -Class USB -ErrorAction Stop | Where-Object { $_.Status -ne 'OK' }
        if($badUsb){ Add-Finding "ฮาร์ดแวร์" "USB Devices" "Yellow" ("มีปัญหา: " + (($badUsb | Select-Object -First 5 -ExpandProperty FriendlyName) -join ', ')) $null $null }
        else{ Add-Finding "ฮาร์ดแวร์" "USB Devices" "Green" "ปกติทุกตัว" $null $null }
    }catch{ Add-Finding "ฮาร์ดแวร์" "USB Devices" "Yellow" "ตรวจสอบไม่ได้" $null $null }

    try{
        $adapters = Get-NetAdapter -Physical -ErrorAction Stop
        $upA = $adapters | Where-Object { $_.Status -eq 'Up' }
        $downA = $adapters | Where-Object { $_.Status -ne 'Up' }
        if(-not $upA){ Add-Finding "เครือข่าย" "Network Adapter" "Red" "ไม่พบการ์ดเครือข่ายที่เชื่อมต่ออยู่" $null $null }
        elseif($downA){ Add-Finding "เครือข่าย" "Network Adapter" "Yellow" ("ไม่เชื่อมต่อ: " + (($downA.Name) -join ', ')) $null $null }
        else{ Add-Finding "เครือข่าย" "Network Adapter" "Green" ("เชื่อมต่ออยู่: " + (($upA.Name) -join ', ')) $null $null }
    }catch{ Add-Finding "เครือข่าย" "Network Adapter" "Yellow" "ตรวจสอบไม่ได้" $null $null }

    $gwip = $null
    try{
        $ipcfg = Get-NetIPConfiguration -ErrorAction Stop | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1
        if($ipcfg){
            $ipA = $ipcfg.IPv4Address.IPAddress; $gwip = $ipcfg.IPv4DefaultGateway.NextHop
            if($ipA -like '169.254.*'){ Add-Finding "เครือข่าย" "IP Configuration" "Red" "ได้ IP แบบ APIPA ($ipA) — DHCP อาจมีปัญหา" "net_reset" "Reset Network" }
            else{ Add-Finding "เครือข่าย" "IP Configuration" "Green" "IP: $ipA   Gateway: $gwip" $null $null }
        } else { Add-Finding "เครือข่าย" "IP Configuration" "Red" "ไม่พบ Default Gateway" $null $null }
    }catch{ Add-Finding "เครือข่าย" "IP Configuration" "Yellow" "ตรวจสอบไม่ได้" $null $null }

    try{
        $pingOk = Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet -ErrorAction Stop
        if($pingOk){ Add-Finding "เครือข่าย" "Internet" "Green" "เชื่อมต่ออินเทอร์เน็ตได้" $null $null }
        else{ Add-Finding "เครือข่าย" "Internet" "Red" "ping ออกอินเทอร์เน็ตไม่ได้" "net_reset" "Reset Network" }
    }catch{ Add-Finding "เครือข่าย" "Internet" "Red" "ping ออกอินเทอร์เน็ตไม่ได้" "net_reset" "Reset Network" }

    if($gwip){
        try{
            $pg = Test-Connection -ComputerName $gwip -Count 1 -Quiet -ErrorAction Stop
            if($pg){ Add-Finding "เครือข่าย" "Ping Gateway" "Green" "ตอบสนอง ($gwip)" $null $null }
            else{ Add-Finding "เครือข่าย" "Ping Gateway" "Red" "ไม่ตอบสนอง ($gwip)" $null $null }
        }catch{ Add-Finding "เครือข่าย" "Ping Gateway" "Yellow" "ตรวจสอบไม่ได้" $null $null }
    }

    try{
        Resolve-DnsName -Name "www.microsoft.com" -ErrorAction Stop | Out-Null
        Add-Finding "เครือข่าย" "DNS Resolution" "Green" "แปลงชื่อโดเมนได้ปกติ" $null $null
    }catch{ Add-Finding "เครือข่าย" "DNS Resolution" "Red" "แปลงชื่อโดเมนไม่ได้ — DNS อาจมีปัญหา" "dns_flush" "Flush DNS" }

    try{
        $spooler = Get-Service Spooler -ErrorAction Stop
        if($spooler.Status -ne 'Running'){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "Print Spooler" "Red" "บริการหยุดทำงาน" "spooler_restart" "รีสตาร์ท Spooler" }
        else{
            $stuck = @(Get-CimInstance Win32_PrintJob -ErrorAction SilentlyContinue)
            if($stuck.Count -gt 3){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "Print Queue" "Yellow" "มีงานพิมพ์ค้าง $($stuck.Count) รายการ" "spooler_clearqueue" "ล้างคิวพิมพ์" }
            else{ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "Print Spooler" "Green" "ทำงานปกติ" $null $null }
        }
    }catch{ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "Print Spooler" "Yellow" "ตรวจสอบไม่ได้" $null $null }

    foreach($svcName in @("EventLog","RpcSs","Dhcp","Dnscache","LanmanWorkstation","LanmanServer","BITS")){
        try{
            $svc = Get-Service -Name $svcName -ErrorAction Stop
            if($svc.StartType -eq 'Disabled'){ continue }
            if($svc.Status -ne 'Running'){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "Service: $svcName" "Red" "ไม่ทำงาน (Status: $($svc.Status))" "svc_start:$svcName" "Start $svcName" }
        }catch{}
    }

    $startupCountH = @(@(Get-RunEntries 'HKCU')+@(Get-RunEntries 'HKLM') | Where-Object { $_.Enabled }).Count
    if($startupCountH -gt 8){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "Startup Programs" "Yellow" "$startupCountH โปรแกรม — อาจทำให้บูตช้า" "open_startup" "จัดการ Startup" }
    else{ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "Startup Programs" "Green" "$startupCountH โปรแกรม" $null $null }

    # ---------- SCPclear Plus: เพิ่มจาก SCP-Remote ----------
    try{
        $upDays = [math]::Round(((Get-Date) - $osInfo.LastBootUpTime).TotalDays, 1)
        if($upDays -ge 14){ Add-Finding "ระบบปฏิบัติการ" "เปิดเครื่องต่อเนื่อง" "Red" "เปิดมาแล้ว $upDays วัน — ควรรีสตาร์ทเพื่อคืนหน่วยความจำและให้อัปเดตทำงานครบ" $null $null }
        elseif($upDays -ge 7){ Add-Finding "ระบบปฏิบัติการ" "เปิดเครื่องต่อเนื่อง" "Yellow" "เปิดมาแล้ว $upDays วัน — ควรรีสตาร์ทเมื่อสะดวก" $null $null }
        else{ Add-Finding "ระบบปฏิบัติการ" "เปิดเครื่องต่อเนื่อง" "Green" "เปิดมาแล้ว $upDays วัน" $null $null }
        $pendingRb = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')
        if($pendingRb){ Add-Finding "ระบบปฏิบัติการ" "อัปเดตรอรีสตาร์ท" "Yellow" "มีอัปเดตติดตั้งแล้วรอรีสตาร์ทเครื่อง" $null $null }
    }catch{}

    try{
        foreach($pr in @(Get-Printer -ErrorAction Stop | Select-Object -First 15)){
            $pst = [string]$pr.PrinterStatus
            if($pst -match 'Paused'){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "เครื่องพิมพ์: $($pr.Name)" "Yellow" "ถูกหยุดไว้ (Paused)" "printer_resume:$($pr.Name)" "ให้ทำงานต่อ" }
            elseif($pst -match 'Offline|NotAvailable'){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "เครื่องพิมพ์: $($pr.Name)" "Red" "ออฟไลน์ — ตรวจว่าเปิดเครื่องพิมพ์และสาย/เน็ตต่ออยู่" $null $null }
            elseif($pst -match 'Jam'){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "เครื่องพิมพ์: $($pr.Name)" "Red" "กระดาษติด — เปิดเครื่องพิมพ์แล้วดึงกระดาษออก" $null $null }
            elseif($pst -match 'PaperOut'){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "เครื่องพิมพ์: $($pr.Name)" "Red" "กระดาษหมด" $null $null }
            elseif($pst -match 'TonerLow|NoToner'){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "เครื่องพิมพ์: $($pr.Name)" "Yellow" "หมึกใกล้หมด — เตรียมตลับใหม่" $null $null }
            elseif($pst -match 'Error|DoorOpen'){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "เครื่องพิมพ์: $($pr.Name)" "Red" "สถานะ $pst" $null $null }
        }
        if(Get-Process SCPPrint -ErrorAction SilentlyContinue){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "SCPPrint" "Green" "ทำงานอยู่ (แชร์เครื่องพิมพ์ให้เครื่องอื่น) — ระวัง: ล้างคิวพิมพ์จะล้างงานของเครื่องอื่นด้วย" $null $null }
        elseif(Get-ChildItem 'C:\Users\*\AppData\Local\SCPPrint\config.json' -ErrorAction SilentlyContinue){ Add-Finding "บริการ/อุปกรณ์ต่อพ่วง" "SCPPrint" "Red" "ติดตั้งไว้แต่ไม่ได้เปิด — เครื่องอื่นปริ้นผ่านเครื่องนี้ไม่ได้" $null $null }
    }catch{}

    try{
        $sysPart = Get-Partition -DriveLetter ($env:SystemDrive.TrimEnd(':')) -ErrorAction Stop | Select-Object -First 1
        $sysPd = Get-PhysicalDisk | Where-Object { [string]$_.DeviceId -eq [string]$sysPart.DiskNumber } | Select-Object -First 1
        if([string]$sysPd.MediaType -eq 'SSD'){ Add-Finding "ฮาร์ดแวร์" "SSD TRIM" "Green" "ใช้ SSD — กด TRIM เพื่อให้เร็วเหมือนใหม่ (ปลอดภัย ไม่ลบไฟล์)" "trim" "TRIM ตอนนี้" }
        elseif([string]$sysPd.MediaType -eq 'HDD'){ Add-Finding "ฮาร์ดแวร์" "ชนิดดิสก์" "Yellow" "ใช้ฮาร์ดดิสก์จานหมุน — เปลี่ยนเป็น SSD (~1,500 บาท) เร็วขึ้นหลายเท่า" $null $null }
    }catch{}

    try{
        $plan = [string](powercfg /getactivescheme)
        if($plan -match 'saver|ประหยัด'){ Add-Finding "ระบบปฏิบัติการ" "โหมดพลังงาน" "Yellow" "โหมดประหยัดพลังงานทำให้ CPU ช้า" "power_balanced" "ตั้งเป็น Balanced" }
    }catch{}

    try{
        $fontNames = @((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts').PSObject.Properties | ForEach-Object { $_.Name })
        $thaiDir = Join-Path $ScriptDir 'ThaiFonts'
        $haveThai = @('Sarabun','Kanit','Prompt') | Where-Object { $n = $_; $fontNames | Where-Object { $_ -like "$n*" } }
        if(@($haveThai).Count -lt 3 -and (Test-Path $thaiDir)){ Add-Finding "ฟอนต์" "ฟอนต์ไทย" "Yellow" "ยังไม่มีฟอนต์ไทยครบ (Sarabun, Kanit, Prompt) — ติดตั้งจากโฟลเดอร์ ThaiFonts (ใช้ฟรีถูกลิขสิทธิ์ SIL OFL)" "install_thaifonts" "ติดตั้งฟอนต์ไทย" }
        else{ Add-Finding "ฟอนต์" "ฟอนต์ไทย" "Green" "มี Sarabun, Kanit, Prompt" $null $null }
        if(-not ($fontNames | Where-Object { $_ -match 'TH ?Sarabun' })){ Add-Finding "ฟอนต์" "TH Sarabun (หนังสือราชการ)" "Yellow" "ยังไม่มี — ถ้าต้องใช้ ให้วางไฟล์ TH Sarabun New ในโฟลเดอร์ ThaiFonts แล้วกดติดตั้ง" $null $null }
    }catch{}

    try{
        $topMem = (Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 | ForEach-Object { "$($_.ProcessName) $([int]($_.WorkingSet64/1MB)) MB" }) -join ', '
        Add-Finding "ฮาร์ดแวร์" "โปรแกรมที่ใช้แรมมากสุด" "Green" $topMem $null $null
    }catch{}

    Add-Finding "ระบบไฟล์" "System File Checker (SFC/DISM)" "Yellow" "ไม่ได้รันอัตโนมัติ (ใช้เวลานาน) — ไปที่ 'จัดการระบบ > ซ่อมไฟล์ระบบ' เพื่อรันเอง" $null $null

    return $report
}

function Invoke-HealthFix($fixKey){
    try{
        switch -Regex ($fixKey){
            '^wu_reset$' {
                Stop-Service wuauserv,bits,cryptsvc -Force -ErrorAction SilentlyContinue
                $stamp = Get-Date -Format yyyyMMddHHmmss
                Rename-Item "$env:SystemRoot\SoftwareDistribution" "SoftwareDistribution.bak_$stamp" -ErrorAction SilentlyContinue
                Rename-Item "$env:SystemRoot\System32\catroot2" "catroot2.bak_$stamp" -ErrorAction SilentlyContinue
                Start-Service wuauserv,bits,cryptsvc -ErrorAction SilentlyContinue
                return @{Success=$true; Message="รีเซ็ต Windows Update แล้ว"}
            }
            '^dns_flush$' {
                Clear-DnsClientCache -ErrorAction SilentlyContinue; ipconfig /flushdns | Out-Null
                return @{Success=$true; Message="Flush DNS แล้ว"}
            }
            '^net_reset$' {
                netsh winsock reset | Out-Null
                netsh int ip reset | Out-Null
                return @{Success=$true; Message="Reset Network (Winsock + IP stack) แล้ว — ต้องรีสตาร์ทเครื่องเพื่อให้มีผลสมบูรณ์"}
            }
            '^fw_enable$' {
                Set-NetFirewallProfile -All -Enabled True -ErrorAction Stop
                return @{Success=$true; Message="เปิด Firewall ทุกโปรไฟล์แล้ว"}
            }
            '^disk_clean$' {
                Remove-Item "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
                Remove-Item "$env:SystemRoot\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue
                Clear-RecycleBin -Force -ErrorAction SilentlyContinue
                return @{Success=$true; Message="ล้างไฟล์ชั่วคราว + Recycle Bin แล้ว"}
            }
            '^spooler_restart$' {
                Restart-Service Spooler -Force -ErrorAction Stop
                return @{Success=$true; Message="รีสตาร์ท Print Spooler แล้ว"}
            }
            '^spooler_clearqueue$' {
                Stop-Service Spooler -Force -ErrorAction Stop
                Remove-Item "$env:SystemRoot\System32\spool\PRINTERS\*" -Force -ErrorAction SilentlyContinue
                Start-Service Spooler -ErrorAction Stop
                return @{Success=$true; Message="ล้างคิวพิมพ์แล้ว"}
            }
            '^svc_start:(.+)$' {
                Start-Service -Name $Matches[1] -ErrorAction Stop
                return @{Success=$true; Message="Start service $($Matches[1]) แล้ว"}
            }
            '^printer_resume:(.+)$' {
                $p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $Matches[1] } | Select-Object -First 1
                if(-not $p){ return @{Success=$false; Message="ไม่พบเครื่องพิมพ์"} }
                $r = ($p | Invoke-CimMethod -MethodName Resume).ReturnValue
                return @{Success=($r -eq 0); Message=$(if($r -eq 0){"เครื่องพิมพ์ทำงานต่อแล้ว"}else{"สั่งไม่สำเร็จ (รหัส $r)"})}
            }
            '^trim$' {
                Optimize-Volume -DriveLetter ($env:SystemDrive.TrimEnd(':')) -ReTrim -ErrorAction Stop
                return @{Success=$true; Message="TRIM SSD เสร็จแล้ว"}
            }
            '^power_balanced$' {
                powercfg /setactive SCHEME_BALANCED | Out-Null
                return @{Success=$true; Message="ตั้งโหมดพลังงานเป็น Balanced แล้ว"}
            }
            '^install_thaifonts$' {
                $thaiDir = Join-Path $ScriptDir 'ThaiFonts'
                $fontNames = @((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts').PSObject.Properties | ForEach-Object { $_.Name })
                $shellFonts = (New-Object -ComObject Shell.Application).Namespace(0x14)
                $done = 0; $skip = 0
                foreach($ff in @(Get-ChildItem -Path $thaiDir -Include *.ttf,*.otf -Recurse -File)){
                    if(Test-Path (Join-Path "$env:SystemRoot\Fonts" $ff.Name)){ $skip++; continue }
                    $shellFonts.CopyHere($ff.FullName, 0x14); $done++
                }
                return @{Success=$true; Message="ติดตั้งฟอนต์ใหม่ $done ไฟล์ (มีอยู่แล้ว $skip) — ปิดเปิด Word/Excel ใหม่จึงจะเห็น"}
            }
            default { return @{Success=$false; Message="ไม่รู้จักคำสั่งแก้ไข"} }
        }
    }catch{ return @{Success=$false; Message=$_.Exception.Message} }
}

function Show-HistoryWindow {
    $entries = @(Get-HistoryEntries) | Sort-Object -Property Time -Descending
    $hw=New-Object System.Windows.Window
    $hw.Title="ประวัติการตรวจ/ซ่อม"; $hw.Width=470; $hw.Height=560; $hw.WindowStartupLocation="CenterScreen"; $hw.ResizeMode="NoResize"
    $hw.Background=(NewBrush $Theme.WindowBg); $hw.FontFamily=$FontFamilyValue; $hw.Owner=$window
    Set-ModernChrome $hw
    $root=New-Object System.Windows.Controls.Grid; $root.Margin="20"
    foreach($h in "Auto","*","Auto"){ $rd=New-Object System.Windows.Controls.RowDefinition; $rd.Height=$h; $root.RowDefinitions.Add($rd) }
    $hdr=New-Object System.Windows.Controls.TextBlock; $hdr.Text="ประวัติการตรวจ/ซ่อม"; $hdr.FontSize=18; $hdr.FontWeight="Bold"; $hdr.Foreground=(NewBrush $Theme.TitleFg); $hdr.Margin="0,0,0,10"
    [System.Windows.Controls.Grid]::SetRow($hdr,0); $root.Children.Add($hdr)|Out-Null
    $sv=New-Object System.Windows.Controls.ScrollViewer; $sv.VerticalScrollBarVisibility="Auto"
    $sp=New-Object System.Windows.Controls.StackPanel; $sv.Content=$sp
    [System.Windows.Controls.Grid]::SetRow($sv,1); $root.Children.Add($sv)|Out-Null
    if($entries.Count -eq 0){
        $e=New-Object System.Windows.Controls.TextBlock; $e.Text="ยังไม่มีประวัติการตรวจ/ซ่อม"; $e.Foreground=(NewBrush $Theme.MutedFg); $sp.Children.Add($e)|Out-Null
    }
    foreach($en in $entries){
        $c=New-Object System.Windows.Controls.Border; $c.Background=(NewBrush $Theme.CardBg); $c.CornerRadius="12"; $c.BorderBrush=(NewBrush $Theme.CardBorder); $c.BorderThickness="1"; $c.Padding="14,10"; $c.Margin="0,0,0,8"
        $isp=New-Object System.Windows.Controls.StackPanel
        $t1=New-Object System.Windows.Controls.TextBlock; $t1.Text="$($en.Time)   •   $($en.Computer)   •   $($en.User)"; $t1.FontSize=11; $t1.Foreground=(NewBrush $Theme.MutedFg)
        $t2=New-Object System.Windows.Controls.TextBlock; $t2.Text="ปัญหา: $($en.Problem)"; $t2.FontSize=12.5; $t2.FontWeight="SemiBold"; $t2.Foreground=(NewBrush $Theme.BodyFg); $t2.Margin="0,4,0,0"; $t2.TextWrapping="Wrap"
        $t3=New-Object System.Windows.Controls.TextBlock; $t3.Text="การแก้ไข: $($en.Action)"; $t3.FontSize=12; $t3.Foreground=(NewBrush $Theme.BodyFg); $t3.Margin="0,2,0,0"; $t3.TextWrapping="Wrap"
        $resColor = if($en.Result -like "*สำเร็จ*"){ "#22A06B" } else { "#E5484D" }
        $t4=New-Object System.Windows.Controls.TextBlock; $t4.Text="ผลลัพธ์: $($en.Result)"; $t4.FontSize=12; $t4.Foreground=(NewBrush $resColor); $t4.FontWeight="SemiBold"; $t4.Margin="0,2,0,0"; $t4.TextWrapping="Wrap"
        $isp.Children.Add($t1)|Out-Null; $isp.Children.Add($t2)|Out-Null; $isp.Children.Add($t3)|Out-Null; $isp.Children.Add($t4)|Out-Null
        $c.Child=$isp; $sp.Children.Add($c)|Out-Null
    }
    $bClose=New-Object System.Windows.Controls.Button; $bClose.Content="ปิด"; $bClose.Width=140; $bClose.Height=42; $bClose.Cursor="Hand"; $bClose.Background=(NewBrush $Theme.SecondaryBg); $bClose.Foreground=(NewBrush $Theme.BodyFg); $bClose.BorderThickness="0"; $bClose.Margin="0,12,0,0"; $bClose.HorizontalAlignment="Left"
    [System.Windows.Controls.Grid]::SetRow($bClose,2); $root.Children.Add($bClose)|Out-Null
    $bClose.Add_Click({ $hw.Close() }.GetNewClosure())
    $hw.Content=$root; $hw.ShowDialog() | Out-Null
}

$BtnHealth.Add_Click({
  $hcw=New-Object System.Windows.Window
  $hcw.Title="ตรวจสุขภาพเครื่อง (IT)"; $hcw.Width=480; $hcw.Height=680; $hcw.WindowStartupLocation="CenterScreen"; $hcw.ResizeMode="NoResize"
  $hcw.Background=(NewBrush $Theme.WindowBg); $hcw.FontFamily=$FontFamilyValue; $hcw.Owner=$window
  Set-ModernChrome $hcw
  $root=New-Object System.Windows.Controls.Grid; $root.Margin="20"
  foreach($h in "Auto","Auto","*","Auto"){ $rd=New-Object System.Windows.Controls.RowDefinition; $rd.Height=$h; $root.RowDefinitions.Add($rd) }
  $hdr=New-Object System.Windows.Controls.TextBlock; $hdr.Text="ตรวจสุขภาพเครื่อง (IT)"; $hdr.FontSize=18; $hdr.FontWeight="Bold"; $hdr.Foreground=(NewBrush $Theme.TitleFg)
  [System.Windows.Controls.Grid]::SetRow($hdr,0); $root.Children.Add($hdr)|Out-Null
  $statText=New-Object System.Windows.Controls.TextBlock; $statText.FontSize=13; $statText.Foreground=(NewBrush $Theme.MutedFg); $statText.Margin="0,4,0,10"
  [System.Windows.Controls.Grid]::SetRow($statText,1); $root.Children.Add($statText)|Out-Null
  $sv=New-Object System.Windows.Controls.ScrollViewer; $sv.VerticalScrollBarVisibility="Auto"
  $fsp=New-Object System.Windows.Controls.StackPanel; $sv.Content=$fsp
  [System.Windows.Controls.Grid]::SetRow($sv,2); $root.Children.Add($sv)|Out-Null
  $bp=New-Object System.Windows.Controls.WrapPanel; $bp.Margin="0,12,0,0"
  [System.Windows.Controls.Grid]::SetRow($bp,3); $root.Children.Add($bp)|Out-Null
  $bRescan=New-Object System.Windows.Controls.Button; $bRescan.Content="ตรวจใหม่"; $bRescan.Width=110; $bRescan.Height=42; $bRescan.Margin="0,0,8,8"; $bRescan.Cursor="Hand"; $bRescan.Background=(NewBrush "#EE6C2B"); $bRescan.Foreground=(NewBrush "#FFFFFF"); $bRescan.FontWeight="Bold"; $bRescan.BorderThickness="0"
  $bExport=New-Object System.Windows.Controls.Button; $bExport.Content="Export รายงาน"; $bExport.Width=130; $bExport.Height=42; $bExport.Margin="0,0,8,8"; $bExport.Cursor="Hand"; $bExport.Background=(NewBrush $Theme.SecondaryBg); $bExport.Foreground=(NewBrush $Theme.BodyFg); $bExport.BorderThickness="0"
  $bHistory=New-Object System.Windows.Controls.Button; $bHistory.Content="ประวัติการตรวจ/ซ่อม"; $bHistory.Width=170; $bHistory.Height=42; $bHistory.Margin="0,0,8,8"; $bHistory.Cursor="Hand"; $bHistory.Background=(NewBrush $Theme.SecondaryBg); $bHistory.Foreground=(NewBrush $Theme.BodyFg); $bHistory.BorderThickness="0"
  $bCloseH=New-Object System.Windows.Controls.Button; $bCloseH.Content="ปิด"; $bCloseH.Width=100; $bCloseH.Height=42; $bCloseH.Margin="0,0,0,8"; $bCloseH.Cursor="Hand"; $bCloseH.Background=(NewBrush $Theme.SecondaryBg); $bCloseH.Foreground=(NewBrush $Theme.BodyFg); $bCloseH.BorderThickness="0"
  $bp.Children.Add($bRescan)|Out-Null; $bp.Children.Add($bExport)|Out-Null; $bp.Children.Add($bHistory)|Out-Null; $bp.Children.Add($bCloseH)|Out-Null

  $statusColor = @{ Green="#22A06B"; Yellow="#F5A623"; Red="#E5484D" }
  $statusLabel = @{ Green="ปกติ"; Yellow="ควรตรวจสอบ"; Red="มีปัญหา" }
  $catIcon = @{ "ระบบปฏิบัติการ"="💻"; "ฮาร์ดแวร์"="🔧"; "เครือข่าย"="🌐"; "บริการ/อุปกรณ์ต่อพ่วง"="🔌"; "ระบบไฟล์"="🗂️" }

  $global:SCPclearRefreshHealth = {
    $fsp.Children.Clear()
    $hcw.Cursor = [System.Windows.Input.Cursors]::Wait
    $findings = Get-HealthReport
    $global:SCPclearFindings = $findings
    $hcw.Cursor = [System.Windows.Input.Cursors]::Arrow
    $g=(@($findings | Where-Object {$_.Status -eq 'Green'})).Count
    $y=(@($findings | Where-Object {$_.Status -eq 'Yellow'})).Count
    $r=(@($findings | Where-Object {$_.Status -eq 'Red'})).Count
    $statText.Text = "🟢 ปกติ $g   🟡 ควรตรวจสอบ $y   🔴 มีปัญหา $r"
    foreach($cat in ($findings | ForEach-Object { $_.Cat } | Select-Object -Unique)){
      $ic = if($catIcon.ContainsKey($cat)){ $catIcon[$cat] } else { "•" }
      $catHdr=New-Object System.Windows.Controls.TextBlock; $catHdr.Text="$ic $cat"; $catHdr.FontSize=11.5; $catHdr.FontWeight="Bold"; $catHdr.Foreground=(NewBrush $Theme.SectionFg); $catHdr.Margin="2,14,0,8"
      $fsp.Children.Add($catHdr)|Out-Null
      foreach($f in ($findings | Where-Object { $_.Cat -eq $cat })){
        $c=New-Object System.Windows.Controls.Border; $c.Background=(NewBrush $Theme.CardBg); $c.CornerRadius="12"; $c.BorderBrush=(NewBrush $Theme.CardBorder); $c.BorderThickness="1"; $c.Padding="14,10"; $c.Margin="0,0,0,8"
        $rowG=New-Object System.Windows.Controls.Grid
        $col0=New-Object System.Windows.Controls.ColumnDefinition; $col0.Width="Auto"
        $col1=New-Object System.Windows.Controls.ColumnDefinition; $col1.Width="*"
        $col2=New-Object System.Windows.Controls.ColumnDefinition; $col2.Width="Auto"
        $rowG.ColumnDefinitions.Add($col0); $rowG.ColumnDefinitions.Add($col1); $rowG.ColumnDefinitions.Add($col2)
        $dot=New-Object System.Windows.Controls.Border; $dot.Width=10; $dot.Height=10; $dot.CornerRadius="5"; $dot.Background=(NewBrush $statusColor[$f.Status]); $dot.VerticalAlignment="Top"; $dot.Margin="0,4,10,0"
        [System.Windows.Controls.Grid]::SetColumn($dot,0); $rowG.Children.Add($dot)|Out-Null
        $txtSp=New-Object System.Windows.Controls.StackPanel
        $t1=New-Object System.Windows.Controls.TextBlock; $t1.Text=$f.Title; $t1.FontSize=13; $t1.FontWeight="SemiBold"; $t1.Foreground=(NewBrush $Theme.BodyFg); $t1.TextWrapping="Wrap"
        $t2=New-Object System.Windows.Controls.TextBlock; $t2.Text=$f.Detail; $t2.FontSize=11.5; $t2.Foreground=(NewBrush $Theme.MutedFg); $t2.Margin="0,2,0,0"; $t2.TextWrapping="Wrap"
        $txtSp.Children.Add($t1)|Out-Null; $txtSp.Children.Add($t2)|Out-Null
        [System.Windows.Controls.Grid]::SetColumn($txtSp,1); $rowG.Children.Add($txtSp)|Out-Null
        if($f.FixKey){
          $bFix=New-Object System.Windows.Controls.Button; $bFix.Content=$f.FixLabel; $bFix.FontSize=11.5; $bFix.Padding="10,6"; $bFix.Cursor="Hand"; $bFix.VerticalAlignment="Top"
          $bFix.Background=(NewBrush "#FFF6F0"); $bFix.Foreground=(NewBrush "#EE6C2B"); $bFix.BorderBrush=(NewBrush "#F3C6A8"); $bFix.BorderThickness="1"
          [System.Windows.Controls.Grid]::SetColumn($bFix,2); $rowG.Children.Add($bFix)|Out-Null
          $bFix.Add_Click({
            if($f.FixKey -eq 'open_startup'){
              $hcw.Close()
              $BtnStartup.RaiseEvent((New-Object System.Windows.RoutedEventArgs([System.Windows.Controls.Button]::ClickEvent)))
              return
            }
            $r2=[System.Windows.MessageBox]::Show("พบปัญหา`n$($f.Title): $($f.Detail)`n`nต้องการแก้ไขด้วย: $($f.FixLabel) ?","ยืนยันการแก้ไข",[System.Windows.MessageBoxButton]::YesNo,[System.Windows.MessageBoxImage]::Question)
            if($r2 -ne [System.Windows.MessageBoxResult]::Yes){ return }
            $res = Invoke-HealthFix $f.FixKey
            $resultText = if($res.Success){ "สำเร็จ: $($res.Message)" } else { "ล้มเหลว: $($res.Message)" }
            Add-HistoryEntry "$($f.Title): $($f.Detail)" $f.FixLabel $resultText
            [System.Windows.MessageBox]::Show($resultText,"ผลการแก้ไข",[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Information) | Out-Null
            & $global:SCPclearRefreshHealth
          }.GetNewClosure())
        }
        $c.Child=$rowG; $fsp.Children.Add($c)|Out-Null
      }
    }
  }.GetNewClosure()

  $bRescan.Add_Click({ & $global:SCPclearRefreshHealth }.GetNewClosure())
  $bExport.Add_Click({
    try{
      $findingsToExport = $global:SCPclearFindings
      if(-not $findingsToExport -or $findingsToExport.Count -eq 0){
        [System.Windows.MessageBox]::Show("ยังไม่มีข้อมูลตรวจสอบ กรุณากด 'ตรวจใหม่' ก่อน","Export รายงาน",[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Warning) | Out-Null
        return
      }
      $path = Join-Path ([Environment]::GetFolderPath('Desktop')) "SCPclear-HealthReport-$env:COMPUTERNAME-$(Get-Date -Format yyyyMMdd_HHmmss).txt"
      $lines = New-Object System.Collections.Generic.List[string]
      $lines.Add("===== SCPclear - รายงานตรวจสุขภาพเครื่อง =====")
      $lines.Add("เครื่อง: $env:COMPUTERNAME")
      $lines.Add("ผู้ตรวจ: $env:USERNAME")
      $lines.Add("วันที่: $(Get-Date -Format 'dd/MM/yyyy HH:mm')")
      $lines.Add("")
      $ge=(@($findingsToExport | Where-Object {$_.Status -eq 'Green'})).Count
      $ye=(@($findingsToExport | Where-Object {$_.Status -eq 'Yellow'})).Count
      $re=(@($findingsToExport | Where-Object {$_.Status -eq 'Red'})).Count
      $lines.Add("สรุป: ปกติ $ge   ควรตรวจสอบ $ye   มีปัญหา $re")
      $lines.Add("")
      foreach($cat in ($findingsToExport | ForEach-Object { $_.Cat } | Select-Object -Unique)){
        $lines.Add("--- $cat ---")
        foreach($f in ($findingsToExport | Where-Object { $_.Cat -eq $cat })){
          $mark = switch($f.Status){ 'Green'{'[OK]'} 'Yellow'{'[!]'} 'Red'{'[X]'} default{'[?]'} }
          $lines.Add("$mark $($f.Title): $($f.Detail)")
        }
        $lines.Add("")
      }
      $lines | Set-Content -Path $path -Encoding UTF8
      [System.Windows.MessageBox]::Show("บันทึกรายงานที่:`n$path","Export สำเร็จ",[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Information) | Out-Null
    }catch{ [System.Windows.MessageBox]::Show("Export ไม่สำเร็จ: $($_.Exception.Message)","Export รายงาน",[System.Windows.MessageBoxButton]::OK,[System.Windows.MessageBoxImage]::Error) | Out-Null }
  }.GetNewClosure())
  $bHistory.Add_Click({ Show-HistoryWindow }.GetNewClosure())
  $bCloseH.Add_Click({ $hcw.Close() }.GetNewClosure())

  $hcw.Content=$root
  & $global:SCPclearRefreshHealth
  $hcw.ShowDialog() | Out-Null
})

$window.Add_Closing({ Save-Settings })
$window.ShowDialog() | Out-Null

}
catch {
    Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
    [System.Windows.MessageBox]::Show("เกิดข้อผิดพลาด:`n`n$($_.Exception.Message)","SCPclear - Error") | Out-Null
}
