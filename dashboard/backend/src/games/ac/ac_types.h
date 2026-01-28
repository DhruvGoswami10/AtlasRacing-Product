#pragma once

#include <windows.h>

namespace AC {

struct SPageFileStatic {
    wchar_t smVersion[15];        // Shared memory version
    wchar_t acVersion[15];        // AC version
    int numberOfSessions;         // Number of sessions
    int numCars;                  // Max cars on track
    wchar_t carModel[33];         // Player's car name
    wchar_t track[33];            // Track name
    wchar_t playerName[33];       // Player name
    wchar_t playerSurname[33];    // Player surname
    wchar_t playerNick[33];       // Player nickname
    int sectorCount;              // Track sectors
    float maxTorque;              // Max torque
    float maxPower;               // Max power
    int maxRpm;                   // Max RPM
    float maxFuel;                // Max fuel capacity
    float suspensionMaxTravel[4]; // Suspension travel FL,FR,RL,RR
    float tyreRadius[4];          // Tire radius FL,FR,RL,RR
    float maxTurboBoost;          // Max turbo boost
    float deprecated_1;           // Do not use
    float deprecated_2;           // Do not use
    int penaltiesEnabled;         // Penalties enabled
    float aidFuelRate;            // Fuel consumption rate
    float aidTireRate;            // Tire wear rate
    float aidMechanicalDamage;    // Damage rate
    int aidAllowTyreBlankets;     // Hot tire start
    float aidStability;           // Stability aid
    int aidAutoClutch;            // Auto clutch
    int aidAutoBlip;              // Auto blip
    int hasDRS;                   // Has DRS system
    int hasERS;                   // Has ERS system
    int hasKERS;                  // Has KERS system
    float kersMaxJ;               // Max KERS energy
    int engineBrakeSettingsCount; // Engine brake settings
    int ersPowerControllerCount;  // ERS power controllers
    float trackSPlineLength;      // Track spline length
    wchar_t trackConfiguration[33]; // Track layout name
    float ersMaxJ;                // Max ERS energy
    int isTimedRace;              // Timed race flag
    int hasExtraLap;              // Extra lap flag
    wchar_t carSkin[33];          // Car skin name
    int reversedGridPositions;    // Reversed grid positions
    int PitWindowStart;           // Pit window start
    int PitWindowEnd;             // Pit window end
};

struct SPageFilePhysics {
    int packetId;                 // Packet ID
    float gas;                    // Throttle 0-1
    float brake;                  // Brake 0-1
    float fuel;                   // Fuel in liters
    int gear;                     // Gear (0=reverse, 1=neutral, 2=1st)
    int rpms;                     // RPM
    float steerAngle;             // Steering angle
    float speedKmh;               // Speed km/h
    float velocity[3];            // Velocity x,y,z
    float accG[3];                // G-forces x,y,z
    float wheelSlip[4];           // Wheel slip FL,FR,RL,RR
    float wheelLoad[4];           // Wheel load FL,FR,RL,RR
    float wheelsPressure[4];      // Tire pressure FL,FR,RL,RR
    float wheelAngularSpeed[4];   // Wheel angular speed FL,FR,RL,RR
    float tyreWear[4];            // Tire wear FL,FR,RL,RR
    float tyreDirtyLevel[4];      // Tire dirt FL,FR,RL,RR
    float tyreCoreTemperature[4]; // Tire core temp FL,FR,RL,RR
    float camberRAD[4];           // Camber radians FL,FR,RL,RR
    float suspensionTravel[4];    // Suspension travel FL,FR,RL,RR
    float drs;                    // DRS enabled 0/1
    float tc;                     // Traction control
    float heading;                // Car heading
    float pitch;                  // Car pitch
    float roll;                   // Car roll
    float cgHeight;               // Center of gravity height
    float carDamage[5];           // Car damage levels
    int numberOfTyresOut;         // Tires out of track
    int pitLimiterOn;             // Pit limiter 0/1
    float abs;                    // ABS setting
    float kersCharge;             // KERS charge 0-1
    float kersInput;              // KERS input 0-1
    int autoShifterOn;            // Auto shifter 0/1
    float rideHeight[2];          // Ride height front/rear
    float turboBoost;             // Turbo boost
    float ballast;                // Ballast weight
    float airDensity;             // Air density
    float airTemp;                // Air temperature
    float roadTemp;               // Road temperature
    float localAngularVel[3];     // Angular velocity x,y,z
    float finalFF;                // Force feedback
    float performanceMeter;       // Performance vs best lap
    int engineBrake;              // Engine brake setting
    int ersRecoveryLevel;         // ERS recovery level
    int ersPowerLevel;            // ERS power level
    int ersHeatCharging;          // ERS heat charging
    int ersIsCharging;            // ERS is charging
    float kersCurrentKJ;          // KERS energy spent
    int drsAvailable;             // DRS available in zone
    int drsEnabled;               // DRS enabled
    float brakeTemp[4];           // Brake temps FL,FR,RL,RR
    float clutch;                 // Clutch 0-1
    float tyreTempI[4];           // Tire inner temp FL,FR,RL,RR
    float tyreTempM[4];           // Tire middle temp FL,FR,RL,RR
    float tyreTempO[4];           // Tire outer temp FL,FR,RL,RR
    int isAIControlled;           // AI controlled car
    float tyreContactPoint[4][3]; // Contact points FL,FR,RL,RR x,y,z
    float tyreContactNormal[4][3]; // Contact normals FL,FR,RL,RR x,y,z
    float tyreContactHeading[4][3]; // Contact heading FL,FR,RL,RR x,y,z
    float brakeBias;              // Brake bias 0-1
    float localVelocity[3];       // Local velocity x,y,z
};

struct SPageFileGraphic {
    int packetId;                 // Packet ID
    int status;                   // AC status (0=off,1=replay,2=live,3=pause)
    int session;                  // Session type (0=practice,1=qualify,2=race,3=hotlap,4=time_attack,5=drift,6=drag)
    wchar_t currentTime[15];      // Current lap time string
    wchar_t lastTime[15];         // Last lap time string
    wchar_t bestTime[15];         // Best lap time string
    wchar_t split[15];            // Sector time string
    int completedLaps;            // Completed laps
    int position;                 // Current position
    int iCurrentTime;             // Current lap time (ms)
    int iLastTime;                // Last lap time (ms)
    int iBestTime;                // Best lap time (ms)
    float sessionTimeLeft;        // Session time left
    float distanceTraveled;       // Distance traveled
    int isInPit;                  // In pit 0/1
    int currentSectorIndex;       // Current sector
    int lastSectorTime;           // Last sector time
    int numberOfLaps;             // Number of laps
    wchar_t tyreCompound[33];     // Tire compound
    float replayTimeMultiplier;   // Replay multiplier
    float normalizedCarPosition;  // Car position on spline
    float carCoordinates[3];      // Car world coordinates x,y,z
    float penaltyTime;            // Penalty time
    int flag;                     // Flag type (0=none,1=blue,2=yellow,3=black,4=white,5=checkered,6=penalty)
    int idealLineOn;              // Ideal line enabled
    int isInPitLane;              // In pit lane 0/1
    float surfaceGrip;            // Track surface grip
    int mandatoryPitDone;         // Mandatory pit done
    float windSpeed;              // Wind speed
    float windDirection;          // Wind direction
};

} // namespace AC
