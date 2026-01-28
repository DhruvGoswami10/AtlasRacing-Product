cmake_minimum_required(VERSION 3.15)
project(AtlasRacingTestingSuite)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Static linking for Windows to avoid runtime library issues
if(WIN32)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -static-libgcc -static-libstdc++")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -static")
endif()

# Create bin directory for executables
file(MAKE_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

# Add subdirectories
add_subdirectory(recorder)
add_subdirectory(replayer)

# Print build information
message(STATUS "Building Atlas Racing Testing Suite")
message(STATUS "  - Packet Recorder: recorder/packet_recorder")  
message(STATUS "  - Packet Replayer: replayer/packet_replayer")
message(STATUS "  - Web Interface: web_interface/index.html")
message(STATUS "  - Output directory: ${CMAKE_BINARY_DIR}/bin")

# Custom target to show usage information
add_custom_target(usage
    COMMAND echo "Atlas Racing Testing Suite - Usage:"
    COMMAND echo ""
    COMMAND echo "1. Record a session:"
    COMMAND echo "   ./bin/packet_recorder -f my_session.f124 -n \"Monaco Practice\""
    COMMAND echo ""
    COMMAND echo "2. Replay a session:"
    COMMAND echo "   ./bin/packet_replayer -f my_session.f124 -s 1.0"
    COMMAND echo ""
    COMMAND echo "3. Open web interface:"
    COMMAND echo "   Open web_interface/index.html in your browser"
    COMMAND echo ""
    COMMAND echo "4. Start Atlas Racing dashboard:"
    COMMAND echo "   Use the main dashboard's run-windows.bat"
    COMMAND echo ""
)