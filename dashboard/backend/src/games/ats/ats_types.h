#pragma once

#ifdef _WIN32
#include <windows.h>

#pragma pack(push, 1)

namespace ATS {

#define SCS_STRING_SIZE 64

// SCS Telemetry SDK shared memory structure for ATS
// Maps to `Local\SCSTelemetry`
struct SCSTelemetry {
    // --- SDK control ---
    unsigned int sdkActive;           // 1 = telemetry SDK active
    unsigned int paused;              // 1 = game paused

    // --- Timestamps ---
    unsigned int timestamp;           // In-game timestamp (ms since session start)
    unsigned int simulatedTimestamp;   // Simulated time (ms)
    unsigned int renderTimestamp;      // Render time (ms)

    // --- Common game data ---
    unsigned int timeAbsolute;        // Absolute game time in minutes from midnight
    unsigned int gears;               // Forward gear count
    unsigned int gearsReverse;        // Reverse gear count
    unsigned int restStop;            // Distance to next rest stop in meters

    // --- Truck powertrain ---
    float speed;                      // Speed in m/s (negative = reversing)
    float engineRpm;                  // Current engine RPM
    float engineRpmMax;               // Maximum engine RPM
    int gear;                         // Current gear: -1=reverse, 0=neutral, 1+=forward
    int displayedGear;                // Gear displayed on dashboard
    int gearSlots;
    int gearSlotsHandlePosition;
    int gearSlotsSelector;

    // --- Cruise control ---
    float cruiseControlSpeed;         // Cruise control speed m/s
    unsigned int cruiseControlEnabled; // 1 = cruise control active

    // --- Fuel ---
    float fuel;                       // Current fuel in liters
    float fuelCapacity;               // Tank capacity in liters
    float fuelAvgConsumption;         // Average consumption L/km
    float fuelRange;                  // Estimated range in km
    float adblue;                     // AdBlue level in liters
    float adblueCapacity;             // AdBlue tank capacity
    unsigned int adblueWarning;       // AdBlue warning flag

    // --- Temperatures and fluids ---
    float oilTemp;                    // Engine oil temperature
    float oilPressure;                // Engine oil pressure (psi)
    float waterTemp;                  // Engine water/coolant temperature
    float batteryVoltage;             // Battery voltage

    // --- Air and braking ---
    float airPressure;                // Brake air pressure (psi)
    unsigned int airPressureWarning;  // Low air pressure warning
    float brakeTemperature;           // Brake temperature
    int retarderLevel;                // Current retarder/exhaust brake level
    int retarderStepCount;            // Total retarder steps
    unsigned int engineBrake;         // Engine brake active

    // --- Lights ---
    unsigned int lightsParking;
    unsigned int lightsBeamLow;
    unsigned int lightsBeamHigh;
    unsigned int lightsAuxFront;
    unsigned int lightsAuxRoof;
    unsigned int lightsBeacon;
    unsigned int lightsBrake;
    unsigned int lightsReverse;

    // --- Controls ---
    unsigned int wipersEnabled;
    unsigned int electricEnabled;     // Ignition/electrics on
    unsigned int engineEnabled;       // Engine running

    // --- Truck damage (0.0 = pristine, 1.0 = destroyed) ---
    float wearEngine;
    float wearTransmission;
    float wearCabin;
    float wearChassis;
    float wearWheels;

    // --- Truck position (world coordinates) ---
    double worldX;
    double worldY;
    double worldZ;
    float heading;                    // Heading in radians
    float pitch;                      // Pitch in radians
    float roll;                       // Roll in radians

    // --- Speed limit ---
    float speedLimit;                 // Posted speed limit in m/s

    // --- Navigation ---
    float navigationDistanceRemaining; // Remaining distance in meters
    float navigationTimeRemaining;     // Remaining time in seconds
    float navigationSpeedLimit;        // Navigation speed limit in m/s

    // --- Cargo ---
    float cargoWeight;                // Cargo mass in kg
    float cargoDamage;                // Cargo damage (0.0 - 1.0)

    // --- Truck identity ---
    char truckBrand[SCS_STRING_SIZE];
    char truckBrandId[SCS_STRING_SIZE];
    char truckModel[SCS_STRING_SIZE];
    char truckModelId[SCS_STRING_SIZE];

    // --- Driver inputs ---
    float throttle;                   // Throttle 0.0 - 1.0
    float brake;                      // Brake 0.0 - 1.0
    float clutch;                     // Clutch 0.0 - 1.0
    float steering;                   // Steering -1.0 (left) to 1.0 (right)
};

} // namespace ATS

#pragma pack(pop)

#endif // _WIN32
