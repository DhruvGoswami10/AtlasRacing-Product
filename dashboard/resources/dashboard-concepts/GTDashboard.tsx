import { useState, useEffect } from 'react';

interface GTDashboardProps {}

export function GTDashboard({}: GTDashboardProps) {
  const [telemetryData, setTelemetryData] = useState({
    speed: 0,
    rpm: 0,
    maxRpm: 8000,
    gear: 'N',
    throttle: 0,
    brake: 0,
    turboPresure: 0.0,
    oilPressure: 0.0,
    fuelLevel: 0.0,
    fuelPerLap: 0.0,
    fuelLastLap: 0.0,
    lapsOfFuel: 0.0,
    tyreTemps: {
      frontLeft: 0,
      frontRight: 0,
      rearLeft: 0,
      rearRight: 0,
    },
    // Car settings
    tractionControl: 2,
    brakeBalance: 62,
    abs: 3,
    engineMap: 1,
    lapTime: '00:00.000',
    bestLap: '00:00.000',
    timeDiff: '0.000',
    sessionTime: '00:00.0',
    currentLap: 1,
    trackCondition: 'DRY',
    session: 'RACE 1',
  });

  // Simulate telemetry data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryData(prev => ({
        ...prev,
        speed: Math.floor(Math.random() * 300),
        rpm: Math.floor(Math.random() * prev.maxRpm),
        gear: Math.random() > 0.1 ? Math.floor(Math.random() * 6 + 1).toString() : 'N',
        throttle: Math.floor(Math.random() * 100),
        brake: Math.floor(Math.random() * 100),
        turboPresure: parseFloat((Math.random() * 2).toFixed(1)),
        oilPressure: parseFloat((Math.random() * 5).toFixed(1)),
        fuelLevel: parseFloat((50 + Math.random() * 50).toFixed(1)),
        fuelPerLap: parseFloat((2 + Math.random() * 3).toFixed(1)),
        fuelLastLap: parseFloat((2 + Math.random() * 3).toFixed(1)),
        lapsOfFuel: parseFloat((10 + Math.random() * 20).toFixed(1)),
        tyreTemps: {
          frontLeft: Math.floor(60 + Math.random() * 80),
          frontRight: Math.floor(60 + Math.random() * 80),
          rearLeft: Math.floor(60 + Math.random() * 80),
          rearRight: Math.floor(60 + Math.random() * 80),
        },
        // Update car settings occasionally
        tractionControl: Math.random() > 0.95 ? Math.floor(Math.random() * 5) : prev.tractionControl,
        brakeBalance: Math.random() > 0.95 ? Math.floor(50 + Math.random() * 30) : prev.brakeBalance,
        abs: Math.random() > 0.95 ? Math.floor(Math.random() * 6) : prev.abs,
        engineMap: Math.random() > 0.95 ? Math.floor(1 + Math.random() * 4) : prev.engineMap,
        lapTime: `${Math.floor(Math.random() * 2)}:${(20 + Math.random() * 40).toFixed(3).padStart(6, '0')}`,
        bestLap: `${Math.floor(Math.random() * 2)}:${(20 + Math.random() * 40).toFixed(3).padStart(6, '0')}`,
        timeDiff: `${Math.random() > 0.5 ? '+' : '-'}${(Math.random() * 2).toFixed(3)}`,
        sessionTime: `${Math.floor(Math.random() * 60).toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}.${Math.floor(Math.random() * 10)}`,
        currentLap: Math.floor(1 + Math.random() * 50),
      }));
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const getTyreColor = (temp: number) => {
    if (temp < 70) return 'text-blue-400';
    if (temp < 90) return 'text-green-400';
    if (temp < 110) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getRpmColor = (rpm: number, maxRpm: number) => {
    const percentage = (rpm / maxRpm) * 100;
    if (percentage < 60) return 'bg-green-500';
    if (percentage < 80) return 'bg-yellow-500';
    if (percentage < 95) return 'bg-red-500';
    return 'bg-purple-500';
  };

  const renderRpmLights = () => {
    const lights = [];
    const rpmPercentage = (telemetryData.rpm / telemetryData.maxRpm) * 100;
    const totalLights = 16;
    const activeLights = Math.floor((rpmPercentage / 100) * totalLights);

    for (let i = 0; i < totalLights; i++) {
      const isActive = i < activeLights;
      const lightClass = isActive ? getRpmColor(telemetryData.rpm, telemetryData.maxRpm) : 'bg-gray-800';
      
      lights.push(
        <div
          key={i}
          className={`w-4 h-8 border border-gray-600 transition-all duration-75 ${lightClass}`}
        />
      );
    }

    return lights;
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="mx-auto max-w-[2000px]">
        <div className="mb-6 py-[0px] px-[89px]">
          <h1 className="text-4xl tracking-tight text-foreground/90">
            GT DASHBOARD
          </h1>
          <div className="h-0.5 w-32 bg-red-500 mt-2"></div>
        </div>

        {/* Main DDU Container - Increased size */}
        <div className="mx-auto max-w-[1800px] flex items-center justify-center">
          <div className="bg-[rgba(0,0,0,1)] border-4 border-gray-700 rounded-3xl w-full shadow-2xl mx-[0px] my-[80px] mx-[0px] p-[35px] mx-[30px] my-[83px] my-[85px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[80px] my-[85px] mx-[80px] my-[87px] my-[85px] my-[85px] my-[85px] my-[85px] my-[85px] my-[85px] my-[85px] my-[85px] my-[85px] my-[85px] my-[85px] my-[85px] my-[85px]">
            {/* Top Section - Session Info */}
            <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-700">
              <div className="flex items-center gap-8">
                <div className="text-red-500 tracking-widest text-2xl">
                  {telemetryData.session}
                </div>
                <div className="text-gray-400 text-xl">|</div>
                <div className="text-gray-300 text-xl">
                  LAP {telemetryData.currentLap}
                </div>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="bg-green-900 text-green-400 px-6 py-3 rounded border border-green-600 text-lg">
                  {telemetryData.trackCondition}
                </div>
                <div className="text-gray-300 font-mono text-2xl">
                  {telemetryData.sessionTime}
                </div>
              </div>
            </div>

            {/* RPM Lights - Made bigger */}
            <div className="flex justify-center gap-2 mb-10">
              {renderRpmLights()}
            </div>

            {/* Main Data Grid */}
            <div className="grid grid-cols-12 gap-8 mb-10">
              {/* Left Column - Input & Fuel Data */}
              <div className="col-span-3 space-y-6">
                {/* Input Data */}
                <div className="bg-black border border-gray-600 rounded-lg p-6">
                  <div className="text-orange-500 text-lg tracking-wider mb-4 text-center">
                    INPUT DATA
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-800 px-4 py-3 rounded text-center">
                      <div className="text-gray-400 text-sm">THR</div>
                      <div className="text-2xl">{telemetryData.throttle}%</div>
                    </div>
                    <div className="bg-gray-800 px-4 py-3 rounded text-center">
                      <div className="text-gray-400 text-sm">BRK</div>
                      <div className="text-2xl">{telemetryData.brake}%</div>
                    </div>
                  </div>
                </div>

                {/* Engine Data */}
                <div className="bg-black border border-gray-600 rounded-lg p-6">
                  <div className="text-orange-500 text-lg tracking-wider mb-4 text-center">
                    ENGINE
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-base">Turbo</span>
                      <span className="text-white text-lg">{telemetryData.turboPresure} bar</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-base">Oil Press</span>
                      <span className="text-white text-lg">{telemetryData.oilPressure} bar</span>
                    </div>
                  </div>
                </div>

                {/* Fuel Data */}
                <div className="bg-black border border-gray-600 rounded-lg p-6">
                  <div className="text-orange-500 text-lg tracking-wider mb-4 text-center">
                    FUEL
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-base">Level</span>
                      <span className="text-white text-lg">{telemetryData.fuelLevel} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-base">Per Lap</span>
                      <span className="text-white text-lg">{telemetryData.fuelPerLap} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-base">Laps Left</span>
                      <span className="text-white text-lg">{telemetryData.lapsOfFuel}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Column - Main Display */}
              <div className="col-span-6 flex flex-col items-center justify-center space-y-8">
                {/* Speed Display - Fixed container with proper centering */}
                <div className="bg-black border-2 border-gray-600 rounded-xl w-80 h-36 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-gray-400 text-lg mb-2">SPEED</div>
                    <div className="text-7xl font-mono leading-none">{telemetryData.speed}</div>
                    <div className="text-gray-400 text-lg mt-2">KM/H</div>
                  </div>
                </div>

                {/* Gear Display - Fixed container with proper centering */}
                <div className="bg-black border-4 border-gray-600 rounded-xl w-64 h-48 flex items-center justify-center">
                  <div className="text-9xl font-mono text-center text-[rgba(151,151,151,1)] leading-none">
                    {telemetryData.gear}
                  </div>
                </div>

                {/* Tyre Temperature Display - Fixed container with proper layout */}
                <div className="bg-black border-2 border-orange-500 rounded-xl w-96 h-52">
                  <div className="h-full flex flex-col justify-center p-4">
                    <div className="text-center mb-4">
                      <div className="bg-orange-500 text-black px-4 py-2 rounded text-lg tracking-wider mx-auto inline-block">
                        TYRE TEMP
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <div className="text-gray-400 text-sm mb-1">FL</div>
                        <div className={`text-3xl font-mono ${getTyreColor(telemetryData.tyreTemps.frontLeft)}`}>
                          {telemetryData.tyreTemps.frontLeft}°
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-400 text-sm mb-1">FR</div>
                        <div className={`text-3xl font-mono ${getTyreColor(telemetryData.tyreTemps.frontRight)}`}>
                          {telemetryData.tyreTemps.frontRight}°
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-400 text-sm mb-1">RL</div>
                        <div className={`text-3xl font-mono ${getTyreColor(telemetryData.tyreTemps.rearLeft)}`}>
                          {telemetryData.tyreTemps.rearLeft}°
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-400 text-sm mb-1">RR</div>
                        <div className={`text-3xl font-mono ${getTyreColor(telemetryData.tyreTemps.rearRight)}`}>
                          {telemetryData.tyreTemps.rearRight}°
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Timing & Settings Data */}
              <div className="col-span-3 space-y-6">
                {/* Timing Data */}
                <div className="bg-black border border-gray-600 rounded-lg p-6">
                  <div className="text-orange-500 text-lg tracking-wider mb-4 text-center">
                    TIMING
                  </div>
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="text-gray-400 text-sm">CURRENT</div>
                      <div className="text-2xl font-mono">{telemetryData.lapTime}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-400 text-sm">BEST</div>
                      <div className="text-2xl font-mono text-green-400">{telemetryData.bestLap}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-400 text-sm">DELTA</div>
                      <div className={`text-2xl font-mono ${telemetryData.timeDiff.startsWith('+') ? 'text-red-400' : 'text-green-400'}`}>
                        {telemetryData.timeDiff}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Car Settings */}
                <div className="bg-black border border-gray-600 rounded-lg p-6">
                  <div className="text-orange-500 text-xl tracking-wider mb-6 text-center">
                    SETTINGS
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* TC */}
                    <div className="bg-blue-900/30 border border-blue-500 rounded-lg py-6 px-4 text-center">
                      <div className="text-blue-400 text-lg mb-3 tracking-wide">TC</div>
                      <div className="text-blue-400 text-5xl font-mono font-bold leading-none">
                        {telemetryData.tractionControl}
                      </div>
                    </div>
                    {/* BB */}
                    <div className="bg-red-900/30 border border-red-500 rounded-lg py-6 px-4 text-center">
                      <div className="text-red-400 text-lg mb-3 tracking-wide">BB</div>
                      <div className="text-red-400 text-5xl font-mono font-bold leading-none">
                        {telemetryData.brakeBalance}
                      </div>
                    </div>
                    {/* ABS */}
                    <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg py-6 px-4 text-center">
                      <div className="text-yellow-400 text-lg mb-3 tracking-wide">ABS</div>
                      <div className="text-yellow-400 text-5xl font-mono font-bold leading-none">
                        {telemetryData.abs}
                      </div>
                    </div>
                    {/* MAP */}
                    <div className="bg-green-900/30 border border-green-500 rounded-lg py-6 px-4 text-center">
                      <div className="text-green-400 text-lg mb-3 tracking-wide">MAP</div>
                      <div className="text-green-400 text-5xl font-mono font-bold leading-none">
                        {telemetryData.engineMap}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Branding */}
            <div className="flex justify-center pt-6 border-t border-gray-700">
              <div className="text-[rgba(179,0,0,1)] text-lg tracking-[0.2em] text-[32px] font-[Bruno_Ace_SC] font-normal no-underline pb-[-13px] mx-[0px] mx-[0px] mx-[0px] mx-[0px] mx-[0px] m-[0px] p-[0px] mt-[5px] mr-[0px] mb-[0px] ml-[0px]">
                ATLAS RACING
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}