@echo off
REM Atlas Racing Dashboard - Windows Run Script
REM This is the Windows equivalent of ./scripts/run.sh

echo 🏁  Atlas Racing Multi-Game Dashboard
echo ====================================
echo.

REM Set MSYS2 environment
set MSYSTEM=MINGW64
set PATH=C:\msys64\mingw64\bin;%PATH%
set TMPDIR=C:\temp
set TMP=C:\temp
set TEMP=C:\temp

REM Create temp directory if it doesn't exist
if not exist "C:\temp" mkdir "C:\temp"

REM Parse arguments
set BACKEND_ONLY=false
set FRONTEND_ONLY=false
set NO_ELECTRON=false
set PRODUCTION=false

:parse_args
if "%1"=="--backend-only" (
    set BACKEND_ONLY=true
    shift
    goto parse_args
)
if "%1"=="--frontend-only" (
    set FRONTEND_ONLY=true
    shift
    goto parse_args
)
if "%1"=="--no-electron" (
    set NO_ELECTRON=true
    shift
    goto parse_args
)
if "%1"=="--production" (
    set PRODUCTION=true
    shift
    goto parse_args
)
if "%1"=="--help" (
    echo Usage: run.bat [options]
    echo.
    echo Options:
    echo   --backend-only    Start only the backend server
    echo   --frontend-only   Start only the frontend
    echo   --no-electron     Start without Electron wrapper
    echo   --production      Run in production mode
    echo   --help            Show this help
    echo.
    echo Supported Games:
    echo   • F1 24 ^(UDP telemetry^)
    echo   • Assetto Corsa ^(shared memory^)
    echo.
    goto :eof
)
if "%1" neq "" (
    shift
    goto parse_args
)

REM Check if we're in the correct directory
if not exist "claude.md" (
    echo ERROR: Please run this script from the dashboard root directory
    echo ^(the directory containing claude.md^)
    pause
    exit /b 1
)

REM Build backend if needed
if not exist "backend\build\atlas_racing_server.exe" (
    if not exist "backend\build\telemetry_server.exe" (
        echo Building backend...
        call scripts\build.bat
        if errorlevel 1 (
            echo ERROR: Backend build failed
            pause
            exit /b 1
        )
    )
)

REM Start based on options
if "%BACKEND_ONLY%"=="true" (
    echo Starting backend only...
    call :start_backend
    goto :eof
)

if "%FRONTEND_ONLY%"=="true" (
    echo Starting frontend only...
    call :start_frontend
    goto :eof
)

REM Start full dashboard
echo Starting full dashboard...
start /B cmd /C call :start_backend
call :sleep_seconds 3
call :start_frontend
goto :eof

:start_backend
echo Starting C++ telemetry server...
cd backend\build
if exist "atlas_racing_server.exe" (
    echo Using unified multi-game server
    atlas_racing_server.exe
) else if exist "telemetry_server.exe" (
    echo Using F1 24 only server
    telemetry_server.exe
) else (
    echo ERROR: No backend executable found
    echo Run 'scripts\build.bat' first
    pause
    exit /b 1
)
cd ..\..
goto :eof

:start_frontend
echo Starting React frontend...
cd frontend

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing npm dependencies...
    npm install
)

REM Start development server
set "BROWSER=none"
set "DISABLE_ESLINT_PLUGIN=true"
set "NODE_NO_WARNINGS=1"

if "%NO_ELECTRON%"=="true" (
    echo Starting web version...
    npm start
) else (
    echo Starting Electron app...
    npm run electron-dev
)

cd ..
goto :eof

:sleep_seconds
set "_sleep=%~1"
if "%_sleep%"=="" goto :eof
set /a "_ping_count=%_sleep%+1"
ping 127.0.0.1 -n %_ping_count% >nul
goto :eof
