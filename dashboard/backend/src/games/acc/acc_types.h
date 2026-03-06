#pragma once

#ifdef _WIN32
#include <windows.h>

#pragma pack(push, 4)

namespace ACC {

struct SPageFilePhysics {
    int packetId;
    float gas;
    float brake;
    float fuel;
    int gear;                     // 0=reverse, 1=neutral, 2=1st, ...
    int rpms;
    float steerAngle;
    float speedKmh;
    float velocity[3];
    float accG[3];
    float wheelSlip[4];
    float wheelLoad[4];
    float wheelsPressure[4];
    float wheelAngularSpeed[4];
    float tyreWear[4];
    float tyreDirtyLevel[4];
    float tyreCoreTemperature[4];
    float camberRAD[4];
    float suspensionTravel[4];
    float drs;
    float tc;
    float heading;
    float pitch;
    float roll;
    float cgHeight;
    float carDamage[5];
    int numberOfTyresOut;
    int pitLimiterOn;
    float abs;
    float kersCharge;
    float kersInput;
    int autoShifterOn;
    float rideHeight[2];
    float turboBoost;
    float ballast;
    float airDensity;
    float airTemp;
    float roadTemp;
    float localAngularVel[3];
    float finalFF;
    float performanceMeter;
    int engineBrake;
    int ersRecoveryLevel;
    int ersPowerLevel;
    int ersHeatCharging;
    int ersIsCharging;
    float kersCurrentKJ;
    int drsAvailable;
    int drsEnabled;
    float brakeTemp[4];
    float clutch;
    float tyreTempI[4];
    float tyreTempM[4];
    float tyreTempO[4];
    int isAIControlled;
    float tyreContactPoint[4][3];
    float tyreContactNormal[4][3];
    float tyreContactHeading[4][3];
    float brakeBias;
    float localVelocity[3];

    // ACC-specific additions (beyond AC)
    int P2PActivations;
    int P2PStatus;
    int currentMaxRpm;
    float mz[4];
    float fx[4];
    float fy[4];
    float slipRatio[4];
    float slipAngle[4];
    int tcInAction;
    int absInAction;
    float suspensionDamage[4];
    float tyreTemp[4];
    float waterTemp;
    float brakePressure[4];
    int frontBrakeCompound;
    int rearBrakeCompound;
    float padLife[4];
    float discLife[4];
    int ignitionOn;
    int starterEngineOn;
    int isEngineRunning;
    float kerbVibration;
    float slipVibrations;
    float gVibrations;
    float absVibrations;
};

struct SPageFileGraphic {
    int packetId;
    int status;                   // 0=off, 1=replay, 2=live, 3=pause
    int session;                  // 0=practice, 1=qualifying, 2=race, 3=hotlap, 4=hotstint
    wchar_t currentTime[15];
    wchar_t lastTime[15];
    wchar_t bestTime[15];
    wchar_t split[15];
    int completedLaps;
    int position;
    int iCurrentTime;
    int iLastTime;
    int iBestTime;
    float sessionTimeLeft;
    float distanceTraveled;
    int isInPit;
    int currentSectorIndex;
    int lastSectorTime;
    int numberOfLaps;
    wchar_t tyreCompound[33];
    float replayTimeMultiplier;
    float normalizedCarPosition;
    int activeCars;
    float carCoordinates[60][3];
    int carID[60];
    int playerCarID;
    float penaltyTime;
    int flag;                     // 0=none, 1=blue, 2=yellow, 3=black, 4=white, 5=checkered, 6=penalty
    int penalty;
    int idealLineOn;
    int isInPitLane;
    float surfaceGrip;
    int mandatoryPitDone;
    float windSpeed;
    float windDirection;
    int isSetupMenuVisible;
    int mainDisplayIndex;
    int secondaryDisplayIndex;
    int TC;
    int TCCut;
    int EngineMap;
    int ABS;
    float fuelXLap;               // Fuel used per lap
    int rainLights;
    int flashingLights;
    int lightsStage;
    float exhaustTemperature;
    int wiperLV;
    int driverStintTotalTimeLeft;
    int driverStintTimeLeft;
    int rainTyres;
    int sessionIndex;
    float usedFuel;
    wchar_t deltaLapTime[15];
    int iDeltaLapTime;
    wchar_t estimatedLapTime[15];
    int iEstimatedLapTime;
    int isDeltaPositive;
    int iSplit;
    int isValidLap;
    float fuelEstimatedLaps;
    wchar_t trackStatus[33];
    int missingMandatoryPits;
    float Clock;
    int directionLightsLeft;
    int directionLightsRight;
    int GlobalYellow;
    int GlobalYellow1;
    int GlobalYellow2;
    int GlobalYellow3;
    int GlobalWhite;
    int GlobalGreen;
    int GlobalChequered;
    int GlobalRed;
    int mfdTyreSet;
    float mfdFuelToAdd;
    float mfdTyrePressureLF;
    float mfdTyrePressureRF;
    float mfdTyrePressureLR;
    float mfdTyrePressureRR;
    int trackGripStatus;          // 0=Green, 1=Fast, 2=Optimum, 3=Greasy, 4=Damp, 5=Wet
    int rainIntensity;            // 0=No Rain, 1=Drizzle, 2=Light, 3=Heavy
    int rainIntensityIn10min;
    int rainIntensityIn30min;
    int currentTyreSet;
    int strategyTyreSet;
    int gapAhead;                 // Gap to car ahead in ms
    int gapBehind;                // Gap to car behind in ms
};

struct SPageFileStatic {
    wchar_t smVersion[15];
    wchar_t acVersion[15];
    int numberOfSessions;
    int numCars;
    wchar_t carModel[33];
    wchar_t track[33];
    wchar_t playerName[33];
    wchar_t playerSurname[33];
    wchar_t playerNick[33];
    int sectorCount;
    float maxTorque;
    float maxPower;
    int maxRpm;
    float maxFuel;
    float suspensionMaxTravel[4];
    float tyreRadius[4];
    float maxTurboBoost;
    float deprecated_1;
    float deprecated_2;
    int penaltiesEnabled;
    float aidFuelRate;
    float aidTireRate;
    float aidMechanicalDamage;
    int aidAllowTyreBlankets;
    float aidStability;
    int aidAutoClutch;
    int aidAutoBlip;
    int hasDRS;
    int hasERS;
    int hasKERS;
    float kersMaxJ;
    int engineBrakeSettingsCount;
    int ersPowerControllerCount;
    float trackSPlineLength;
    wchar_t trackConfiguration[33];
    float ersMaxJ;
    int isTimedRace;
    int hasExtraLap;
    wchar_t carSkin[33];
    int reversedGridPositions;
    int PitWindowStart;
    int PitWindowEnd;
    int isOnline;
    wchar_t dryTyresName[33];
    wchar_t wetTyresName[33];
};

} // namespace ACC

#pragma pack(pop)

#endif // _WIN32
