cmake_minimum_required(VERSION 3.15)
project(AtlasRacingTelemetry)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(PkgConfig QUIET)

# Find JsonCpp
if(PkgConfig_FOUND)
    pkg_check_modules(JsonCpp jsoncpp)
endif()

if(NOT JsonCpp_FOUND)
    find_package(jsoncpp QUIET)
    if(jsoncpp_FOUND)
        set(JsonCpp_LIBRARIES jsoncpp_lib)
        set(JsonCpp_INCLUDE_DIRS "")
    else()
        # Fallback: look for system jsoncpp
        find_path(JsonCpp_INCLUDE_DIRS json/json.h PATHS /usr/include /usr/local/include)
        find_library(JsonCpp_LIBRARIES NAMES jsoncpp PATHS /usr/lib /usr/local/lib)
    endif()
endif()

if(NOT JsonCpp_INCLUDE_DIRS OR NOT JsonCpp_LIBRARIES)
    message(WARNING "JsonCpp not found - JSON API endpoints will not work")
    add_definitions(-DNO_JSON_SUPPORT)
else()
    message(STATUS "Found JsonCpp: ${JsonCpp_LIBRARIES}")
    include_directories(${JsonCpp_INCLUDE_DIRS})
    if(JsonCpp_LIBRARY_DIRS)
        link_directories(${JsonCpp_LIBRARY_DIRS})
    endif()
endif()

# Include directories
include_directories(include)
include_directories(src)

# Common source files
set(SOURCES
    src/core/udp_receiver.cpp
    src/core/packet_parser.cpp
    src/core/http_server.cpp
    src/core/data_processor.cpp
    src/core/accurate_lap_predictor.cpp
    src/core/pit_strategy_calculator.cpp
    src/core/websocket_server.cpp
    src/f1_24/f1_24_parser.cpp
)

# Windows-specific game parser sources (shared memory based)
if(WIN32)
    set(AC_SOURCES
        src/games/ac/ac_shared_memory.cpp
        src/games/ac/ac_parser.cpp
    )
    set(ACC_SOURCES
        src/games/acc/acc_shared_memory.cpp
        src/games/acc/acc_parser.cpp
    )
    set(ATS_SOURCES
        src/games/ats/ats_shared_memory.cpp
        src/games/ats/ats_parser.cpp
    )
    list(APPEND SOURCES ${AC_SOURCES} ${ACC_SOURCES} ${ATS_SOURCES})
    add_definitions(-DWINDOWS_AC_SUPPORT -DWINDOWS_ACC_SUPPORT -DWINDOWS_ATS_SUPPORT)
    add_definitions(-DUNICODE -D_UNICODE)  # Unicode support for wide chars
endif()

# Create library
add_library(atlas_racing_telemetry STATIC ${SOURCES})

# Link libraries

# Link JsonCpp if available
if(JsonCpp_LIBRARIES)
    target_link_libraries(atlas_racing_telemetry ${JsonCpp_LIBRARIES})
endif()

# Platform-specific linking
if(WIN32)
    # Windows-specific libraries for AC support and networking
    target_link_libraries(atlas_racing_telemetry 
        kernel32 
        user32 
        psapi      # For process enumeration
        ws2_32     # Windows sockets
    )
elseif(APPLE)
    # macOS specific settings
    target_compile_definitions(atlas_racing_telemetry PRIVATE __APPLE__)
    target_link_libraries(atlas_racing_telemetry "-framework Foundation")
elseif(UNIX)
    # Linux-specific settings (if needed in future)
    target_compile_definitions(atlas_racing_telemetry PRIVATE __LINUX__)
endif()

# Create main executables
add_executable(telemetry_server src/main.cpp)
target_link_libraries(telemetry_server atlas_racing_telemetry)

# Unified multi-game server
add_executable(atlas_racing_server src/main_unified.cpp)
target_link_libraries(atlas_racing_server atlas_racing_telemetry)

# Compiler-specific options
if(CMAKE_CXX_COMPILER_ID STREQUAL "Clang" OR CMAKE_CXX_COMPILER_ID STREQUAL "AppleClang")
    target_compile_options(atlas_racing_telemetry PRIVATE -Wall -Wextra -O2)
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    target_compile_options(atlas_racing_telemetry PRIVATE -Wall -Wextra -O2)
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    target_compile_options(atlas_racing_telemetry PRIVATE /W4 /O2)
endif()

# Installation
install(TARGETS atlas_racing_telemetry DESTINATION lib)
install(TARGETS telemetry_server atlas_racing_server DESTINATION bin)
install(DIRECTORY include/ DESTINATION include)