#!/bin/bash

# Atlas Racing Multi-Game Dashboard Build Script
# Builds both the C++ backend and React frontend

set -e  # Exit on any error

echo "🔨 Atlas Racing Multi-Game Dashboard Build Script"
echo "=================================================="

# Set up Windows MSYS2 environment if needed
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ -d "/c/msys64" ]]; then
    echo "Setting up Windows MSYS2 environment..."
    export MSYSTEM=MINGW64
    export PATH="/c/msys64/mingw64/bin:/c/msys64/usr/bin:$PATH"
    export TMPDIR="/tmp"
    export TMP="/tmp"
    export TEMP="/tmp"
    mkdir -p /tmp
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to build C++ backend
build_backend() {
    print_status "Building C++ telemetry backend..."
    
    if [ ! -d "backend" ]; then
        print_warning "Backend directory not found, skipping backend build"
        return 0
    fi
    
    cd backend
    
    # Create build directory if it doesn't exist
    mkdir -p build
    cd build
    
    # Check if CMake has been run
    if [ ! -f "Makefile" ]; then
        print_status "Running CMake configuration..."
        cmake .. -DCMAKE_BUILD_TYPE=Release
    fi
    
    # Build the project
    print_status "Compiling C++ code..."
    # Use different CPU count detection for Windows/Linux vs macOS
    if command -v nproc &> /dev/null; then
        make -j$(nproc)
    else
        make -j4
    fi
    
    if [ $? -eq 0 ]; then
        print_success "Backend build completed successfully"
    else
        print_error "Backend build failed"
        exit 1
    fi
    
    cd ../..
}

# Function to build React frontend
build_frontend() {
    print_status "Building React frontend..."
    
    if [ ! -d "frontend" ]; then
        print_warning "Frontend directory not found, skipping frontend build"
        return 0
    fi
    
    cd frontend
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_status "Installing npm dependencies..."
        npm install
    fi
    
    # Build the React app
    print_status "Building React application..."
    npm run build
    
    if [ $? -eq 0 ]; then
        print_success "Frontend build completed successfully"
    else
        print_error "Frontend build failed"
        exit 1
    fi
    
    cd ..
}

# Function to package Electron app (optional)
package_electron() {
    if [ "$1" = "--package" ]; then
        print_status "Packaging Electron application..."
        
        cd frontend
        npm run electron-pack
        
        if [ $? -eq 0 ]; then
            print_success "Electron app packaged successfully"
            print_status "Package location: frontend/dist/"
        else
            print_error "Electron packaging failed"
        fi
        
        cd ..
    fi
}

# Function to run tests (optional)
run_tests() {
    if [ "$1" = "--test" ]; then
        print_status "Running tests..."
        
        # Backend tests (if available)
        if [ -d "backend/build" ] && [ -f "backend/build/tests" ]; then
            print_status "Running backend tests..."
            cd backend/build
            ./tests
            cd ../..
        fi
        
        # Frontend tests
        if [ -d "frontend" ]; then
            print_status "Running frontend tests..."
            cd frontend
            npm test -- --coverage --watchAll=false
            cd ..
        fi
        
        print_success "Tests completed"
    fi
}

# Function to show build information
show_build_info() {
    print_success "Build Summary"
    echo "============="
    
    # Backend info
    if [ -f "backend/build/atlas_racing_server" ]; then
        echo "✅ Backend: atlas_racing_server executable ready (multi-game support)"
        echo "   Location: backend/build/atlas_racing_server"
    elif [ -f "backend/build/telemetry_server" ]; then
        echo "✅ Backend: telemetry_server executable ready (F1 24 only)"
        echo "   Location: backend/build/telemetry_server"
    else
        echo "❌ Backend: Build not found"
    fi
    
    # Frontend info
    if [ -d "frontend/build" ]; then
        echo "✅ Frontend: React app built"
        echo "   Location: frontend/build/"
    else
        echo "❌ Frontend: Build not found"
    fi
    
    # Electron info
    if [ -d "frontend/dist" ]; then
        echo "✅ Electron: Native app packaged"
        echo "   Location: frontend/dist/"
    fi
    
    echo ""
    echo "Next steps:"
    echo "1. Run './scripts/run.sh' to start the dashboard"
    echo "2. Launch F1 24 or Assetto Corsa"
    echo "3. Configure game telemetry settings (F1 24 only)"
    echo "4. Start racing!"
}

# Main build process
main() {
    local start_time=$(date +%s)
    
    print_status "Starting build process..."
    
    # Parse command line arguments
    local package_flag=""
    local test_flag=""
    
    for arg in "$@"; do
        case $arg in
            --package)
                package_flag="--package"
                ;;
            --test)
                test_flag="--test"
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --package    Package Electron app after building"
                echo "  --test       Run tests after building"
                echo "  --help       Show this help message"
                echo ""
                exit 0
                ;;
        esac
    done
    
    # Build backend
    build_backend
    
    # Build frontend
    build_frontend
    
    # Package Electron app if requested
    package_electron "$package_flag"
    
    # Run tests if requested
    run_tests "$test_flag"
    
    # Calculate build time
    local end_time=$(date +%s)
    local build_time=$((end_time - start_time))
    
    echo ""
    print_success "Build completed in ${build_time} seconds"
    echo ""
    
    # Show build information
    show_build_info
}

# Check if we're in the correct directory
if [ ! -f "claude.md" ]; then
    print_error "Please run this script from the dashboard root directory"
    print_error "(the directory containing claude.md)"
    exit 1
fi

# Run main build process
main "$@"