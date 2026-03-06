#pragma once

#ifdef _WIN32

#include "ats_types.h"
#include <windows.h>

namespace ATS {

class SharedMemoryReader {
private:
    HANDLE telemetry_handle;
    SCSTelemetry* telemetry_data;
    bool initialized;

public:
    SharedMemoryReader();
    ~SharedMemoryReader();

    bool initialize();
    void cleanup();
    bool isDataValid() const;
    bool isConnected() const;

    const SCSTelemetry* getTelemetry() const;

    bool isGameRunning() const;
    bool isSessionActive() const;
};

} // namespace ATS

#endif // _WIN32
