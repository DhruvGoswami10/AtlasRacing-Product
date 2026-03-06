#ifdef _WIN32

#include "acc_shared_memory.h"
#include <tlhelp32.h>
#include <iostream>

namespace ACC {

SharedMemoryReader::SharedMemoryReader()
    : physics_handle(nullptr)
    , graphics_handle(nullptr)
    , static_handle(nullptr)
    , physics_data(nullptr)
    , graphics_data(nullptr)
    , static_data(nullptr)
    , initialized(false)
{
}

SharedMemoryReader::~SharedMemoryReader() {
    cleanup();
}

bool SharedMemoryReader::initialize() {
    if (initialized) {
        return true;
    }

    std::cout << "[ACC] Attempting to open shared memory files..." << std::endl;

    physics_handle = OpenFileMappingA(FILE_MAP_READ, FALSE, "Local\\acpmf_physics");
    graphics_handle = OpenFileMappingA(FILE_MAP_READ, FALSE, "Local\\acpmf_graphics");
    static_handle = OpenFileMappingA(FILE_MAP_READ, FALSE, "Local\\acpmf_static");

    std::cout << "   Physics handle: " << (physics_handle ? "SUCCESS" : "FAILED") << std::endl;
    std::cout << "   Graphics handle: " << (graphics_handle ? "SUCCESS" : "FAILED") << std::endl;
    std::cout << "   Static handle: " << (static_handle ? "SUCCESS" : "FAILED") << std::endl;

    if (!physics_handle || !graphics_handle || !static_handle) {
        DWORD error = GetLastError();
        std::cerr << "[ACC] Failed to open shared memory files (Error: " << error << ")" << std::endl;
        std::cerr << "   Make sure ACC is running and in a live session." << std::endl;
        cleanup();
        return false;
    }

    std::cout << "[ACC] Mapping shared memory views..." << std::endl;

    physics_data = (SPageFilePhysics*)MapViewOfFile(physics_handle, FILE_MAP_READ, 0, 0, sizeof(SPageFilePhysics));
    graphics_data = (SPageFileGraphic*)MapViewOfFile(graphics_handle, FILE_MAP_READ, 0, 0, sizeof(SPageFileGraphic));
    static_data = (SPageFileStatic*)MapViewOfFile(static_handle, FILE_MAP_READ, 0, 0, sizeof(SPageFileStatic));

    std::cout << "   Physics data: " << (physics_data ? "MAPPED" : "FAILED") << std::endl;
    std::cout << "   Graphics data: " << (graphics_data ? "MAPPED" : "FAILED") << std::endl;
    std::cout << "   Static data: " << (static_data ? "MAPPED" : "FAILED") << std::endl;

    if (!physics_data || !graphics_data || !static_data) {
        DWORD error = GetLastError();
        std::cerr << "[ACC] Failed to map shared memory views (Error: " << error << ")" << std::endl;
        cleanup();
        return false;
    }

    initialized = true;
    std::cout << "[ACC] Shared Memory initialized successfully" << std::endl;
    return true;
}

void SharedMemoryReader::cleanup() {
    if (physics_data) {
        UnmapViewOfFile(physics_data);
        physics_data = nullptr;
    }
    if (graphics_data) {
        UnmapViewOfFile(graphics_data);
        graphics_data = nullptr;
    }
    if (static_data) {
        UnmapViewOfFile(static_data);
        static_data = nullptr;
    }
    if (physics_handle) {
        CloseHandle(physics_handle);
        physics_handle = nullptr;
    }
    if (graphics_handle) {
        CloseHandle(graphics_handle);
        graphics_handle = nullptr;
    }
    if (static_handle) {
        CloseHandle(static_handle);
        static_handle = nullptr;
    }
    initialized = false;
}

bool SharedMemoryReader::isDataValid() const {
    return initialized && physics_data && graphics_data && static_data;
}

bool SharedMemoryReader::isConnected() const {
    return isDataValid() && isGameRunning();
}

const SPageFilePhysics* SharedMemoryReader::getPhysics() const {
    return physics_data;
}

const SPageFileGraphic* SharedMemoryReader::getGraphics() const {
    return graphics_data;
}

const SPageFileStatic* SharedMemoryReader::getStatic() const {
    return static_data;
}

bool SharedMemoryReader::isGameRunning() const {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) {
        return false;
    }

    PROCESSENTRY32 entry;
    entry.dwSize = sizeof(PROCESSENTRY32);

    bool found = false;
    if (Process32First(snapshot, &entry)) {
        do {
            if (wcscmp(entry.szExeFile, L"ACC.exe") == 0) {
                found = true;
                break;
            }
        } while (Process32Next(snapshot, &entry));
    }

    CloseHandle(snapshot);
    return found;
}

bool SharedMemoryReader::isSessionActive() const {
    if (!isDataValid()) {
        return false;
    }
    return graphics_data->status == 2; // Live session
}

} // namespace ACC

#endif // _WIN32
