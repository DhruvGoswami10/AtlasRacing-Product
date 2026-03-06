@echo off
REM Atlas Racing Dashboard - MSYS2 Setup Script
REM This script sets up the proper MSYS2 environment for building the C++ backend

echo ========================================
echo Atlas Racing Dashboard - MSYS2 Setup
echo ========================================
echo.

echo Step 1: Updating MSYS2 packages...
C:\msys64\usr\bin\bash.exe -lc "pacman -Syu --noconfirm"

echo.
echo Step 2: Installing required development tools...
C:\msys64\usr\bin\bash.exe -lc "pacman -S --noconfirm mingw-w64-x86_64-toolchain mingw-w64-x86_64-cmake mingw-w64-x86_64-ninja mingw-w64-x86_64-sqlite3 mingw-w64-x86_64-pkg-config"

echo.
echo Step 3: Testing the build environment...
C:\msys64\usr\bin\bash.exe -lc "export MSYSTEM=MINGW64 && cd '/c/Users/ASUS/OneDrive/Documents/atlas racing/dashboard' && echo 'Current directory:' && pwd && echo 'Testing tools:' && which gcc && which g++ && which cmake && which ninja"

echo.
echo Step 4: Building the Atlas Racing backend...
C:\msys64\usr\bin\bash.exe -lc "export MSYSTEM=MINGW64 && cd '/c/Users/ASUS/OneDrive/Documents/atlas racing/dashboard' && rm -rf backend/build && mkdir -p backend/build && cd backend/build && cmake .. -G Ninja && ninja"

echo.
echo ========================================
echo Setup completed! 
echo.
echo To continue development, always use:
echo   C:\msys64\mingw64.exe
echo.
echo Or from Windows Start Menu:
echo   Search for "MSYS2 MINGW64"
echo ========================================
pause