import { useState, useEffect } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';

interface InputData {
  throttle: number;
  brake: number;
  clutch: number;
  steering: number; // -100 to 100 (left to right)
}

interface TelemetryHistoryPoint {
  throttle: number;
  brake: number;
  timestamp: number;
}

export function InputTelemetry() {
  const { telemetry, isConnected } = useTelemetry();
  const [inputData, setInputData] = useState<InputData>({
    throttle: 0,
    brake: 0,
    clutch: 0,
    steering: 0
  });

  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryHistoryPoint[]>([]);
  const maxHistoryPoints = 100;

  // Update from live telemetry
  useEffect(() => {
    if (!telemetry || !isConnected) return;

    const toPercent = (value: number | undefined | null) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
      const scaled = value <= 1 ? value * 100 : value;
      return Math.max(0, Math.min(100, scaled));
    };

    const nextData: InputData = {
      throttle: toPercent((telemetry as any).throttle_percent ?? (telemetry as any).throttle),
      brake: toPercent((telemetry as any).brake_percent ?? (telemetry as any).brake),
      clutch: toPercent((telemetry as any).clutch ?? (telemetry as any).clutch_position),
      steering: (() => {
        const value = (telemetry as any).steerAngle ?? (telemetry as any).steering_angle ?? (telemetry as any).steering;
        if (typeof value === 'number' && Number.isFinite(value)) {
          // value may already be -1..1 or degrees; normalize -100..100
          if (Math.abs(value) <= 1.5) return value * 100;
          if (Math.abs(value) <= 360) return Math.max(-100, Math.min(100, value / 1.8));
          return Math.max(-100, Math.min(100, value));
        }
        return 0;
      })()
    };

    setInputData(nextData);
    setTelemetryHistory((history) => {
      const newHistory = [...history, { throttle: nextData.throttle, brake: nextData.brake, timestamp: Date.now() }];
      return newHistory.slice(-maxHistoryPoints);
    });
  }, [telemetry, isConnected]);

  // Generate SVG path for throttle/brake graph
  const generatePath = (data: number[]) => {
    if (data.length < 2) return '';

    const width = 400;
    const height = 80;
    const maxValue = 100;

    let path = `M 0 ${height - (data[0] / maxValue) * height}`;

    data.forEach((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      path += ` L ${x} ${y}`;
    });

    return path;
  };

  const throttleData = telemetryHistory.map(point => point.throttle);
  const brakeData = telemetryHistory.map(point => point.brake);

  // Calculate steering angle for rotation (-100 to 100 maps to -180 to 180 degrees)
  const steeringAngle = (inputData.steering / 100) * 180;

  return (
    <div className="space-y-4 h-full">
      <div className="text-sm text-gray-500 uppercase tracking-wider">INPUT TELEMETRY</div>

      {/* Telemetry Graph - Full Width at Top */}
      <div className="bg-black/50 rounded border border-[#222] h-24 p-2">
        <svg width="100%" height="100%" viewBox="0 0 400 80" className="overflow-visible">
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#374151" strokeWidth="0.5" opacity="0.3"/>
            </pattern>
          </defs>
          <rect width="400" height="80" fill="url(#grid)" />

          {/* Brake line (red) */}
          {brakeData.length > 1 && (
            <path
              d={generatePath(brakeData)}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              opacity="0.9"
            />
          )}

          {/* Throttle line (green) */}
          {throttleData.length > 1 && (
            <path
              d={generatePath(throttleData)}
              fill="none"
              stroke="#22c55e"
              strokeWidth="2"
              opacity="0.9"
            />
          )}
        </svg>
      </div>

      {/* Input Controls - Bottom Row */}
      <div className="flex items-end justify-between gap-4">
        {/* Input bars - Left side */}
        <div className="flex gap-3">
          {/* Throttle Bar */}
          <div className="space-y-1">
            <div className="text-[10px] text-green-400 text-center uppercase">Throttle</div>
            <div className="h-20 w-6 bg-gray-800 rounded relative overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 bg-green-500 transition-all duration-100"
                style={{ height: `${inputData.throttle}%` }}
              />
            </div>
            <div className="text-center text-[10px] font-mono text-gray-400">{Math.round(inputData.throttle)}</div>
          </div>

          {/* Brake Bar */}
          <div className="space-y-1">
            <div className="text-[10px] text-red-400 text-center uppercase">Brake</div>
            <div className="h-20 w-6 bg-gray-800 rounded relative overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 bg-red-500 transition-all duration-100"
                style={{ height: `${inputData.brake}%` }}
              />
            </div>
            <div className="text-center text-[10px] font-mono text-gray-400">{Math.round(inputData.brake)}</div>
          </div>

          {/* Clutch Bar */}
          <div className="space-y-1">
            <div className="text-[10px] text-blue-400 text-center uppercase">Clutch</div>
            <div className="h-20 w-6 bg-gray-800 rounded relative overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 bg-blue-500 transition-all duration-100"
                style={{ height: `${inputData.clutch}%` }}
              />
            </div>
            <div className="text-center text-[10px] font-mono text-gray-400">{Math.round(inputData.clutch)}</div>
          </div>
        </div>

        {/* Steering Indicator - Right side */}
        <div className="flex flex-col items-center space-y-1">
          <div className="text-[10px] text-gray-500 text-center uppercase">Steering</div>

          {/* Circular steering indicator */}
          <div className="relative w-20 h-20">
            <svg width="80" height="80" viewBox="0 0 96 96" className="absolute inset-0">
              {/* Outer circle */}
              <circle
                cx="48"
                cy="48"
                r="46"
                fill="none"
                stroke="#374151"
                strokeWidth="2"
              />

              {/* Inner circle */}
              <circle
                cx="48"
                cy="48"
                r="32"
                fill="none"
                stroke="#6b7280"
                strokeWidth="1"
                opacity="0.5"
              />

              {/* Center point */}
              <circle
                cx="48"
                cy="48"
                r="2"
                fill="#9ca3af"
              />

              {/* Steering position indicator (white bar) */}
              <g transform={`rotate(${steeringAngle} 48 48)`}>
                <line
                  x1="48"
                  y1="16"
                  x2="48"
                  y2="32"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </g>
            </svg>
          </div>

          <div className="text-center">
            <div className="text-[10px] font-mono text-gray-400">{Math.round(inputData.steering)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
