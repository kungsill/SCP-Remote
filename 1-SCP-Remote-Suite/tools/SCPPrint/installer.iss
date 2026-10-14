; ============================================================
; Inno Setup script - SCPPrint installer
; ============================================================
; Steps:
;   1. Build the exe first (build.bat does this):
;        dist\SCPPrint.exe
;   2. Open this file in Inno Setup, press Compile (or use build.bat)
;   3. Output\SCPPrint_Setup.exe is your installer
; ============================================================

#define AppName "SCPPrint"
#define AppVersion "2.0"
#define AppExe "SCPPrint.exe"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=SCP
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
OutputBaseFilename={#AppName}_Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
SetupIconFile=hashcat.ico
MinVersion=10.0
UninstallDisplayIcon={app}\{#AppExe}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "hashcat-32px.png"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "hashcat.ico"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "firewallrule"; Description: "Add Firewall rule for ports 9100-9102 (recommended)"; GroupDescription: "Extra setup:"

[Run]
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""SCPPrint"" dir=in action=allow protocol=TCP localport=9100-9102"; Flags: runhidden; Tasks: firewallrule
Filename: "{app}\{#AppExe}"; Description: "Launch {#AppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""SCPPrint"""; Flags: runhidden; RunOnceId: "DelFirewallRule"

[UninstallDelete]
Type: files; Name: "{app}\config.json"
Type: files; Name: "{app}\printserver.log"
