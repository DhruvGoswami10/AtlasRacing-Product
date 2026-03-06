cmake_minimum_required(VERSION 3.15)
project(AtlasRacingRecorder)

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

# Packet Recorder executable
add_executable(packet_recorder
    packet_recorder.cpp
    f124_file_format.h
)

target_link_libraries(packet_recorder ${PLATFORM_LIBS})

# Compiler-specific options
if(MSVC)
    target_compile_options(packet_recorder PRIVATE /W4)
else()
    target_compile_options(packet_recorder PRIVATE -Wall -Wextra -pedantic)
endif()

# Set output directory
set_target_properties(packet_recorder PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

# F1 25 Packet Recorder executable
add_executable(packet_recorder_f125
    packet_recorder_f125.cpp
    f125_file_format.h
)

target_link_libraries(packet_recorder_f125 ${PLATFORM_LIBS})

if(MSVC)
    target_compile_options(packet_recorder_f125 PRIVATE /W4)
else()
    target_compile_options(packet_recorder_f125 PRIVATE -Wall -Wextra -pedantic)
endif()

set_target_properties(packet_recorder_f125 PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

# AC and ACC recorders require Windows shared memory
if(WIN32)
    add_executable(packet_recorder_ac
        packet_recorder_ac.cpp
        ../shared/ac_types.h
    )
    target_link_libraries(packet_recorder_ac ${PLATFORM_LIBS})
    target_include_directories(packet_recorder_ac PRIVATE ../shared)
    target_compile_options(packet_recorder_ac PRIVATE $<$<CXX_COMPILER_ID:MSVC>:/W4> $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -pedantic>)
    set_target_properties(packet_recorder_ac PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

    add_executable(packet_recorder_acc packet_recorder_acc.cpp)
    target_link_libraries(packet_recorder_acc ${PLATFORM_LIBS})
    target_compile_options(packet_recorder_acc PRIVATE $<$<CXX_COMPILER_ID:MSVC>:/W4> $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -pedantic>)
    set_target_properties(packet_recorder_acc PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
endif()
