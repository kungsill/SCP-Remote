@echo off
title Build SCPPrint
setlocal

cd /d "%~dp0"
echo Working folder: %CD%

set APPNAME=SCPPrint

echo.
echo [0/5] Checking required files...
if not exist "print_server_full.py" (
    echo   ERROR: print_server_full.py not found in this folder!
    echo   Files currently here:
    dir /b
    pause
    exit /b 1
)
echo   Found print_server_full.py

echo.
echo [1/5] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo   Python not found. Install from https://www.python.org/downloads/
    echo   IMPORTANT: check Add Python to PATH during install
    pause
    exit /b 1
)
python --version

echo.
echo [2/5] Installing required libraries...
python -m pip install --upgrade pip
python -m pip install pywin32 pystray pillow pyinstaller
if errorlevel 1 (
    echo.
    echo   Failed to install libraries.
    echo   If your Python is 3.14 or newer, install Python 3.12 instead.
    pause
    exit /b 1
)
echo   Done.

echo.
echo [3/5] Preparing icon...
set ICONFILE=
if exist "hashcat.ico" (
    set "ICONFILE=hashcat.ico"
    echo   Using existing hashcat.ico
    goto after_icon
)
if exist "hashcat-32px.png" (
    echo   Converting hashcat-32px.png to hashcat.ico ...
    python -c "from PIL import Image; Image.open('hashcat-32px.png').save('hashcat.ico', sizes=[(16,16),(32,32),(48,48),(256,256)])"
    if exist "hashcat.ico" (
        set "ICONFILE=hashcat.ico"
        echo   Created hashcat.ico
    ) else (
        echo   Could not create .ico - building without custom icon
    )
) else (
    echo   No icon file found - building without custom icon
)
:after_icon

echo.
echo [4/5] Building %APPNAME%.exe  please wait 1-3 minutes...
if not defined ICONFILE (
    python -m PyInstaller --onefile --windowed --noconfirm --name "%APPNAME%" print_server_full.py
    goto after_build
)
if exist "hashcat-32px.png" (
    python -m PyInstaller --onefile --windowed --noconfirm --name "%APPNAME%" --icon "%ICONFILE%" --add-data "hashcat-32px.png;." --add-data "%ICONFILE%;." print_server_full.py
) else (
    python -m PyInstaller --onefile --windowed --noconfirm --name "%APPNAME%" --icon "%ICONFILE%" --add-data "%ICONFILE%;." print_server_full.py
)
:after_build
if not exist "dist\%APPNAME%.exe" (
    echo   Build failed. See error messages above.
    pause
    exit /b 1
)
echo   Created: dist\%APPNAME%.exe

echo.
echo [5/5] Building installer  only if Inno Setup is installed...
set ISCC=
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"

if not defined ISCC (
    echo   Inno Setup not installed - skipped.
    echo   You can use dist\%APPNAME%.exe as a portable app.
    goto finish
)
if not exist "installer.iss" (
    echo   installer.iss not found - skipped.
    goto finish
)
"%ISCC%" installer.iss
echo   Installer created: Output\SCPPrint_Setup.exe

:finish
echo.
echo ============================================================
echo   FINISHED
echo   - Portable app : dist\%APPNAME%.exe
echo   - Installer    : Output\SCPPrint_Setup.exe  if built
echo ============================================================
echo.
pause
