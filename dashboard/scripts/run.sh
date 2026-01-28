#!/bin/bash
# Atlas Racing Dashboard - Windows Run Script (Bash version)
# This works on Windows with Git Bash or MSYS2

echo "🏁  Atlas Racing Multi-Game Dashboard"
echo "===================================="
echo ""

# Set MSYS2 environment variables
export MSYSTEM=MINGW64
export PATH="/c/msys64/mingw64/bin:/c/msys64/usr/bin:$PATH"
export TMPDIR="/tmp"
export TMP="/tmp"
export TEMP="/tmp"

# Create temp directory
mkdir -p /tmp

# Function to show usage
show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --backend-only    Start only the backend server"
    echo "  --frontend-only   Start only the frontend"
    echo "  --no-electron     Start without Electron wrapper"
    echo "  --production      Run in production mode"
    echo "  --help            Show this help"
    echo ""
    echo "Supported Games:"
    echo "  • F1 24 (UDP telemetry)"
    echo "  • Assetto Corsa (shared memory)"
    echo ""
}

# Function to start backend
start_backend() {
    echo "Starting C++ telemetry server..."
    cd backend/build
    
    if [ -f "atlas_racing_server.exe" ]; then
        echo "Using unified multi-game server"
        ./atlas_racing_server.exe &
        BACKEND_PID=$!
    elif [ -f "telemetry_server.exe" ]; then
        echo "Using F1 24 only server"
        ./telemetry_server.exe &
        BACKEND_PID=$!
    else
        echo "ERROR: No backend executable found"
        echo "Run 'scripts/build.sh' first"
        exit 1
    fi
    
    cd ../..
    echo "Backend started (PID: $BACKEND_PID)"
}

# Function to start frontend
start_frontend() {
    echo "Starting React frontend..."
    cd frontend
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing npm dependencies..."
        npm install
    fi
    
    # Start development server
    if [ "$NO_ELECTRON" = "true" ]; then
        echo "Starting web version..."
        npm start
    else
        echo "Starting Electron app..."
        npm run electron-dev
    fi
    
    cd ..
}

# Function to build if needed
build_if_needed() {
    if [ ! -f "backend/build/atlas_racing_server.exe" ] && [ ! -f "backend/build/telemetry_server.exe" ]; then
        echo "Backend not built. Building now..."
        ./scripts/build.sh
        if [ $? -ne 0 ]; then
            echo "Build failed. Please check the errors above."
            exit 1
        fi
    fi
}

# Parse arguments
BACKEND_ONLY=false
FRONTEND_ONLY=false
NO_ELECTRON=false
PRODUCTION=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        --no-electron)
            NO_ELECTRON=true
            shift
            ;;
        --production)
            PRODUCTION=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Check if we're in the correct directory
if [ ! -f "claude.md" ]; then
    echo "ERROR: Please run this script from the dashboard root directory"
    echo "(the directory containing claude.md)"
    exit 1
fi

# Build if needed
build_if_needed

# Start based on options
if [ "$BACKEND_ONLY" = "true" ]; then
    start_backend
    echo "Backend running - press Ctrl+C to stop"
    wait $BACKEND_PID
elif [ "$FRONTEND_ONLY" = "true" ]; then
    start_frontend
else
    # Start full dashboard
    echo "Starting full dashboard..."
    start_backend
    sleep 2
    start_frontend
fi

echo ""
echo "🎮 Game Setup:"
echo "  F1 24: Set UDP telemetry to port 20777"
echo "  Assetto Corsa: No setup needed"
echo ""