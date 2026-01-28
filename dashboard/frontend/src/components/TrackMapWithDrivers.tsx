import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  parseSvgPath,
  getPointAtLapDistance,
  extractMainPath,
  extractViewBox,
  ParsedPath,
  Point
} from '../utils/trackMapUtils';
import { getTrackInfo, getTeamColor, TRACK_DISPLAY_NAMES } from '../data/trackMappings';
import { MultiCarTelemetryData } from '../types/telemetry';

interface TrackMapWithDriversProps {
  trackId: number;
  multiCarData: MultiCarTelemetryData | null;
  playerIndex?: number;
  className?: string;
}

interface DriverMarker {
  carIndex: number;
  position: number;
  name: string;
  teamId: number;
  lapDistance: number; // 0.0 to 1.0 (normalized)
  isPlayer: boolean;
  currentLap: number;
  point: Point;
  teamColor: string;
}

// SVG cache to avoid re-fetching
const svgCache = new Map<string, string>();
const parsedPathCache = new Map<string, ParsedPath>();

export const TrackMapWithDrivers: React.FC<TrackMapWithDriversProps> = ({
  trackId,
  multiCarData,
  playerIndex,
  className = '',
}) => {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get track info
  const trackInfo = useMemo(() => getTrackInfo(trackId), [trackId]);
  const svgFileName = trackInfo?.svgFile;

  // Load SVG file
  useEffect(() => {
    if (!svgFileName) {
      setLoading(false);
      setError(`No SVG available for track ID ${trackId}`);
      return;
    }

    const cacheKey = svgFileName;
    if (svgCache.has(cacheKey)) {
      setSvgContent(svgCache.get(cacheKey)!);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch SVG from resources folder
    fetch(`/resources/f1_2020/${svgFileName}.svg`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load track SVG: ${res.status}`);
        return res.text();
      })
      .then((content) => {
        svgCache.set(cacheKey, content);
        setSvgContent(content);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load track SVG:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [svgFileName, trackId]);

  // Parse path and calculate viewBox
  const { parsedPath, viewBox } = useMemo(() => {
    if (!svgContent || !svgFileName) {
      return { parsedPath: null, viewBox: null };
    }

    // Check cache
    if (parsedPathCache.has(svgFileName)) {
      return {
        parsedPath: parsedPathCache.get(svgFileName)!,
        viewBox: extractViewBox(svgContent),
      };
    }

    const pathData = extractMainPath(svgContent);
    if (!pathData) {
      return { parsedPath: null, viewBox: null };
    }

    const parsed = parseSvgPath(pathData);
    parsedPathCache.set(svgFileName, parsed);

    return {
      parsedPath: parsed,
      viewBox: extractViewBox(svgContent),
    };
  }, [svgContent, svgFileName]);

  // Calculate world coordinate bounds from all cars for positioning
  const worldBounds = useMemo(() => {
    if (!multiCarData?.cars || multiCarData.cars.length === 0) {
      return null;
    }

    const validCars = multiCarData.cars.filter(
      (car) =>
        car.position > 0 &&
        typeof car.world_position_x === 'number' &&
        typeof car.world_position_y === 'number' &&
        Number.isFinite(car.world_position_x) &&
        Number.isFinite(car.world_position_y) &&
        !(car.world_position_x === 0 && car.world_position_y === 0) &&
        Math.abs(car.world_position_x) < 20000 &&
        Math.abs(car.world_position_y) < 20000
    );

    if (validCars.length === 0) {
      return null;
    }

    let minX = validCars[0].world_position_x!;
    let maxX = validCars[0].world_position_x!;
    let minY = validCars[0].world_position_y!;
    let maxY = validCars[0].world_position_y!;

    for (const car of validCars) {
      const x = car.world_position_x!;
      const y = car.world_position_y!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // Add padding to avoid edge cases
    const width = maxX - minX || 100;
    const height = maxY - minY || 100;
    const padding = Math.max(width, height) * 0.1;

    return {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding,
      width: width + 2 * padding,
      height: height + 2 * padding,
    };
  }, [multiCarData]);

  // Calculate driver markers - use world coords if available, fall back to lap_distance
  const driverMarkers = useMemo<DriverMarker[]>(() => {
    if (!multiCarData?.cars || multiCarData.cars.length === 0) {
      return [];
    }

    const trackLength = trackInfo?.trackLength || 5000;
    const svgWidth = viewBox?.width || 600;
    const svgHeight = viewBox?.height || 1000;

    // Check if we have valid world coordinates
    const useWorldCoords = worldBounds !== null;

    return multiCarData.cars
      .filter((car) => car.position > 0) // Only active cars
      .map((car) => {
        const teamColor = getTeamColor(car.team_id);
        const isPlayer = car.is_player === 1 || car.car_index === playerIndex;

        let point: Point;

        const hasValidWorldCoords =
          typeof car.world_position_x === 'number' &&
          typeof car.world_position_y === 'number' &&
          Number.isFinite(car.world_position_x) &&
          Number.isFinite(car.world_position_y) &&
          !(car.world_position_x === 0 && car.world_position_y === 0);

        if (useWorldCoords && hasValidWorldCoords && worldBounds) {
          // Use world coordinates - normalize to SVG viewBox
          const normX = (car.world_position_x! - worldBounds.minX) / worldBounds.width;
          const normY = (car.world_position_y! - worldBounds.minY) / worldBounds.height;

          point = {
            x: normX * svgWidth,
            y: (1 - normY) * svgHeight, // Invert Y for SVG coordinate system
          };
        } else if (parsedPath) {
          // Fall back to lap_distance on SVG path
          let rawDistance = car.lap_distance ?? 0;
          if (rawDistance < 0) {
            rawDistance = trackLength + rawDistance;
          }
          const normalizedDistance = Math.max(0, Math.min(1, rawDistance / trackLength));
          point = getPointAtLapDistance(parsedPath, normalizedDistance);
        } else {
          // No positioning available - center of SVG
          point = { x: svgWidth / 2, y: svgHeight / 2 };
        }

        return {
          carIndex: car.car_index,
          position: car.position,
          name: car.driver_name || `P${car.position}`,
          teamId: car.team_id,
          lapDistance: 0,
          isPlayer,
          currentLap: 0,
          point,
          teamColor,
        };
      })
      .sort((a, b) => a.position - b.position);
  }, [multiCarData, worldBounds, viewBox, parsedPath, trackInfo, playerIndex]);

  // Extract viewBox dimensions for rendering
  const vb = viewBox || { width: 600, height: 1000 };

  // Render loading/error states
  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-[#0a0a0a] rounded ${className}`}>
        <div className="text-gray-500 text-sm">Loading track...</div>
      </div>
    );
  }

  if (error || !svgContent || !parsedPath) {
    const trackName = trackInfo?.name || `Track ${trackId}`;
    return (
      <div className={`flex flex-col items-center justify-center bg-[#0a0a0a] rounded ${className}`}>
        <div className="text-gray-500 text-sm mb-2">{trackName}</div>
        <div className="text-gray-600 text-xs">Track map not available</div>
        {/* Show driver list instead */}
        {driverMarkers.length > 0 && (
          <div className="mt-3 text-xs text-gray-500 max-h-32 overflow-y-auto">
            {driverMarkers.slice(0, 10).map((d) => (
              <div key={d.carIndex} className="flex items-center gap-2">
                <span className="w-6">P{d.position}</span>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: d.teamColor }}
                />
                <span className={d.isPlayer ? 'text-cyan-400' : ''}>{d.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Get display name for track
  const displayName = svgFileName ? (TRACK_DISPLAY_NAMES[svgFileName] || trackInfo?.name?.toUpperCase()) : trackInfo?.name;

  return (
    <div ref={containerRef} className={`relative bg-[#0a0a0a] rounded overflow-hidden ${className}`}>
      {/* Track name header */}
      <div className="absolute top-2 left-3 z-10">
        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
          {displayName}
        </div>
      </div>

      {/* SVG Container */}
      <svg
        viewBox={`0 0 ${vb.width} ${vb.height}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background */}
        <rect x="0" y="0" width={vb.width} height={vb.height} fill="#0a0a0a" />

        {/* Track outline - render the original SVG paths */}
        <g dangerouslySetInnerHTML={{ __html: extractPathElements(svgContent) }} />

        {/* Driver markers */}
        {driverMarkers.map((driver) => {
          const dotSize = driver.isPlayer ? 10 : 7;
          const glowSize = driver.isPlayer ? 18 : 12;

          return (
            <g key={driver.carIndex}>
              {/* Glow effect */}
              <circle
                cx={driver.point.x}
                cy={driver.point.y}
                r={glowSize}
                fill={driver.teamColor}
                opacity={driver.isPlayer ? 0.4 : 0.25}
              />
              {/* Main dot */}
              <circle
                cx={driver.point.x}
                cy={driver.point.y}
                r={dotSize}
                fill={driver.teamColor}
                stroke={driver.isPlayer ? '#ffffff' : '#000000'}
                strokeWidth={driver.isPlayer ? 2 : 1}
              />
              {/* Position number */}
              <text
                x={driver.point.x}
                y={driver.point.y + (driver.isPlayer ? 3.5 : 2.5)}
                textAnchor="middle"
                className="font-bold"
                fontSize={driver.isPlayer ? 8 : 6}
                fill={getContrastColor(driver.teamColor)}
              >
                {driver.position}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Stats overlay */}
      <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] text-gray-600">
        <span>{driverMarkers.length} drivers</span>
      </div>
    </div>
  );
};

// Helper to extract path elements from SVG content
function extractPathElements(svgContent: string): string {
  // Extract just the path elements and style from the SVG
  const styleMatch = svgContent.match(/<style[^>]*>[\s\S]*?<\/style>/);
  const pathMatches = svgContent.match(/<path[^>]*\/?>|<path[^>]*>[\s\S]*?<\/path>/g);

  let result = '';
  if (styleMatch) {
    result += styleMatch[0];
  }
  if (pathMatches) {
    result += pathMatches.join('');
  }
  return result;
}

// Helper to get contrasting text color
function getContrastColor(hexColor: string): string {
  // Convert hex to RGB
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export default TrackMapWithDrivers;
