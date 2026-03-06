#pragma once

#ifdef _WIN32

#include "acc_types.h"
#include <windows.h>

namespace ACC {

class SharedMemoryReader {
private:
    HANDLE physics_handle;
    HANDLE graphics_handle;
    HANDLE static_handle;
    SPageFilePhysics* physics_data;
    SPageFileGraphic* graphics_data;
    SPageFileStatic* static_data;
    bool initialized;

public:
    SharedMemoryReader();
    ~SharedMemoryReader();

    bool initialize();
    void cleanup();
    bool isDataValid() const;
    bool isConnected() const;

    const SPageFilePhysics* getPhysics() const;
    const SPageFileGraphic* getGraphics() const;
    const SPageFileStatic* getStatic() const;

    bool isGameRunning() const;
    bool isSessionActive() const;
};

} // namespace ACC

#endif // _WIN32
