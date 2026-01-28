import type { AtlasLinkEvent, AtlasLinkOpponent, AtlasLinkSnapshot } from '../types/atlasLink';

const DRIVER_NAMES = [
  'Leon Hartmann',
  'Sara Ito',
  'Miguel Duarte',
  'Emily Chen',
  'Jonas Müller',
  'Felipe Navarro',
  'Ava Collins',
  'Tomasz Kowalski',
  'Noah Fischer',
  'Riley Morgan',
  'Luca Romano',
  'Oscar Nilsson',
];

const CAR_MODELS = [
  'Audi R8 LMS GT3',
  'BMW M4 GT3',
  'Ferrari 296 GT3',
  'Mercedes-AMG GT3',
  'Porsche 992 GT3R',
  'Lamborghini Huracán GT3',
];

const CAR_CLASSES = ['GT3', 'GT4', 'LMP2'];

const TYRE_COMPOUNDS = ['Slick', 'Medium Slick', 'Soft Slick', 'Wet', 'Inter'];

let tick = 0;
const eventBuffer: AtlasLinkEvent[] = [];

const randomChoice = <T,>(values: readonly T[]): T =>
  values[Math.floor(Math.random() * values.length)];

const jitter = (amplitude: number, phase: number) =>
  Math.sin(phase) * amplitude;

const formatEvent = (partial: Omit<AtlasLinkEvent, 'timestampMs'>): AtlasLinkEvent => ({
  ...partial,
  timestampMs: Date.now(),
});

const pushEvent = (event: AtlasLinkEvent) => {
  eventBuffer.push(event);
  if (eventBuffer.length > 12) {
    eventBuffer.splice(0, eventBuffer.length - 12);
  }
};

// Seed with an initial message.
pushEvent(
  formatEvent({
    type: 'link_boot',
    description: 'AtlasLink mock feed initialised',
    severity: 'notice',
  }),
);

export const generateMockAtlasLinkSnapshot = (): AtlasLinkSnapshot => {
  tick += 1;
  const phase = tick / 25;
  const playerPosition = 5;
  const lap = 12 + Math.floor(tick / 220);
  const lapProgress = (tick % 220) / 220;
  const totalLaps = 30;
  const timeLeftSeconds = Math.max(0, 3600 - tick * 2);
  const baseSpeed = 215 + jitter(18, phase / 1.5);
  const throttle = 70 + jitter(25, phase);
  const brake = Math.max(0, 18 + jitter(20, phase + 0.8));
  const rpm = 7600 + jitter(900, phase / 0.8);
  const kers = 62 + jitter(15, phase / 0.6);
  const tyreWear = Math.min(78, 18 + lap * 1.7 + lapProgress * 5);
  const tyreTemps = [92, 94, 95, 93].map((base, index) => base + jitter(2.5, phase + index * 0.5));
  const tyrePressures = [26.4, 26.5, 26.3, 26.4].map(
    (base, index) => base + jitter(0.1, phase + index),
  );

  if (tick % 240 === 0) {
    pushEvent(
      formatEvent({
        type: 'pit_window',
        description: 'Pit window recommendation opened for class',
        severity: 'info',
      }),
    );
  }
  if (tick % 360 === 90) {
    pushEvent(
      formatEvent({
        type: 'yellow_flag',
        description: `Local yellow at sector ${(tick / 90) % 3 + 1}`,
        severity: 'warning',
      }),
    );
  }
  if (tick % 540 === 120) {
    pushEvent(
      formatEvent({
        type: 'hazard',
        description: `${randomChoice(DRIVER_NAMES)} reported gravel offline`,
        severity: 'notice',
      }),
    );
  }

  const opponents: AtlasLinkOpponent[] = [];
  for (let position = 1; position <= 12; position += 1) {
    if (position === playerPosition) {
      continue;
    }
    const rankOffset = position - playerPosition;
    const gapToPlayer = rankOffset === 0 ? 0 : rankOffset * 1.35 + jitter(0.15, phase + position);
    const gapToLeader = position === 1 ? 0 : position * 1.35 + jitter(0.2, phase + position / 3);
    opponents.push({
      driverName: DRIVER_NAMES[(position - 1) % DRIVER_NAMES.length],
      carModel: CAR_MODELS[(position - 1) % CAR_MODELS.length],
      carClass: randomChoice(CAR_CLASSES),
      position,
      gapToLeaderSeconds: Number(gapToLeader.toFixed(2)),
      gapToPlayerSeconds:
        rankOffset > 0 ? Number(gapToPlayer.toFixed(2)) : Number((-gapToPlayer).toFixed(2)),
      intervalAheadSeconds:
        position === 1 ? null : Number((1.25 + jitter(0.1, phase + position)).toFixed(2)),
      lap: lap + Math.max(0, Math.sign(-rankOffset)),
      tyreCompound: randomChoice(TYRE_COMPOUNDS),
      tyreAgeLaps: Math.floor(3 + Math.abs(rankOffset) * 1.4 + (tick % 30) / 10),
      inPit: (tick + position) % 420 === 0,
      lastLapSeconds: Number((93.5 + jitter(1.2, phase + position / 2)).toFixed(3)),
      bestLapSeconds: Number((92.1 + jitter(0.8, phase + position / 4)).toFixed(3)),
      speedKph: Number((baseSpeed + jitter(15, phase + position / 5)).toFixed(1)),
      isClassLeader: position === 1 || position === playerPosition - 1,
    });
  }

  return {
    session: {
      game: 'Assetto Corsa',
      trackName: 'Spa-Francorchamps',
      layout: 'GP',
      sessionType: 'Race',
      weather: 'Light Cloud',
      totalLaps,
      completedLaps: Math.min(lap, totalLaps),
      timeLeftSeconds,
      lapLengthMeters: 7004,
    },
    player: {
      driverName: 'Atlas Driver',
      carModel: 'Ferrari 296 GT3',
      carClass: 'GT3',
      position: playerPosition,
      lap,
      totalLaps,
      bestLapSeconds: 92.462,
      lastLapSeconds: Number((92.9 + jitter(0.6, phase)).toFixed(3)),
      deltaToLeader: Number((baseSpeed / 100 - 0.6).toFixed(2)),
      speedKph: Number(baseSpeed.toFixed(1)),
      throttlePercent: Math.max(0, Math.min(100, Number(throttle.toFixed(0)))),
      brakePercent: Math.max(0, Math.min(100, Number(brake.toFixed(0)))),
      gear: ['2', '3', '4', '5', '6'][Math.floor((tick / 5) % 5)],
      rpm: Math.round(rpm),
      fuelLiters: Number((65 - lap * 1.8 - lapProgress * 1.2).toFixed(1)),
      fuelLapsRemaining: Number((Math.max(0, 12 - lapProgress * 2)).toFixed(1)),
      brakeBiasPercent: 58.5 + jitter(0.3, phase / 1.2),
      tractionControlSetting: 5,
      absSetting: 4,
      drsAvailable: false,
      drsActive: false,
      kersPercent: Math.max(0, Math.min(100, Number(kers.toFixed(1)))),
      tyreSummary: {
        compound: 'Slick',
        wearPercent: Number(tyreWear.toFixed(1)),
        ageLaps: lap * 1.2,
        tempsC: tyreTemps.map((temp) => Number(temp.toFixed(1))),
        pressuresPsi: tyrePressures.map((value) => Number(value.toFixed(2))),
      },
    },
    opponents,
    events: [...eventBuffer],
    meta: {
      appVersion: '0.0.0-dev',
      bridgeVersion: 'mock-telemetry',
      source: 'mock-generator',
      tick,
      generatedAtMs: Date.now(),
    },
  };
};
