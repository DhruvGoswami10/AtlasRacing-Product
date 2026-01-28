@echo off
REM Atlas Racing Dashboard - Windows Build Script
REM This builds both the C++ backend and React frontend

echo 🏁  Atlas Racing Dashboard - Build Script
echo =========================================
echo.

REM Set MSYS2 environment
set MSYSTEM=MINGW64
set PATH=C:\msys64\mingw64\bin;C:\msys64\usr\bin;%PATH%
set TMPDIR=C:\temp
set TMP=C:\temp
set TEMP=C:\temp

REM Create temp directory if it doesn't exist
if not exist "C:\temp" mkdir "C:\temp"

REM Check if we're in the correct directory
if not exist "claude.md" (
    echo ERROR: Please run this script from the dashboard root directory
    echo ^(the directory containing claude.md^)
    pause
    exit /b 1
)

echo Step 1: Building C++ backend...
echo ===============================

REM Clean previous build
if exist "backend\build" rmdir /s /q "backend\build"
mkdir "backend\build"

REM Build backend
cd backend\build
echo Running CMake...
cmake .. -G "Unix Makefiles"
if errorlevel 1 (
    echo ERROR: CMake configuration failed
    cd ..\..
    pause
    exit /b 1
)

echo Building with make...
make
if errorlevel 1 (
    echo ERROR: Backend build failed
    echo.
    echo This might be due to permission issues. Try running as Administrator:
    echo   Right-click on Command Prompt and select "Run as administrator"
    echo   Then run this script again.
    cd ..\..
    pause
    exit /b 1
)

echo ✓ Backend build successful!
echo.
echo Built executables:
for %%f in (*.exe) do echo   - %%f
echo.

cd ..\..

echo Step 2: Building React frontend...
echo ==================================

cd frontend

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing npm dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: npm install failed
        cd ..
        pause
        exit /b 1
    )
)

REM Build production version
echo Building production version...
npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed
    cd ..
    pause
    exit /b 1
)

echo ✓ Frontend build successful!
cd ..

echo.
echo =========================================
echo ✓ Build completed successfully!
echo.
echo To run the dashboard:
echo   scripts\run.bat
echo.
echo Or run components separately:
echo   scripts\run.bat --backend-only
echo   scripts\run.bat --frontend-only
echo.
echo =========================================
pause