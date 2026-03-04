import React from 'react';
import { Card } from '../ui/card';
import type { StandardizedTelemetry } from '../../utils/telemetryConverter';
import { sanitizeControlValue, formatDiscreteSetting, asNumber } from './utils';

interface DevModeCarInfoPanelsProps {
  telemetry: StandardizedTelemetry;
  rawTelemetry: any;
  isF124: boolean;
  isAC: boolean;
  acExtended: any;
}

const AC_TC_MAX = 10;
const AC_ABS_MAX = 11;

const DevModeCarInfoPanels: React.FC<DevModeCarInfoPanelsProps> = ({
  telemetry,
  rawTelemetry,
  isF124,
  isAC,
  acExtended,
}) => {
  // Compute AC-specific car settings values
  const acBrakeBias = isAC
    ? (() => {
        const raw =
          acExtended?.brake_bias ?? (rawTelemetry as any)?.brake_bias ?? telemetry.brakeBias;
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          if (raw > 1.5) {
            return raw;
          }
          return raw * 100;
        }
        return null;
      })()
    : null;
  const acTcPrimary = sanitizeControlValue(
    isAC
      ? asNumber(
          acExtended?.traction_control_setting ??
            (rawTelemetry as any)?.traction_control_setting ??
            telemetry.tc,
        )
      : null,
  );
  const acTcSecondary = sanitizeControlValue(
    isAC
      ? asNumber(
          acExtended?.traction_control_setting_secondary ??
            (rawTelemetry as any)?.traction_control_setting_secondary ??
            telemetry.tc2,
        )
      : null,
  );
  const acAbsSetting = sanitizeControlValue(
    isAC
      ? asNumber(acExtended?.abs_setting ?? (rawTelemetry as any)?.abs_setting ?? telemetry.abs)
      : null,
  );
  const rawFuelMapSetting = isAC
    ? asNumber(
        acExtended?.fuel_map_setting ?? (rawTelemetry as any)?.fuel_map_setting ?? telemetry.fuelMapSetting,
      )
    : null;
  const rawFuelMapMax = isAC
    ? asNumber(
        acExtended?.fuel_map_max ?? (rawTelemetry as any)?.fuel_map_max ?? telemetry.fuelMapMax,
      )
    : null;
  const acFuelMapSetting = sanitizeControlValue(rawFuelMapSetting);
  const acFuelMapMax = rawFuelMapMax && rawFuelMapMax > 0 ? rawFuelMapMax : null;
  const acEngineBrakeSetting = isAC
    ? asNumber(
        acExtended?.engine_brake_setting ??
          (rawTelemetry as any)?.engine_brake_setting ??
          telemetry.engineBrake,
      )
    : null;
  const fallbackBrakeBiasDisplay =
    typeof telemetry.brakeBias === 'number' && Number.isFinite(telemetry.brakeBias)
      ? telemetry.brakeBias.toFixed(1)
      : '50.0';

  return (
    <>
      {/* Flags & Penalties - AC/F1 Adaptive */}
      <Card className="bg-black/60 border border-gray-700 p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-2">{isAC ? 'FLAGS & TRACK LIMITS' : 'FLAGS & PENALTIES'}</h3>
        <div className="space-y-1 text-sm">
          {isAC && (
            <>
              <div>Flag: <span className={`font-mono ${
                (rawTelemetry as any)?.flag_type === 0 ? 'text-gray-400' :
                (rawTelemetry as any)?.flag_type === 1 ? 'text-blue-400 font-bold' :
                (rawTelemetry as any)?.flag_type === 2 ? 'text-yellow-400 font-bold' :
                (rawTelemetry as any)?.flag_type === 3 ? 'text-black font-bold bg-white px-1' :
                (rawTelemetry as any)?.flag_type === 4 ? 'text-white font-bold' :
                (rawTelemetry as any)?.flag_type === 5 ? 'text-white font-bold bg-black px-1' :
                (rawTelemetry as any)?.flag_type === 6 ? 'text-red-400 font-bold' :
                'text-gray-400'
              }`}>{
                (rawTelemetry as any)?.flag_type === 0 ? 'NONE' :
                (rawTelemetry as any)?.flag_type === 1 ? 'BLUE FLAG' :
                (rawTelemetry as any)?.flag_type === 2 ? 'YELLOW FLAG' :
                (rawTelemetry as any)?.flag_type === 3 ? 'BLACK FLAG' :
                (rawTelemetry as any)?.flag_type === 4 ? 'WHITE FLAG' :
                (rawTelemetry as any)?.flag_type === 5 ? 'CHECKERED' :
                (rawTelemetry as any)?.flag_type === 6 ? 'PENALTY' :
                'UNKNOWN'
              }</span></div>
              <div>Penalties: <span className={`font-mono ${(rawTelemetry as any)?.penalties_enabled ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.penalties_enabled ? 'ENABLED' : 'DISABLED'}</span></div>
              <div>Penalty Time: <span className="text-red-400 font-mono">{((rawTelemetry as any)?.penalty_time)?.toFixed(1) || '0'}s</span></div>
              <div>Tires Out: <span className={`font-mono ${(rawTelemetry as any)?.numberOfTyresOut >= 4 ? 'text-red-400 font-bold' : (rawTelemetry as any)?.numberOfTyresOut >= 2 ? 'text-yellow-400' : 'text-green-400'}`}>{(rawTelemetry as any)?.numberOfTyresOut || 0}/4</span></div>
              {(rawTelemetry as any)?.numberOfTyresOut >= 4 && (
                <div className="text-red-400 font-bold">🚨 ALL TIRES OFF TRACK</div>
              )}
              <div>In Pit: <span className={`font-mono ${(rawTelemetry as any)?.is_in_pit ? 'text-blue-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.is_in_pit ? 'YES' : 'NO'}</span></div>
              <div>In Pit Lane: <span className={`font-mono ${(rawTelemetry as any)?.is_in_pitlane ? 'text-yellow-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.is_in_pitlane ? 'YES' : 'NO'}</span></div>
              <div>Mandatory Pit: <span className={`font-mono ${(rawTelemetry as any)?.mandatory_pit_done ? 'text-green-400' : 'text-red-400'}`}>{(rawTelemetry as any)?.mandatory_pit_done ? 'DONE' : 'NOT DONE'}</span></div>
              <div>Lap Invalidated: <span className={`font-mono ${(rawTelemetry as any)?.lap_invalidated ? 'text-red-400 font-bold' : 'text-green-400'}`}>{(rawTelemetry as any)?.lap_invalidated ? 'YES' : 'NO'}</span></div>
              {(rawTelemetry as any)?.lap_invalidated && (
                <div className="text-red-400 font-bold">⚠️ LAP TIME DELETED</div>
              )}
            </>
          )}
          {isF124 && (
            <>
              <div>Flag: <span className={`font-mono ${
                telemetry.flagType === 'Yellow' ? 'text-yellow-400 font-bold' :
                telemetry.flagType === 'Green' ? 'text-green-400' :
                telemetry.flagType === 'Blue' ? 'text-blue-400' :
                telemetry.flagType === 'Red' ? 'text-red-400 font-bold' :
                'text-gray-400'
              }`}>{telemetry.flagType}</span></div>
              <div>Track Limits: <span className="text-orange-400 font-mono">{telemetry.cornerCuttingWarnings}</span></div>
              <div>Penalties: <span className="text-red-400 font-mono">{telemetry.penalties}s</span></div>
              <div>Pen Count: <span className="text-red-300 font-mono">{(rawTelemetry as any)?.num_penalties || 0}</span></div>
              {(rawTelemetry as any)?.penalties_time > 0 && (
                <div className="text-red-400 font-bold">🚨 DRIVE-THROUGH: {(rawTelemetry as any).penalties_time}s</div>
              )}
              {(rawTelemetry as any)?.lap_invalid && (
                <div className="text-orange-400 font-bold">❌ LAP INVALID</div>
              )}
              <div>Safety Car: <span className={`font-mono ${
                telemetry.safetyCarStatus === 'Full SC' ? 'text-red-400 font-bold' :
                telemetry.safetyCarStatus === 'VSC' ? 'text-yellow-400 font-bold' :
                'text-gray-400'
              }`}>{telemetry.safetyCarStatus}</span></div>
              <div>Pit Status: <span className={`font-mono ${
                telemetry.pitStatus === 'In Pit' ? 'text-blue-400' :
                telemetry.pitStatus === 'Pitting' ? 'text-yellow-400' :
                'text-gray-400'
              }`}>{telemetry.pitStatus}</span></div>
              {telemetry.pitWindowOpen && (
                <div className="text-green-400 font-bold">PIT WINDOW: L{telemetry.pitWindowIdealLap}-{telemetry.pitWindowLatestLap}</div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Weather & Track - AC Enhanced */}
      <Card className="bg-black/60 border border-gray-700 p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-2">{isAC ? 'ENVIRONMENT & TRACK' : 'WEATHER & TRACK'}</h3>
        <div className="space-y-1 text-sm">
          <div>Track: <span className="text-blue-400 font-mono">{telemetry.trackTemp}°C</span></div>
          <div>Air: <span className="text-green-400 font-mono">{telemetry.airTemp}°C</span></div>
          {isAC && (
            <>
              <div>Wind: <span className="text-cyan-400 font-mono">{((rawTelemetry as any)?.ac_extended?.wind_speed)?.toFixed(1) || '0'}km/h @ {((rawTelemetry as any)?.ac_extended?.wind_direction)?.toFixed(0) || '0'}°</span></div>
              <div>Grip: <span className="text-orange-400 font-mono">{((rawTelemetry as any)?.ac_extended?.surface_grip * 100)?.toFixed(1) || '100.0'}%</span></div>
              <div>Air Density: <span className="text-purple-400 font-mono">{((rawTelemetry as any)?.ac_extended?.air_density)?.toFixed(4) || '1.2250'}</span></div>
              <div>Track Length: <span className="text-pink-400 font-mono">{((rawTelemetry as any)?.ac_extended?.track_spline_length / 1000)?.toFixed(2) || '0'}km</span></div>
            </>
          )}
          {!isAC && (
            <div>Weather: <span className="text-gray-400 font-mono">{telemetry.weather}</span></div>
          )}
          <div>Session: <span className="text-yellow-400 font-mono">
            {(() => {
              // For AC, we can't calculate elapsed time accurately without proper session start time
              // So for now, just show remaining time
              const formatTime = (seconds: number) => {
                if (isNaN(seconds) || seconds < 0) return '--:--';
                if (seconds >= 3600) {
                  return `${Math.floor(seconds / 3600)}:${Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
                }
                return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
              };

              // For AC, we don't have reliable elapsed time, so just show remaining
              const remaining = telemetry.sessionTimeLeft > 0 && telemetry.sessionTimeLeft < 999999 ?
                formatTime(telemetry.sessionTimeLeft) :
                '∞';

              // For F1, we could calculate elapsed from session duration minus remaining
              // But for AC, we don't have session duration, so just show remaining
              return isAC ? `Remaining: ${remaining}` : formatTime(telemetry.sessionTimeLeft);
            })()}
          </span></div>
          <div>Track Name: <span className="text-purple-400 text-xs">{telemetry.trackName || `Track ID: ${telemetry.trackId}`}</span></div>
          {isAC && (
            <>
              <div>Car: <span className="text-green-300 text-xs">{(rawTelemetry as any)?.car_name || 'Unknown'}</span></div>
              <div>Layout: <span className="text-blue-300 text-xs">{(rawTelemetry as any)?.track_configuration || 'Default'}</span></div>
            </>
          )}
        </div>
      </Card>

      {/* Car Settings - AC Enhanced */}
      <Card className="bg-black/60 border border-gray-700 p-4">
        <h3 className="text-sm font-bold text-gray-400 mb-2">{isAC ? 'CAR SETTINGS & AIDS' : 'CAR SETTINGS'}</h3>
        <div className="space-y-1 text-sm">
          <div>
            Brake Bias:{' '}
            <span className="text-blue-400 font-mono">
              {isAC
                ? `${acBrakeBias !== null ? acBrakeBias.toFixed(1) : fallbackBrakeBiasDisplay}%`
                : `${fallbackBrakeBiasDisplay}%`}
            </span>
          </div>
          {isAC && (
            <>
              <div>
                TC1:{' '}
                <span className="text-yellow-400 font-mono">
                  {formatDiscreteSetting(acTcPrimary, AC_TC_MAX)}
                </span>
              </div>
              <div>
                TC2:{' '}
                <span className="text-yellow-300 font-mono">
                  {formatDiscreteSetting(acTcSecondary, AC_TC_MAX)}
                </span>
              </div>
              <div>
                ABS:{' '}
                <span className="text-red-400 font-mono">
                  {formatDiscreteSetting(acAbsSetting, AC_ABS_MAX)}
                </span>
              </div>
              <div>
                Fuel Map:{' '}
                <span className="text-emerald-300 font-mono">
                  {acFuelMapSetting !== null && acFuelMapMax
                    ? `${Math.round(acFuelMapSetting)}/${Math.round(acFuelMapMax)}`
                    : 'N/A (needs AtlasLink)'}
                </span>
              </div>
              <div>
                Engine Brake:{' '}
                <span className="text-orange-400 font-mono">
                  {acEngineBrakeSetting !== null
                    ? `${Math.round(acEngineBrakeSetting)}/13`
                    : 'N/A'}
                </span>
              </div>
              <div>Auto Shift: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.auto_shifter_enabled ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.auto_shifter_enabled ? 'ON' : 'OFF'}</span></div>
              <div>Auto Clutch: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.aid_auto_clutch ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.aid_auto_clutch ? 'ON' : 'OFF'}</span></div>
              <div>Auto Blip: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.aid_auto_blip ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.aid_auto_blip ? 'ON' : 'OFF'}</span> <span className="text-xs text-gray-500">(Rev-match)</span></div>
              <div>Stability: <span className="text-purple-400 font-mono">{((rawTelemetry as any)?.ac_extended?.aid_stability !== undefined) ? ((rawTelemetry as any).ac_extended.aid_stability * 100).toFixed(0) : '0'}%</span> <span className="text-xs text-gray-500">(ESC)</span></div>
              <div>Tire Blankets: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.aid_allow_tyre_blankets ? 'text-green-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.aid_allow_tyre_blankets ? 'ALLOWED' : 'NOT ALLOWED'}</span> <span className="text-xs text-gray-500">(Session setting)</span></div>
              <div>Pit Limiter: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.pit_limiter_enabled ? 'text-blue-400 font-bold' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.pit_limiter_enabled ? 'ACTIVE' : 'OFF'}</span></div>
              <div>Ideal Line: <span className={`font-mono ${(rawTelemetry as any)?.ac_extended?.ideal_line_enabled ? 'text-cyan-400' : 'text-gray-400'}`}>{(rawTelemetry as any)?.ac_extended?.ideal_line_enabled ? 'ON' : 'OFF'}</span></div>
            </>
          )}
          {isF124 && (
            <>
              <div>Differential: <span className="text-yellow-400 font-mono">{telemetry.differential}%</span></div>
              {telemetry.sessionType === 'Race' && telemetry.differential === 50 && (
                <div className="text-xs text-orange-400">⚠️ Diff locked (Parc Fermé)</div>
              )}
              <div className="text-xs text-gray-500 mt-2">
                Raw Diff Value: {(rawTelemetry as any).differential_on_throttle || 'N/A'}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Car Damage & Setup - UPDATED */}
      {isF124 && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-black/60 border border-gray-700 p-4">
            <h3 className="text-sm font-bold text-gray-400 mb-2">CAR DAMAGE</h3>
            <div className="space-y-1 text-sm">
              <div>Front L Wing: <span className={`font-mono ${telemetry.frontLeftWingDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.frontLeftWingDamage}%</span></div>
              <div>Front R Wing: <span className={`font-mono ${telemetry.frontRightWingDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.frontRightWingDamage}%</span></div>
              <div>Rear Wing: <span className={`font-mono ${telemetry.rearWingDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.rearWingDamage}%</span></div>
              <div>Engine: <span className={`font-mono ${telemetry.engineDamage > 0 ? 'text-red-400' : 'text-green-400'}`}>{telemetry.engineDamage}%</span></div>
              <div>Gearbox: <span className={`font-mono ${telemetry.gearboxDamage > 0 ? 'text-yellow-400' : 'text-green-400'}`}>{telemetry.gearboxDamage}%</span></div>
              <div>Floor: <span className={`font-mono ${telemetry.floorDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.floorDamage}%</span></div>
              <div>Diffuser: <span className={`font-mono ${telemetry.diffuserDamage > 0 ? 'text-orange-400' : 'text-green-400'}`}>{telemetry.diffuserDamage}%</span></div>
            </div>
            {/* Tyre Blisters (F1 25) */}
            {(rawTelemetry as any)?.tyre_blisters && (
              <>
                <div className="border-t border-gray-700 my-2" />
                <h4 className="text-xs font-bold text-pink-400 mb-1">TYRE BLISTERS</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div>FL: <span className={`font-mono ${((rawTelemetry as any).tyre_blisters[0] || 0) > 20 ? 'text-red-400' : ((rawTelemetry as any).tyre_blisters[0] || 0) > 10 ? 'text-orange-400' : 'text-green-400'}`}>{((rawTelemetry as any).tyre_blisters[0] || 0).toFixed(1)}%</span></div>
                  <div>FR: <span className={`font-mono ${((rawTelemetry as any).tyre_blisters[1] || 0) > 20 ? 'text-red-400' : ((rawTelemetry as any).tyre_blisters[1] || 0) > 10 ? 'text-orange-400' : 'text-green-400'}`}>{((rawTelemetry as any).tyre_blisters[1] || 0).toFixed(1)}%</span></div>
                  <div>RL: <span className={`font-mono ${((rawTelemetry as any).tyre_blisters[2] || 0) > 20 ? 'text-red-400' : ((rawTelemetry as any).tyre_blisters[2] || 0) > 10 ? 'text-orange-400' : 'text-green-400'}`}>{((rawTelemetry as any).tyre_blisters[2] || 0).toFixed(1)}%</span></div>
                  <div>RR: <span className={`font-mono ${((rawTelemetry as any).tyre_blisters[3] || 0) > 20 ? 'text-red-400' : ((rawTelemetry as any).tyre_blisters[3] || 0) > 10 ? 'text-orange-400' : 'text-green-400'}`}>{((rawTelemetry as any).tyre_blisters[3] || 0).toFixed(1)}%</span></div>
                </div>
              </>
            )}
          </Card>

          <Card className="bg-black/60 border border-gray-700 p-4">
            <h3 className="text-sm font-bold text-gray-400 mb-2">CAR SETUP</h3>
            <div className="space-y-1 text-sm">
              <div>Front Wing: <span className="text-blue-400 font-mono">{(rawTelemetry as any)?.front_wing_aero || 'N/A'}</span></div>
              <div>Rear Wing: <span className="text-blue-400 font-mono">{(rawTelemetry as any)?.rear_wing_aero || 'N/A'}</span></div>
              <div>Front Susp: <span className="text-green-400 font-mono">{(rawTelemetry as any)?.front_suspension || 'N/A'}</span></div>
              <div>Rear Susp: <span className="text-green-400 font-mono">{(rawTelemetry as any)?.rear_suspension || 'N/A'}</span></div>
              <div>Front ARB: <span className="text-orange-400 font-mono">{(rawTelemetry as any)?.front_anti_roll_bar || 'N/A'}</span></div>
              <div>Rear ARB: <span className="text-orange-400 font-mono">{(rawTelemetry as any)?.rear_anti_roll_bar || 'N/A'}</span></div>
              <div>Brake Bias: <span className="text-red-400 font-mono">{(rawTelemetry as any)?.f1_brake_bias || 'N/A'}%</span></div>
              <div>Brake Press: <span className="text-red-300 font-mono">{(rawTelemetry as any)?.brake_pressure || 'N/A'}%</span></div>
              <div>F Camber: <span className="text-yellow-400 font-mono">{(rawTelemetry as any)?.front_camber ? (rawTelemetry as any).front_camber.toFixed(2) : 'N/A'}°</span></div>
              <div>R Camber: <span className="text-yellow-400 font-mono">{(rawTelemetry as any)?.rear_camber ? (rawTelemetry as any).rear_camber.toFixed(2) : 'N/A'}°</span></div>
              <div>F Toe: <span className="text-cyan-400 font-mono">{(rawTelemetry as any)?.front_toe ? (rawTelemetry as any).front_toe.toFixed(3) : 'N/A'}°</span></div>
              <div>R Toe: <span className="text-cyan-400 font-mono">{(rawTelemetry as any)?.rear_toe ? (rawTelemetry as any).rear_toe.toFixed(3) : 'N/A'}°</span></div>
              <div>Diff On: <span className="text-purple-400 font-mono">{(rawTelemetry as any)?.differential_on_throttle || 'N/A'}%</span></div>
              <div>Diff Off: <span className="text-purple-300 font-mono">{(rawTelemetry as any)?.differential_off_throttle || 'N/A'}%</span></div>
              <div>F Ride H: <span className="text-pink-400 font-mono">{(rawTelemetry as any)?.front_ride_height || 'N/A'}</span></div>
              <div>R Ride H: <span className="text-pink-400 font-mono">{(rawTelemetry as any)?.rear_ride_height || 'N/A'}</span></div>
            </div>
          </Card>
        </div>
      )}

      {/* Marshal Zones (F1 24 only) */}
      {isF124 && telemetry.marshalZones.length > 0 && (
        <Card className="bg-black/60 border border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">MARSHAL ZONES</h3>
          <div className="grid grid-cols-3 gap-1 text-xs">
            {telemetry.marshalZones.slice(0, 15).map((flag, idx) => (
              <div key={idx} className={`font-mono ${
                flag === 3 ? 'text-yellow-400 font-bold' :
                flag === 2 ? 'text-blue-400' :
                flag === 1 ? 'text-green-400' :
                flag === 4 ? 'text-red-400 font-bold' :
                'text-gray-600'
              }`}>
                Z{idx + 1}: {flag === 0 ? '-' : flag === 1 ? 'G' : flag === 2 ? 'B' : flag === 3 ? 'Y' : flag === 4 ? 'R' : '?'}
              </div>
            ))}
          </div>
          {telemetry.marshalZones.some((f: number) => f === 3) && (
            <div className="text-yellow-400 font-bold mt-2">⚠️ YELLOW FLAG ZONE ACTIVE</div>
          )}
        </Card>
      )}
    </>
  );
};

export default DevModeCarInfoPanels;
