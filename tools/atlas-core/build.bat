@echo off
REM Atlas Core - Build Script
REM Requires: MSYS2 MinGW64 (g++ in PATH)

echo.
echo  Building Atlas Core...
echo.

cd /d "%~dp0"

REM Game type headers from the main backend
set AC_TYPES=..\..\dashboard\backend\src\games\ac
set ACC_TYPES=..\..\dashboard\backend\src\games\acc
set ATS_TYPES=..\..\dashboard\backend\src\games\ats

if not exist build mkdir build

windres resources\atlas_core.rc -O coff -o build\atlas_core_res.o
if %ERRORLEVEL% neq 0 (
    echo  Build FAILED (resource compile error)
    echo.
    pause
    exit /b 1
)

g++ -std=c++17 -O2 -DWIN32 -D_WIN32 ^
  -I%AC_TYPES% -I%ACC_TYPES% -I%ATS_TYPES% ^
  src\main.cpp build\atlas_core_res.o ^
  -o build\atlas-core.exe ^
  -lws2_32 -lshell32 -luser32 -lkernel32 -lpsapi ^
  -static-libgcc -static-libstdc++ -static ^
  -mconsole

if %ERRORLEVEL% == 0 (
    echo  Build successful: build\atlas-core.exe
    echo.
    echo  Usage: atlas-core.exe [--host IP] [--port PORT] [--hz RATE]
    echo  Default: 127.0.0.1:20777 @ 60Hz
) else (
    echo  Build FAILED
)

echo.
pause
