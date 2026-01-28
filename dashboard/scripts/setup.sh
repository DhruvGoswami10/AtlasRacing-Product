#!/bin/bash

# F1 24 Dashboard Setup Script for macOS
# This script sets up the development environment for the F1 24 sim racing dashboard

set -e  # Exit on any error

echo "🏎️  F1 24 Dashboard Setup Script"
echo "================================"

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script is designed for macOS only"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Homebrew if not present
install_homebrew() {
    if ! command_exists brew; then
        echo "📦 Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Add Homebrew to PATH for Apple Silicon Macs
        if [[ $(uname -m) == "arm64" ]]; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
    else
        echo "✅ Homebrew already installed"
    fi
}

# Function to install Node.js and npm
install_nodejs() {
    if ! command_exists node; then
        echo "📦 Installing Node.js..."
        brew install node
    else
        echo "✅ Node.js already installed ($(node --version))"
    fi
}

# Function to install C++ dependencies
install_cpp_dependencies() {
    echo "📦 Installing C++ development dependencies..."
    
    # Install CMake
    if ! command_exists cmake; then
        brew install cmake
    else
        echo "✅ CMake already installed ($(cmake --version | head -n1))"
    fi
    
    # Install pkg-config (required by CMake)
    brew install pkg-config
    
    # Install SQLite3
    brew install sqlite3
    
    # Install nlohmann/json for JSON handling
    brew install nlohmann-json
    
    # Install spdlog for logging
    brew install spdlog
    
    # Install Boost for networking (optional, for WebSocket server)
    brew install boost
    
    echo "✅ C++ dependencies installed"
}

# Function to setup backend
setup_backend() {
    echo "🔧 Setting up C++ backend..."
    
    cd backend
    
    # Create build directory
    mkdir -p build
    cd build
    
    # Configure CMake
    echo "📦 Configuring CMake..."
    cmake .. -DCMAKE_BUILD_TYPE=Debug
    
    # Build the project
    echo "🔨 Building backend..."
    make -j$(sysctl -n hw.ncpu)
    
    cd ../..
    echo "✅ Backend setup complete"
}

# Function to setup frontend
setup_frontend() {
    echo "🔧 Setting up React frontend..."
    
    cd frontend
    
    # Install npm dependencies
    echo "📦 Installing npm packages..."
    npm install
    
    # Install additional Electron dependencies
    echo "📦 Installing Electron..."
    npm install --save-dev electron-is-dev
    
    cd ..
    echo "✅ Frontend setup complete"
}

# Function to create launch scripts
create_launch_scripts() {
    echo "🔧 Creating launch scripts..."
    
    # Make scripts executable
    chmod +x scripts/*.sh
    
    echo "✅ Launch scripts ready"
}

# Function to verify F1 24 setup
verify_f1_setup() {
    echo "🎮 F1 24 Setup Verification"
    echo "==========================="
    echo ""
    echo "Please ensure F1 24 is configured for telemetry:"
    echo "1. Open F1 24 Game Settings"
    echo "2. Go to Telemetry Settings"
    echo "3. Set UDP Telemetry to 'On'"
    echo "4. Set UDP Port to 20777"
    echo "5. Set UDP Format to 2024"
    echo "6. Set UDP Send Rate to 60Hz (recommended)"
    echo ""
    echo "The dashboard will automatically connect when F1 24 is running."
}

# Main setup process
main() {
    echo "Starting setup process..."
    echo ""
    
    # Install Homebrew
    install_homebrew
    
    # Install Node.js
    install_nodejs
    
    # Install C++ dependencies
    install_cpp_dependencies
    
    # Setup backend
    if [ -d "backend" ]; then
        setup_backend
    else
        echo "⚠️  Backend directory not found, skipping backend setup"
    fi
    
    # Setup frontend
    if [ -d "frontend" ]; then
        setup_frontend
    else
        echo "⚠️  Frontend directory not found, skipping frontend setup"
    fi
    
    # Create launch scripts
    create_launch_scripts
    
    # Verify F1 setup
    verify_f1_setup
    
    echo ""
    echo "🎉 Setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Configure F1 24 telemetry settings (see above)"
    echo "2. Run './scripts/run.sh' to start the dashboard"
    echo "3. Start F1 24 and begin racing!"
    echo ""
    echo "For troubleshooting, check the README.md file."
}

# Check if we're in the correct directory
if [ ! -f "claude.md" ]; then
    echo "❌ Please run this script from the dashboard root directory"
    echo "   (the directory containing claude.md)"
    exit 1
fi

# Run main setup
main