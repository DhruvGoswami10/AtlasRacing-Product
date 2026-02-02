import { useEffect, useRef, useState } from 'react';
import type { TelemetryData } from '../types/telemetry';

export interface PitStopTrackerState {
  stopsCompleted: number;
  mandatoryStopCompleted: boolean;
  lastCompound: string | null;
  currentCompound: string | null;
  lastStopLap: number | null;
  stintLaps: number;
}

interface PitStopTrackerInternal extends PitStopTrackerState {
  pitEntryActive: boolean;
  compoundAtPitEntry: string | null;
  startingCompound: string | null;
  compoundsUsed: Set<string>;
}

const normalizeCompound = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('soft')) return 'Soft';
  if (lower.includes('medium')) return 'Medium';
  if (lower.includes('hard')) return 'Hard';
  if (lower.includes('inter')) return 'Inter';
  if (lower.includes('wet')) return 'Wet';
  return trimmed;
};

const buildPublicState = (state: PitStopTrackerInternal): PitStopTrackerState => ({
  stopsCompleted: state.stopsCompleted,
  mandatoryStopCompleted: state.mandatoryStopCompleted,
  lastCompound: state.lastCompound,
  currentCompound: state.currentCompound,
  lastStopLap: state.lastStopLap,
  stintLaps: state.stintLaps,
});

const initialState: PitStopTrackerState = {
  stopsCompleted: 0,
  mandatoryStopCompleted: false,
  lastCompound: null,
  currentCompound: null,
  lastStopLap: null,
  stintLaps: 0,
};

export const usePitStopTracker = (telemetry: TelemetryData | null): PitStopTrackerState => {
  const [state, setState] = useState<PitStopTrackerState>(initialState);
  const stateRef = useRef<PitStopTrackerInternal>({
    ...initialState,
    pitEntryActive: false,
    compoundAtPitEntry: null,
    startingCompound: null,
    compoundsUsed: new Set<string>(),
  });
  const initialPitExitRef = useRef(true); // Skip first pit exit (race start)

  useEffect(() => {
    if (!telemetry) {
      return;
    }

    const pitStatus = typeof telemetry.pit_status === 'number' ? telemetry.pit_status : 0;
    const currentLap = typeof telemetry.current_lap_num === 'number' ? telemetry.current_lap_num : 0;
    const normalizedCompound = normalizeCompound(telemetry.tire_compound);
    const stintLaps = Number.isFinite(telemetry.tire_age_laps) ? telemetry.tire_age_laps : null;

    const internal = stateRef.current;
    let updated = false;

    if (!internal.currentCompound && normalizedCompound) {
      internal.currentCompound = normalizedCompound;
      internal.startingCompound = normalizedCompound;
      internal.compoundsUsed.add(normalizedCompound);
      updated = true;
    }

    if (normalizedCompound && normalizedCompound !== internal.currentCompound) {
      internal.currentCompound = normalizedCompound;
      internal.compoundsUsed.add(normalizedCompound);
      updated = true;
    }

    const inPitNow = pitStatus > 0;
    if (inPitNow && !internal.pitEntryActive) {
      internal.pitEntryActive = true;
      internal.compoundAtPitEntry = internal.currentCompound ?? normalizedCompound ?? null;
    }

    if (!inPitNow && internal.pitEntryActive) {
      internal.pitEntryActive = false;

      // Skip the initial pit exit at race start (car starts in pit lane)
      if (initialPitExitRef.current) {
        initialPitExitRef.current = false;
        internal.compoundAtPitEntry = null;
        return;
      }

      internal.stopsCompleted += 1;
      internal.lastStopLap = currentLap || internal.lastStopLap;

      const newCompound = normalizedCompound ?? internal.currentCompound;
      if (newCompound) {
        internal.compoundsUsed.add(newCompound);
      }

      if (internal.compoundAtPitEntry) {
        internal.lastCompound = internal.compoundAtPitEntry;
      }

      if (newCompound) {
        internal.currentCompound = newCompound;
      }

      internal.mandatoryStopCompleted = internal.compoundsUsed.size >= 2;
      internal.compoundAtPitEntry = null;
      updated = true;
    }

    if (stintLaps !== null && stintLaps !== internal.stintLaps) {
      internal.stintLaps = stintLaps;
      updated = true;
    }

    if (internal.currentCompound && internal.compoundsUsed.size >= 2) {
      if (!internal.mandatoryStopCompleted) {
        internal.mandatoryStopCompleted = true;
        updated = true;
      }
    }

    if (updated) {
      setState(buildPublicState(internal));
    }
  }, [telemetry]);

  return state;
};
