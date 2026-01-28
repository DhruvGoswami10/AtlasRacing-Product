import React, { useMemo } from 'react';

export type MapPoint = {
  x: number;
  y: number;
};

export interface TrackOpponent {
  id: string;
  driver: string;
  position?: number;
  isAhead?: boolean;
  gapToPlayer?: number | null;
  distanceToPlayer?: number | null;
  point: MapPoint;
}

interface DevModeTrackMapProps {
  trackOutline: MapPoint[];
  playerHistory: MapPoint[];
  playerPosition?: MapPoint | null;
  opponents: TrackOpponent[];
}

const normalise = (value: number, min: number, range: number) => {
  if (!Number.isFinite(value)) {
    return 50;
  }
  if (range <= 0.0001) {
    return 50;
  }
  return ((value - min) / range) * 100;
};

const isValidPoint = (point: MapPoint | undefined | null) => {
  if (!point) return false;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (Math.abs(point.x) >= 20000 || Math.abs(point.y) >= 20000) return false;
  if (point.x === 0 && point.y === 0) return false;
  return true;
};

export const DevModeTrackMap: React.FC<DevModeTrackMapProps> = ({
  trackOutline,
  playerHistory,
  playerPosition,
  opponents,
}) => {
  const { outlinePoints, historyPoints, playerMarker, opponentMarkers } = useMemo(() => {
    const filteredOutline = trackOutline.filter(isValidPoint);
    const filteredHistory = playerHistory.filter(isValidPoint);

    const opponentCandidates: Array<
      TrackOpponent & { gapToPlayer: number | null; distanceToPlayer: number | null }
    > = [];

    for (const opponent of opponents) {
      if (!isValidPoint(opponent.point)) {
        continue;
      }

      const gap: number | null =
        typeof opponent.gapToPlayer === 'number' && Number.isFinite(opponent.gapToPlayer)
          ? opponent.gapToPlayer
          : null;

      const distance: number | null =
        typeof opponent.distanceToPlayer === 'number' && Number.isFinite(opponent.distanceToPlayer)
          ? opponent.distanceToPlayer
          : null;

      opponentCandidates.push({
        ...opponent,
        gapToPlayer: gap,
        distanceToPlayer: distance,
      });
    }

    const candidatePoints: MapPoint[] = [];
    candidatePoints.push(...filteredOutline);
    candidatePoints.push(...filteredHistory);
    opponentCandidates.forEach((opponent) => candidatePoints.push(opponent.point));
    if (isValidPoint(playerPosition || undefined) && playerPosition) {
      candidatePoints.push(playerPosition);
    }

    if (candidatePoints.length === 0) {
      return {
        outlinePoints: [] as MapPoint[],
        historyPoints: [] as MapPoint[],
        playerMarker: null as MapPoint | null,
        opponentMarkers: [] as Array<
          TrackOpponent & {
            screenX: number;
            screenY: number;
          }
        >,
      };
    }

    let minX = candidatePoints[0].x;
    let maxX = candidatePoints[0].x;
    let minY = candidatePoints[0].y;
    let maxY = candidatePoints[0].y;

    for (const point of candidatePoints) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = Math.max(width, height) * 0.08 || 5;

    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    const normalisedOutline = filteredOutline.map((point) => ({
      x: normalise(point.x, minX, rangeX),
      y: 100 - normalise(point.y, minY, rangeY),
    }));

    const normalisedHistory = filteredHistory.map((point) => ({
      x: normalise(point.x, minX, rangeX),
      y: 100 - normalise(point.y, minY, rangeY),
    }));

    const normalisedPlayer =
      isValidPoint(playerPosition || undefined) && playerPosition
        ? {
            x: normalise(playerPosition.x, minX, rangeX),
            y: 100 - normalise(playerPosition.y, minY, rangeY),
          }
        : null;

    const normalisedOpponents = opponentCandidates.map<
      TrackOpponent & { screenX: number; screenY: number }
    >((marker) => ({
      ...marker,
      screenX: normalise(marker.point.x, minX, rangeX),
      screenY: 100 - normalise(marker.point.y, minY, rangeY),
    }));

    return {
      outlinePoints: normalisedOutline,
      historyPoints: normalisedHistory,
      playerMarker: normalisedPlayer,
      opponentMarkers: normalisedOpponents,
    };
  }, [trackOutline, playerHistory, playerPosition, opponents]);

  return (
    <div className="space-y-3">
      <div className="relative h-64 rounded border border-gray-700 bg-gray-900/70">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <defs>
            <radialGradient id="player-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="opponent-ahead-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f472b6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="opponent-behind-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width="100" height="100" fill="#0f172a" rx="2" />

          {outlinePoints.length >= 2 && (
            <polyline
              points={outlinePoints.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="#64748b"
              strokeWidth={1.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.65}
            />
          )}

          {historyPoints.length >= 2 && (
            <polyline
              points={historyPoints.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.8}
            />
          )}

          {playerMarker && (
            <>
              <circle cx={playerMarker.x} cy={playerMarker.y} r={5} fill="url(#player-glow)" opacity={0.9} />
              <circle cx={playerMarker.x} cy={playerMarker.y} r={2} fill="#38bdf8" />
            </>
          )}

          {opponentMarkers.map((marker) => {
            const color = marker.isAhead ? '#fda4af' : '#34d399';
            const glowFill = marker.isAhead ? 'url(#opponent-ahead-glow)' : 'url(#opponent-behind-glow)';
            const label = marker.position ? `P${marker.position}` : 'Car';
            return (
              <g key={marker.id}>
                <circle cx={marker.screenX} cy={marker.screenY} r={4.4} fill={glowFill} opacity={0.8} />
                <circle cx={marker.screenX} cy={marker.screenY} r={2.2} fill={color} />
                <text
                  x={marker.screenX + 3.5}
                  y={marker.screenY - 3.5}
                  className="fill-white text-[3.2px]"
                  style={{ pointerEvents: 'none' }}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          <div>Outline pts: {trackOutline.length}</div>
          <div>Trail pts: {playerHistory.length}</div>
          <div>Opponents plotted: {opponentMarkers.length}</div>
        </div>
      </div>
    </div>
  );
};
