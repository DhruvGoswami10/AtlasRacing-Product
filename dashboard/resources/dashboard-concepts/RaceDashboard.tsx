import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Flag, Thermometer, CloudRain, Sun, Wind } from 'lucide-react';
import NurburgringNordschleife1 from '../imports/NurburgringNordschleife1';
import { InputTelemetry } from './InputTelemetry';

interface Driver {
  position: number;
  name: string;
  team: string;
  gap: string;
  lastLap: string;
  bestLap: string;
  sector1: string;
  sector2: string;
  sector3: string;
  tyreCompound: 'Soft' | 'Medium' | 'Hard' | 'Intermediate' | 'Wet';
  pitstops: number;
  points: number;
  status: 'Running' | 'DNF' | 'DNS' | 'Retired';
  lapsCompleted: number;
}

interface SessionData {
  trackName: string;
  currentLap: number;
  totalLaps: number;
  sessionType: string;
  timeRemaining: string;
  weather: 'Sunny' | 'Cloudy' | 'Rainy' | 'Overcast';
  trackTemp: number;
  airTemp: number;
  humidity: number;
  windSpeed: number;
  trackCondition: 'Dry' | 'Damp' | 'Wet';
  sessionTime: string;
  overallBest: string;
  leaderName: string;
  leaderGap: string;
}

interface RaceEvent {
  type: 'Yellow Flag' | 'Safety Car' | 'Virtual Safety Car' | 'DRS Enabled' | 'Red Flag' | 'Green Flag';
  sector: number;
  message: string;
  timestamp: string;
}

interface TelemetryData {
  speed: number;
  rpm: number;
  gear: string;
  throttle: number;
  brake: number;
  fuelRemaining: number;
  ersDeployment: number;
  drs: 'Available' | 'Open' | 'Closed';
  tc: number;
  abs: number;
  brakeBalance: number;
}

export function RaceDashboard() {
  const [leaderboard, setLeaderboard] = useState<Driver[]>([
    { 
      position: 1, 
      name: "M. Campbell", 
      team: "Mercedes", 
      gap: "LEADER", 
      lastLap: "1:31.485", 
      bestLap: "1:31.485",
      sector1: "30.940",
      sector2: "30.095",
      sector3: "30.450",
      tyreCompound: "Medium", 
      pitstops: 0, 
      points: 912,
      status: "Running",
      lapsCompleted: 13
    },
    { 
      position: 2, 
      name: "R. Aloe", 
      team: "Red Bull", 
      gap: "+0.63", 
      lastLap: "1:31.477", 
      bestLap: "1:31.477",
      sector1: "30.710",
      sector2: "30.335",
      sector3: "30.432",
      tyreCompound: "Medium", 
      pitstops: 0, 
      points: 814,
      status: "Running",
      lapsCompleted: 13
    },
    { 
      position: 3, 
      name: "K. Van Der Linde", 
      team: "Ferrari", 
      gap: "+1.31", 
      lastLap: "1:31.065", 
      bestLap: "1:31.065",
      sector1: "30.792",
      sector2: "30.122",
      sector3: "30.210",
      tyreCompound: "Medium", 
      pitstops: 0, 
      points: 694,
      status: "Running",
      lapsCompleted: 13
    },
    { 
      position: 4, 
      name: "F. Vervisch", 
      team: "McLaren", 
      gap: "+2.08", 
      lastLap: "1:30.652", 
      bestLap: "1:30.652",
      sector1: "30.477",
      sector2: "30.000",
      sector3: "30.175",
      tyreCompound: "Soft", 
      pitstops: 1, 
      points: 746,
      status: "Running",
      lapsCompleted: 13
    },
    { 
      position: 5, 
      name: "M. Vaxiviere", 
      team: "Aston Martin", 
      gap: "+4.23", 
      lastLap: "1:31.610", 
      bestLap: "1:31.610",
      sector1: "30.862",
      sector2: "30.350",
      sector3: "30.357",
      tyreCompound: "Medium", 
      pitstops: 0, 
      points: 862,
      status: "Running",
      lapsCompleted: 13
    },
    { 
      position: 6, 
      name: "C. Engelhart", 
      team: "Alpine", 
      gap: "+5.37", 
      lastLap: "1:31.547", 
      bestLap: "1:31.547",
      sector1: "30.917",
      sector2: "30.205",
      sector3: "30.425",
      tyreCompound: "Medium", 
      pitstops: 0, 
      points: 865,
      status: "Running",
      lapsCompleted: 13
    },
    { 
      position: 7, 
      name: "T. Neubauer", 
      team: "Williams", 
      gap: "+7.24", 
      lastLap: "1:32.387", 
      bestLap: "1:32.387",
      sector1: "00.282",
      sector2: "32.927",
      sector3: "31.877",
      tyreCompound: "Hard", 
      pitstops: 0, 
      points: 417,
      status: "Running",
      lapsCompleted: 12
    },
    { 
      position: 8, 
      name: "B. Auberlen", 
      team: "Alfa Romeo", 
      gap: "+7.78", 
      lastLap: "1:32.210", 
      bestLap: "1:32.210",
      sector1: "00.430",
      sector2: "32.032",
      sector3: "31.747",
      tyreCompound: "Medium", 
      pitstops: 0, 
      points: 694,
      status: "Running",
      lapsCompleted: 12
    },
  ]);

  const [sessionData, setSessionData] = useState<SessionData>({
    trackName: "Nurburgring",
    currentLap: 12,
    totalLaps: 29,
    sessionType: "RACE",
    timeRemaining: "11:03",
    weather: "Sunny",
    trackTemp: 42,
    airTemp: 28,
    humidity: 45,
    windSpeed: 12,
    trackCondition: "Dry",
    sessionTime: "47.292",
    overallBest: "1:30.652",
    leaderName: "C. Mies",
    leaderGap: "-0.69"
  });

  const [raceEvents, setRaceEvents] = useState<RaceEvent[]>([
    { type: "DRS Enabled", sector: 0, message: "DRS ENABLED", timestamp: "14:23:45" },
    { type: "Yellow Flag", sector: 2, message: "YELLOW FLAG - DEBRIS TURN 7", timestamp: "14:22:15" },
    { type: "Green Flag", sector: 0, message: "ALL CLEAR - RACING RESUMED", timestamp: "14:21:30" },
  ]);

  const [telemetryData, setTelemetryData] = useState<TelemetryData>({
    speed: 192,
    rpm: 11200,
    gear: "4",
    throttle: 85,
    brake: 0,
    fuelRemaining: 13,
    ersDeployment: 68,
    drs: "Available",
    tc: 2,
    abs: 3,
    brakeBalance: 62.7
  });

  const [currentFlag, setCurrentFlag] = useState<{
    type: 'Green Flag' | 'Yellow Flag' | 'Red Flag';
    message: string;
    sector?: number;
  }>({
    type: 'Green Flag',
    message: 'GREEN FLAG - ALL CLEAR',
  });

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionData(prev => ({
        ...prev,
        currentLap: Math.min(prev.totalLaps, prev.currentLap + (Math.random() < 0.05 ? 1 : 0)),
        sessionTime: (parseFloat(prev.sessionTime) + 0.1).toFixed(3),
      }));

      setTelemetryData(prev => ({
        ...prev,
        speed: Math.max(50, Math.min(300, prev.speed + (Math.random() - 0.5) * 20)),
        rpm: Math.max(4000, Math.min(13000, prev.rpm + (Math.random() - 0.5) * 500)),
        throttle: Math.max(0, Math.min(100, prev.throttle + (Math.random() - 0.5) * 30)),
        brake: Math.max(0, Math.min(100, prev.brake + (Math.random() - 0.5) * 20)),
        ersDeployment: Math.max(0, Math.min(100, prev.ersDeployment + (Math.random() - 0.5) * 5)),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Demo cycle through all flag types
  useEffect(() => {
    let flagIndex = 0;
    const flagTypes = [
      { type: 'Green Flag' as const, message: 'GREEN FLAG - ALL CLEAR' },
      { type: 'Yellow Flag' as const, message: 'YELLOW FLAG - CAUTION SECTOR 1', sector: 1 },
      { type: 'Yellow Flag' as const, message: 'YELLOW FLAG - CAUTION SECTOR 2', sector: 2 },
      { type: 'Yellow Flag' as const, message: 'YELLOW FLAG - CAUTION SECTOR 3', sector: 3 },
      { type: 'Red Flag' as const, message: 'RED FLAG - BACK TO PITS' },
      { type: 'Green Flag' as const, message: 'GREEN FLAG - RACING RESUMED' },
    ];

    const flagInterval = setInterval(() => {
      setCurrentFlag(flagTypes[flagIndex]);
      flagIndex = (flagIndex + 1) % flagTypes.length;
    }, 4000); // Change every 4 seconds for demo

    return () => clearInterval(flagInterval);
  }, []);

  const getTyreCompoundColor = (compound: string) => {
    switch (compound) {
      case 'Soft': return 'bg-red-500';
      case 'Medium': return 'bg-yellow-500';
      case 'Hard': return 'bg-gray-300 text-black';
      case 'Intermediate': return 'bg-green-500';
      case 'Wet': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getSectorTimeColor = (sector: string, isPersonalBest = false) => {
    if (sector.startsWith("00.") || sector === "00.000") return 'text-muted-foreground';
    if (isPersonalBest) return 'text-green-400';
    if (sector.startsWith("30.")) return 'text-yellow-400';
    return 'text-foreground';
  };

  const getLapTimeColor = (time: string, isBest = false) => {
    if (isBest) return 'text-green-400';
    if (time.startsWith("1:30")) return 'text-purple-400';
    return 'text-foreground';
  };

  const getFlagStyles = (flagType: string) => {
    switch (flagType) {
      case 'Green Flag':
        return {
          background: 'bg-green-500',
          text: 'text-black',
          border: 'border-green-400/50'
        };
      case 'Yellow Flag':
        return {
          background: 'bg-yellow-500',
          text: 'text-black',
          border: 'border-yellow-400/50'
        };
      case 'Red Flag':
        return {
          background: 'bg-red-500',
          text: 'text-black',
          border: 'border-red-400/50'
        };
      default:
        return {
          background: 'bg-green-500',
          text: 'text-black',
          border: 'border-green-400/50'
        };
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-[2000px]">
        <div className="mb-6">
          <h1 className="text-3xl tracking-tight text-foreground/90">RACE CONTROL</h1>
          <div className="h-0.5 w-32 bg-primary mt-2"></div>
        </div>

        <div className="grid grid-cols-24 gap-4 h-[calc(100vh-180px)]">
          {/* Top Row - Session Header */}
          <Card className="col-span-4 p-6 bg-card border-border/50 rounded-xl">
            <div className="space-y-4 h-full flex flex-col justify-center">
              <div className="text-center">
                <div className="text-4xl font-mono tracking-wider">L{sessionData.currentLap}</div>
                <div className="text-lg text-muted-foreground">RACE</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-mono">{sessionData.currentLap}/{sessionData.totalLaps}</div>
                <div className="text-sm text-muted-foreground tracking-wider">POSITION</div>
              </div>
            </div>
          </Card>

          <Card className="col-span-3 p-6 bg-card border-border/50 rounded-xl">
            <div className="space-y-4 h-full flex flex-col justify-center">
              <div className="text-center">
                <div className="text-3xl font-mono">{sessionData.timeRemaining}</div>
                <div className="text-sm text-muted-foreground tracking-wider">TIME LEFT</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-mono text-green-400">{sessionData.overallBest}</div>
                <div className="text-sm text-muted-foreground">LAST LAP</div>
              </div>
            </div>
          </Card>

          <Card className="col-span-4 p-6 bg-card border-border/50 rounded-xl">
            <div className="space-y-4 h-full flex flex-col justify-center">
              <div className="text-center">
                <div className="text-4xl font-mono text-green-400">{sessionData.overallBest}</div>
                <div className="text-sm text-muted-foreground tracking-wider">BEST LAP</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-mono text-purple-400">{sessionData.overallBest}</div>
                <div className="text-sm text-muted-foreground">OVERALL BEST</div>
              </div>
            </div>
          </Card>

          <Card className="col-span-5 p-6 bg-card border-border/50 rounded-xl">
            <div className="h-full flex flex-col justify-center">
              <div className="text-center space-y-3">
                <div className="text-3xl font-mono tracking-wider">{sessionData.trackName}</div>
                <div className="text-lg text-muted-foreground">TRACK</div>
                <div className="text-2xl font-mono">START</div>
                <div className="text-2xl font-mono">{sessionData.timeRemaining}</div>
              </div>
            </div>
          </Card>

          <Card className="col-span-4 p-6 bg-card border-border/50 rounded-xl">
            <div className="space-y-4 h-full flex flex-col justify-center">
              <div className="text-center">
                <div className="text-3xl font-mono">47 m/s</div>
                <div className="text-sm text-muted-foreground">@ 29° in 35° OUT</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-2xl">
                  <Sun className="w-8 h-8" />
                  <span>{sessionData.trackTemp}°C</span>
                </div>
                <div className="text-sm text-muted-foreground">TRACK TEMP</div>
              </div>
            </div>
          </Card>

          <Card className="col-span-4 p-6 bg-card border-border/50 rounded-xl">
            <div className="space-y-4 h-full flex flex-col justify-center">
              <div className="text-center">
                <div className="text-3xl font-mono">UT:</div>
                <div className="text-3xl font-mono">OK</div>
              </div>
              <div className="text-center">
                <div className="text-lg text-muted-foreground">SYSTEM</div>
                <div className="text-2xl">OK</div>
              </div>
            </div>
          </Card>

          {/* Main Content Row */}
          {/* Large Leaderboard */}
          <Card className="col-span-14 p-6 bg-card border-border/50 rounded-xl">
            <div className="space-y-4">
              {/* Leaderboard Header */}
              <div className="grid grid-cols-12 gap-3 text-sm text-muted-foreground tracking-wider py-3 border-b border-border/30">
                <div className="col-span-1 text-center">POS</div>
                <div className="col-span-2">DRIVER</div>
                <div className="col-span-1 text-center">GAP</div>
                <div className="col-span-1 text-center">INT</div>
                <div className="col-span-1 text-center">LAPS</div>
                <div className="col-span-2 text-center">LAST LAP</div>
                <div className="col-span-1 text-center">BEST LAP</div>
                <div className="col-span-1 text-center">S1</div>
                <div className="col-span-1 text-center">S2</div>
                <div className="col-span-1 text-center">S3</div>
              </div>

              {/* Leaderboard Rows */}
              <div className="space-y-2">
                {leaderboard.map((driver, index) => (
                  <div 
                    key={driver.position} 
                    className={`grid grid-cols-12 gap-3 items-center py-3 px-3 rounded text-base ${
                      driver.position <= 3 ? 'bg-primary/10' : 'bg-muted/5'
                    }`}
                  >
                    <div className="col-span-1 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-mono text-xl">{driver.position}</span>
                        {driver.position <= 3 && (
                          <div className={`w-2 h-2 rounded-full ${driver.position === 1 ? 'bg-yellow-500' : driver.position === 2 ? 'bg-gray-400' : 'bg-orange-600'}`}></div>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm">#{driver.points}</span>
                        <span className="font-mono text-lg">{driver.name}</span>
                      </div>
                    </div>
                    <div className="col-span-1 text-center font-mono text-lg">
                      {driver.gap}
                    </div>
                    <div className="col-span-1 text-center font-mono text-lg">
                      {driver.gap !== "LEADER" ? driver.gap : "+0.00"}
                    </div>
                    <div className="col-span-1 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-mono text-lg">{driver.lapsCompleted}</span>
                        <div className={`w-3 h-3 rounded-full ${getTyreCompoundColor(driver.tyreCompound)}`}></div>
                      </div>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className={`font-mono text-lg ${getLapTimeColor(driver.lastLap)}`}>
                        {driver.lastLap}
                      </span>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className={`font-mono text-lg ${getLapTimeColor(driver.bestLap, true)}`}>
                        {driver.bestLap}
                      </span>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className={`font-mono text-base ${getSectorTimeColor(driver.sector1)}`}>
                        {driver.sector1}
                      </span>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className={`font-mono text-base ${getSectorTimeColor(driver.sector2)}`}>
                        {driver.sector2}
                      </span>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className={`font-mono text-base ${getSectorTimeColor(driver.sector3)}`}>
                        {driver.sector3}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Right Column - Track Map & Telemetry */}
          <Card className="col-span-10 p-6 bg-card border-border/50 rounded-xl">
            <div className="h-full space-y-6">
              {/* Track Map */}
              <div className="space-y-4">
                <div className="text-lg text-muted-foreground tracking-wider">NURBURGRING NORDSCHLEIFE</div>
                <div className="relative h-48 bg-card/50 rounded border border-border/50 p-4">
                  <div className="w-full h-full relative">
                    <NurburgringNordschleife1 />
                  </div>
                </div>
              </div>

              {/* Telemetry Section */}
              <div className="grid grid-cols-3 gap-6">
                {/* Throttle/Brake */}
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground tracking-wider text-center">THROTTLE</div>
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-4xl font-mono">{Math.round(telemetryData.throttle)}%</div>
                    </div>
                    <Progress value={telemetryData.throttle} className="h-4 bg-muted [&>div]:bg-green-500" />
                  </div>
                </div>

                {/* Speed/Gear */}
                <div className="text-center space-y-3">
                  <div className="text-sm text-muted-foreground tracking-wider">GEAR / RPM</div>
                  <div className="text-6xl font-mono text-primary">{telemetryData.gear}</div>
                  <div className="text-2xl font-mono text-muted-foreground">{Math.round(telemetryData.rpm)}</div>
                  <div className="text-lg">{Math.round(telemetryData.speed)} KM/H</div>
                </div>

                {/* Systems */}
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground tracking-wider text-center">SYSTEMS</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="text-center p-2 bg-muted/10 rounded">
                      <div className="text-blue-400 text-lg">TC {telemetryData.tc}</div>
                    </div>
                    <div className="text-center p-2 bg-muted/10 rounded">
                      <div className="text-yellow-400 text-lg">ABS {telemetryData.abs}</div>
                    </div>
                    <div className="text-center p-2 bg-muted/10 rounded">
                      <div className="text-red-400 text-lg">BB {telemetryData.brakeBalance}</div>
                    </div>
                    <div className="text-center p-2 bg-muted/10 rounded">
                      <div className="text-green-400 text-lg">ERS {Math.round(telemetryData.ersDeployment)}%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timing Display */}
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 bg-green-500/10 rounded border border-green-500/30">
                  <div className="text-2xl font-mono text-green-400">04:04.547</div>
                  <div className="text-sm text-muted-foreground">BEST</div>
                </div>
                <div className="text-center p-4 bg-yellow-500/10 rounded border border-yellow-500/30">
                  <div className="text-2xl font-mono text-yellow-400">01:30.740</div>
                  <div className="text-sm text-muted-foreground">SECTOR</div>
                </div>
                <div className="text-center p-4 bg-red-500/10 rounded border border-red-500/30">
                  <div className="text-2xl font-mono text-red-400">54.4</div>
                  <div className="text-sm text-muted-foreground">TC OUT</div>
                </div>
                <div className="text-center p-4 bg-blue-500/10 rounded border border-blue-500/30">
                  <div className="text-2xl font-mono text-blue-400">00:17:39</div>
                  <div className="text-sm text-muted-foreground">FUEL</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Bottom Row - Race Control & Status */}
          <Card className="col-span-8 p-6 bg-card border-border/50 rounded-xl">
            <div className="space-y-6 h-full flex flex-col justify-center">
              <div className="text-lg text-muted-foreground tracking-wider">RACE DIRECTOR</div>
              <div className="space-y-4">
                <div className="text-5xl font-mono">{sessionData.leaderGap}</div>
                <div className="text-3xl font-mono text-green-400">{sessionData.leaderName}</div>
                <div className="text-2xl">B. Auberlen</div>
              </div>
              <div className="space-y-4">
                <div className="text-4xl font-mono">4:04.840</div>
                <div className="text-3xl font-mono text-green-400">4:04.210</div>
              </div>
            </div>
          </Card>

          <Card className="col-span-6 p-6 bg-card border-border/50 rounded-xl">
            <InputTelemetry />
          </Card>

          <Card className="col-span-10 p-6 bg-card border-border/50 rounded-xl">
            <div className="space-y-6 h-full">
              <div className="text-lg text-muted-foreground tracking-wider">RACE EVENTS & FLAGS</div>
              <div className="space-y-3">
                {raceEvents.map((event, index) => (
                  <div key={index} className="flex items-center justify-between p-4 rounded border border-border/30 bg-muted/5">
                    <div className="flex items-center gap-4">
                      <Flag className={`w-6 h-6 ${
                        event.type === 'Yellow Flag' ? 'text-yellow-500' : 
                        event.type === 'Green Flag' ? 'text-green-500' : 
                        'text-blue-500'
                      }`} />
                      <span className="text-lg font-mono tracking-wide">{event.message}</span>
                    </div>
                    <div className="text-base text-muted-foreground font-mono">{event.timestamp}</div>
                  </div>
                ))}
              </div>
              
              {/* Live Flag Status */}
              <div className={`${getFlagStyles(currentFlag.type).background} p-6 rounded border ${getFlagStyles(currentFlag.type).border} overflow-hidden`}>
                <div className="relative">
                  <div className={`text-2xl font-mono tracking-wider ${getFlagStyles(currentFlag.type).text} animate-scroll-left whitespace-nowrap`}>
                    {/* Repeat the message multiple times for continuous scroll */}
                    {Array(10).fill(currentFlag.message).join('                              ')}
                  </div>
                </div>
                <div className="text-center mt-2">
                  <div className={`text-lg opacity-80 ${getFlagStyles(currentFlag.type).text}`}>
                    {currentFlag.type === 'Green Flag' && 'RACING CONDITIONS NORMAL'}
                    {currentFlag.type === 'Yellow Flag' && 'CAUTION - SLOW DOWN'}
                    {currentFlag.type === 'Red Flag' && 'SESSION STOPPED'}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}