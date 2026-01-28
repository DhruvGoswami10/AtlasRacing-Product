/**
 * Universal Telemetry Converter
 * Based on the F1ProDashboard's refined implementation
 * Converts raw backend telemetry to standardized format for all dashboards
 */

import { TelemetryData } from '../types/telemetry';

// Helper functions
export const formatTime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "0:00.000";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toFixed(3).padStart(6, '0')}`;
};

export const formatSectorTime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "0.000";
  return seconds.toFixed(3);
};

// Track name mapping for F1 24
export const getF1TrackName = (trackId: number | undefined): string => {
  const tracks = [
    'Melbourne', 'Paul Ricard', 'Shanghai', 'Sakhir (Bahrain)', 'Catalunya',
    'Monaco', 'Montreal', 'Silverstone', 'Hockenheim', 'Hungaroring',
    'Spa', 'Monza', 'Singapore', 'Suzuka', 'Abu Dhabi',
    'Texas', 'Brazil', 'Austria', 'Sochi', 'Mexico',
    'Baku (Azerbaijan)', 'Sakhir Short', 'Silverstone Short', 'Texas Short', 'Suzuka Short',
    'Hanoi', 'Zandvoort', 'Imola', 'Portimão', 'Jeddah',
    'Miami', 'Las Vegas', 'Losail', 'Lusail'
  ];
  return tracks[trackId || 0] || `Track ${trackId}`;
};

// Session type mapping for F1 24
export const getF1SessionType = (sessionType: number | undefined): string => {
  const sessions = [
    'Unknown',      // 0
    'P1',          // 1
    'P2',          // 2
    'P3',          // 3
    'Short P',     // 4
    'Q1',          // 5
    'Q2',          // 6
    'Q3',          // 7
    'Short Q',     // 8
    'OSQ',         // 9
    'Race',        // 10
    'Race2',       // 11
    'Race3',       // 12
    'Time Trial',  // 13
    'Time Attack', // 14
    'Race',        // 15 - Career mode race
    'Sprint',      // 16
    'Sprint Shootout', // 17
    'Time Trial',  // 18 - Alternative time trial ID
    'Career Q'     // 19
  ];
  return sessions[sessionType || 0] || 'Unknown';
};

// Session type mapping for AC
export const getACSessionType = (sessionType: number | undefined): string => {
  const sessions = [
    'Practice',     // 0
    'Qualifying',   // 1
    'Race',         // 2
    'Hotlap',       // 3
    'Time Attack',  // 4
    'Drift',        // 5
    'Drag'          // 6
  ];
  return sessions[sessionType || 0] || 'Unknown';
};

// Tire compound mapping for F1 24 and AC
export const getTireCompound = (compound: number | undefined): string => {
  const compounds: { [key: number]: string } = {
    // F1 24 actual compounds (Packet 12)
    0: 'C0',
    1: 'C1',
    2: 'C2',
    3: 'C3',
    4: 'C4',
    5: 'C5',
    6: 'C6',

    // Visual compounds (HUD)
    16: 'Soft',
    17: 'Medium',
    18: 'Hard',
    19: 'Street',
    20: 'Semi-Slick',
    21: 'Slick',
    22: 'C6',

    7: 'Inter',  // Intermediate
    8: 'Wet'     // Wet
  };
  return compounds[compound || 0] || 'Unknown';
};

// Visual compound mapping (what the game shows)
export const getVisualCompound = (compound: number | undefined): string => {
  const compounds: { [key: number]: string } = {
    // F1 24 visual compounds
    16: 'Soft',
    17: 'Medium',
    18: 'Hard',
    // AC specific compounds
    19: 'Street',
    20: 'Semi-Slick',
    21: 'Slick',
    22: 'C6',
    7: 'Inter',
    8: 'Wet'
  };
  return compounds[compound || 0] || 'Unknown';
};

// Sector status mapping
export const getSectorStatus = (status: number | undefined): 'fastest' | 'personal' | 'none' => {
  if (status === 2) return 'fastest';  // Purple
  if (status === 1) return 'personal'; // Green
  return 'none';                       // Yellow
};

// Flag type mapping
export const getFlagType = (flagType: number | undefined): string => {
  const flags = ['None', 'Green', 'Blue', 'Yellow', 'Red'];
  return flags[flagType || 0] || 'None';
};

// Weather type mapping
export const getWeatherType = (weather: number | undefined): string => {
  const weathers = ['Clear', 'Light Cloud', 'Overcast', 'Light Rain', 'Heavy Rain', 'Storm'];
  return weathers[weather || 0] || 'Unknown';
};

// Safety car status mapping
export const getSafetyCarStatus = (status: number | undefined): string => {
  if (status === 1) return 'Full SC';
  if (status === 2) return 'VSC';
  if (status === 3) return 'Formation Lap';
  return 'No SC';
};

// Pit status mapping
export const getPitStatus = (status: number | undefined): string => {
  if (status === 1) return 'Pitting';
  if (status === 2) return 'In Pit';
  return 'On Track';
};

// DRS status helper
export const getDRSStatus = (drsAllowed: number | undefined, drsOpen: number | undefined): string => {
  if (!drsAllowed) return 'Not Allowed';
  if (drsOpen) return 'ACTIVE';
  return 'Available';
};

// Fuel mix mapping
export const getFuelMix = (fuelMix: number | undefined): string => {
  const mixes = ['Lean', 'Standard', 'Rich', 'Max'];
  return mixes[fuelMix || 0] || 'Standard';
};

// ERS deploy mode mapping
export const getERSMode = (mode: number | undefined): string => {
  const modes = ['None', 'Medium', 'Hotlap', 'Overtake'];
  return modes[mode || 0] || 'None';
};

/**
 * Universal telemetry converter
 * Converts raw backend data to standardized format
 */
export interface StandardizedTelemetry {
  // Core telemetry
  speed: number;
  rpm: number;
  gear: string;
  throttle: number;
  brake: number;
  steering: number;

  // Timing
  currentLapTime: string;
  lastLapTime: string;
  bestLapTime: string;
  estimatedLapTime: string;
  deltaTime: number;

  // Sectors
  sector1Time: string;
  sector2Time: string;
  sector3Time: string;
  sector1Status: 'fastest' | 'personal' | 'none';
  sector2Status: 'fastest' | 'personal' | 'none';
  sector3Status: 'fastest' | 'personal' | 'none';
  currentSector: number;

  // Position & Lap
  position: number;
  currentLapNum: number;
  totalLaps: number;
  lapDistance: number;
  totalDistance: number;

  // Tires (F1 24 wheel order: RL, RR, FL, FR)
  tireCompoundActual: string;
  tireCompoundVisual: string;
  tireAge: number;
  tireWearFL: number;  // Percentage
  tireWearFR: number;
  tireWearRL: number;
  tireWearRR: number;
  tireTempFL: number;  // Surface temp
  tireTempFR: number;
  tireTempRL: number;
  tireTempRR: number;
  tireTempInnerFL: number | null;
  tireTempInnerFR: number | null;
  tireTempInnerRL: number | null;
  tireTempInnerRR: number | null;
  tirePressureFL: number;
  tirePressureFR: number;
  tirePressureRL: number;
  tirePressureRR: number;

  // Brakes
  brakeTempFL: number;
  brakeTempFR: number;
  brakeTempRL: number;
  brakeTempRR: number;

  // Fuel & Energy
  fuelInTank: number;
  fuelRemainingLaps: number;
  fuelMix: string;
  ersStoreEnergy: number;     // Percentage
  ersDeployMode: string;
  ersDeploying: boolean;
  ersDeployedThisLap: number; // MJ

  // DRS
  drsEnabled: boolean;
  drsOpen: boolean;
  drsDistance: number;

  // Car Settings
  brakeBias: number;
  tc?: number;
  tc2?: number;
  abs?: number;
  engineBrake?: number;
  fuelMapSetting?: number;
  fuelMapMax?: number;
  differential: number;

  // Car Damage (percentage)
  frontLeftWingDamage: number;
  frontRightWingDamage: number;
  rearWingDamage: number;
  engineDamage: number;
  gearboxDamage: number;
  floorDamage: number;
  diffuserDamage: number;

  // Session Info
  sessionType: string;
  sessionTimeLeft: number;
  weather: string;
  trackTemp: number;
  airTemp: number;

  // Flags & Penalties
  flagType: string;
  penalties: number;
  penaltiesCount: number;
  lapInvalid: boolean;
  cornerCuttingWarnings: number;
  safetyCarStatus: string;
  marshalZones: number[];

  // Pit Info
  pitStatus: string;
  pitWindowIdealLap: number;
  pitWindowLatestLap: number;
  pitWindowOpen: boolean;

  // Game Info
  gameName: string;
  carName: string;
  trackName: string;
  trackId: number;

  // World Position (for track maps)
  worldPositionX: number;
  worldPositionY: number;
  worldPositionZ: number;

  // Raw data reference
  raw: TelemetryData;
}

export function convertTelemetry(data: TelemetryData | null): StandardizedTelemetry {
  if (!data) {
    // Return default values
    return {
      speed: 0,
      rpm: 0,
      gear: 'N',
      throttle: 0,
      brake: 0,
      steering: 0,
      currentLapTime: '0:00.000',
      lastLapTime: '0:00.000',
      bestLapTime: '0:00.000',
      estimatedLapTime: '0:00.000',
      deltaTime: 0,
      sector1Time: '0.000',
      sector2Time: '0.000',
      sector3Time: '0.000',
      sector1Status: 'none',
      sector2Status: 'none',
      sector3Status: 'none',
      currentSector: 0,
      position: 0,
      currentLapNum: 0,
      totalLaps: 0,
      lapDistance: 0,
      totalDistance: 0,
      tireCompoundActual: 'Unknown',
      tireCompoundVisual: 'Unknown',
      tireAge: 0,
      tireWearFL: 0,
      tireWearFR: 0,
      tireWearRL: 0,
      tireWearRR: 0,
      tireTempFL: 0,
      tireTempFR: 0,
      tireTempRL: 0,
      tireTempRR: 0,
      tireTempInnerFL: null,
      tireTempInnerFR: null,
      tireTempInnerRL: null,
      tireTempInnerRR: null,
      tirePressureFL: 0,
      tirePressureFR: 0,
      tirePressureRL: 0,
      tirePressureRR: 0,
      brakeTempFL: 0,
      brakeTempFR: 0,
      brakeTempRL: 0,
      brakeTempRR: 0,
      fuelInTank: 0,
      fuelRemainingLaps: 0,
      fuelMix: 'Standard',
      ersStoreEnergy: 0,
      ersDeployMode: 'None',
      ersDeploying: false,
      ersDeployedThisLap: 0,
      drsEnabled: false,
      drsOpen: false,
      drsDistance: 0,
      brakeBias: 50,
      differential: 50,
      frontLeftWingDamage: 0,
      frontRightWingDamage: 0,
      rearWingDamage: 0,
      engineDamage: 0,
      gearboxDamage: 0,
      floorDamage: 0,
      diffuserDamage: 0,
      sessionType: 'Unknown',
      sessionTimeLeft: 0,
      weather: 'Unknown',
      trackTemp: 0,
      airTemp: 0,
      flagType: 'None',
      penalties: 0,
      penaltiesCount: 0,
      lapInvalid: false,
      cornerCuttingWarnings: 0,
      safetyCarStatus: 'No SC',
      marshalZones: [],
      pitStatus: 'On Track',
      pitWindowIdealLap: 0,
      pitWindowLatestLap: 0,
      pitWindowOpen: false,
      gameName: 'Not Connected',
      carName: '',
      trackName: '',
      trackId: 0,
      worldPositionX: 0,
      worldPositionY: 0,
      worldPositionZ: 0,
      raw: {} as TelemetryData
    };
  }

  // Determine wheel mapping based on game
  const isAC = data.game_name === 'Assetto Corsa';

  // F1 24 wheel order in packets: RL(0), RR(1), FL(2), FR(3)
  // AC wheel order in shared memory: FL(0), FR(1), RL(2), RR(3)
  let WHEEL_FL, WHEEL_FR, WHEEL_RL, WHEEL_RR;

  if (isAC) {
    // AC standard order
    WHEEL_FL = 0;
    WHEEL_FR = 1;
    WHEEL_RL = 2;
    WHEEL_RR = 3;
  } else {
    // F1 24 order
    WHEEL_RL = 0;
    WHEEL_RR = 1;
    WHEEL_FL = 2;
    WHEEL_FR = 3;
  }

  const pickTempArray = (sources: unknown[]): (number | null)[] | null => {
    for (const source of sources) {
      if (!Array.isArray(source)) {
        continue;
      }
      const mapped = source.map((value) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      });
      if (mapped.some((value) => value !== null)) {
        return mapped;
      }
    }
    return null;
  };

  const sanitizeCoreTemps = (source: (number | null)[] | null): (number | null)[] | null => {
    if (!source) {
      return null;
    }

    const sanitized = source.map((value) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0.5) {
        return null;
      }
      return value;
    });

    return sanitized.some((value) => value !== null) ? sanitized : null;
  };

  const surfaceTemps = pickTempArray([
    data.tire_temps?.surface,
    (data as any).tireTemps?.surface,
    (data as any).tyre_temps?.surface,
    (data as any).tyreTemps?.surface,
    (data as any).tire_temps_surface,
  ]);

  const innerTemps = sanitizeCoreTemps(
    pickTempArray([
      data.tire_temps?.inner,
      (data as any).tireTemps?.inner,
      (data as any).tyre_temps?.inner,
      (data as any).tyreTemps?.inner,
      (data as any).tyre_temp_inner,
      (data as any).tire_temps_inner,
      (data as any).ac_extended?.tyre_temp_zones?.inner,
      (data as any).ac_extended?.tyre_temp_inner,
    ]),
  );

  return {
    // Core telemetry
    speed: Math.round(data.speed_kph || 0),
    rpm: data.rpm || 0,
    gear: data.gear === 0 ? 'N' : data.gear === -1 ? 'R' : String(data.gear),
    throttle: Math.round(data.throttle_percent || 0),
    brake: Math.round(data.brake_percent || 0),
    steering: Math.round(data.steering_angle || 0),

    // Timing
    currentLapTime: formatTime(data.current_lap_time || 0),
    lastLapTime: formatTime(data.last_lap_time || 0),
    bestLapTime: formatTime(data.best_lap_time || 0),
    estimatedLapTime: formatTime(data.estimated_lap_time || 0),
    deltaTime: data.delta_time || 0,

    // Sectors
    sector1Time: formatSectorTime(data.sector1_time || 0),
    sector2Time: formatSectorTime(data.sector2_time || 0),
    sector3Time: formatSectorTime(data.sector3_time || 0),
    sector1Status: getSectorStatus(data.sector1_status),
    sector2Status: getSectorStatus(data.sector2_status),
    sector3Status: getSectorStatus(data.sector3_status),
    currentSector: data.current_sector || 0,

    // Position & Lap
    position: data.position || 0,
    currentLapNum: data.current_lap_num || 0,
    totalLaps: data.total_laps || 0,
    lapDistance: Math.round(data.lap_distance || 0),
    totalDistance: Math.round((data as any).total_distance || 0),

    // Tires - Game-specific handling
    tireCompoundActual: getTireCompound((data as any).tyre_compound_actual || (data as any).tire_compound_actual),
    tireCompoundVisual: getVisualCompound((data as any).tyre_compound_visual || (data as any).tire_compound_visual),
    tireAge: (data as any).tyre_age_laps || (data as any).tire_age_laps || 0,

    // Tire wear - Backend sends tire_wear for both games as percentage (0-100)
    tireWearFL: Number((data.tire_wear?.[WHEEL_FL] ?? 0).toFixed(1)),
    tireWearFR: Number((data.tire_wear?.[WHEEL_FR] ?? 0).toFixed(1)),
    tireWearRL: Number((data.tire_wear?.[WHEEL_RL] ?? 0).toFixed(1)),
    tireWearRR: Number((data.tire_wear?.[WHEEL_RR] ?? 0).toFixed(1)),

    // Tire temperatures - Backend sends tire_temps.surface for both games
    // AC order: FL(0), FR(1), RL(2), RR(3) - same as backend expectation
    tireTempFL: surfaceTemps?.[WHEEL_FL] ?? data.tire_temps?.surface?.[WHEEL_FL] ?? 0,
    tireTempFR: surfaceTemps?.[WHEEL_FR] ?? data.tire_temps?.surface?.[WHEEL_FR] ?? 0,
    tireTempRL: surfaceTemps?.[WHEEL_RL] ?? data.tire_temps?.surface?.[WHEEL_RL] ?? 0,
    tireTempRR: surfaceTemps?.[WHEEL_RR] ?? data.tire_temps?.surface?.[WHEEL_RR] ?? 0,
    tireTempInnerFL: innerTemps?.[WHEEL_FL] ?? null,
    tireTempInnerFR: innerTemps?.[WHEEL_FR] ?? null,
    tireTempInnerRL: innerTemps?.[WHEEL_RL] ?? null,
    tireTempInnerRR: innerTemps?.[WHEEL_RR] ?? null,

    // Tire pressures - Backend sends tire_pressure for both games
    tirePressureFL: data.tire_pressure?.[WHEEL_FL] || 0,
    tirePressureFR: data.tire_pressure?.[WHEEL_FR] || 0,
    tirePressureRL: data.tire_pressure?.[WHEEL_RL] || 0,
    tirePressureRR: data.tire_pressure?.[WHEEL_RR] || 0,

    // Brake temperatures - Backend sends brake_temperature for both games
    // AC order: FL(0), FR(1), RL(2), RR(3) - same as backend expectation
    brakeTempFL: data.brake_temperature?.[WHEEL_FL] || 0,
    brakeTempFR: data.brake_temperature?.[WHEEL_FR] || 0,
    brakeTempRL: data.brake_temperature?.[WHEEL_RL] || 0,
    brakeTempRR: data.brake_temperature?.[WHEEL_RR] || 0,

    // Fuel & Energy
    fuelInTank: data.fuel_in_tank || 0,
    fuelRemainingLaps: data.fuel_remaining_laps || 0,
    fuelMix: getFuelMix(data.fuel_mix),
    ersStoreEnergy: Math.round(
      isAC
        ? ((data.ers_store_energy ?? 0) * 100)
        : (((data.ers_store_energy ?? 0) / 4.0) * 100)
    ),
    ersDeployMode: getERSMode(data.ers_deploy_mode),
    ersDeploying: (data.ers_deploy_mode || 0) > 0,
    ersDeployedThisLap: (data as any).ers_deployed_this_lap || 0,

    // DRS
    drsEnabled: (data.drs_allowed || 0) === 1,
    drsOpen: (data.drs_open || 0) === 1,
    drsDistance: (data as any).drs_activation_distance || 0,

    // Car Settings
    brakeBias: (() => {
      const rawBias = data.brake_bias;
      if (isAC && typeof rawBias === 'number' && Number.isFinite(rawBias)) {
        if (rawBias > 1.5) {
          return Number(rawBias.toFixed(1));
        }
        return Number((rawBias * 100).toFixed(1));
      }
      const f1Bias = (data as any).f1_brake_bias;
      if (!isAC && typeof f1Bias === 'number' && Number.isFinite(f1Bias)) {
        return f1Bias;
      }
      if (typeof rawBias === 'number' && Number.isFinite(rawBias)) {
        return Number(rawBias.toFixed(1));
      }
      return 50;
    })(),
    tc: typeof (data as any).traction_control_setting === 'number'
      ? (data as any).traction_control_setting
      : undefined,
    tc2: typeof (data as any).traction_control_setting_secondary === 'number'
      ? (data as any).traction_control_setting_secondary
      : undefined,
    abs: typeof (data as any).abs_setting === 'number'
      ? (data as any).abs_setting
      : undefined,
    engineBrake: typeof (data as any).engine_brake_setting === 'number'
      ? (data as any).engine_brake_setting
      : undefined,
    fuelMapSetting: typeof (data as any).fuel_map_setting === 'number'
      ? (data as any).fuel_map_setting
      : undefined,
    fuelMapMax: typeof (data as any).fuel_map_max === 'number'
      ? (data as any).fuel_map_max
      : undefined,
    differential: (() => {
      const raw = data.differential_on_throttle ?? 50;

      if (isAC) {
        return Math.round(raw);
      }

      const sessionType = getF1SessionType(data.session_type);

      // Time Trial works correctly
      if (sessionType === 'Time Trial') {
        return Math.min(100, Math.max(10, raw));
      }

      // In Race, differential is locked (Parc Ferme rules)
      if (raw === 0 || raw === 255) {
        return 50; // Default middle value when locked
      }

      // If value is > 100, might be raw 0-255 value
      if (raw > 100) {
        return Math.round(10 + (raw / 255) * 90);
      }

      return Math.min(100, Math.max(10, raw));
    })(),

    // Car Damage (from Packet 10 - F1 24 sends as percentage 0-100)
    frontLeftWingDamage: (data as any).front_left_wing_damage || 0,
    frontRightWingDamage: (data as any).front_right_wing_damage || 0,
    rearWingDamage: (data as any).rear_wing_damage || 0,
    engineDamage: (data as any).engine_damage || 0,
    gearboxDamage: (data as any).gearbox_damage || 0,
    floorDamage: (data as any).floor_damage || 0,
    diffuserDamage: (data as any).diffuser_damage || 0,

    // Session Info
    sessionType: data.game_name === 'Assetto Corsa' ? getACSessionType(data.session_type) : getF1SessionType(data.session_type),
    sessionTimeLeft: data.session_time_left || 0,
    weather: getWeatherType(data.weather),
    trackTemp: data.track_temperature || 0,
    airTemp: data.air_temperature || 0,

    // Flags & Penalties
    flagType: getFlagType((data as any).flag_type),
    penalties: (data as any).f1_penalties_time || 0,
    penaltiesCount: (data as any).f1_num_penalties || 0,
    lapInvalid: ((data as any).f1_lap_invalid || 0) === 1,
    cornerCuttingWarnings: (data as any).corner_cutting_warnings || 0,
    safetyCarStatus: getSafetyCarStatus(data.safety_car_status),
    marshalZones: data.marshal_zone_flags || [],

    // Pit Info
    pitStatus: getPitStatus(data.pit_status),
    pitWindowIdealLap: data.pit_window_ideal_lap || 0,
    pitWindowLatestLap: data.pit_window_latest_lap || 0,
    pitWindowOpen: (data.pit_window_open || 0) === 1,

    // Game Info
    gameName: data.game_name || 'Unknown',
    carName: (data as any).car_name || '',
    trackName: data.game_name === 'F1 24' ? getF1TrackName(data.track_id) : ((data as any).track_name || ''),
    trackId: data.track_id || 0,

    // World Position
    worldPositionX: data.world_position_x || 0,
    worldPositionY: data.world_position_y || 0,
    worldPositionZ: (data as any).world_position_z || 0,

    // Keep raw reference
    raw: data
  };
}
