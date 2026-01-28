import { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Progress } from "./ui/progress";
import { Badge } from "./ui/badge";
import NurburgringNordschleife1 from '../imports/NurburgringNordschleife1';

interface TelemetryData {
  speed: number;
  rpm: number;
  gear: string;
  throttle: number;
  brake: number;
  sector1: string;
  sector2: string;
  sector3: string;
  currentLapTime: string;
  lastLapTime: string;
  bestLapTime: string;
  predictedLapTime: string;
  currentSector: number;
  maxSpeed: number;
  maxRpm: number;

  // Car systems
  tractionControl: number;
  abs: number;
  brakeBalance: number;
  engineMap: number;
  ers: number;
  drs: "On" | "Off" | "Available";

  // Fuel
  fuelRemaining: number;
  fuelConsumptionAvg: number;
  fuelLapsRemaining: number;

  // Tires
  tires: {
    frontLeft: { temp: number; pressure: number; wear: number };
    frontRight: {
      temp: number;
      pressure: number;
      wear: number;
    };
    rearLeft: { temp: number; pressure: number; wear: number };
    rearRight: { temp: number; pressure: number; wear: number };
    compound: "Soft" | "Medium" | "Hard";
    lapsOnTire: number;
  };

  // Position and race info
  position: number;
  raceTime: string;
  lapNumber: number;
  totalLaps: number;
}

export function TelemetryDashboard() {
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    speed: 285,
    rpm: 11074,
    gear: "7",
    throttle: 98,
    brake: 0,
    sector1: "23.456",
    sector2: "41.892",
    sector3: "26.743",
    currentLapTime: "0:17.538",
    lastLapTime: "1:28.495",
    bestLapTime: "1:27.945",
    predictedLapTime: "1:28.123",
    currentSector: 2,
    maxSpeed: 340,
    maxRpm: 13000,

    tractionControl: 2,
    abs: 3,
    brakeBalance: 62.2,
    engineMap: 1,
    ers: 68,
    drs: "On",

    fuelRemaining: 58.4,
    fuelConsumptionAvg: 2.6,
    fuelLapsRemaining: 17,

    tires: {
      frontLeft: { temp: 89, pressure: 23.1, wear: 12.3 },
      frontRight: { temp: 95, pressure: 23.4, wear: 13.2 },
      rearLeft: { temp: 78, pressure: 21.8, wear: 11.1 },
      rearRight: { temp: 82, pressure: 22.1, wear: 11.6 },
      compound: "Medium",
      lapsOnTire: 8,
    },

    position: 3,
    raceTime: "00:47:23",
    lapNumber: 12,
    totalLaps: 56,
  });

  // Simulate real-time telemetry updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        speed: Math.max(
          0,
          Math.min(
            340,
            prev.speed + (Math.random() - 0.5) * 30,
          ),
        ),
        rpm: Math.max(
          1000,
          Math.min(
            13000,
            prev.rpm + (Math.random() - 0.5) * 800,
          ),
        ),
        gear:
          Math.random() > 0.7
            ? prev.gear === "N"
              ? "1"
              : Math.random() > 0.5
                ? "N"
                : String(
                    Math.max(
                      1,
                      Math.min(
                        8,
                        parseInt(prev.gear) +
                          Math.floor((Math.random() - 0.5) * 3),
                      ),
                    ),
                  )
            : prev.gear,
        throttle: Math.max(
          0,
          Math.min(
            100,
            prev.throttle + (Math.random() - 0.5) * 40,
          ),
        ),
        brake: Math.max(
          0,
          Math.min(
            100,
            prev.brake + (Math.random() - 0.5) * 30,
          ),
        ),

        tires: {
          ...prev.tires,
          frontLeft: {
            ...prev.tires.frontLeft,
            temp: Math.max(
              70,
              Math.min(
                120,
                prev.tires.frontLeft.temp +
                  (Math.random() - 0.5) * 4,
              ),
            ),
            wear: Math.max(
              10,
              Math.min(
                30,
                prev.tires.frontLeft.wear +
                  (Math.random() - 0.5) * 0.3,
              ),
            ),
          },
          frontRight: {
            ...prev.tires.frontRight,
            temp: Math.max(
              70,
              Math.min(
                120,
                prev.tires.frontRight.temp +
                  (Math.random() - 0.5) * 4,
              ),
            ),
            wear: Math.max(
              10,
              Math.min(
                30,
                prev.tires.frontRight.wear +
                  (Math.random() - 0.5) * 0.3,
              ),
            ),
          },
          rearLeft: {
            ...prev.tires.rearLeft,
            temp: Math.max(
              70,
              Math.min(
                120,
                prev.tires.rearLeft.temp +
                  (Math.random() - 0.5) * 4,
              ),
            ),
            wear: Math.max(
              10,
              Math.min(
                30,
                prev.tires.rearLeft.wear +
                  (Math.random() - 0.5) * 0.3,
              ),
            ),
          },
          rearRight: {
            ...prev.tires.rearRight,
            temp: Math.max(
              70,
              Math.min(
                120,
                prev.tires.rearRight.temp +
                  (Math.random() - 0.5) * 4,
              ),
            ),
            wear: Math.max(
              10,
              Math.min(
                30,
                prev.tires.rearRight.wear +
                  (Math.random() - 0.5) * 0.3,
              ),
            ),
          },
        },

        ers: Math.max(
          0,
          Math.min(100, prev.ers + (Math.random() - 0.5) * 5),
        ),
        fuelRemaining: Math.max(
          0,
          prev.fuelRemaining - Math.random() * 0.1,
        ),
      }));
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const getTireBarColor = (temp: number) => {
    if (temp < 80) return "bg-blue-500"; // Cold
    if (temp >= 80 && temp <= 105) return "bg-green-500"; // Optimal
    return "bg-red-500"; // Hot
  };

  const getDRSColor = (status: string) => {
    switch (status) {
      case "On":
        return "bg-green-500";
      case "Available":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getLapTimeColor = (
    type: "current" | "last" | "best",
  ) => {
    switch (type) {
      case "current":
        return "text-foreground";
      case "last":
        return "text-yellow-400";
      case "best":
        return "text-green-400";
      default:
        return "text-foreground";
    }
  };

  return (
    <div className="min-h-screen bg-[rgba(0,0,0,1)] p-4">
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-6">
          <h1 className="text-3xl tracking-tight text-foreground/90">
            {" "}
            GT3 TELEMETRY
          </h1>
          <div className="h-0.5 w-24 bg-primary mt-2"></div>
        </div>

        {/* DDU Style Container */}
        <div className="mx-auto max-w-[1600px] flex items-center justify-center">
          <div className="bg-[#000000] border-4 border-gray-700 rounded-3xl relative overflow-hidden p-8 w-full">
            <div className="grid grid-cols-12 gap-4 h-[calc(100vh-280px)]">
              {/* Row 1 - Top Status Bar */}
              <Card className="col-span-3 p-6 bg-[#000000] border-2 border-white rounded-xl flex items-center justify-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-muted/20 rounded-lg flex items-center justify-center">
                    <span className="text-lg text-muted-foreground">
                      🔊
                    </span>
                  </div>
                  <div className="w-12 h-12 bg-muted/20 rounded-lg flex items-center justify-center">
                    <span className="text-lg text-muted-foreground">
                      ⚙
                    </span>
                  </div>
                  <div className="w-12 h-12 bg-green-500/80 rounded-lg flex items-center justify-center">
                    <span className="text-lg text-white">
                      ⚡
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="col-span-2 p-6 bg-green-500 text-white rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl font-mono tracking-tight">
                    -0.187
                  </div>
                  <div className="text-sm tracking-wider opacity-90">
                    DELTA
                  </div>
                </div>
              </Card>

              <Card className="col-span-5 p-6 bg-[#000000] border-2 border-white rounded-xl">
                <div className="grid grid-cols-4 gap-4 text-center h-full">
                  <div className="flex flex-col justify-center">
                    <div className="text-2xl font-mono">
                      {telemetry.raceTime}
                    </div>
                    <div className="text-sm text-muted-foreground tracking-wider">
                      RACE
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-2xl font-mono">
                      {String(telemetry.position).padStart(
                        2,
                        "0",
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground tracking-wider">
                      POS
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-2xl font-mono">
                      {String(telemetry.lapNumber).padStart(
                        2,
                        "0",
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground tracking-wider">
                      LAP
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="text-2xl font-mono text-muted-foreground">
                      00:00
                    </div>
                    <div className="text-sm text-muted-foreground tracking-wider">
                      TIME
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="col-span-2 p-6 bg-yellow-500 text-black rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <div className="text-lg tracking-wider">
                    SECTOR {telemetry.currentSector}
                  </div>
                  <div className="text-xs tracking-wider opacity-80">
                    ACTIVE
                  </div>
                </div>
              </Card>

              {/* Row 2 - Main Display Area */}
              <Card className="col-span-3 p-6 bg-[#000000] border-2 border-white rounded-xl">
                <div className="space-y-4 h-full flex flex-col">
                  <div className="text-lg text-muted-foreground tracking-wider text-center">
                    TYRES
                  </div>
                  <div className="grid grid-cols-2 gap-6 flex-1">
                    {/* Front Left */}
                    <div className="text-center flex flex-col justify-between">
                      <div className="text-2xl mb-2">
                        {telemetry.tires.frontLeft.wear.toFixed(
                          1,
                        )}
                      </div>
                      <div className="flex flex-col items-center flex-1 justify-center">
                        <div className="text-base text-muted-foreground mb-2">
                          {Math.round(
                            telemetry.tires.frontLeft.temp,
                          )}
                          °
                        </div>
                        <div
                          className={`w-6 h-16 rounded ${getTireBarColor(telemetry.tires.frontLeft.temp)}`}
                        ></div>
                        <div className="text-base text-muted-foreground mt-2">
                          {Math.round(
                            telemetry.tires.frontLeft.temp +
                              540,
                          )}
                          °
                        </div>
                      </div>
                    </div>

                    {/* Front Right */}
                    <div className="text-center flex flex-col justify-between">
                      <div className="text-2xl mb-2">
                        {telemetry.tires.frontRight.wear.toFixed(
                          1,
                        )}
                      </div>
                      <div className="flex flex-col items-center flex-1 justify-center">
                        <div className="text-base text-muted-foreground mb-2">
                          {Math.round(
                            telemetry.tires.frontRight.temp,
                          )}
                          °
                        </div>
                        <div
                          className={`w-6 h-16 rounded ${getTireBarColor(telemetry.tires.frontRight.temp)}`}
                        ></div>
                        <div className="text-base text-muted-foreground mt-2">
                          {Math.round(
                            telemetry.tires.frontRight.temp +
                              540,
                          )}
                          °
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center py-3">
                    <div className="text-xl">
                      {telemetry.tires.compound.toUpperCase()}{" "}
                      {telemetry.tires.lapsOnTire}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 flex-1">
                    {/* Rear Left */}
                    <div className="text-center flex flex-col justify-between">
                      <div className="text-2xl mb-2">
                        {telemetry.tires.rearLeft.wear.toFixed(
                          1,
                        )}
                      </div>
                      <div className="flex flex-col items-center flex-1 justify-center">
                        <div className="text-base text-muted-foreground mb-2">
                          {Math.round(
                            telemetry.tires.rearLeft.temp,
                          )}
                          °
                        </div>
                        <div
                          className={`w-6 h-16 rounded ${getTireBarColor(telemetry.tires.rearLeft.temp)}`}
                        ></div>
                        <div className="text-base text-muted-foreground mt-2">
                          {Math.round(
                            telemetry.tires.rearLeft.temp + 540,
                          )}
                          °
                        </div>
                      </div>
                    </div>

                    {/* Rear Right */}
                    <div className="text-center flex flex-col justify-between">
                      <div className="text-2xl mb-2">
                        {telemetry.tires.rearRight.wear.toFixed(
                          1,
                        )}
                      </div>
                      <div className="flex flex-col items-center flex-1 justify-center">
                        <div className="text-base text-muted-foreground mb-2">
                          {Math.round(
                            telemetry.tires.rearRight.temp,
                          )}
                          °
                        </div>
                        <div
                          className={`w-6 h-16 rounded ${getTireBarColor(telemetry.tires.rearRight.temp)}`}
                        ></div>
                        <div className="text-base text-muted-foreground mt-2">
                          {Math.round(
                            telemetry.tires.rearRight.temp +
                              540,
                          )}
                          °
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="col-span-6 p-8 bg-[#000000] border-2 border-white rounded-xl">
                <div className="text-center space-y-4 h-full flex flex-col justify-center">
                  <div className="text-8xl font-mono text-primary">
                    {telemetry.gear}
                  </div>
                  <div className="text-3xl font-mono text-muted-foreground">
                    {Math.round(telemetry.rpm)}
                  </div>
                  <Progress
                    value={Math.round(telemetry.throttle)}
                    className="h-4 bg-muted [&>div]:bg-green-500"
                  />
                  <div className="text-lg text-muted-foreground">
                    {Math.round(telemetry.speed)} KPH
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-4 text-lg">
                      <span>🌡 20°</span>
                      <span>/\\ 32°</span>
                      <Badge className="bg-green-600 text-white text-base px-4 py-1">
                        GRN
                      </Badge>
                    </div>
                    {/* Track Map */}
                    <div className="relative h-24 bg-muted/10 rounded border border-muted/20 p-2">
                      <div className="w-full h-full relative">
                        <NurburgringNordschleife1 />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="col-span-3 p-6 bg-[#000000] border-2 border-white rounded-xl">
                <div className="space-y-4 h-full flex flex-col">
                  <div className="text-lg text-muted-foreground tracking-wider text-center">
                    LAP TIMES
                  </div>
                  <div className="space-y-4 flex-1 flex flex-col justify-center">
                    <div className="text-center">
                      <div className="text-3xl font-mono text-foreground">
                        {telemetry.currentLapTime}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        CURRENT LAP
                      </div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`text-3xl font-mono ${getLapTimeColor("last")}`}
                      >
                        {telemetry.lastLapTime}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        LAST LAP
                      </div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`text-3xl font-mono ${getLapTimeColor("best")}`}
                      >
                        {telemetry.bestLapTime}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        BEST LAP
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Row 3 - Car System Values */}
              <Card className="col-span-2 py-6 px-4 bg-[#000000] border-2 border-blue-500 rounded-xl flex flex-col justify-center">
                <div className="text-center">
                  <div className="text-lg text-blue-400 tracking-wider mb-3">
                    TC
                  </div>
                  <div className="text-6xl font-mono font-bold text-blue-400 leading-none">
                    {telemetry.tractionControl}
                  </div>
                </div>
              </Card>

              <Card className="col-span-2 py-6 px-4 bg-[#000000] border-2 border-blue-500 rounded-xl flex flex-col justify-center">
                <div className="text-center">
                  <div className="text-lg text-blue-400 tracking-wider mb-3">
                    TC CUT
                  </div>
                  <div className="text-6xl font-mono font-bold text-blue-400 leading-none">
                    {telemetry.tractionControl}
                  </div>
                </div>
              </Card>

              <Card className="col-span-2 py-6 px-4 bg-[#000000] border-2 border-yellow-500 rounded-xl flex flex-col justify-center">
                <div className="text-center">
                  <div className="text-lg text-yellow-400 tracking-wider mb-3">
                    ABS
                  </div>
                  <div className="text-6xl font-mono font-bold text-yellow-400 leading-none">
                    {telemetry.abs}
                  </div>
                </div>
              </Card>

              <Card className="col-span-2 py-6 px-4 bg-[#000000] border-2 border-red-500 rounded-xl flex flex-col justify-center">
                <div className="text-center">
                  <div className="text-lg text-red-400 tracking-wider mb-3">
                    BB
                  </div>
                  <div className="text-6xl font-mono font-bold text-red-400 leading-none">
                    {telemetry.brakeBalance}
                  </div>
                </div>
              </Card>

              <Card className="col-span-2 py-6 px-4 bg-[#000000] border-2 border-green-500 rounded-xl flex flex-col justify-center">
                <div className="text-center">
                  <div className="text-lg text-green-400 tracking-wider mb-3">
                    MAP
                  </div>
                  <div className="text-6xl font-mono font-bold text-green-400 leading-none">
                    {telemetry.engineMap}
                  </div>
                </div>
              </Card>

              <Card className="col-span-2 p-4 bg-[#000000] border-2 border-white rounded-xl flex flex-col justify-center">
                <div className="text-center space-y-2">
                  <div className="text-sm text-muted-foreground tracking-wider">
                    FUEL
                  </div>
                  <div className="space-y-2">
                    <div className="text-3xl font-mono">
                      {Math.round(telemetry.fuelRemaining)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      LITRES
                    </div>
                    <div className="text-xl font-mono">
                      {telemetry.fuelConsumptionAvg.toFixed(1)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      AVG
                    </div>
                    <div className="text-xl font-mono">
                      {telemetry.fuelLapsRemaining}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      LAPS
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}