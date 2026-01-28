import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Flag, Thermometer, CloudRain, Sun } from 'lucide-react';
import { InputTelemetry } from './InputTelemetry';
import { DevModeTrackMap, type MapPoint, type TrackOpponent } from './DevModeTrackMap';

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

const MOCK_TRACK_OUTLINE: MapPoint[] = [
  { x: -120, y: -60 },
  { x: -60, y: -140 },
  { x: 40, y: -180 },
  { x: 180, y: -160 },
  { x: 260, y: -80 },
  { x: 300, y: 10 },
  { x: 220, y: 120 },
  { x: 80, y: 180 },
  { x: -40, y: 170 },
  { x: -160, y: 120 },
  { x: -220, y: 20 },
  { x: -200, y: -40 },
  { x: -160, y: -80 },
  { x: -120, y: -60 },
];

const MOCK_PLAYER_HISTORY: MapPoint[] = MOCK_TRACK_OUTLINE.slice(0, 9);
const MOCK_PLAYER_POSITION: MapPoint = MOCK_PLAYER_HISTORY[MOCK_PLAYER_HISTORY.length - 1];

const MOCK_OPPONENTS: TrackOpponent[] = [
  {
    id: 'ahead-1',
    driver: 'Car 27',
    position: 1,
    isAhead: true,
    gapToPlayer: 1.6,
    point: { x: 260, y: -10 },
  },
  {
    id: 'ahead-2',
    driver: 'Car 44',
    position: 2,
    isAhead: true,
    gapToPlayer: 0.6,
    point: { x: 210, y: 80 },
  },
  {
    id: 'behind-1',
    driver: 'Car 5',
    position: 4,
    isAhead: false,
    gapToPlayer: 0.9,
    point: { x: -40, y: 120 },
  },
  {
    id: 'behind-2',
    driver: 'Car 63',
    position: 5,
    isAhead: false,
    gapToPlayer: 3.4,
    point: { x: -140, y: 10 },
  },
];

export function RaceControlDashboard() {
  const [leaderboard] = useState<Driver[]>([
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

  const [raceEvents] = useState<RaceEvent[]>([
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

  useEffect(() => {
    let flagIndex = 0;
    const flagTypes = [
      { type: 'Green Flag' as const, message: 'GREEN FLAG - ALL CLEAR' },
      { type: 'Yellow Flag' as const, message: 'YELLOW FLAG - INCIDENT SECTOR 1', sector: 1 },
      { type: 'Yellow Flag' as const, message: 'YELLOW FLAG - INCIDENT SECTOR 2', sector: 2 },
      { type: 'Red Flag' as const, message: 'RED FLAG - RETURN TO PITS' },
      { type: 'Green Flag' as const, message: 'GREEN FLAG - RACING RESUMED' },
    ];

    const flagInterval = setInterval(() => {
      setCurrentFlag(flagTypes[flagIndex]);
      flagIndex = (flagIndex + 1) % flagTypes.length;
    }, 5000);

    return () => clearInterval(flagInterval);
  }, []);

  const getWeatherIcon = (weather: SessionData['weather']) => {
    switch (weather) {
      case 'Sunny':
        return <Sun className="h-5 w-5 text-yellow-400" />;
      case 'Rainy':
        return <CloudRain className="h-5 w-5 text-sky-400" />;
      case 'Overcast':
        return <CloudRain className="h-5 w-5 text-slate-300" />;
      case 'Cloudy':
      default:
        return <CloudRain className="h-5 w-5 text-slate-200" />;
    }
  };

  const getFlagStyles = (flagType: string) => {
    switch (flagType) {
      case 'Green Flag':
        return {
          background: 'bg-emerald-400/90',
          text: 'text-emerald-950',
          border: 'border-emerald-400/60',
        };
      case 'Yellow Flag':
        return {
          background: 'bg-yellow-400/90',
          text: 'text-yellow-950',
          border: 'border-yellow-400/60',
        };
      case 'Red Flag':
        return {
          background: 'bg-red-500/90',
          text: 'text-red-50',
          border: 'border-red-400/60',
        };
      default:
        return {
          background: 'bg-emerald-400/90',
          text: 'text-emerald-950',
          border: 'border-emerald-400/60',
        };
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-background text-white">
      <div className="mx-auto flex h-full max-w-[2200px] flex-col gap-3 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-zen-dots tracking-[0.6em] text-white">RACE CONTROL</h1>
            <p className="text-sm uppercase tracking-[0.35em] text-muted-foreground">Live engineering overview</p>
          </div>
          <Badge variant="outline" className="flex items-center gap-2 px-4 py-2 text-xs uppercase">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Live
          </Badge>
        </div>

        <div className="grid flex-none grid-cols-12 gap-2.5">
          <Card className="col-span-3 bg-card border-border/50">
            <div className="space-y-2.5 p-3">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Race & Position</div>
              <div className="font-zen-dots tracking-[0.3em] text-white">
                <div className="text-2xl">{sessionData.sessionType}</div>
                <div className="text-lg">Lap {sessionData.currentLap} / {sessionData.totalLaps}</div>
              </div>
              <div className="space-y-1 font-mono text-sm text-muted-foreground">
                <div>Leader <span className="text-green-400">{sessionData.leaderName}</span></div>
                <div>Gap <span className="text-yellow-400">{sessionData.leaderGap}</span></div>
              </div>
            </div>
          </Card>

          <Card className="col-span-2 bg-card border-border/50">
            <div className="space-y-2.5 p-3">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Time Left</div>
              <div className="text-3xl font-mono text-yellow-400">{sessionData.timeRemaining}</div>
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Last Lap</div>
              <div className="text-xl font-mono">{leaderboard[0].lastLap}</div>
            </div>
          </Card>

          <Card className="col-span-2 bg-card border-border/50">
            <div className="space-y-2.5 p-3">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Best Lap</div>
              <div className="text-3xl font-mono text-green-400">{leaderboard[3].bestLap}</div>
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Overall Best</div>
              <div className="text-xl font-mono text-purple-400">{sessionData.overallBest}</div>
            </div>
          </Card>

          <Card className="col-span-2 bg-card border-border/50">
            <div className="space-y-2.5 p-3">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Track Info</div>
              <div className="text-lg font-semibold text-white">{sessionData.trackName}</div>
              <div className="text-sm text-muted-foreground">Condition <span className="text-emerald-300">{sessionData.trackCondition}</span></div>
              <div className="text-sm text-muted-foreground">Session <span className="font-mono">{sessionData.sessionTime}</span></div>
            </div>
          </Card>

          <Card className="col-span-2 bg-card border-border/50">
            <div className="space-y-2.5 p-3">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Track Temp</div>
              <div className="flex items-center gap-2 text-xl font-mono text-amber-300">
                <Thermometer className="h-5 w-5" />
                {sessionData.trackTemp}°C
              </div>
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Weather</div>
              <div className="flex items-center gap-2 text-lg">
                {getWeatherIcon(sessionData.weather)}
                <span className="font-mono">{sessionData.weather}</span>
              </div>
            </div>
          </Card>

          <Card className="col-span-1 bg-card border-border/50">
            <div className="space-y-1.5 p-3 text-xs font-mono text-muted-foreground">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Systems</div>
              <div>Wind <span className="text-sky-300">{sessionData.windSpeed} km/h</span></div>
              <div>Humidity <span className="text-sky-300">{sessionData.humidity}%</span></div>
              <div>Air {sessionData.airTemp}°C</div>
            </div>
          </Card>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-12 gap-2.5">
          <Card className="col-span-6 flex h-full flex-col bg-card border-border/50">
            <div className="flex items-center justify-between px-4 pt-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Leaderboard</div>
                <div className="text-xl font-zen-dots tracking-[0.3em] text-white">Race Status</div>
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-12 gap-3 px-4 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              <div className="col-span-1 text-center">Pos</div>
              <div className="col-span-4">Driver</div>
              <div className="col-span-1 text-right">Gap</div>
              <div className="col-span-2 text-right">Last</div>
              <div className="col-span-2 text-right">Best</div>
              <div className="col-span-1 text-center">Tyre</div>
              <div className="col-span-1 text-center">Pts</div>
            </div>
            <div className="flex-1 overflow-auto px-4 pb-3 pr-3">
              <div className="space-y-3">
                {leaderboard.map((driver) => (
                  <div
                    key={driver.position}
                    className={`grid grid-cols-12 items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2 transition-colors hover:border-primary/50 ${
                      driver.position === 1 ? 'shadow-[0_0_12px_rgba(34,197,94,0.12)]' : ''
                    }`}
                  >
                    <div className="col-span-1 text-center font-mono text-sm text-muted-foreground">
                      {driver.position.toString().padStart(2, '0')}
                    </div>
                    <div className="col-span-4 flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-mono border ${
                          driver.team === 'Mercedes'
                            ? 'bg-gradient-to-br from-slate-900 to-emerald-900 border-emerald-500/80 text-emerald-200'
                            : driver.team === 'Red Bull'
                              ? 'bg-gradient-to-br from-blue-900 to-amber-900 border-amber-400/70 text-amber-100'
                              : driver.team === 'Ferrari'
                                ? 'bg-gradient-to-br from-gray-900 to-red-900 border-red-500/70 text-red-100'
                                : 'bg-card border-border/50 text-muted-foreground'
                        }`}
                      >
                        {driver.name.split(' ').map((part) => part[0]).join('')}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{driver.name}</div>
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{driver.team}</div>
                      </div>
                    </div>
                    <div
                      className={`col-span-1 text-right font-mono text-xs ${
                        driver.gap === 'LEADER'
                          ? 'text-green-400'
                          : driver.gap.includes('+')
                            ? 'text-yellow-400'
                            : 'text-blue-400'
                      }`}
                    >
                      {driver.gap}
                    </div>
                    <div className="col-span-2 text-right font-mono text-xs text-muted-foreground">{driver.lastLap}</div>
                    <div className="col-span-2 text-right font-mono text-xs text-green-400">{driver.bestLap}</div>
                    <div className="col-span-1 text-center">
                      <Badge
                        variant="outline"
                        className={`px-2 py-0.5 text-[10px] font-mono uppercase border ${
                          driver.tyreCompound === 'Soft'
                            ? 'border-red-500/50 text-red-300 bg-red-500/10'
                            : driver.tyreCompound === 'Medium'
                              ? 'border-yellow-500/50 text-yellow-300 bg-yellow-500/10'
                              : driver.tyreCompound === 'Hard'
                                ? 'border-blue-500/50 text-blue-300 bg-blue-500/10'
                                : driver.tyreCompound === 'Intermediate'
                                  ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
                                  : 'border-sky-500/50 text-sky-300 bg-sky-500/10'
                        }`}
                      >
                        {driver.tyreCompound}
                      </Badge>
                    </div>
                    <div className="col-span-1 text-center font-mono text-xs text-muted-foreground">{driver.points}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="col-span-6 flex h-full flex-col bg-card border-border/50">
            <div className="flex flex-col gap-3.5 p-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{sessionData.trackName}</div>
                <Badge variant="outline" className="text-xs uppercase">Telemetry Mock</Badge>
              </div>
              <div className="relative rounded border border-border/40 bg-card/60 p-3">
                <div className="h-48">
                  <DevModeTrackMap
                    trackOutline={MOCK_TRACK_OUTLINE}
                    playerHistory={MOCK_PLAYER_HISTORY}
                    playerPosition={MOCK_PLAYER_POSITION}
                    opponents={MOCK_OPPONENTS}
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 px-4 pb-3">
              <Card className="bg-card/60 border-border/40 p-3">
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground text-center">Throttle</div>
                <div className="mt-2 text-center text-3xl font-mono text-white">{Math.round(telemetryData.throttle)}%</div>
                <Progress value={telemetryData.throttle} className="mt-2.5 h-3 bg-muted [&>div]:bg-green-500" />
              </Card>
              <Card className="bg-card/60 border-border/40 p-3 text-center">
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Gear / RPM</div>
                <div className="text-5xl font-mono text-primary">{telemetryData.gear}</div>
                <div className="text-xl font-mono text-muted-foreground">{Math.round(telemetryData.rpm)}</div>
                <div className="text-sm font-mono text-muted-foreground">{Math.round(telemetryData.speed)} km/h</div>
              </Card>
              <Card className="bg-card/60 border-border/40 p-3">
                <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground text-center">Systems</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs font-mono text-muted-foreground">
                  <div className="rounded bg-muted/10 p-2">TC {telemetryData.tc}</div>
                  <div className="rounded bg-muted/10 p-2">ABS {telemetryData.abs}</div>
                  <div className="rounded bg-muted/10 p-2">BB {telemetryData.brakeBalance}</div>
                  <div className="rounded bg-muted/10 p-2">ERS {Math.round(telemetryData.ersDeployment)}%</div>
                </div>
              </Card>
            </div>
          </Card>
        </div>

        <div className="grid flex-none grid-cols-12 gap-2.5">
          <Card className="col-span-4 bg-card border-border/50">
            <div className="flex h-full flex-col justify-between p-3.5">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Race Director</div>
              <div className="space-y-3">
                <div className="text-4xl font-mono text-white">{sessionData.leaderGap}</div>
                <div className="text-2xl font-mono text-green-400">{sessionData.leaderName}</div>
              </div>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <div>Clerk <span className="text-white">B. Auberlen</span></div>
                <div>Latest Call <span className="text-yellow-400">Maintain delta, track clear</span></div>
              </div>
            </div>
          </Card>

          <Card className="col-span-4 bg-card border-border/50">
            <div className="h-full p-3">
              <div className="mb-4 text-xs uppercase tracking-[0.3em] text-muted-foreground">Input Telemetry</div>
              <InputTelemetry />
            </div>
          </Card>

          <Card className="col-span-4 flex h-full flex-col bg-card border-border/50">
            <div className="px-3 pt-3">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Race Events & Flags</div>
            </div>
            <div className="flex-1 overflow-auto px-3 pb-3 pr-3">
              <div className="space-y-2">
                {raceEvents.map((event, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded border border-border/30 bg-muted/5 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <Flag className={`h-5 w-5 ${
                        event.type === 'Yellow Flag'
                          ? 'text-yellow-500'
                          : event.type === 'Green Flag'
                            ? 'text-green-500'
                            : 'text-blue-500'
                      }`} />
                      <span className="font-mono text-xs tracking-wide">{event.message}</span>
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">{event.timestamp}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`mx-4 mb-4 rounded border px-3 py-2 text-center font-mono text-sm ${getFlagStyles(currentFlag.type).background} ${getFlagStyles(currentFlag.type).border} ${getFlagStyles(currentFlag.type).text}`}>
              {currentFlag.message}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
