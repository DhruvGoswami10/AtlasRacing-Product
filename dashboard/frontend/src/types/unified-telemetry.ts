import type { TyreSetData, PitPlan } from './telemetry';

// ─── Game Identifier ─────────────────────────────────────────────────────────

export type GameId = 'f1' | 'ac' | 'acc' | 'ats' | 'unknown';

// ─── Tuple Helpers ───────────────────────────────────────────────────────────

export type WheelQuad = [number, number, number, number]; // FL, FR, RL, RR
export type SectorTriple = [number, number, number];

// ─── Core Telemetry (shared by all games) ────────────────────────────────────

export interface UnifiedTelemetryCore {
  timestamp: number;
  game: GameId;
  connected: boolean;

  // Motion
  speed_kph: number;
  rpm: number;
  gear: number;
  throttle: number;   // 0-100
  brake: number;      // 0-100
  steering: number;   // -1 to 1
  clutch: number;     // 0-100

  // Timing
  current_lap_time: number;
  last_lap_time: number;
  best_lap_time: number;
  delta: number;
  position: number;
  current_lap: number;
  total_laps: number;
  sector_times: SectorTriple;
  current_sector: number;

  // Tyres
  tyre_wear: WheelQuad;
  tyre_surface_temp: WheelQuad;
  tyre_inner_temp: WheelQuad;
  tyre_pressure: WheelQuad;
  tyre_compound: string;
  tyre_age_laps: number;

  // Fuel
  fuel_remaining: number;      // kg or litres
  fuel_per_lap: number;
  fuel_laps_remaining: number;

  // Session
  session_type: string;        // practice, qualifying, race, hotlap, etc.
  weather: string;             // clear, rain, etc.
  track_temp: number;
  air_temp: number;
  safety_car: string;         // none, full, virtual
  pit_status: string;         // none, pitting, in_pit

  // Flags
  flag: string;               // none, green, yellow, red, blue, black, chequered
}

// ─── F1-Specific Extension ───────────────────────────────────────────────────

export interface F1Extension {
  ers_store: number;
  ers_deploy_mode: number;
  ers_deployed_this_lap: number;
  drs_allowed: boolean;
  drs_open: boolean;
  brake_bias: number;
  differential: number;
  pit_window_open: boolean;
  pit_window_ideal_lap: number;
  pit_window_latest_lap: number;
  max_rpm: number;

  tyre_sets?: TyreSetData[];

  gap_to_leader: number;
  gap_to_car_ahead: number;

  pit_strategy?: PitPlan;

  sector_statuses: SectorTriple; // 0=none, 1=personal best, 2=overall fastest
}

// ─── Assetto Corsa Extension ─────────────────────────────────────────────────

export interface ACExtension {
  tyre_temp_inner: WheelQuad;
  tyre_temp_middle: WheelQuad;
  tyre_temp_outer: WheelQuad;
  suspension_travel: WheelQuad;
  wheel_slip: WheelQuad;
  wheel_load: WheelQuad;
  performance_meter: number;
  surface_grip: number;
  camber: WheelQuad;
  ride_height: [number, number]; // front, rear
  tc_setting: number;
  tc2_setting: number;
  abs_setting: number;
  engine_brake: number;
  fuel_map: number;
  fuel_map_max: number;
  turbo_boost: number;
  pit_limiter: boolean;
  car_damage: number[];
  wind_speed: number;
  wind_direction: number;
}

// ─── Assetto Corsa Competizione Extension ────────────────────────────────────

export interface ACCExtension extends ACExtension {
  ecu_map: number;
  rain_lights: boolean;
  flasher: boolean;
  wet_track: boolean;
  grip_status: string;
}

// ─── American Truck Simulator Extension ──────────────────────────────────────

export interface ATSExtension {
  fatigue: number;                // 0-100
  speed_limit: number;            // current road speed limit
  cruise_control_speed: number;
  cargo_name: string;
  cargo_weight: number;
  cargo_damage: number;           // 0-100%
  delivery_distance: number;      // remaining km
  delivery_eta: number;           // estimated time of arrival in seconds
  rest_stop_distance: number;     // distance to nearest rest stop
  fuel_capacity: number;
  fuel_consumption_rate: number;  // L/100km or mpg
  odometer: number;
  engine_temp: number;
  oil_temp: number;
  oil_pressure: number;
  battery_voltage: number;
  adblue: number;
  truck_damage: {
    engine: number;
    transmission: number;
    cabin: number;
    chassis: number;
    wheels: number;
  };
  lights_on: boolean;
  wipers_on: boolean;
  parking_brake: boolean;
  retarder_level: number;
}

// ─── Combined Unified Telemetry ──────────────────────────────────────────────

export interface UnifiedTelemetry extends UnifiedTelemetryCore {
  f1?: F1Extension;
  ac?: ACExtension;
  acc?: ACCExtension;
  ats?: ATSExtension;
}

// ─── Widget Metadata (dashboard builder) ─────────────────────────────────────

export type WidgetCategory =
  | 'gauge'
  | 'tyre'
  | 'timing'
  | 'fuel'
  | 'strategy'
  | 'race'
  | 'session'
  | 'ai'
  | 'truck'
  | 'input';

export interface WidgetMeta {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  supportedGames: (GameId | 'all')[];
}

// ─── Default Factory ─────────────────────────────────────────────────────────

export function createDefaultTelemetry(): UnifiedTelemetry {
  return {
    timestamp: 0,
    game: 'unknown',
    connected: false,

    speed_kph: 0,
    rpm: 0,
    gear: 0,
    throttle: 0,
    brake: 0,
    steering: 0,
    clutch: 0,

    current_lap_time: 0,
    last_lap_time: 0,
    best_lap_time: 0,
    delta: 0,
    position: 0,
    current_lap: 0,
    total_laps: 0,
    sector_times: [0, 0, 0],
    current_sector: 0,

    tyre_wear: [0, 0, 0, 0],
    tyre_surface_temp: [0, 0, 0, 0],
    tyre_inner_temp: [0, 0, 0, 0],
    tyre_pressure: [0, 0, 0, 0],
    tyre_compound: '',
    tyre_age_laps: 0,

    fuel_remaining: 0,
    fuel_per_lap: 0,
    fuel_laps_remaining: 0,

    session_type: '',
    weather: '',
    track_temp: 0,
    air_temp: 0,
    safety_car: 'none',
    pit_status: 'none',

    flag: 'none',
  };
}
