@echo off
echo Atlas Racing Testing Suite - Web Interface (F1 25)
echo ===================================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Python not found! Please install Python 3.6+ to use the web interface.
    echo.
    echo Alternative: Use the command line tools directly:
    echo   Record: build\bin\packet_recorder_f125.exe -f session.f125 -n "My Session"
    echo   Replay: build\bin\packet_replayer_f125.exe -f session.f125 -s 1.0
    echo.
    pause
    exit /b 1
)

echo ✅ Python found. Starting web server...
echo.

cd web_interface
python server.py

pause