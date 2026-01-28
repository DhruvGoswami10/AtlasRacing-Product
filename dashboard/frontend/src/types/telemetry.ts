// TypeScript definitions for F1 24 telemetry data

export interface PitPlanStop {
  target_lap: number;
  window_open: number;
  window_close: number;
  compound: number;
  stint_length: number;
}

export interface PitPlan {
  label: string;
  total_stops: number;
  stops_completed: number;
  risk_rating: number;
  projected_total_time: number;
  delta_vs_best: number;
  confidence: number;
  stop_count: number;
  cheap_pit_opportunity: number;
  stops: PitPlanStop[];
}

export interface TelemetryData {
  timestamp: number;
  speed_kph: number;
  rpm: number;
  gear: number;
  throttle_percent: number;
  brake_percent: number;
  speed_delta: number;
  rpm_delta: number;
  current_lap_time: number;
  last_lap_time: number;
  best_lap_time: number;
  position: number;
  current_lap_num: number;
  sector1_time: number;
  sector2_time: number;
  sector3_time: number;
  current_sector: number;
  pit_status: number;
  tire_compound: string;
  tire_age_laps: number;
  tire_temps: {
    surface: number[];
    inner: number[];
  };
  tire_pressure: number[];
  tire_wear?: number[];           // F1 24 tyre wear percentage (optional)
  tyre_blisters?: number[];       // F1 25: Tyre blisters percentage FL, FR, RL, RR
  tyre_stint_progress?: number;   // 0-1 progress through current tyre stint
  tyre_strategy_status?: number;  // 0 healthy, 1 caution, 2 critical
  fuel_in_tank: number;
  fuel_mix?: number;              // Fuel mix (0=lean, 1=standard, 2=rich, 3=max)
  fuel_remaining_laps: number;
  fuel_margin_laps?: number;      // Positive = spare fuel, negative = deficit
  fuel_deficit_laps?: number;     // Absolute deficit in laps when negative
  fuel_target_save_per_lap?: number; // Laps worth of fuel to save each lap
  fuel_strategy_status?: number;  // 0 optimal, 1 monitor, 2 critical
  drs_allowed: number;
  drs_open?: number;                // F1 Dashboard V4: DRS current state (0=off, 1=on)
  max_rpm?: number;                 // F1 Dashboard V4: Maximum RPM for rev limiter
  ers_deploy_mode: number;
  ers_store_energy: number;
  ers_store_percent?: number;     // ERS store as percentage of maximum
  ers_strategy_mode?: number;     // 0 balanced, 1 harvest, 2 attack, 3 defend
  ers_attack_gap?: number;        // Gap threshold to car ahead for attack mode
  ers_defend_gap?: number;        // Gap threshold to car behind for defend mode
  ers_harvest_gap?: number;       // Gap threshold where harvesting is safe
  differential_on_throttle?: number; // F1 Dashboard V4: Differential setting %
  pit_window_ideal_lap?: number;    // F1 Dashboard V4: Ideal pit lap
  pit_window_latest_lap?: number;   // F1 Dashboard V4: Latest pit lap
  pit_window_open?: number;         // F1 Dashboard V4: Pit window status (0=closed, 1=open)
  pit_strategy_status?: number;     // 0 hold, 1 plan, 2 box now
  pit_recommended_lap?: number;     // Suggested lap to pit
  pit_net_time_delta?: number;      // Net time change if we pit immediately
  pit_time_loss_no_pit?: number;    // Estimated loss if we stay out
  pit_tire_time_gain?: number;      // Time gained from fresh tyres
  pit_fuel_time_gain?: number;      // Time gained from lighter fuel
  delta_time?: number;              // F1 Dashboard V4: Real-time delta vs reference
  estimated_lap_time?: number;      // F1 Dashboard V4: Predicted lap time
  sector1_status?: number;          // F1 Dashboard V4: 0=none, 1=personal, 2=fastest
  sector2_status?: number;          // F1 Dashboard V4: Sector timing status
  sector3_status?: number;          // F1 Dashboard V4: Sector timing status
  brake_bias?: number;              // F1 24: Front brake bias percentage (0-100)
  
  // Game identifier
  game_name?: string;
  
  // Motion data
  world_position_x?: number;
  world_position_y?: number;
  lap_distance?: number;
  
  // Session data
  weather?: number;
  track_temperature?: number;
  air_temperature?: number;
  total_laps?: number;
  track_id?: number;
  session_type?: number;
  session_time_left?: number;
  safety_car_status?: number;
  marshal_zones_count?: number;
  marshal_zone_flags?: number[];
  
  // Enhanced tyre data
  brake_temperature?: number[];
  surface_type?: number[];
  
  // AC-specific fields
  tyreTempInner?: number[];      // Inner tire temps FL,FR,RL,RR
  tyreTempMiddle?: number[];     // Middle tire temps
  tyreTempOuter?: number[];      // Outer tire temps
  tyreWear?: number[];           // Tire wear
  suspensionTravel?: number[];   // Suspension travel
  performanceMeter?: number;     // Performance vs best lap
  surfaceGrip?: number;          // Track surface grip
  windSpeed?: number;            // Wind speed
  windDirection?: number;        // Wind direction
  steerAngle?: number;           // Steering angle
  steering_angle?: number;        // Steering angle (from backend)
  clutch?: number;               // Clutch position
  pitLimiterOn?: boolean;        // Pit limiter status
  tc?: number;                   // Traction control setting
  tc2?: number;                  // Secondary traction control setting
  abs?: number;                  // ABS setting
  engineBrake?: number;          // Engine brake setting
  fuelMapSetting?: number;       // Fuel/engine map setting
  fuelMapMax?: number;           // Max available fuel map slots
  turboBoost?: number;           // Turbo boost pressure
  ballast?: number;              // Ballast weight
  brakeBias?: number;            // Brake bias
  carDamage?: number[];          // Car damage levels
  
  // Event data (from Packet 3)
  race_events?: RaceEvent[];
  
  // Car setup data (from Packet 5)
  car_setup?: CarSetupData;
  
  // AC penalty system (top level for mistake detection)
  penalties_enabled?: number;        // Cut penalties enabled
  penalty_time?: number;             // Current penalty time
  numberOfTyresOut?: number;         // How many tires are out of track (CRITICAL for track limits)
  flag_type?: number;                // Current flag type (0=none, 6=penalty)
  normalized_car_position?: number;  // Position on track spline (0-1)
  
  // Tyre sets data (from Packet 12)
  tyre_sets?: TyreSetData[];
  
  // AC Extended Telemetry Data (new comprehensive structure)
  ac_extended?: {
    tyre_temp_zones?: {
      inner: number[];           // Inner tire temperature zones FL, FR, RL, RR
      middle: number[];          // Middle tire temperature zones FL, FR, RL, RR  
      outer: number[];           // Outer tire temperature zones FL, FR, RL, RR
    };
    tyre_wear_detailed: number[];      // Detailed tire wear FL, FR, RL, RR
    suspension_travel: number[];       // Suspension travel FL, FR, RL, RR
    performance_meter: number;         // Performance vs best lap meter
    surface_grip: number;              // Track surface grip level
    wind_speed: number;                // Wind speed
    wind_direction: number;            // Wind direction (0-359 degrees)
    clutch_position: number;           // Clutch pedal position 0-1
    turbo_boost: number;               // Turbo boost pressure
    ballast_kg: number;                // Ballast weight in kg
    air_density: number;               // Air density
    center_of_gravity_height: number;  // Center of gravity height
    force_feedback: number;            // Current force feedback value
    camber_angle: number[];            // Camber angle for each wheel (radians)
    wheel_slip: number[];              // Wheel slip for each tire
    wheel_load: number[];              // Wheel load in Newtons FL, FR, RL, RR
    local_angular_velocity: number[];  // Angular velocity x,y,z
    local_velocity: number[];          // Local velocity vector x,y,z
    acceleration_g: number[];          // G-forces x,y,z
    car_damage: number[];              // Damage levels for car sections
    brake_bias: number;                // Brake bias (0=rear, 1=front)
    is_ai_controlled: number;          // AI controlled car flag
    auto_shifter_enabled: number;      // Auto shifter enabled
    pit_limiter_enabled: number;       // Pit limiter enabled
    ideal_line_enabled: number;        // Ideal line display enabled
    traction_control_setting: number;          // TC setting
    traction_control_setting_secondary?: number; // TC2 setting (if available)
    abs_setting: number;                        // ABS setting
    fuel_map_setting?: number;                  // Fuel/engine map (ERS power) setting
    fuel_map_max?: number;                      // Maximum selectable fuel map
    engine_brake_setting: number;               // Engine brake setting
    steering_angle: number;            // Steering wheel angle
    heading_angle: number;             // Car heading angle
    pitch_angle: number;               // Car pitch angle
    roll_angle: number;                // Car roll angle
    normalized_car_position: number;   // Position on track spline (0-1)
    track_spline_length: number;       // Total track spline length
    penalties_enabled: number;         // Cut penalties enabled
    penalty_time: number;              // Current penalty time
    numberOfTyresOut: number;          // How many tires are out of track (CRITICAL for track limits)
    flag_type: number;                 // Current flag type (0=none, 6=penalty)
    ride_height: number[];             // Ride height front/rear
  };

  // === ATLAS AI: Strategic Telemetry ===
  atlas_ai?: {
    // Fuel calculations
    fuel_per_lap_average: number;           // Rolling 5-lap average kg/lap
    fuel_last_lap: number;                  // Fuel used on previous lap
    fuel_laps_remaining_calculated: number; // Our calculation (more accurate)
    fuel_calc_ready: number;                // 1 when we have enough history (>=2 laps)
    fuel_margin_laps: number;              // Positive = extra fuel, negative = deficit
    fuel_deficit_laps: number;             // Absolute deficit in laps when negative
    fuel_target_save_per_lap: number;      // Laps worth of fuel to save each lap
    fuel_strategy_status: number;          // 0 optimal, 1 monitor, 2 critical

    // Tire degradation
    tyre_degradation_rate: number;          // Seconds lost per lap vs optimal
    tyre_life_remaining_laps: number;       // Predicted laps until critical
    tyre_performance_index: number;         // 0-100, current performance level
    tyre_critical_warning: number;          // 1 if < 3 laps remaining
    tyre_stint_progress: number;            // 0-1 progress through current tyre stint
    tyre_strategy_status: number;           // 0 healthy, 1 caution, 2 critical

    // Pit strategy
    pit_delta_time: number;                 // Track-specific pit time loss
    pit_delta_with_wing: number;            // Pit time if wing change needed
    pit_advantage_available: number;        // 1 if pitting is advantageous
    pit_break_even_laps: number;            // Laps needed to recover pit loss
    pit_strategy_status: number;            // 0 hold, 1 plan, 2 box now
    pit_recommended_lap: number;            // Suggested lap to pit
    pit_net_time_delta: number;             // Net time change if we pit immediately
    pit_time_loss_no_pit: number;           // Estimated loss if we stay out
    pit_tire_time_gain: number;             // Time gained from fresh tyres
    pit_fuel_time_gain: number;             // Time gained from lighter fuel
    pit_rejoin_position: number;            // Projected position after pitting now
    pit_rejoin_ahead: {
      driver_name: string;
      position: number;
      gap_seconds: number;
    };
    pit_rejoin_behind: {
      driver_name: string;
      position: number;
      gap_seconds: number;
    };
    pit_stops_completed: number;
    last_pit_stop_lap: number;
    pit_plan_count: number;
    pit_plan_selected: number;
    pit_cheap_stop_available: number;
    pit_plan_primary: PitPlan;
    pit_plan_alternative: PitPlan;
    pit_plan_third: PitPlan;

    // ERS guidance
    ers_store_percent: number;              // Current ERS store percentage
    ers_strategy_mode: number;              // 0 balanced, 1 harvest, 2 attack, 3 defend
    ers_attack_gap: number;                 // Gap threshold to car ahead
    ers_defend_gap: number;                 // Gap threshold to car behind
    ers_harvest_gap: number;                // Gap threshold considered safe to harvest

    // Nearby opponents
    opponent_ahead_1: {
      driver_name: string;
      position: number;
      gap_seconds: number;
      tyre_age: number;
      last_lap_time: number;
      tyre_compound: number;
    };
    opponent_ahead_2: {
      driver_name: string;
      position: number;
      gap_seconds: number;
      tyre_age: number;
      last_lap_time: number;
      tyre_compound: number;
    };
    opponent_behind_1: {
      driver_name: string;
      position: number;
      gap_seconds: number;
      tyre_age: number;
      last_lap_time: number;
      tyre_compound: number;
    };
    opponent_behind_2: {
      driver_name: string;
      position: number;
      gap_seconds: number;
      tyre_age: number;
      last_lap_time: number;
      tyre_compound: number;
    };
    num_opponents_ahead: number;
    num_opponents_behind: number;
  };
}

// Event data structures (Packet 3)
export interface RaceEvent {
  id: string;
  type: 'FTLP' | 'RTMT' | 'PENA' | 'OVTK' | 'STLG' | 'DRSE' | 'DRSN' | 'CHQF' | 'RCWN' | 'SPTP' | 
        'SSTA' | 'LGOT' | 'DRSD' | 'RDFL' | 'DTSV' | 'SGSV' | 'FLBK' | 'SCAR' | 'COLL' | 'TMPT' | 
        'YFLAG' | 'YFEND' | 'SCFULL' | 'SCVIR' | 'SCEND' | 'SCFORM' | 'SEND' | 'DSQ' | 'DNF';
  message: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
  vehicleIdx?: number;
  data?: any;
}

// Car setup data structures (Packet 5)
export interface CarSetupData {
  frontWing: number;
  rearWing: number;
  onThrottle: number;
  offThrottle: number;
  frontCamber: number;
  rearCamber: number;
  frontToe: number;
  rearToe: number;
  frontSuspension: number;
  rearSuspension: number;
  frontAntiRollBar: number;
  rearAntiRollBar: number;
  frontSuspensionHeight: number;
  rearSuspensionHeight: number;
  brakePressure: number;
  brakeBias: number;
  rearLeftTyrePressure: number;
  rearRightTyrePressure: number;
  frontLeftTyrePressure: number;
  frontRightTyrePressure: number;
  ballast: number;
  fuelLoad: number;
}

// Tyre sets data structures (Packet 12)
export interface TyreSetData {
  id: number;
  actualTyreCompound: number;
  visualTyreCompound: number;
  wear: number;
  available: boolean;
  recommendedSession: number;
  lifeSpan: number;
  usableLife: number;
  lapDeltaTime: number;
  fitted: boolean;
}

export interface TyreSetsData {
  sets: TyreSetData[];
  fittedIdx: number;
}

export interface CarTelemetryRaw {
  m_speed: number;
  m_throttle: number;
  m_steer: number;
  m_brake: number;
  m_clutch: number;
  m_gear: number;
  m_engineRPM: number;
  m_drs: number;
  m_revLightsPercent: number;
  m_brakesTemperature: number[];
  m_tyresSurfaceTemperature: number[];
  m_tyresInnerTemperature: number[];
  m_engineTemperature: number;
  m_tyresPressure: number[];
}

export interface LapData {
  m_lastLapTimeInMS: number;
  m_currentLapTimeInMS: number;
  m_sector1TimeInMS: number;
  m_sector2TimeInMS: number;
  m_deltaToCarInFrontInMS: number;
  m_deltaToRaceLeaderInMS: number;
  m_lapDistance: number;
  m_totalDistance: number;
  m_carPosition: number;
  m_currentLapNum: number;
  m_pitStatus: number;
  m_numPitStops: number;
  m_sector: number;
  m_currentLapInvalid: number;
  m_penalties: number;
  m_gridPosition: number;
  m_driverStatus: number;
  m_resultStatus: number;
}

export interface SessionData {
  sessionUID: string;
  sessionTime: number;
  frameIdentifier: number;
  playerCarIndex: number;
  connected: boolean;
  lastUpdateTime: number;
}

export interface DashboardState {
  telemetry: TelemetryData | null;
  session: SessionData | null;
  isConnected: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError?: string;
}

export interface WidgetProps {
  telemetry: TelemetryData;
  className?: string;
}

export interface DashboardLayout {
  id: string;
  name: string;
  description: string;
  widgets: {
    id: string;
    type: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    config?: Record<string, any>;
  }[];
}

// Widget configuration types
export interface SpeedWidgetConfig {
  showDelta: boolean;
  unit: 'kph' | 'mph';
  maxSpeed: number;
}

export interface RPMWidgetConfig {
  showRedline: boolean;
  maxRPM: number;
  redlineRPM: number;
}

export interface LapTimeWidgetConfig {
  showSectors: boolean;
  showDeltas: boolean;
  precision: number;
}

// F1 24 Packet Structures for Pit Wall Dashboard

export interface ParticipantData {
  m_aiControlled: number;
  m_driverId: number;
  m_networkId: number;
  m_teamId: number;
  m_myTeam: number;
  m_raceNumber: number;
  m_nationality: number;
  m_name: string;
  m_yourTelemetry: number;
  m_showOnlineNames: number;
  m_platform: number;
}

export interface PacketParticipantsData {
  m_header: PacketHeader;
  m_numActiveCars: number;
  m_participants: ParticipantData[];
}

export interface PacketHeader {
  m_packetFormat: number;
  m_gameMajorVersion: number;
  m_gameMinorVersion: number;
  m_packetVersion: number;
  m_packetId: number;
  m_sessionUID: string;
  m_sessionTime: number;
  m_frameIdentifier: number;
  m_playerCarIndex: number;
  m_secondaryPlayerCarIndex: number;
}

export interface LapDataAll {
  m_lapData: LapData[];
}

export interface PacketLapData {
  m_header: PacketHeader;
  m_lapData: LapData[];
  m_timeTrialPBCarIdx: number;
  m_timeTrialRivalCarIdx: number;
}

export interface CarStatusData {
  m_tractionControl: number;
  m_antiLockBrakes: number;
  m_fuelMix: number;
  m_frontBrakeBias: number;
  m_pitLimiterStatus: number;
  m_fuelInTank: number;
  m_fuelCapacity: number;
  m_fuelRemainingLaps: number;
  m_maxRPM: number;
  m_idleRPM: number;
  m_maxGears: number;
  m_drsAllowed: number;
  m_drsActivationDistance: number;
  m_actualTyreCompound: number;
  m_visualTyreCompound: number;
  m_tyresAgeLaps: number;
  m_vehicleFiaFlags: number;
  m_ersStoreEnergy: number;
  m_ersDeployMode: number;
  m_ersHarvestedThisLapMGUK: number;
  m_ersHarvestedThisLapMGUH: number;
  m_ersDeployedThisLap: number;
  m_networkPaused: number;
}

export interface PacketCarStatusData {
  m_header: PacketHeader;
  m_carStatusData: CarStatusData[];
}

// Enhanced telemetry data for all cars (matches backend JSON structure)
export interface MultiCarTelemetryData {
  type: "multicar";
  timestamp: number;
  num_active_cars: number;
  session_best_times: {
    sector1: number;
    sector2: number;
    sector3: number;
    lap: number;
  };
  cars: {
    car_index: number;
    position: number;
    driver_name: string;
    team_id: number;
    team_name: string;
    race_number: number;
    is_player?: number;
    current_lap_time: number;
    last_lap_time: number;
    sector1_time: number;
    sector2_time: number;
    sector3_time: number;
    current_sector: number;
    pit_status: number;
    tyre_compound: string;
    tyre_age: number;
    fuel_remaining_laps: number;
    gap_to_leader?: number; // Gap to race leader in seconds
    gap_to_car_ahead?: number; // Gap to car directly ahead in seconds
    world_position_x?: number;
    world_position_y?: number;
    lap_distance?: number;
    fuel_margin_laps?: number;
    fuel_strategy_status?: number;
    tyre_strategy_status?: number;
    pit_strategy_status?: number;
    ers_store_percent?: number;
    ers_strategy_mode?: number;
    best_lap_time?: number;
    has_fastest_lap?: number;
  }[];
}

// Legacy interface for backward compatibility
export interface MultiCarTelemetryDataLegacy {
  header: PacketHeader;
  participants: ParticipantData[];
  lapData: LapData[];
  carStatusData: CarStatusData[];
  timestamp: number;
}

// Driver names mapping
export const DRIVER_NAMES: { [key: number]: string } = {
  0: "Carlos Sainz",
  1: "Charles Leclerc", 
  2: "Max Verstappen",
  3: "Sergio Perez",
  4: "Lando Norris",
  5: "Oscar Piastri",
  6: "George Russell",
  7: "Lewis Hamilton",
  8: "Fernando Alonso",
  9: "Lance Stroll",
  10: "Yuki Tsunoda",
  11: "Daniel Ricciardo",
  12: "Nico Hulkenberg",
  13: "Kevin Magnussen",
  14: "Alexander Albon",
  15: "Logan Sargeant",
  16: "Esteban Ocon",
  17: "Pierre Gasly",
  18: "Valtteri Bottas",
  19: "Zhou Guanyu"
};

// Team names mapping (Official F1 24 UDP Specification)
export const TEAM_NAMES: { [key: number]: string } = {
  0: "Mercedes",
  1: "Ferrari",
  2: "Red Bull Racing",
  3: "Williams", 
  4: "Aston Martin",
  5: "Alpine",
  6: "RB",                    // Official F1 24 name (formerly VCARB/Alpha Tauri)
  7: "Haas",
  8: "McLaren",
  9: "Sauber",
  41: "F1 Generic",
  104: "F1 Custom Team",
  // F2 2023 Teams
  143: "Art GP '23",
  144: "Campos '23",
  145: "Carlin '23",
  146: "PHM '23",
  147: "Dams '23",
  148: "Hitech '23",
  149: "MP Motorsport '23",
  150: "Prema '23",
  151: "Trident '23",
  152: "Van Amersfoort Racing '23",
  153: "Virtuosi '23"
};

// Tyre compound mapping (F1 24 official spec)
export const TYRE_COMPOUNDS: { [key: number]: string } = {
  // F1 24 actual compounds (Packet 12)
  0: "C0",
  1: "C1",
  2: "C2",
  3: "C3",
  4: "C4",
  5: "C5",
  6: "C6",

  // Visual compounds (what players see in HUD)
  7: "Inter",
  8: "Wet",
  9: "Dry",
  10: "Wet",
  11: "SuperSoft",
  12: "Soft",
  13: "Medium",
  14: "Hard",
  15: "Wet",

  // Legacy / shared enums (keep for backwards compatibility)
  16: "Soft",
  17: "Medium",
  18: "Hard",
  19: "Street",
  20: "Semi-Slick",
  21: "Slick",
  22: "C6"
};
