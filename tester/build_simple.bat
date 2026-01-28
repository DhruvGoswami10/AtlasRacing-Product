@echo off
REM Simple build script using MinGW directly
echo 🔧 Simple MinGW Build
echo ===================

REM Clean build directory
if exist "build" rmdir /s /q "build"
mkdir "build"
mkdir "build\bin"

echo Building packet_recorder...
g++ -std=c++17 -static-libgcc -static-libstdc++ -static ^
    -I recorder ^
    -o build\bin\packet_recorder.exe ^
    recorder\packet_recorder.cpp ^
    -lws2_32 -lwsock32 -lwinmm

if errorlevel 1 (
    echo ❌ Failed to build packet_recorder
    pause
    exit /b 1
)

echo Building packet_recorder_f125...
g++ -std=c++17 -static-libgcc -static-libstdc++ -static ^
    -I recorder ^
    -o build\bin\packet_recorder_f125.exe ^
    recorder\packet_recorder_f125.cpp ^
    -lws2_32 -lwsock32 -lwinmm

if errorlevel 1 (
    echo ❌ Failed to build packet_recorder_f125
    pause
    exit /b 1
)

echo Building packet_recorder_ac...
g++ -std=c++17 -static-libgcc -static-libstdc++ -static ^
    -I recorder ^
    -I shared ^
    -o build\bin\packet_recorder_ac.exe ^
    recorder\packet_recorder_ac.cpp ^
    -lws2_32 -lwsock32 -lwinmm

if errorlevel 1 (
    echo ❌ Failed to build packet_recorder_ac
    pause
    exit /b 1
)

echo Building packet_recorder_acc...
g++ -std=c++17 -static-libgcc -static-libstdc++ -static ^
    -I recorder ^
    -o build\bin\packet_recorder_acc.exe ^
    recorder\packet_recorder_acc.cpp ^
    -lws2_32 -lwsock32 -lwinmm

if errorlevel 1 (
    echo ❌ Failed to build packet_recorder_acc
    pause
    exit /b 1
)

echo Building packet_replayer...
g++ -std=c++17 -static-libgcc -static-libstdc++ -static ^
    -I recorder ^
    -o build\bin\packet_replayer.exe ^
    replayer\packet_replayer.cpp ^
    -lws2_32 -lwsock32 -lwinmm

if errorlevel 1 (
    echo ❌ Failed to build packet_replayer
    pause
    exit /b 1
)

echo Building packet_replayer_f125...
g++ -std=c++17 -static-libgcc -static-libstdc++ -static ^
    -I recorder ^
    -o build\bin\packet_replayer_f125.exe ^
    replayer\packet_replayer_f125.cpp ^
    -lws2_32 -lwsock32 -lwinmm

if errorlevel 1 (
    echo ❌ Failed to build packet_replayer_f125
    pause
    exit /b 1
)

echo Building packet_replayer_ac...
g++ -std=c++17 -static-libgcc -static-libstdc++ -static ^
    -I recorder ^
    -I shared ^
    -o build\bin\packet_replayer_ac.exe ^
    replayer\packet_replayer_ac.cpp ^
    -lws2_32 -lwsock32 -lwinmm

if errorlevel 1 (
    echo ❌ Failed to build packet_replayer_ac
    pause
    exit /b 1
)

echo Building packet_replayer_acc...
g++ -std=c++17 -static-libgcc -static-libstdc++ -static ^
    -I recorder ^
    -o build\bin\packet_replayer_acc.exe ^
    replayer\packet_replayer_acc.cpp ^
    -lws2_32 -lwsock32 -lwinmm

if errorlevel 1 (
    echo ❌ Failed to build packet_replayer_acc
    pause
    exit /b 1
)

echo.
echo ✅ Build completed successfully!
echo.
echo Executables created:
dir build\bin\*.exe
echo.
echo Test the executables:
echo   build\bin\packet_recorder.exe --help
echo   build\bin\packet_replayer.exe --help
echo.
pause