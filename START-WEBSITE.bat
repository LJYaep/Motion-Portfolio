@echo off
setlocal
cd /d "%~dp0"
py -3 --version >nul 2>&1
if not errorlevel 1 (
    py -3 "%~dp0start-website.py"
    goto end
)
python --version >nul 2>&1
if not errorlevel 1 (
    python "%~dp0start-website.py"
    goto end
)
python3 --version >nul 2>&1
if not errorlevel 1 (
    python3 "%~dp0start-website.py"
    goto end
)
echo Python 3 was not found. Install Python 3, then run this file again.
echo You can also preview the folder through your editor's local web server.
:end
pause
