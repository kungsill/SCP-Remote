@echo off
REM SCP-Remote network check. Read-only, no administrator rights needed.
REM Kept ASCII-only so it runs on any Windows code page.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0Check-Network.ps1"
if not "%errorlevel%"=="0" pause
endlocal
