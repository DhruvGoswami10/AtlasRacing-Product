@echo off
REM Atlas Racing Dashboard - Electron Desktop App Launcher
REM Double-click this file or run: run-windows.bat

echo Atlas Racing Dashboard (Electron) - F1 25
echo ==========================================
echo.

REM Set environment
set MSYSTEM=MINGW64
set PATH=C:\msys64\mingw64\bin;%PATH%
set TMPDIR=C:\temp
set TMP=C:\temp
set TEMP=C:\temp

REM Create temp directory
if not exist "C:\temp" mkdir "C:\temp"

REM Go to project directory
cd /d "%~dp0"
set "PROJECT_DIR=%CD%"

echo Starting Atlas Racing Dashboard...
echo.

REM Check if backend is built
if not exist "backend\build\atlas_racing_server.exe" (
    if not exist "backend\build\telemetry_server.exe" (
        echo Backend not built. Building now...
        call scripts\build.bat
        if errorlevel 1 (
            echo Build failed. Please check the errors above.
            pause
            exit /b 1
        )
    )
)

echo Starting backend server...
start "Atlas Racing Backend" /D "%PROJECT_DIR%\backend\build" cmd /K "chcp 65001>nul && (if exist atlas_racing_server.exe (atlas_racing_server.exe) else (telemetry_server.exe))"

echo Waiting for backend to start...
call :sleep_seconds 2

echo Cleaning up any existing React dev server...
REM Kill any existing node processes running on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing existing process on port 3000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

echo Starting React frontend...
REM Clear webpack cache to ensure fresh build
echo Clearing webpack cache...
if exist "%PROJECT_DIR%\frontend\node_modules\.cache" (
    rd /s /q "%PROJECT_DIR%\frontend\node_modules\.cache" 2>nul
)

REM Start React dev server and open browser
start "Atlas Racing Frontend" /D "%PROJECT_DIR%\frontend" cmd /K "chcp 65001>nul && set \"BROWSER=none\" && set \"DISABLE_ESLINT_PLUGIN=true\" && set \"NODE_NO_WARNINGS=1\" && npm start"

REM Wait for React to start, then open browser
call :sleep_seconds 5
start http://localhost:3000

echo.
echo Dashboard is starting in browser!
echo.
echo Services Running:
echo   Backend: Running in separate window (port 8080)
echo   Frontend: http://localhost:3000 (opening in browser)
echo.
echo Game Setup:
echo   F1 24/25: Set UDP telemetry to port 20777
echo.
echo Close all service windows to stop the dashboard.
pause

goto :eof

:sleep_seconds
set "_sleep=%~1"
if "%_sleep%"=="" goto :eof
set /a "_ping_count=%_sleep%+1"
ping 127.0.0.1 -n %_ping_count% >nul
goto :eof
