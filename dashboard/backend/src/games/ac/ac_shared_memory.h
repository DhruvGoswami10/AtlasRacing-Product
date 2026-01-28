#pragma once

#include "ac_types.h"
#include <windows.h>
#include <memory>

namespace AC {

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

    // Helper methods
    bool isGameRunning() const;
    bool isSessionActive() const;
};

} // namespace AC