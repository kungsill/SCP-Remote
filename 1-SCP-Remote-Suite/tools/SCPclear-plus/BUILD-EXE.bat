@echo off
cd /d "%~dp0"
set "PS1=%~dp0SCPclear.ps1"
if not exist "%PS1%" ( for %%F in ("%~dp0*.ps1") do set "PS1=%%F" )
if not exist "%PS1%" (
  echo ERROR: No .ps1 file found in this folder! Put SCPclear.ps1 here first.
  pause
  exit /b
)
set "ICO=%~dp0SCPclear.ico"
set "ICOARG="
if exist "%ICO%" set "ICOARG=-iconFile '%ICO%'"
echo ============================================================
echo   Building SCPclear.exe  (portable, no install needed)
echo   Using script: "%PS1%"
echo   Runs ONCE to create the .exe. Needs internet.
echo ============================================================
echo.
if not exist "%~dp0Fonts\Sarabun-Regular.ttf" (
  echo WARNING: Fonts\Sarabun-Regular.ttf not found next to this script.
  echo          The app will still work but will fall back to Segoe UI.
  echo.
)
powershell -NoProfile -Sta -ExecutionPolicy Bypass -Command ^
  "try { if (-not (Get-Command Invoke-ps2exe -ErrorAction SilentlyContinue)) { Write-Host 'Installing ps2exe...'; Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue; Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber }; Import-Module ps2exe; Write-Host 'Compiling...'; Invoke-ps2exe -inputFile '%PS1%' -outputFile '%~dp0SCPclear.exe' %ICOARG% -requireAdmin -noConsole -STA -title 'SCPclear' -product 'SCPclear' -company 'SCPclear' -version '1.5.0.0'; Write-Host ''; Write-Host 'SUCCESS: SCPclear.exe created!' } catch { Write-Host ('ERROR: ' + $_.Exception.Message) }"
echo.
echo ============================================================
echo  Done. If successful, SCPclear.exe is in this folder.
echo  Double-click SCPclear.exe to run (no install needed).
echo.
echo  IMPORTANT: when copying/sharing SCPclear.exe, also copy the
echo  "Fonts" folder (Sarabun UI font) and the "ThaiFonts" folder
echo  (fonts the "install Thai fonts" fix copies into Windows).
echo ============================================================
pause
