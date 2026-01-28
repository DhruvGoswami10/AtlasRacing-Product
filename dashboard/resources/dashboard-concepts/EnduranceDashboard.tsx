import { useState, useEffect } from 'react';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { Lightbulb } from 'lucide-react';

interface EnduranceTelemetryData {
  speed: number;
  rpm: number;
  gear: string;
  throttle: number;
  brake: number;
  currentLapTime: string;
  estimatedLapTime: string;
  lastLapTime: string;
  bestLapTime: string;
  delta: number;
  position: number;
  lapNumber: number;
  totalLaps: number;
  fuelRemaining: number;
  fuelTotal: number;
  fuelLapsRemaining: number;
  maxRpm: number;
  
  // Car settings
  tc: number;
  tcCut: number;
  abs: number;
  brakeBalance: number;
  engineMap: number;
  
  // Tyre data
  tyres: {
    frontLeft: { tempInner: number; tempMiddle: number; tempOuter: number; pressure: number; wear: number };
    frontRight: { tempInner: number; tempMiddle: number; tempOuter: number; pressure: number; wear: number };
    rearLeft: { tempInner: number; tempMiddle: number; tempOuter: number; pressure: number; wear: number };
    rearRight: { tempInner: number; tempMiddle: number; tempOuter: number; pressure: number; wear: number };
    compound: 'Dry' | 'Wet';
  };
  
  // Vehicle damage (simplified)
  damage: {
    frontWing: number;
    rearWing: number;
    suspension: number;
    engine: number;
    transmission: number;
  };
}

type DashboardType = 'main' | 'tyres' | 'damage' | 'meme';

interface FlagData {
  type: 'Green Flag' | 'Yellow Flag' | 'Red Flag';
  active: boolean;
}

export function EnduranceDashboard() {
  const [currentDash, setCurrentDash] = useState<DashboardType>('main');
  const [telemetry, setTelemetry] = useState<EnduranceTelemetryData>({
    speed: 287,
    rpm: 8650,
    gear: "5",
    throttle: 92,
    brake: 0,
    currentLapTime: "2:34.567",
    estimatedLapTime: "2:33.890",
    lastLapTime: "2:34.123",
    bestLapTime: "2:32.456",
    delta: +0.234,
    position: 4,
    lapNumber: 57,
    totalLaps: 105,
    fuelRemaining: 45.8,
    fuelTotal: 120,
    fuelLapsRemaining: 23,
    maxRpm: 9500,
    
    tc: 3,
    tcCut: 7,
    abs: 2,
    brakeBalance: 58.5,
    engineMap: 4,
    
    tyres: {
      frontLeft: { tempInner: 87, tempMiddle: 94, tempOuter: 89, pressure: 26.3, wear: 15.2 },
      frontRight: { tempInner: 91, tempMiddle: 97, tempOuter: 92, pressure: 26.1, wear: 16.1 },
      rearLeft: { tempInner: 82, tempMiddle: 88, tempOuter: 85, pressure: 24.8, wear: 12.3 },
      rearRight: { tempInner: 84, tempMiddle: 90, tempOuter: 87, pressure: 24.9, wear: 13.1 },
      compound: 'Dry'
    },
    
    damage: {
      frontWing: 98,
      rearWing: 100,
      suspension: 95,
      engine: 100,
      transmission: 99
    }
  });

  const [flagStatus, setFlagStatus] = useState<FlagData>({
    type: 'Green Flag',
    active: false
  });

  // Simulate real-time telemetry updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry(prev => ({
        ...prev,
        speed: Math.max(50, Math.min(320, prev.speed + (Math.random() - 0.5) * 25)),
        rpm: Math.max(2000, Math.min(9500, prev.rpm + (Math.random() - 0.5) * 600)),
        gear: Math.random() > 0.9 ? String(Math.max(1, Math.min(6, parseInt(prev.gear) + Math.floor((Math.random() - 0.5) * 2)))) : prev.gear,
        throttle: Math.max(0, Math.min(100, prev.throttle + (Math.random() - 0.5) * 40)),
        brake: Math.max(0, Math.min(100, prev.brake + (Math.random() - 0.5) * 30)),
        delta: prev.delta + (Math.random() - 0.5) * 0.05,
        fuelRemaining: Math.max(0, prev.fuelRemaining - Math.random() * 0.02),
        
        tyres: {
          ...prev.tyres,
          frontLeft: {
            ...prev.tyres.frontLeft,
            tempInner: Math.max(70, Math.min(110, prev.tyres.frontLeft.tempInner + (Math.random() - 0.5) * 3)),
            tempMiddle: Math.max(70, Math.min(110, prev.tyres.frontLeft.tempMiddle + (Math.random() - 0.5) * 3)),
            tempOuter: Math.max(70, Math.min(110, prev.tyres.frontLeft.tempOuter + (Math.random() - 0.5) * 3)),
          },
          frontRight: {
            ...prev.tyres.frontRight,
            tempInner: Math.max(70, Math.min(110, prev.tyres.frontRight.tempInner + (Math.random() - 0.5) * 3)),
            tempMiddle: Math.max(70, Math.min(110, prev.tyres.frontRight.tempMiddle + (Math.random() - 0.5) * 3)),
            tempOuter: Math.max(70, Math.min(110, prev.tyres.frontRight.tempOuter + (Math.random() - 0.5) * 3)),
          },
          rearLeft: {
            ...prev.tyres.rearLeft,
            tempInner: Math.max(70, Math.min(110, prev.tyres.rearLeft.tempInner + (Math.random() - 0.5) * 3)),
            tempMiddle: Math.max(70, Math.min(110, prev.tyres.rearLeft.tempMiddle + (Math.random() - 0.5) * 3)),
            tempOuter: Math.max(70, Math.min(110, prev.tyres.rearLeft.tempOuter + (Math.random() - 0.5) * 3)),
          },
          rearRight: {
            ...prev.tyres.rearRight,
            tempInner: Math.max(70, Math.min(110, prev.tyres.rearRight.tempInner + (Math.random() - 0.5) * 3)),
            tempMiddle: Math.max(70, Math.min(110, prev.tyres.rearRight.tempMiddle + (Math.random() - 0.5) * 3)),
            tempOuter: Math.max(70, Math.min(110, prev.tyres.rearRight.tempOuter + (Math.random() - 0.5) * 3)),
          },
        }
      }));
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // Simulate flag changes
  useEffect(() => {
    const flagInterval = setInterval(() => {
      const random = Math.random();
      if (random < 0.1) { // 10% chance of flag change
        const flags: FlagData['type'][] = ['Green Flag', 'Yellow Flag', 'Red Flag'];
        const randomFlag = flags[Math.floor(Math.random() * flags.length)];
        setFlagStatus({ type: randomFlag, active: true });
        
        // Auto-clear flags after some time
        setTimeout(() => {
          setFlagStatus(prev => ({ ...prev, active: false }));
        }, randomFlag === 'Red Flag' ? 8000 : randomFlag === 'Yellow Flag' ? 5000 : 3000);
      }
    }, 4000);

    return () => clearInterval(flagInterval);
  }, []);

  // Generate animated RPM LEDs (15 total, edges to center progression)
  const generateRPMLeds = () => {
    const leds = [];
    const rpmPercentage = (telemetry.rpm / telemetry.maxRpm) * 100;
    const totalLeds = 15;
    const centerIndex = Math.floor(totalLeds / 2); // Index 7 is center
    
    // Calculate how many "layers" from edges should be lit
    // Each layer lights up both left and right simultaneously 
    const maxLayers = centerIndex + 1; // 8 layers total (0-6 from edges + center)
    const activeLayers = Math.round((rpmPercentage / 100) * maxLayers);

    for (let i = 0; i < totalLeds; i++) {
      const edgeDistance = Math.min(i, totalLeds - 1 - i); // Distance from nearest edge
      const isActive = edgeDistance < activeLayers;
      
      let color = 'bg-gray-800/50';
      if (isActive) {
        // Color progression from edges to center: green -> yellow -> red -> purple
        if (edgeDistance <= 2) color = 'bg-green-500';       // Edges: green
        else if (edgeDistance <= 4) color = 'bg-yellow-500'; // Moving in: yellow
        else if (edgeDistance <= 6) color = 'bg-red-500';    // Near center: red
        else color = 'bg-purple-500';                        // Center: purple
      }
      
      leds.push(
        <div 
          key={i} 
          className={`w-8 h-5 rounded-sm ${color} border border-gray-700 transition-all duration-150`}
        ></div>
      );
    }
    return leds;
  };

  const getTireBarColor = (temp: number) => {
    if (temp < 80) return 'bg-blue-500'; // Cold
    if (temp >= 80 && temp <= 100) return 'bg-green-500'; // Optimal
    return 'bg-red-500'; // Hot
  };

  const cycleDashboard = () => {
    const dashOrder: DashboardType[] = ['main', 'tyres', 'damage', 'meme'];
    const currentIndex = dashOrder.indexOf(currentDash);
    const nextIndex = (currentIndex + 1) % dashOrder.length;
    setCurrentDash(dashOrder[nextIndex]);
  };

  const getFlagLEDColor = (flagType: FlagData['type'], active: boolean) => {
    if (!active) return 'bg-gray-600';
    switch (flagType) {
      case 'Green Flag': return 'bg-green-500 animate-pulse';
      case 'Yellow Flag': return 'bg-yellow-500 animate-pulse';
      case 'Red Flag': return 'bg-red-500 animate-pulse';
      default: return 'bg-gray-600';
    }
  };

  const renderTyreSection = (
    position: 'FL' | 'FR' | 'RL' | 'RR',
    tyreData: { tempInner: number; tempMiddle: number; tempOuter: number; pressure: number; wear: number }
  ) => {
    return (
      <div className="text-center space-y-3">
        {/* Tyre Label */}
        <div className="text-2xl text-green-400 mb-4">{position}</div>
        
        {/* Tyre Graphic - Simple rounded rectangle representing tyre */}
        <div className="mx-auto mb-4">
          <div className="w-16 h-24 bg-gray-800 border-2 border-gray-600 rounded-lg relative overflow-hidden">
            {/* Tyre sidewall details */}
            <div className="absolute inset-1 bg-gray-700 rounded"></div>
            <div className="absolute top-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
            <div className="absolute bottom-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
            {/* Tread pattern */}
            <div className="absolute inset-x-2 top-4 bottom-4 flex flex-col justify-between">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-0.5 bg-gray-400 rounded"></div>
              ))}
            </div>
          </div>
        </div>

        {/* Tyre Pressure */}
        <div className="text-xl font-mono text-cyan-400 mb-2">
          {tyreData.pressure.toFixed(1)} PSI
        </div>

        {/* Tyre Wear */}
        <div className="text-lg font-mono text-red-400 mb-2">
          {tyreData.wear.toFixed(1)}% WEAR
        </div>

        {/* 3-Zone Temperatures */}
        <div className="flex justify-center gap-1 text-sm font-mono">
          <span className={`px-2 py-1 rounded ${getTireBarColor(tyreData.tempInner)} text-black`}>
            {Math.round(tyreData.tempInner)}
          </span>
          <span className={`px-2 py-1 rounded ${getTireBarColor(tyreData.tempMiddle)} text-black`}>
            {Math.round(tyreData.tempMiddle)}
          </span>
          <span className={`px-2 py-1 rounded ${getTireBarColor(tyreData.tempOuter)} text-black`}>
            {Math.round(tyreData.tempOuter)}
          </span>
        </div>
      </div>
    );
  };

  const renderDashboard = () => {
    switch (currentDash) {
      case 'main':
        return (
          <div className="h-full flex items-center justify-center px-8">
            <div className="grid grid-cols-5 gap-12 w-full h-full">
              {/* Left side - Current Lap Time, Estimated Time, Delta */}
              <div className="col-span-1 flex flex-col justify-center space-y-12">
                <div className="text-center">
                  <div className="text-lg text-gray-400 mb-4 tracking-wider">CURRENT</div>
                  <div className="text-5xl font-mono text-white">{telemetry.currentLapTime}</div>
                </div>
                
                <div className="text-center">
                  <div className="text-lg text-gray-400 mb-4 tracking-wider">ESTIMATED</div>
                  <div className="text-4xl font-mono text-blue-400">{telemetry.estimatedLapTime}</div>
                </div>
                
                <div className="text-center">
                  <div className="text-lg text-gray-400 mb-4 tracking-wider">DELTA</div>
                  <div className={`text-4xl font-mono ${telemetry.delta < 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {telemetry.delta > 0 ? '+' : ''}{telemetry.delta.toFixed(3)}
                  </div>
                </div>
              </div>

              {/* Center - Big Gear with Speed on top */}
              <div className="col-span-3 flex flex-col items-center justify-center space-y-8 mt-[0px] mr-[50px] mb-[0px] ml-[-50px]">
                <div className="text-center">
                  <div className="text-7xl font-mono text-gray-300 mb-6">{Math.round(telemetry.speed)} KM/H</div>
                </div>
                
                <div className="text-center">
                  <div className="text-[18rem] font-black text-white leading-none">
                    {telemetry.gear}
                  </div>
                </div>
              </div>

              {/* Right side - Lap info, Position, Fuel */}
              <div className="col-span-1 flex flex-col justify-center space-y-12 mr-[120px] mt-[0px] mb-[0px] ml-[-100px]">
                <div className="text-center">
                  <div className="text-lg text-gray-400 mb-4 tracking-wider">LAP</div>
                  <div className="text-5xl font-mono text-white">{telemetry.lapNumber}/{telemetry.totalLaps}</div>
                </div>
                
                <div className="text-center">
                  <div className="text-lg text-gray-400 mb-4 tracking-wider">POS</div>
                  <div className="text-7xl font-mono text-yellow-400">P{telemetry.position}</div>
                </div>
                
                <div className="text-center">
                  <div className="text-lg text-blue-400 mb-4 tracking-wider">FUEL</div>
                  <div className="text-4xl font-mono text-blue-400">{telemetry.fuelRemaining.toFixed(1)}L</div>
                  <div className="text-2xl font-mono text-blue-400 mt-2">{telemetry.fuelTotal}L</div>
                  <div className="text-lg text-gray-400 mt-2">{telemetry.fuelLapsRemaining} LAPS</div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'tyres':
        return (
          <div className="h-full grid grid-cols-5 gap-6 p-6">
            {/* Left side - FL, RL */}
            <div className="col-span-2 space-y-8">
              {/* Front Left */}
              <div className="text-center space-y-3">
                {/* Tyre Label */}
                <div className="text-2xl text-green-400 mb-4">FL</div>
                
                {/* Tyre Graphic - Simple rounded rectangle representing tyre */}
                <div className="mx-auto mb-4">
                  <div className="w-16 h-24 bg-gray-800 border-2 border-gray-600 rounded-lg relative overflow-hidden mr-[234px] mr-[3203987654329876543210px] m-[0px] mt-[0px] mr-[0px] mb-[0px] ml-[220px]">
                    {/* Tyre sidewall details */}
                    <div className="absolute inset-1 bg-gray-700 rounded"></div>
                    <div className="absolute top-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
                    <div className="absolute bottom-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
                    {/* Tread pattern */}
                    <div className="absolute inset-x-2 top-4 bottom-4 flex flex-col justify-between">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-0.5 bg-gray-400 rounded"></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tyre Pressure */}
                <div className="text-xl font-mono text-cyan-400 mb-2">
                  {telemetry.tyres.frontLeft.pressure.toFixed(1)} PSI
                </div>

                {/* Tyre Wear */}
                <div className="text-lg font-mono text-red-400 mb-2">
                  {telemetry.tyres.frontLeft.wear.toFixed(1)}% WEAR
                </div>

                {/* 3-Zone Temperatures */}
                <div className="flex justify-center gap-1 text-sm font-mono">
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.frontLeft.tempInner)} text-black`}>
                    {Math.round(telemetry.tyres.frontLeft.tempInner)}
                  </span>
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.frontLeft.tempMiddle)} text-black`}>
                    {Math.round(telemetry.tyres.frontLeft.tempMiddle)}
                  </span>
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.frontLeft.tempOuter)} text-black`}>
                    {Math.round(telemetry.tyres.frontLeft.tempOuter)}
                  </span>
                </div>
              </div>

              {/* Rear Left */}
              <div className="text-center space-y-3 mt-[115px] mr-[0px] mb-[0px] ml-[0px]">
                {/* Tyre Label */}
                <div className="text-2xl text-green-400 mb-4">RL</div>
                
                {/* Tyre Graphic - Simple rounded rectangle representing tyre */}
                <div className="mx-auto mb-4">
                  <div className="w-16 h-24 bg-gray-800 border-2 border-gray-600 rounded-lg relative overflow-hidden mt-[0px] mr-[0px] mb-[0px] ml-[8765434320309876529876 ml-[220px] ml-[90px]543210px]">
                    {/* Tyre sidewall details */}
                    <div className="absolute inset-1 bg-gray-700 rounded"></div>
                    <div className="absolute top-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
                    <div className="absolute bottom-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
                    {/* Tread pattern */}
                    <div className="absolute inset-x-2 top-4 bottom-4 flex flex-col justify-between">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-0.5 bg-gray-400 rounded"></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tyre Pressure */}
                <div className="text-xl font-mono text-cyan-400 mb-2">
                  {telemetry.tyres.rearLeft.pressure.toFixed(1)} PSI
                </div>

                {/* Tyre Wear */}
                <div className="text-lg font-mono text-red-400 mb-2">
                  {telemetry.tyres.rearLeft.wear.toFixed(1)}% WEAR
                </div>

                {/* 3-Zone Temperatures */}
                <div className="flex justify-center gap-1 text-sm font-mono">
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.rearLeft.tempInner)} text-black`}>
                    {Math.round(telemetry.tyres.rearLeft.tempInner)}
                  </span>
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.rearLeft.tempMiddle)} text-black`}>
                    {Math.round(telemetry.tyres.rearLeft.tempMiddle)}
                  </span>
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.rearLeft.tempOuter)} text-black`}>
                    {Math.round(telemetry.tyres.rearLeft.tempOuter)}
                  </span>
                </div>
              </div>
            </div>

            {/* Center - Gear and Speed */}
            <div className="col-span-1 flex flex-col items-center justify-center space-y-8">
              <div className="text-center">
                <div className="text-7xl font-mono text-gray-300">{Math.round(telemetry.speed)}</div>
                <div className="text-sm text-gray-400">KM/H</div>
              </div>
              
              <div className="text-center">
                <div className="text-[18rem] font-black text-white leading-none">{telemetry.gear}</div>
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-mono text-yellow-400">{telemetry.tyres.compound}</div>
                <div className="text-sm text-gray-400">COMPOUND</div>
              </div>
            </div>

            {/* Right side - FR, RR */}
            <div className="col-span-2 space-y-8">
              {/* Front Right */}
              <div className="text-center space-y-3">
                {/* Tyre Label */}
                <div className="text-2xl text-green-400 mb-4">FR</div>
                
                {/* Tyre Graphic - Simple rounded rectangle representing tyre */}
                <div className="mx-auto mb-4">
                  <div className="w-16 h-24 bg-gray-800 border-2 border-gray-600 rounded-lg relative overflow-hidden mt-[0px] mr-[0px] mb-[0px] ml-[222px]">
                    {/* Tyre sidewall details */}
                    <div className="absolute inset-1 bg-gray-700 rounded"></div>
                    <div className="absolute top-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
                    <div className="absolute bottom-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
                    {/* Tread pattern */}
                    <div className="absolute inset-x-2 top-4 bottom-4 flex flex-col justify-between">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-0.5 bg-gray-400 rounded"></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tyre Pressure */}
                <div className="text-xl font-mono text-cyan-400 mb-2">
                  {telemetry.tyres.frontRight.pressure.toFixed(1)} PSI
                </div>

                {/* Tyre Wear */}
                <div className="text-lg font-mono text-red-400 mb-2">
                  {telemetry.tyres.frontRight.wear.toFixed(1)}% WEAR
                </div>

                {/* 3-Zone Temperatures */}
                <div className="flex justify-center gap-1 text-sm font-mono">
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.frontRight.tempInner)} text-black`}>
                    {Math.round(telemetry.tyres.frontRight.tempInner)}
                  </span>
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.frontRight.tempMiddle)} text-black`}>
                    {Math.round(telemetry.tyres.frontRight.tempMiddle)}
                  </span>
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.frontRight.tempOuter)} text-black`}>
                    {Math.round(telemetry.tyres.frontRight.tempOuter)}
                  </span>
                </div>
              </div>

              {/* Rear Right */}
              <div className="text-center space-y-3 mt-[115px] mr-[0px] mb-[0px] ml-[0px]">
                {/* Tyre Label */}
                <div className="text-2xl text-green-400 mb-4">RR</div>
                
                {/* Tyre Graphic - Simple rounded rectangle representing tyre */}
                <div className="mx-auto mb-4">
                  <div className="w-16 h-24 bg-gray-800 border-2 border-gray-600 rounded-lg relative overflow-hidden mt-[0px] mr-[0px] mb-[0px] ml-[222px]">
                    {/* Tyre sidewall details */}
                    <div className="absolute inset-1 bg-gray-700 rounded"></div>
                    <div className="absolute top-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
                    <div className="absolute bottom-2 left-2 right-2 h-1 bg-gray-500 rounded"></div>
                    {/* Tread pattern */}
                    <div className="absolute inset-x-2 top-4 bottom-4 flex flex-col justify-between">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-0.5 bg-gray-400 rounded"></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tyre Pressure */}
                <div className="text-xl font-mono text-cyan-400 mb-2">
                  {telemetry.tyres.rearRight.pressure.toFixed(1)} PSI
                </div>

                {/* Tyre Wear */}
                <div className="text-lg font-mono text-red-400 mb-2">
                  {telemetry.tyres.rearRight.wear.toFixed(1)}% WEAR
                </div>

                {/* 3-Zone Temperatures */}
                <div className="flex justify-center gap-1 text-sm font-mono">
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.rearRight.tempInner)} text-black`}>
                    {Math.round(telemetry.tyres.rearRight.tempInner)}
                  </span>
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.rearRight.tempMiddle)} text-black`}>
                    {Math.round(telemetry.tyres.rearRight.tempMiddle)}
                  </span>
                  <span className={`px-2 py-1 rounded ${getTireBarColor(telemetry.tyres.rearRight.tempOuter)} text-black`}>
                    {Math.round(telemetry.tyres.rearRight.tempOuter)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'damage':
        return (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-8">
              <div className="text-6xl font-mono text-gray-500 mb-8">VEHICLE DAMAGE</div>
              
              <div className="grid grid-cols-2 gap-8 text-3xl font-mono">
                <div className="text-center">
                  <div className="text-lg text-gray-400 mb-2">FRONT WING</div>
                  <div className={`${telemetry.damage.frontWing < 90 ? 'text-red-400' : 'text-green-400'}`}>
                    {telemetry.damage.frontWing}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg text-gray-400 mb-2">REAR WING</div>
                  <div className={`${telemetry.damage.rearWing < 90 ? 'text-red-400' : 'text-green-400'}`}>
                    {telemetry.damage.rearWing}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg text-gray-400 mb-2">SUSPENSION</div>
                  <div className={`${telemetry.damage.suspension < 90 ? 'text-red-400' : 'text-green-400'}`}>
                    {telemetry.damage.suspension}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg text-gray-400 mb-2">ENGINE</div>
                  <div className={`${telemetry.damage.engine < 90 ? 'text-red-400' : 'text-green-400'}`}>
                    {telemetry.damage.engine}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'meme':
        return (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center space-y-12">
              <div className="text-5xl font-mono text-yellow-400 leading-relaxed">
                "USE THE BRAKES FFS<br />
                IF YOU DON'T WISH TO<br />
                MEET AYRTON SENNA"
              </div>
              
              <div className="text-3xl font-mono text-gray-400">
                - Every Race Engineer Ever
              </div>
          
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white p-6 relative">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6">
          <h1 className="text-3xl tracking-tight text-white/90">ENDURANCE DASHBOARD</h1>
          <div className="h-0.5 w-40 bg-white mt-2"></div>
        </div>
        
        <div className="flex items-center justify-center min-h-[calc(100vh-220px)]">
          <div className="relative">
            
            {/* ATLAS RACING Header - Outside DDU */}
            <div className="text-center mb-8">
              <div className="text-4xl font-bold text-white" style={{ letterSpacing: '0.5em' }}>ATLAS RACING</div>
            </div>

            {/* Flag LEDs - Vertical on Left Side */}
            <div className="absolute -left-12 top-24 flex flex-col gap-4">
              {[1, 2, 3].map(i => (
                <div 
                  key={`left-${i}`} 
                  className={`w-5 h-5 rounded-full ${getFlagLEDColor(flagStatus.type, flagStatus.active)} border border-gray-600`}
                ></div>
              ))}
            </div>

            {/* Flag LEDs - Vertical on Right Side */}
            <div className="absolute -right-12 top-24 flex flex-col gap-4">
              {[1, 2, 3].map(i => (
                <div 
                  key={`right-${i}`} 
                  className={`w-5 h-5 rounded-full ${getFlagLEDColor(flagStatus.type, flagStatus.active)} border border-gray-600`}
                ></div>
              ))}
            </div>

            {/* DDU Screen Container - Fixed Size */}
            <div className="bg-[#000000] border-4 border-gray-700 rounded-3xl relative overflow-hidden p-[40px] w-[1400px] h-[800px]">

              {/* RPM LEDs at the top */}
              <div className="flex justify-center gap-2 mb-12 relative z-10">
                {generateRPMLeds()}
              </div>

              {/* Headlight symbol - Top Right (Always visible) */}
              <div className="absolute top-8 right-8">
                <Lightbulb className="w-10 h-10 text-yellow-400" />
              </div>

              {/* Main Dashboard Content Area - Fixed Height */}
              <div className="relative h-[580px]">
                {renderDashboard()}
              </div>

              {/* Fixed Settings Panel - Right Side */}
              <div className="absolute right-6 top-1/2 transform -translate-y-1/2 space-y-6">
                <div className="text-center p-4 bg-blue-600/20 rounded-lg border border-blue-500 min-w-[80px]">
                  <div className="text-sm text-blue-400 font-mono">TC</div>
                  <div className="text-3xl font-mono text-blue-400">{telemetry.tc}</div>
                </div>
                <div className="text-center p-4 bg-blue-600/20 rounded-lg border border-blue-500 min-w-[80px]">
                  <div className="text-sm text-blue-400 font-mono">TC CUT</div>
                  <div className="text-2xl font-mono text-blue-400">{telemetry.tcCut}</div>
                </div>
                <div className="text-center p-4 bg-yellow-600/20 rounded-lg border border-yellow-500 min-w-[80px]">
                  <div className="text-sm text-yellow-400 font-mono">ABS</div>
                  <div className="text-3xl font-mono text-yellow-400">{telemetry.abs}</div>
                </div>
                <div className="text-center p-4 bg-red-600/20 rounded-lg border border-red-500 min-w-[80px]">
                  <div className="text-sm text-red-400 font-mono">BB</div>
                  <div className="text-xl font-mono text-red-400">{telemetry.brakeBalance.toFixed(1)}</div>
                </div>
                <div className="text-center p-4 bg-green-600/20 rounded-lg border border-green-500 min-w-[80px]">
                  <div className="text-sm text-green-400 font-mono">MAP</div>
                  <div className="text-3xl font-mono text-green-400">{telemetry.engineMap}</div>
                </div>
              </div>
            </div>

            {/* Circular Dashboard Switcher Button - Below DDU */}
            <div className="flex justify-center mt-8">
              <Button
                onClick={cycleDashboard}
                className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-700 border-4 border-white shadow-lg transform hover:scale-105 transition-all duration-200"
                size="sm"
              >
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}