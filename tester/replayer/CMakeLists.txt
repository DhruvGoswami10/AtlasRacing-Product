cmake_minimum_required(VERSION 3.15)
project(AtlasRacingReplayer)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Static linking for Windows to avoid runtime library issues
if(WIN32)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -static-libgcc -static-libstdc++")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -static")
endif()

# Platform-specific libraries
if(WIN32)
    set(PLATFORM_LIBS ws2_32 wsock32 winmm)
else()
    set(PLATFORM_LIBS "")
endif()

# Packet Replayer executable
add_executable(packet_replayer
    packet_replayer.cpp
    ../recorder/f124_file_format.h
)

target_link_libraries(packet_replayer ${PLATFORM_LIBS})

# Include the recorder directory for the header
target_include_directories(packet_replayer PRIVATE ../recorder)

# Compiler-specific options
if(MSVC)
    target_compile_options(packet_replayer PRIVATE /W4)
else()
    target_compile_options(packet_replayer PRIVATE -Wall -Wextra -pedantic)
endif()

# Set output directory
set_target_properties(packet_replayer PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

# F1 25 Packet Replayer executable
add_executable(packet_replayer_f125
    packet_replayer_f125.cpp
    ../recorder/f125_file_format.h
)

target_link_libraries(packet_replayer_f125 ${PLATFORM_LIBS})
target_include_directories(packet_replayer_f125 PRIVATE ../recorder)

if(MSVC)
    target_compile_options(packet_replayer_f125 PRIVATE /W4)
else()
    target_compile_options(packet_replayer_f125 PRIVATE -Wall -Wextra -pedantic)
endif()

set_target_properties(packet_replayer_f125 PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

# AC and ACC replayers require Windows shared memory
if(WIN32)
    add_executable(packet_replayer_ac
        packet_replayer_ac.cpp
        ../shared/ac_types.h
    )
    target_link_libraries(packet_replayer_ac ${PLATFORM_LIBS})
    target_include_directories(packet_replayer_ac PRIVATE ../recorder ../shared)
    target_compile_options(packet_replayer_ac PRIVATE $<$<CXX_COMPILER_ID:MSVC>:/W4> $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -pedantic>)
    set_target_properties(packet_replayer_ac PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

    add_executable(packet_replayer_acc packet_replayer_acc.cpp)
    target_link_libraries(packet_replayer_acc ${PLATFORM_LIBS})
    target_compile_options(packet_replayer_acc PRIVATE $<$<CXX_COMPILER_ID:MSVC>:/W4> $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -pedantic>)
    set_target_properties(packet_replayer_acc PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
endif()
