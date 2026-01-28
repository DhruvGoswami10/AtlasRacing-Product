# MSYS2 Setup Guide for Atlas Racing Dashboard

## The Problem
The current build is failing because the compiler is trying to write temporary files to `C:\WINDOWS\` which requires administrator permissions. This is a common issue when using MSYS2 in a restricted environment.

## Solution: Complete MSYS2 Setup

### Step 1: Run PowerShell as Administrator
1. Press `Win + X` and select "Windows PowerShell (Admin)" or "Windows Terminal (Admin)"
2. Or right-click on PowerShell and select "Run as Administrator"

### Step 2: Run the Build Script
```powershell
cd "C:\Users\ASUS\OneDrive\Documents\atlas racing\atlas racing\dashboard"
.\build_admin.ps1
```

### Step 3: Alternative - Manual MSYS2 Setup

If the PowerShell script doesn't work, follow these manual steps:

1. **Open MSYS2 MINGW64 Shell**:
   - Press `Win + R`, type `C:\msys64\mingw64.exe` and press Enter
   - OR search for "MSYS2 MINGW64" in Windows Start Menu

2. **Update MSYS2** (in the MINGW64 shell):
   ```bash
   pacman -Syu
   ```

3. **Install required tools**:
   ```bash
   pacman -S --noconfirm mingw-w64-x86_64-toolchain
   pacman -S --noconfirm mingw-w64-x86_64-cmake
   pacman -S --noconfirm mingw-w64-x86_64-ninja
   pacman -S --noconfirm mingw-w64-x86_64-sqlite3
   ```

4. **Build the project**:
   ```bash
   cd "/c/Users/ASUS/OneDrive/Documents/atlas racing/atlas racing/dashboard"
   rm -rf backend/build
   mkdir -p backend/build
   cd backend/build
   cmake .. -G "Ninja"
   ninja
   ```

### Step 4: Alternative Build Method (If Still Failing)

If you're still having permission issues, try building in a different location:

1. **Create a build directory in your home folder**:
   ```bash
   mkdir -p ~/atlas-racing-build
   cd ~/atlas-racing-build
   ```

2. **Copy the source files**:
   ```bash
   cp -r "/c/Users/ASUS/OneDrive/Documents/atlas racing/atlas racing/dashboard/backend/src" .
   cp -r "/c/Users/ASUS/OneDrive/Documents/atlas racing/atlas racing/dashboard/backend/include" .
   cp "/c/Users/ASUS/OneDrive/Documents/atlas racing/atlas racing/dashboard/backend/CMakeLists.txt" .
   ```

3. **Build**:
   ```bash
   mkdir build && cd build
   cmake .. -G "Ninja"
   ninja
   ```

4. **Copy executables back**:
   ```bash
   cp *.exe "/c/Users/ASUS/OneDrive/Documents/atlas racing/atlas racing/dashboard/backend/build/"
   ```

## What Should Work After Setup

Once built successfully, you should see these executables in `backend/build/`:
- `atlas_racing_server.exe` - Multi-game telemetry server
- `telemetry_server.exe` - F1 24 only server

## Running the Dashboard

After successful build:

1. **Start the backend** (in MSYS2 MINGW64 shell):
   ```bash
   cd "/c/Users/ASUS/OneDrive/Documents/atlas racing/atlas racing/dashboard/backend/build"
   ./atlas_racing_server.exe
   ```

2. **Start the frontend** (in a new terminal):
   ```bash
   cd "/c/Users/ASUS/OneDrive/Documents/atlas racing/atlas racing/dashboard/frontend"
   npm start
   ```

3. **Or use the run script**:
   ```bash
   cd "/c/Users/ASUS/OneDrive/Documents/atlas racing/atlas racing/dashboard"
   ./scripts/run.sh
   ```

## Environment Variables for MSYS2

Always use these environment settings in MSYS2:
```bash
export MSYSTEM=MINGW64
export PATH="/mingw64/bin:/usr/local/bin:/usr/bin:/bin"
export TMPDIR="/tmp"
export TMP="/tmp"
export TEMP="/tmp"
```

## Key Points
- **Always use MSYS2 MINGW64** (not regular MSYS2 or Git Bash)
- **Run as Administrator** if you encounter permission issues
- **Use Ninja** as the build system (faster than Make)
- **Keep projects in user directories** to avoid permission issues

## Troubleshooting
- If you get "Permission denied" errors, run PowerShell as Administrator
- If executables aren't found, check that `/mingw64/bin` is in your PATH
- If CMake fails, ensure you're using the MINGW64 environment, not MSYS2 or Git Bash