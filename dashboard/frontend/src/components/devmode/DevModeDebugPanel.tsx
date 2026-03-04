import React from 'react';
import { Card } from '../ui/card';
import type { StandardizedTelemetry } from '../../utils/telemetryConverter';

interface Props {
  telemetry: StandardizedTelemetry;
  rawTelemetry: any;
  connectionStatus: string;
  gameConnected: string;
  isF124: boolean;
  isAC: boolean;
}

export function DevModeDebugPanel({ telemetry, rawTelemetry, connectionStatus, gameConnected, isF124, isAC }: Props) {
  return (
    <Card className="bg-black/60 border border-gray-700 p-4 col-span-4">
      <h3 className="text-sm font-bold text-gray-400 mb-2">DEBUG INFO - {isAC ? 'AC SHARED MEMORY DATA' : 'F1 24 PACKET DATA'}</h3>
      <div className="grid grid-cols-4 gap-4 text-xs font-mono text-gray-500">
        <div>Connected: {connectionStatus === 'connected' ? '\u2705' : '\u274C'}</div>
        <div>Status: {connectionStatus}</div>
        <div>Game: {gameConnected}</div>
        <div>Session Type ID: {rawTelemetry?.session_type}</div>
        <div>Track ID: {telemetry.trackId}</div>
        <div>World Pos: X:{telemetry.worldPositionX.toFixed(1)} Y:{telemetry.worldPositionY.toFixed(1)}</div>
        <div>Total Distance: {telemetry.totalDistance}m</div>

        {isAC && (
          <>
            <div className="text-green-400">--- AC SHARED MEMORY STATUS ---</div>
            <div>AC Version: {rawTelemetry?.ac_version || 'N/A'}</div>
            <div>SM Version: {rawTelemetry?.sm_version || 'N/A'}</div>
            <div>Player: {rawTelemetry?.player_name || 'N/A'} {rawTelemetry?.player_surname || ''}</div>
            <div>Car Model: {rawTelemetry?.car_name || 'N/A'}</div>
            <div>Track Config: {rawTelemetry?.track_configuration || 'Default'}</div>
            <div>Car Skin: {rawTelemetry?.car_skin || 'N/A'}</div>
            <div>Max Cars: {rawTelemetry?.num_cars || 'N/A'}</div>
            <div>Sectors: {rawTelemetry?.sector_count || 'N/A'}</div>
            <div>Physics PacketID: {rawTelemetry?.packet_id || 'N/A'}</div>
            <div>Graphics PacketID: {rawTelemetry?.graphics_packet_id || 'N/A'}</div>
            <div>AC Status: {rawTelemetry?.status === 2 ? 'LIVE' : rawTelemetry?.status === 1 ? 'REPLAY' : rawTelemetry?.status === 3 ? 'PAUSE' : 'OFF'}</div>
            <div>Session: {rawTelemetry?.session_type === 0 ? 'PRACTICE' : rawTelemetry?.session_type === 1 ? 'QUALIFY' : rawTelemetry?.session_type === 2 ? 'RACE' : rawTelemetry?.session_type === 3 ? 'HOTLAP' : rawTelemetry?.session_type === 4 ? 'TIME ATTACK' : rawTelemetry?.session_type === 5 ? 'DRIFT' : rawTelemetry?.session_type === 6 ? 'DRAG' : 'UNKNOWN'}</div>
            <div>Position on Spline: {(rawTelemetry?.normalized_car_position * 100)?.toFixed(1) || '0'}%</div>
            <div>Distance Traveled: {(rawTelemetry?.distance_traveled / 1000)?.toFixed(2) || '0'}km</div>
            <div>Replay Multiplier: {rawTelemetry?.replay_time_multiplier || '1.0'}x</div>
            <div className="text-blue-400">--- AC CAR SPECIFICATIONS ---</div>
            <div>Max Power: {rawTelemetry?.max_power || 'N/A'}hp</div>
            <div>Max Torque: {rawTelemetry?.max_torque || 'N/A'}Nm</div>
            <div>Max RPM: {rawTelemetry?.max_rpm || 'N/A'}</div>
            <div>Max Turbo: {rawTelemetry?.max_turbo_boost || 'N/A'}</div>
            <div>Engine Brake Settings: {rawTelemetry?.engine_brake_settings_count || 'N/A'}</div>
            <div>ERS Controllers: {rawTelemetry?.ers_power_controller_count || 'N/A'}</div>
            <div>Has DRS: {rawTelemetry?.has_drs ? 'YES' : 'NO'}</div>
            <div>Has ERS: {rawTelemetry?.has_ers ? 'YES' : 'NO'}</div>
            <div>Has KERS: {rawTelemetry?.has_kers ? 'YES' : 'NO'}</div>
            <div>Pit Window: L{rawTelemetry?.pit_window_start || 'N/A'}-{rawTelemetry?.pit_window_end || 'N/A'}</div>
            <div>Timed Race: {rawTelemetry?.is_timed_race ? 'YES' : 'NO'}</div>
            <div>Extra Lap: {rawTelemetry?.has_extra_lap ? 'YES' : 'NO'}</div>
          </>
        )}

        {isF124 && rawTelemetry && (
          <>
            <div className="text-orange-400">--- F1 24 Packet Data ---</div>
            <div>Packet 1 (Session): {rawTelemetry.session_type !== undefined ? '\u2705' : '\u274C'}</div>
            <div>Packet 2 (Lap): {rawTelemetry.current_lap_time !== undefined ? '\u2705' : '\u274C'}</div>
            <div>Packet 3 (Event): {rawTelemetry.last_event_code ? '\u2705' : '\u274C'}</div>
            <div>Packet 5 (Setup): {rawTelemetry.differential_on_throttle !== undefined ? '\u2705' : '\u274C'}</div>
            <div>Packet 6 (Telemetry): {rawTelemetry.speed_kph !== undefined ? '\u2705' : '\u274C'}</div>
            <div>Packet 7 (Status): {rawTelemetry.fuel_in_tank !== undefined ? '\u2705' : '\u274C'}</div>
            <div>Packet 10 (Damage): {rawTelemetry.front_left_wing_damage !== undefined ? '\u2705' : '\u274C'}</div>
            <div>Packet 12 (Tyre Sets): {rawTelemetry.tyre_sets_available !== undefined ? '\u2705' : '\u274C'}</div>
          </>
        )}

        <div>Last Update: {new Date().toLocaleTimeString()}</div>
        <div className="text-purple-400">Total Fields: {isAC ? '191' : '80+'}</div>
      </div>
    </Card>
  );
}
