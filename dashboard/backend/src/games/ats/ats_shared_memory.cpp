#ifdef _WIN32

#include "ats_shared_memory.h"
#include <tlhelp32.h>
#include <iostream>

namespace ATS {

SharedMemoryReader::SharedMemoryReader()
    : telemetry_handle(nullptr)
    , telemetry_data(nullptr)
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

    std::cout << "[ATS] Attempting to open shared memory..." << std::endl;

    telemetry_handle = OpenFileMappingA(FILE_MAP_READ, FALSE, "Local\\SCSTelemetry");

    std::cout << "   Telemetry handle: " << (telemetry_handle ? "SUCCESS" : "FAILED") << std::endl;

    if (!telemetry_handle) {
        DWORD error = GetLastError();
        std::cerr << "[ATS] Failed to open shared memory (Error: " << error << ")" << std::endl;
        std::cerr << "   Make sure ATS is running with the SCS Telemetry SDK plugin installed." << std::endl;
        cleanup();
        return false;
    }

    std::cout << "[ATS] Mapping shared memory view..." << std::endl;

    telemetry_data = (SCSTelemetry*)MapViewOfFile(telemetry_handle, FILE_MAP_READ, 0, 0, sizeof(SCSTelemetry));

    std::cout << "   Telemetry data: " << (telemetry_data ? "MAPPED" : "FAILED") << std::endl;

    if (!telemetry_data) {
        DWORD error = GetLastError();
        std::cerr << "[ATS] Failed to map shared memory view (Error: " << error << ")" << std::endl;
        cleanup();
        return false;
    }

    initialized = true;
    std::cout << "[ATS] Shared Memory initialized successfully" << std::endl;
    return true;
}

void SharedMemoryReader::cleanup() {
    if (telemetry_data) {
        UnmapViewOfFile(telemetry_data);
        telemetry_data = nullptr;
    }
    if (telemetry_handle) {
        CloseHandle(telemetry_handle);
        telemetry_handle = nullptr;
    }
    initialized = false;
}

bool SharedMemoryReader::isDataValid() const {
    return initialized && telemetry_data && telemetry_data->sdkActive;
}

bool SharedMemoryReader::isConnected() const {
    return isDataValid() && isGameRunning();
}

const SCSTelemetry* SharedMemoryReader::getTelemetry() const {
    return telemetry_data;
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
            if (wcscmp(entry.szExeFile, L"amtrucks.exe") == 0) {
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
    return !telemetry_data->paused && telemetry_data->sdkActive;
}

} // namespace ATS

#endif // _WIN32
