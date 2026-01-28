import type { TyreSetData } from '../types/telemetry';

export type CompoundName = 'Soft' | 'Medium' | 'Hard' | 'Intermediate' | 'Wet';

export type StrategyProfile = 'sprint' | 'standard' | 'endurance';

export interface StrategyTemplateDefinition {
  label: string;
  id: 'A' | 'B';
  totalStops: number;
  stintCompounds: CompoundName[];
  stopLapRatios: number[]; // ratios (0-1) for each planned stop
  risk: 'low' | 'medium' | 'high';
  description: string;
}

export interface StrategyTemplateSet {
  primary: StrategyTemplateDefinition;
  alternate: StrategyTemplateDefinition;
}

export const DEFAULT_STRATEGY_TEMPLATES: Record<StrategyProfile, StrategyTemplateSet> = {
  sprint: {
    primary: {
      label: 'Plan A · 1 Stop',
      id: 'A',
      totalStops: 1,
      stintCompounds: ['Soft', 'Medium'],
      stopLapRatios: [0.55],
      risk: 'low',
      description: 'Conservative one-stop: open on Soft, finish on Medium if wear is under control.',
    },
    alternate: {
      label: 'Plan B · 2 Stops',
      id: 'B',
      totalStops: 2,
      stintCompounds: ['Soft', 'Soft', 'Medium'],
      stopLapRatios: [0.38, 0.72],
      risk: 'medium',
      description: 'Aggressive two-stop: double Soft opening to maximise pace, Medium to close.',
    },
  },
  standard: {
    primary: {
      label: 'Plan A · Balanced 2 Stop',
      id: 'A',
      totalStops: 2,
      stintCompounds: ['Soft', 'Medium', 'Hard'],
      stopLapRatios: [0.33, 0.68],
      risk: 'medium',
      description: 'Baseline 2-stop splitting the race in thirds: Soft launch, Medium middle, Hard to finish.',
    },
    alternate: {
      label: 'Plan B · Defensive 1 Stop',
      id: 'B',
      totalStops: 1,
      stintCompounds: ['Soft', 'Hard'],
      stopLapRatios: [0.52],
      risk: 'low',
      description: 'Stay-out alternative: stretch the opening Soft, box once for Hard to secure track position.',
    },
  },
  endurance: {
    primary: {
      label: 'Plan A · Soft → Med → Hard',
      id: 'A',
      totalStops: 2,
      stintCompounds: ['Soft', 'Medium', 'Hard'],
      stopLapRatios: [0.30, 0.63],
      risk: 'medium',
      description: 'High-deg baseline: pit early to protect Softs, close on Hard for durability.',
    },
    alternate: {
      label: 'Plan B · Soft → Medium → Soft',
      id: 'B',
      totalStops: 2,
      stintCompounds: ['Soft', 'Medium', 'Soft'],
      stopLapRatios: [0.32, 0.70],
      risk: 'high',
      description: 'Attack option: commit to two aggressive stints and finish on Soft with lighter fuel.',
    },
  },
};

export const TRACK_STRATEGY_PROFILE: Partial<Record<number, StrategyProfile>> = {
  7: 'sprint', // Monaco - track position critical, favour one stop
  11: 'endurance', // Silverstone - high wear
  13: 'endurance', // Belgium
  14: 'endurance', // Zandvoort
  17: 'sprint', // Singapore - long but track position bias
  21: 'standard', // Las Vegas street
  22: 'endurance', // Qatar - tyre limited
};

export const PIT_DELTA_BY_TRACK: Record<number, number> = {
  0: 24.8,
  1: 18.8,
  2: 16.9,
  3: 23.6,
  4: 21.8,
  5: 21.9,
  6: 29.7,
  7: 22.7,
  8: 23.2,
  9: 21.1,
  10: 19.1,
  11: 33.6,
  12: 21.2,
  13: 22.3,
  14: 18.1,
  15: 24.6,
  16: 18.9,
  17: 26.0,
  18: 22.4,
  19: 22.9,
  20: 21.9,
  21: 20.8,
  22: 27.9,
  23: 20.5,
  24: 26.3,
};

export const DEFAULT_PIT_DELTA = 22.0;

export const compoundOrder: CompoundName[] = ['Soft', 'Medium', 'Hard', 'Intermediate', 'Wet'];

export const toCompoundName = (value: string | number | undefined): CompoundName | null => {
  if (typeof value === 'number') {
    switch (value) {
      case 12:
      case 0:
      case 11:
        return 'Soft';
      case 13:
      case 2:
        return 'Medium';
      case 14:
      case 1:
        return 'Hard';
      default:
        return null;
    }
  }

  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (normalised.startsWith('soft') || normalised.startsWith('c5') || normalised.startsWith('c4')) {
      return 'Soft';
    }
    if (normalised.startsWith('med') || normalised.startsWith('c3') || normalised.startsWith('c2')) {
      return 'Medium';
    }
    if (normalised.startsWith('hard') || normalised.startsWith('c1') || normalised.startsWith('c0')) {
      return 'Hard';
    }
    if (normalised.startsWith('int')) {
      return 'Intermediate';
    }
    if (normalised.startsWith('wet')) {
      return 'Wet';
    }
  }

  return null;
};

export const countAvailableSets = (compound: CompoundName, tyreSets: TyreSetData[] | undefined): number => {
  if (!tyreSets || tyreSets.length === 0) {
    return 0;
  }

  return tyreSets.reduce((count, set) => {
    if (!set.available) {
      return count;
    }

    const actual = toCompoundName(set.actualTyreCompound);
    const visual = toCompoundName(set.visualTyreCompound);

    return actual === compound || visual === compound ? count + 1 : count;
  }, 0);
};

