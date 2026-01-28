import { useMemo } from "react";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { imgSteeringWheel1 } from "../imports/svg-jevek";
import { useTelemetry, useTelemetryHistory } from "../hooks/useTelemetry";
import { convertTelemetry } from "../utils/telemetryConverter";

// Sector reference lines component
const SectorBars = ({ width = "100%", height = "100%" }) => (
  <svg
    width={width}
    height={height}
    className="absolute inset-0 pointer-events-none"
    style={{ zIndex: 1 }}
  >
    {/* Sector 1 end - 33% */}
    <line
      x1="33%"
      y1="0"
      x2="33%"
      y2="100%"
      stroke="#374151"
      strokeWidth="1"
      strokeDasharray="2 2"
      opacity="0.6"
    />
    {/* Sector 2 end - 66% */}
    <line
      x1="66%"
      y1="0"
      x2="66%"
      y2="100%"
      stroke="#374151"
      strokeWidth="1"
      strokeDasharray="2 2"
      opacity="0.6"
    />
  </svg>
);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface TelemetryPoint {
  timestamp: number;
  lapTimeFormatted: string;
  speed: number;
  throttle: number;
  brake: number;
  abs: number;
  steeringAngle: number;
  gear: string;
  rpm: number;
  tyreTempFL: number;
  tyreTempFR: number;
  tyreTempRL: number;
  tyreTempRR: number;
  tyreWearFL: number;
  tyreWearFR: number;
  tyreWearRL: number;
  tyreWearRR: number;
}

interface TyreTemperatureEntry {
  surface: number;
  core: number;
  inner: number;
  middle: number;
  outer: number;
}

interface TyreOverview {
  temperatures: {
    frontLeft: TyreTemperatureEntry;
    frontRight: TyreTemperatureEntry;
    rearLeft: TyreTemperatureEntry;
    rearRight: TyreTemperatureEntry;
  };
  wear: {
    frontLeft: number;
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  slip: {
    slipRatio: {
      frontLeft: number;
      frontRight: number;
      rearLeft: number;
      rearRight: number;
    };
    slipAngle: {
      frontLeft: number;
      frontRight: number;
      rearLeft: number;
      rearRight: number;
    };
    gripLevel: {
      frontLeft: number;
      frontRight: number;
      rearLeft: number;
      rearRight: number;
    };
  };
}

export function LiveRaceAnalysis() {
  const { telemetry } = useTelemetry();
  const { history } = useTelemetryHistory(600);

  const telemetryData = useMemo<TelemetryPoint[]>(() => {
    const samples = history.length > 0 ? history : telemetry ? [telemetry] : [];

    return samples.slice(-600).map((sample) => {
      const converted = convertTelemetry(sample);
      const raw = sample as any;

      const absValue =
        typeof raw.abs === 'number'
          ? clamp(raw.abs * 100, 0, 100)
          : 0;

      const steeringAngle =
        typeof raw.steering_angle === 'number'
          ? raw.steering_angle
          : typeof raw.steerAngle === 'number'
            ? raw.steerAngle
            : typeof converted.raw?.steering_angle === 'number'
              ? converted.raw.steering_angle
              : 0;

      return {
        timestamp: sample.timestamp ?? Date.now(),
        lapTimeFormatted: converted.currentLapTime,
        speed: Math.max(0, Math.round(converted.speed)),
        throttle: Math.round(clamp(sample.throttle_percent ?? converted.throttle, 0, 100)),
        brake: Math.round(clamp(sample.brake_percent ?? converted.brake, 0, 100)),
        abs: Math.round(absValue),
        steeringAngle: Math.round(steeringAngle),
        gear: converted.gear || 'N',
        rpm: Math.max(0, Math.round(converted.rpm)),
        tyreTempFL: Math.round(converted.tireTempFL),
        tyreTempFR: Math.round(converted.tireTempFR),
        tyreTempRL: Math.round(converted.tireTempRL),
        tyreTempRR: Math.round(converted.tireTempRR),
        tyreWearFL: Math.round(clamp(converted.tireWearFL, 0, 100)),
        tyreWearFR: Math.round(clamp(converted.tireWearFR, 0, 100)),
        tyreWearRL: Math.round(clamp(converted.tireWearRL, 0, 100)),
        tyreWearRR: Math.round(clamp(converted.tireWearRR, 0, 100))
      };
    });
  }, [history, telemetry]);

  const latestTelemetry = history.length > 0 ? history[history.length - 1] : telemetry ?? null;
  const latestConverted = useMemo(() => convertTelemetry(latestTelemetry ?? null), [latestTelemetry]);

  const tyreData = useMemo<TyreOverview>(() => {
    const raw = (latestTelemetry ?? {}) as any;
    const acExtended = raw.ac_extended ?? {};
    const tempZones = acExtended.tyre_temp_zones ?? {};
    const wheelSlip: number[] = acExtended.wheel_slip ?? [];
    const slipAngles: number[] = acExtended.slip_angle ?? [];

    const asTempEntry = (index: number, fallback: number): TyreTemperatureEntry => ({
      surface: Math.round(fallback),
      core: Math.round(tempZones.middle?.[index] ?? fallback),
      inner: Math.round(tempZones.inner?.[index] ?? fallback),
      middle: Math.round(tempZones.middle?.[index] ?? fallback),
      outer: Math.round(tempZones.outer?.[index] ?? fallback)
    });

    const slipRatio = {
      frontLeft: clamp(wheelSlip?.[0] ?? 0, -1, 1),
      frontRight: clamp(wheelSlip?.[1] ?? 0, -1, 1),
      rearLeft: clamp(wheelSlip?.[2] ?? 0, -1, 1),
      rearRight: clamp(wheelSlip?.[3] ?? 0, -1, 1)
    };

    const toGrip = (value: number) => clamp(1 - Math.abs(value), 0, 1);

    return {
      temperatures: {
        frontLeft: asTempEntry(0, latestConverted.tireTempFL),
        frontRight: asTempEntry(1, latestConverted.tireTempFR),
        rearLeft: asTempEntry(2, latestConverted.tireTempRL),
        rearRight: asTempEntry(3, latestConverted.tireTempRR)
      },
      wear: {
        frontLeft: Math.round(clamp(latestConverted.tireWearFL, 0, 100)),
        frontRight: Math.round(clamp(latestConverted.tireWearFR, 0, 100)),
        rearLeft: Math.round(clamp(latestConverted.tireWearRL, 0, 100)),
        rearRight: Math.round(clamp(latestConverted.tireWearRR, 0, 100))
      },
      slip: {
        slipRatio: {
          frontLeft: Number((slipRatio.frontLeft).toFixed(2)),
          frontRight: Number((slipRatio.frontRight).toFixed(2)),
          rearLeft: Number((slipRatio.rearLeft).toFixed(2)),
          rearRight: Number((slipRatio.rearRight).toFixed(2))
        },
        slipAngle: {
          frontLeft: Number((slipAngles?.[0] ?? 0).toFixed(2)),
          frontRight: Number((slipAngles?.[1] ?? 0).toFixed(2)),
          rearLeft: Number((slipAngles?.[2] ?? 0).toFixed(2)),
          rearRight: Number((slipAngles?.[3] ?? 0).toFixed(2))
        },
        gripLevel: {
          frontLeft: Number((toGrip(slipRatio.frontLeft)).toFixed(2)),
          frontRight: Number((toGrip(slipRatio.frontRight)).toFixed(2)),
          rearLeft: Number((toGrip(slipRatio.rearLeft)).toFixed(2)),
          rearRight: Number((toGrip(slipRatio.rearRight)).toFixed(2))
        }
      }
    };
  }, [latestConverted, latestTelemetry]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const getUnit = (dataKey: string) => {
        if (dataKey === "speed") return " km/h";
        if (dataKey === "gear") return "";
        if (dataKey === "abs") return "%";
        if (dataKey.includes("steeringAngle")) return "°";
        if (dataKey.includes("steeringSmoothness")) return "";
        if (dataKey.includes("tyreWear")) return "%";
        if (dataKey.includes("tyreTemp")) return "°C";
        if (dataKey.includes("suspension")) return " mm";
        if (dataKey.includes("g") && !dataKey.includes("gear"))
          return " G";
        return "%";
      };

      return (
        <div className="bg-black/90 backdrop-blur-sm border border-gray-600 rounded p-2 shadow-xl">
          <p className="text-xs font-medium mb-1 text-gray-300">
            Distance: {label}m
          </p>
          {payload.map((entry: any, index: number) => (
            <p
              key={index}
              className="text-xs"
              style={{ color: entry.color }}
            >
              {entry.name || entry.dataKey}:{" "}
              {typeof entry.value === "number"
                ? entry.value.toFixed(1)
                : entry.value}
              {getUnit(entry.dataKey)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen overflow-auto bg-[#050505] text-white font-oxanium pt-14">
      {/* Top Header Bar */}
      <div className="bg-[rgba(0,0,0,1)] border-b border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-400 text-sm font-medium">
                LIVE TELEMETRY
              </span>
            </div>
            <div className="text-xs text-gray-400">
              14:23:45 UTC • Lap 12/58 • Position 3 • Gap
              +2.347s
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
            >
              Overview
            </Button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-60px)]">
        {/* Left Sidebar - Data Panel */}
        <div className="w-64 bg-[rgba(0,0,0,1)] border-r border-gray-700 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Current Lap Data */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Current Lap
              </h3>
              <div className="space-y-1">
                {[
                  {
                    label: "Lap Time",
                    value: "1:23.456",
                    delta: "+0.234",
                  },
                  {
                    label: "S1",
                    value: "28.234",
                    delta: "+0.078",
                  },
                  {
                    label: "S2",
                    value: "31.892",
                    delta: "+0.158",
                  },
                  {
                    label: "S3",
                    value: "23.567",
                    delta: "+0.122",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex justify-between items-center text-xs"
                  >
                    <span className="text-gray-400">
                      {item.label}
                    </span>
                    <div className="text-right">
                      <span className="text-white font-medium">
                        {item.value}
                      </span>
                      <span
                        className={`ml-2 ${item.delta.startsWith("+") ? "text-red-400" : "text-green-400"}`}
                      >
                        {item.delta}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-gray-700" />

            {/* Session Data */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Session
              </h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">
                    Best Lap
                  </span>
                  <span className="text-white font-medium">
                    1:22.234
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">
                    Last Lap
                  </span>
                  <span className="text-white font-medium">
                    1:23.567
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fuel</span>
                  <span className="text-white font-medium">
                    45.2L
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Stint</span>
                  <span className="text-white font-medium">
                    12 laps
                  </span>
                </div>
              </div>
            </div>

            <Separator className="bg-gray-700" />

            {/* Tyre Status */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Tyre Status
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(tyreData.temperatures).map(
                  ([position, temps]) => {
                    const avgTemp = Math.round(
                      (temps.inner +
                        temps.middle +
                        temps.outer) /
                        3,
                    );
                    const getColorFromTemp = (temp: number) => {
                      if (temp < 80) return "text-blue-400";
                      if (temp < 95) return "text-green-400";
                      if (temp < 105) return "text-yellow-400";
                      if (temp < 115) return "text-orange-400";
                      return "text-red-400";
                    };

                    return (
                      <div
                        key={position}
                        className="text-center"
                      >
                        <div className="text-xs text-gray-400 mb-1">
                          {position
                            .replace(/([A-Z])/g, " $1")
                            .trim()}
                        </div>
                        <div
                          className={`text-sm font-medium ${getColorFromTemp(avgTemp)}`}
                        >
                          {avgTemp}°C
                        </div>
                        <div className="text-xs text-gray-500">
                          {
                            tyreData.wear[
                              position as keyof typeof tyreData.wear
                            ]
                          }
                          %
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            <Separator className="bg-gray-700" />

            {/* Tyre Slip Analysis */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Tyre Slip
              </h3>

              {/* Slip Ratio */}
              <div className="space-y-1">
                <div className="text-xs text-gray-500">
                  Slip Ratio
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(tyreData.slip.slipRatio).map(
                    ([position, value]) => (
                      <div
                        key={position}
                        className="flex justify-between"
                      >
                        <span className="text-gray-400">
                          {position
                            .replace(/([A-Z])/g, " $1")
                            .trim()}
                        </span>
                        <span
                          className={`${value > 0.15 ? "text-red-400" : value > 0.1 ? "text-yellow-400" : "text-green-400"}`}
                        >
                          {value.toFixed(2)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>

              {/* Slip Angle */}
              <div className="space-y-1">
                <div className="text-xs text-gray-500">
                  Slip Angle (°)
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(tyreData.slip.slipAngle).map(
                    ([position, value]) => (
                      <div
                        key={position}
                        className="flex justify-between"
                      >
                        <span className="text-gray-400">
                          {position
                            .replace(/([A-Z])/g, " $1")
                            .trim()}
                        </span>
                        <span
                          className={`${value > 3.0 ? "text-red-400" : value > 2.5 ? "text-yellow-400" : "text-green-400"}`}
                        >
                          {value.toFixed(1)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>

              {/* Grip Level */}
              <div className="space-y-1">
                <div className="text-xs text-gray-500">
                  Grip Level
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(tyreData.slip.gripLevel).map(
                    ([position, value]) => (
                      <div
                        key={position}
                        className="flex justify-between"
                      >
                        <span className="text-gray-400">
                          {position
                            .replace(/([A-Z])/g, " $1")
                            .trim()}
                        </span>
                        <span
                          className={`${value < 0.85 ? "text-red-400" : value < 0.9 ? "text-yellow-400" : "text-green-400"}`}
                        >
                          {(value * 100).toFixed(0)}%
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>

            <Separator className="bg-gray-700" />

            {/* Live Inputs */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Live Inputs
              </h3>
              
              {/* Throttle */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Throttle</span>
                  <span className="text-green-400 font-medium">
                    {telemetryData[telemetryData.length - 1]?.throttle || 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div 
                    className="bg-green-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${telemetryData[telemetryData.length - 1]?.throttle || 0}%` }}
                  ></div>
                </div>
              </div>

              {/* Brake */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Brake</span>
                  <span className="text-red-400 font-medium">
                    {telemetryData[telemetryData.length - 1]?.brake || 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div 
                    className="bg-red-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${telemetryData[telemetryData.length - 1]?.brake || 0}%` }}
                  ></div>
                </div>
              </div>

              {/* ABS */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">ABS</span>
                  <span className={`font-medium ${
                    (telemetryData[telemetryData.length - 1]?.abs || 0) > 0 
                      ? "text-orange-400" 
                      : "text-gray-500"
                  }`}>
                    {telemetryData[telemetryData.length - 1]?.abs || 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div 
                    className="bg-orange-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${telemetryData[telemetryData.length - 1]?.abs || 0}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <Separator className="bg-gray-700" />

            {/* Steering Input */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Steering Input
              </h3>
              
              <div className="flex flex-col items-center space-y-2">
                {/* Steering Wheel */}
                <div className="relative w-20 h-12">
                  <img 
                    src={imgSteeringWheel1}
                    alt="Steering Wheel"
                    className="w-full h-full object-contain transition-transform duration-200"
                    style={{ 
                      transform: `rotate(${(telemetryData[telemetryData.length - 1]?.steeringAngle || 0) * 2}deg)`,
                      filter: 'invert(1)'
                    }}
                  />
                </div>
                
                {/* Steering Angle Value */}
                <div className="text-center">
                  <div className="text-xs text-gray-400">Angle</div>
                  <div className={`text-sm font-medium ${
                    Math.abs(telemetryData[telemetryData.length - 1]?.steeringAngle || 0) > 30
                      ? "text-yellow-400"
                      : "text-white"
                  }`}>
                    {telemetryData[telemetryData.length - 1]?.steeringAngle || 0}°
                  </div>
                </div>

                {/* Steering Direction Indicator */}
                <div className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${
                    (telemetryData[telemetryData.length - 1]?.steeringAngle || 0) < -5
                      ? "bg-slate-400"
                      : "bg-gray-600"
                  }`}></div>
                  <span className="text-gray-400 text-xs">L</span>
                  <div className="w-4 h-0.5 bg-gray-600"></div>
                  <span className="text-gray-400 text-xs">R</span>
                  <div className={`w-2 h-2 rounded-full ${
                    (telemetryData[telemetryData.length - 1]?.steeringAngle || 0) > 5
                      ? "bg-slate-400"
                      : "bg-gray-600"
                  }`}></div>
                </div>
              </div>
            </div>

            <Separator className="bg-gray-700" />

            {/* Speed Gauge */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Speed
              </h3>
              <div className="flex justify-center">
                <div className="relative w-24 h-16">
                  {/* Speed Arc Background */}
                  <svg className="w-full h-full" viewBox="0 0 100 60">
                    {/* Background arc - semicircle from left to right */}
                    <path
                      d="M 10 50 A 40 40 0 0 1 90 50"
                      fill="none"
                      stroke="#374151"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    {/* Speed progress arc */}
                    <path
                      d="M 10 50 A 40 40 0 0 1 90 50"
                      fill="none"
                      stroke="#EAB308"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="125.66"
                      strokeDashoffset={125.66 - (125.66 * Math.min((telemetryData[telemetryData.length - 1]?.speed || 0) / 350, 1))}
                      className="transition-all duration-300"
                    />
                    {/* Red zone at the right end (last 15% of arc) - drawn last to appear on top */}
                    <path
                      d="M 78 22 A 40 40 0 0 1 90 50"
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="7"
                      strokeLinecap="round"
                      opacity="0.9"
                    />
                  </svg>
                  {/* Speed value in center */}
                  <div className="absolute inset-0 flex items-center justify-center mt-[15px] mr-[0px] mb-[0px] ml-[0px]">
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">
                        {telemetryData[telemetryData.length - 1]?.speed || 0}
                      </div>
                      <div className="text-xs text-gray-400">km/h</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-gray-700" />

            {/* RPM/Gear Gauge */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Engine
              </h3>
              <div className="flex justify-center">
                <div className="relative w-24 h-16">
                  {/* RPM Arc Background */}
                  <svg className="w-full h-full" viewBox="0 0 100 60">
                    {/* Background arc - semicircle from left to right */}
                    <path
                      d="M 10 50 A 40 40 0 0 1 90 50"
                      fill="none"
                      stroke="#374151"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    {/* RPM progress arc */}
                    <path
                      d="M 10 50 A 40 40 0 0 1 90 50"
                      fill="none"
                      stroke="#EAB308"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="125.66"
                      strokeDashoffset={125.66 - (125.66 * Math.min((telemetryData[telemetryData.length - 1]?.rpm || 0) / 13500, 1))}
                      className="transition-all duration-300"
                    />
                    {/* Red zone at the right end (last 10% of arc for RPM redline) - drawn last to appear on top */}
                    <path
                      d="M 80 25 A 40 40 0 0 1 90 50"
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="8"
                      strokeLinecap="round"
                      opacity="1"
                    />
                  </svg>
                  {/* Gear value in center */}
                  <div className="absolute inset-0 flex items-center justify-center mt-[14px] mr-[0px] mb-[2px] ml-[0px] px-[0px] p-[0px]">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {telemetryData[telemetryData.length - 1]?.gear || 'N'}
                      </div>
                      <div className="text-xs text-gray-400">gear</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Telemetry Charts */}
          <div className="flex-1 grid grid-rows-4 gap-px bg-gray-800">
            {/* Speed Chart */}
            <div className="bg-[rgba(0,0,0,1)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">
                  Speed (km/h)
                </h3>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-slate-400"></div>
                    <span className="text-gray-400">Speed</span>
                  </div>
                  <div className="text-gray-500">
                    S1 | S2 | S3
                  </div>
                </div>
              </div>
              <div className="h-48 relative">
                <SectorBars />
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryData.slice(-150)}>
                    <CartesianGrid
                      strokeDasharray="1 1"
                      stroke="#374151"
                      strokeWidth={0.5}
                    />
                    <XAxis
                      dataKey="lapTimeFormatted"
                      stroke="#6B7280"
                      fontSize={10}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#6B7280"
                      fontSize={10}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      domain={[0, 350]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="speed"
                      stroke="#60A5FA"
                      strokeWidth={2}
                      dot={false}
                      name="Speed (km/h)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Driver Inputs Chart */}
            <div className="bg-[rgba(0,0,0,1)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">
                  Driver Inputs
                </h3>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-green-400"></div>
                    <span className="text-gray-400">
                      Throttle
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-red-400"></div>
                    <span className="text-gray-400">Brake</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-orange-400"></div>
                    <span className="text-gray-400">ABS</span>
                  </div>
                  <div className="text-gray-500">
                    S1 | S2 | S3
                  </div>
                </div>
              </div>
              <div className="h-48 relative">
                <SectorBars />
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={telemetryData
                      .slice(-150)
                      .map((d) => ({
                        ...d,
                        absActive: d.abs > 0 ? d.abs : null, // Show ABS spikes at actual intervention level
                      }))}
                  >
                    <CartesianGrid
                      strokeDasharray="1 1"
                      stroke="#374151"
                      strokeWidth={0.5}
                    />
                    <XAxis
                      dataKey="lapTimeFormatted"
                      stroke="#6B7280"
                      fontSize={10}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#6B7280"
                      fontSize={10}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      domain={[0, 100]}
                      ticks={[0, 50, 100]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="throttle"
                      stroke="#34D399"
                      strokeWidth={2}
                      dot={false}
                      name="Throttle %"
                    />
                    <Line
                      type="monotone"
                      dataKey="brake"
                      stroke="#F87171"
                      strokeWidth={2}
                      dot={false}
                      name="Brake %"
                    />
                    <Line
                      type="monotone"
                      dataKey="absActive"
                      stroke="#FB923C"
                      strokeWidth={3}
                      dot={false}
                      connectNulls={false}
                      name="ABS %"
                      strokeDasharray="3 3"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tyre Degradation & Temperatures */}
            <div className="bg-[rgba(0,0,0,1)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">
                  Tyre Degradation & Temperatures
                </h3>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-slate-400"></div>
                    <span className="text-gray-400">
                      FL Wear
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-green-400"></div>
                    <span className="text-gray-400">
                      FR Wear
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-purple-400"></div>
                    <span className="text-gray-400">
                      RL Wear
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-pink-400"></div>
                    <span className="text-gray-400">
                      RR Wear
                    </span>
                  </div>
                  <div className="text-gray-500">
                    S1 | S2 | S3
                  </div>
                </div>
              </div>
              <div className="h-48 relative">
                <SectorBars />
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={telemetryData
                      .slice(-150)
                      .map((d) => ({
                        ...d,
                        // Convert temps to spikes - show as percentage based on optimal range (90-110°C)
                        tempSpike:
                          d.tyreTempFL > 110
                            ? Math.min(
                                100,
                                (d.tyreTempFL - 90) * 2,
                              )
                            : d.tyreTempFL < 90
                              ? Math.max(
                                  0,
                                  50 - (90 - d.tyreTempFL) * 2,
                                )
                              : 50 + (d.tyreTempFL - 90),
                      }))}
                  >
                    <CartesianGrid
                      strokeDasharray="1 1"
                      stroke="#374151"
                      strokeWidth={0.5}
                    />
                    <XAxis
                      dataKey="lapTimeFormatted"
                      stroke="#6B7280"
                      fontSize={10}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#6B7280"
                      fontSize={10}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      domain={[0, 100]}
                      ticks={[0, 50, 100]}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (
                          active &&
                          payload &&
                          payload.length
                        ) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs">
                              <div className="text-gray-300 mb-1">
                                {label}
                              </div>
                              {payload.map((entry, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-2"
                                >
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                      backgroundColor:
                                        entry.color,
                                    }}
                                  />
                                  <span className="text-gray-400">
                                    {entry.name}: {entry.value}%
                                  </span>
                                </div>
                              ))}
                              <div className="mt-2 border-t border-gray-600 pt-2">
                                <div className="text-gray-400">
                                  Tyre Temps:
                                </div>
                                <div className="text-xs text-gray-500">
                                  FL:{" "}
                                  {Math.round(data.tyreTempFL)}
                                  °C | FR:{" "}
                                  {Math.round(data.tyreTempFR)}
                                  °C
                                </div>
                                <div className="text-xs text-gray-500">
                                  RL:{" "}
                                  {Math.round(data.tyreTempRL)}
                                  °C | RR:{" "}
                                  {Math.round(data.tyreTempRR)}
                                  °C
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tyreWearFL"
                      stroke="#60A5FA"
                      strokeWidth={2}
                      dot={false}
                      name="FL Wear"
                    />
                    <Line
                      type="monotone"
                      dataKey="tyreWearFR"
                      stroke="#34D399"
                      strokeWidth={2}
                      dot={false}
                      name="FR Wear"
                    />
                    <Line
                      type="monotone"
                      dataKey="tyreWearRL"
                      stroke="#A78BFA"
                      strokeWidth={2}
                      dot={false}
                      name="RL Wear"
                    />
                    <Line
                      type="monotone"
                      dataKey="tyreWearRR"
                      stroke="#F472B6"
                      strokeWidth={2}
                      dot={false}
                      name="RR Wear"
                    />
                    <Line
                      type="monotone"
                      dataKey="tempSpike"
                      stroke="#EF4444"
                      strokeWidth={1}
                      dot={false}
                      name="Temp Alert"
                      strokeDasharray="2 2"
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Steering Input Analysis */}
            <div className="bg-[rgba(0,0,0,1)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">
                  Steering Input Analysis
                </h3>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-cyan-400"></div>
                    <span className="text-gray-400">
                      Steering Angle
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-yellow-400"></div>
                    <span className="text-gray-400">
                      Smoothness
                    </span>
                  </div>
                  <div className="text-gray-500">
                    S1 | S2 | S3
                  </div>
                </div>
              </div>
              <div className="h-48 relative">
                <SectorBars />
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={telemetryData
                      .slice(-150)
                      .map((d, i) => {
                        // Calculate steering smoothness (rate of change)
                        const prevAngle =
                          i > 0
                            ? telemetryData.slice(-150)[i - 1]
                                .steeringAngle
                            : d.steeringAngle;
                        const steeringSmoothness = Math.abs(
                          d.steeringAngle - prevAngle,
                        );

                        // Detect oversteer/understeer based on speed and steering angle
                        const expectedAngle =
                          d.speed > 200
                            ? Math.abs(d.steeringAngle) * 0.7
                            : Math.abs(d.steeringAngle);
                        const isOversteer =
                          Math.abs(d.steeringAngle) >
                          expectedAngle * 1.2;
                        const isUndersteer =
                          d.throttle > 80 &&
                          Math.abs(d.steeringAngle) > 15;

                        return {
                          ...d,
                          steeringSmoothness:
                            steeringSmoothness,
                          oversteer: isOversteer ? 1 : 0,
                          understeer: isUndersteer ? 1 : 0,
                        };
                      })}
                  >
                    <CartesianGrid
                      strokeDasharray="1 1"
                      stroke="#374151"
                      strokeWidth={0.5}
                    />
                    <XAxis
                      dataKey="lapTimeFormatted"
                      stroke="#6B7280"
                      fontSize={10}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="angle"
                      stroke="#6B7280"
                      fontSize={10}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      domain={[-60, 60]}
                    />
                    <YAxis
                      yAxisId="smoothness"
                      orientation="right"
                      stroke="#6B7280"
                      fontSize={10}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                      domain={[0, 10]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      yAxisId="angle"
                      type="monotone"
                      dataKey="steeringAngle"
                      stroke="#22D3EE"
                      strokeWidth={2}
                      dot={false}
                      name="Steering Angle °"
                    />
                    <Bar
                      yAxisId="smoothness"
                      dataKey="steeringSmoothness"
                      fill="#FBBF24"
                      fillOpacity={0.6}
                      name="Steering Smoothness"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Status Bar */}
          <div className="bg-[rgba(0,0,0,1)] px-6 py-2 flex items-center justify-between border-t border-gray-700">
            <div className="flex items-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span className="text-gray-400">
                  Session: Practice 1
                </span>
              </div>
              <div className="text-gray-400">Track: Monaco</div>
              <div className="text-gray-400">
                Weather: Dry 24°C
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-400">
                Data Rate: 60Hz
              </span>
              <span className="text-green-400">Connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
