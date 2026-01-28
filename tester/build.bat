@echo off
REM Atlas Racing Testing Suite - Windows Build Script

echo 🧪 Atlas Racing Testing Suite - Build Script
echo =============================================
echo.

REM Set MSYS2 environment
set MSYSTEM=MINGW64
set PATH=C:\msys64\mingw64\bin;C:\msys64\usr\bin;%PATH%

REM Check if we're in the correct directory
if not exist "CMakeLists.txt" (
    echo ERROR: Please run this script from the tester directory
    pause
    exit /b 1
)

echo Step 1: Cleaning previous build...
echo ==================================
if exist "build" rmdir /s /q "build"
mkdir "build"

echo Step 2: Configuring with CMake...
echo =================================
cd build
cmake .. -G "Unix Makefiles"
if errorlevel 1 (
    echo ERROR: CMake configuration failed
    cd ..
    pause
    exit /b 1
)

echo Step 3: Building executables...
echo ===============================
make
if errorlevel 1 (
    echo ERROR: Build failed
    cd ..
    pause
    exit /b 1
)

echo.
echo ✓ Build completed successfully!
echo.
echo Built executables:
for %%f in (bin\*.exe) do echo   - %%f
echo.

cd ..

echo =============================================
echo ✓ Atlas Racing Testing Suite built!
echo.
echo Quick Start:
echo   1. Record session: build\bin\packet_recorder.exe -f my_session.f124
echo   2. Replay session:  build\bin\packet_replayer.exe -f my_session.f124
echo   3. Web interface:   Open web_interface\index.html
echo.
echo =============================================
pause