@echo off
REM SCP-Remote client setup launcher.
REM Kept ASCII-only so it runs on any Windows code page. It asks for administrator
REM rights, then opens the PowerShell setup window next to this file.
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0Install-ScpRemoteAgent.ps1"
if not "%errorlevel%"=="0" pause
endlocal
