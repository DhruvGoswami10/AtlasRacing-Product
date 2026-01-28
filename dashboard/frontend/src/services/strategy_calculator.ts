/**
 * Strategy Calculator - Undercut/Overcut Analysis
 *
 * Analyzes pit strategy opportunities based on:
 * - Opponent pit stops and tire ages
 * - Tire performance delta
 * - Track-specific pit deltas
 * - Position battles
 */

// @ts-nocheck - TelemetryData uses mixed naming conventions
import { TelemetryData, MultiCarTelemetryData as MultiCarData } from '../types/telemetry';

export interface StrategyOpportunity {
  type: 'undercut' | 'overcut' | 'track_position';
  opponent: string;
  opponentPosition: number;
  recommendation: 'pit_now' | 'stay_out' | 'respond_next_lap';
  reasoning: string;
  urgency: 'low' | 'medium' | 'high';
  tireAgeDelta: number; // Our age - Their age (positive = we're older)
  gapSeconds: number;
}

export class StrategyCalculator {
  private previousPitStates: Map<string, boolean> = new Map();
  private lastOpportunityCheck: number = 0;

  /**
   * Analyze strategy opportunities based on current race state
   */
  analyzeStrategy(
    telemetry: TelemetryData,
    multiCarData: MultiCarData | null
  ): StrategyOpportunity | null {
    if (!telemetry.atlas_ai || !multiCarData?.cars) {
      return null;
    }

    const now = Date.now();

    // Check for opportunities every 5 seconds max
    if (now - this.lastOpportunityCheck < 5000) {
      return null;
    }

    this.lastOpportunityCheck = now;

    // Get current player state
    const playerTireAge = telemetry.tireAge || 0;
    const playerInPit = telemetry.pitStatus === 'In Pit' || telemetry.pitStatus === 'Pitting';

    // Don't analyze if player is in pit
    if (playerInPit) {
      return null;
    }

    // Check nearby opponents from ATLAS AI
    const atlasAI = telemetry.atlas_ai;

    // 1. Check opponent ahead for undercut opportunity
    if (atlasAI.num_opponents_ahead > 0 && atlasAI.opponent_ahead_1.driver_name) {
      const opponent = atlasAI.opponent_ahead_1;

      // Detect if opponent just pitted (tire age reset)
      const opponentKey = `${opponent.position}_${opponent.driver_name}`;
      const wasInPit = this.previousPitStates.get(opponentKey) || false;
      const nowInPit = opponent.tyre_age < 3; // Fresh tires = recent pit

      // Opponent just pitted - undercut threat!
      if (!wasInPit && nowInPit && opponent.gap_seconds < 10.0) {
        this.previousPitStates.set(opponentKey, true);

        // Calculate if we should respond
        const shouldPit = this.shouldRespondToUndercut(
          playerTireAge,
          opponent.tyre_age,
          opponent.gap_seconds,
          atlasAI.pit_delta_time
        );

        if (shouldPit) {
          return {
            type: 'undercut',
            opponent: opponent.driver_name,
            opponentPosition: opponent.position,
            recommendation: 'pit_now',
            reasoning: `${opponent.driver_name} just pitted. Undercut threat. Box to respond.`,
            urgency: 'high',
            tireAgeDelta: playerTireAge - opponent.tyre_age,
            gapSeconds: opponent.gap_seconds
          };
        }
      }

      // Update pit state tracking
      this.previousPitStates.set(opponentKey, opponent.tyre_age < 3);

      // Check for overcut opportunity (opponent staying out too long)
      if (opponent.tyre_age > playerTireAge + 5 && opponent.gap_seconds < 15.0) {
        const overcutOpportunity = this.evaluateOvercut(
          playerTireAge,
          opponent.tyre_age,
          opponent.gap_seconds,
          atlasAI.pit_delta_time,
          atlasAI.tyre_life_remaining_laps
        );

        if (overcutOpportunity) {
          return {
            type: 'overcut',
            opponent: opponent.driver_name,
            opponentPosition: opponent.position,
            recommendation: 'stay_out',
            reasoning: `${opponent.driver_name} on ${opponent.tyre_age}L tires. Stay out for overcut.`,
            urgency: 'medium',
            tireAgeDelta: playerTireAge - opponent.tyre_age,
            gapSeconds: opponent.gap_seconds
          };
        }
      }
    }

    // 2. Check opponent behind for defensive pit
    if (atlasAI.num_opponents_behind > 0 && atlasAI.opponent_behind_1.driver_name) {
      const opponent = atlasAI.opponent_behind_1;

      // If opponent behind is on much fresher tires and closing in
      if (
        opponent.tyre_age < playerTireAge - 5 &&
        opponent.gap_seconds < 3.0 &&
        atlasAI.tyre_life_remaining_laps < 5
      ) {
        return {
          type: 'track_position',
          opponent: opponent.driver_name,
          opponentPosition: opponent.position,
          recommendation: 'pit_now',
          reasoning: `${opponent.driver_name} on fresher tires closing fast. Defend with pit stop.`,
          urgency: 'high',
          tireAgeDelta: playerTireAge - opponent.tyre_age,
          gapSeconds: opponent.gap_seconds
        };
      }
    }

    return null;
  }

  /**
   * Determine if we should respond to an undercut attempt
   */
  private shouldRespondToUndercut(
    ourTireAge: number,
    theirTireAge: number,
    gap: number,
    pitDelta: number
  ): boolean {
    // If they just pitted and we're within range, we must respond
    if (theirTireAge < 3 && gap < pitDelta + 5) {
      // They'll gain from fresh tires
      // If gap is less than pit delta + tire advantage window, respond
      return true;
    }

    // If our tires are old (>15 laps) and they're fresh, definitely respond
    if (ourTireAge > 15 && theirTireAge < 3) {
      return true;
    }

    return false;
  }

  /**
   * Evaluate if staying out for overcut is viable
   */
  private evaluateOvercut(
    ourTireAge: number,
    theirTireAge: number,
    gap: number,
    pitDelta: number,
    ourTireLifeRemaining: number
  ): boolean {
    // Overcut works if:
    // 1. They have much older tires (slower pace)
    // 2. We have enough tire life to build gap before pitting
    // 3. Gap + tire advantage > pit delta

    const tireAgeDelta = theirTireAge - ourTireAge;

    // They're at least 5 laps older
    if (tireAgeDelta < 5) return false;

    // We have at least 5 laps of tire life left
    if (ourTireLifeRemaining < 5) return false;

    // Gap is manageable (within 15 seconds)
    if (gap > 15) return false;

    // Estimate: Each lap of tire age difference = ~0.1s per lap pace delta
    const estimatedPaceAdvantage = tireAgeDelta * 0.1;
    const lapsToStayOut = Math.min(5, ourTireLifeRemaining);
    const potentialGainPerLap = estimatedPaceAdvantage;
    const totalGain = potentialGainPerLap * lapsToStayOut;

    // If we can gain more than pit delta by staying out, overcut is viable
    return totalGain > pitDelta - gap;
  }

  /**
   * Calculate optimal pit window based on tire deg and opponents
   */
  calculateOptimalPitWindow(
    telemetry: TelemetryData,
    multiCarData: MultiCarData | null
  ): { earliestLap: number; latestLap: number; idealLap: number } | null {
    if (!telemetry.atlas_ai) return null;

    const atlasAI = telemetry.atlas_ai;
    const currentLap = telemetry.currentLapNum;
    const totalLaps = telemetry.totalLaps;
    const tireLifeRemaining = atlasAI.tyre_life_remaining_laps;

    // Earliest pit: When tire deg becomes significant (>0.3s/lap)
    const earliestLap = currentLap + Math.max(1, Math.floor(tireLifeRemaining * 0.3));

    // Latest pit: When tires become critical (3 laps before death)
    const latestLap = currentLap + Math.max(1, tireLifeRemaining - 3);

    // Ideal pit: Balance between tire life and race length
    // For 1-stop: Pit around 50-60% race distance
    // For 2-stop: First stop at 30-35%, second at 65-70%
    const raceProgress = currentLap / totalLaps;
    let idealLap = currentLap;

    if (raceProgress < 0.5) {
      // Early race: aim for 50% mark for 1-stop
      idealLap = Math.floor(totalLaps * 0.5);
    } else {
      // Late race: pit ASAP if tires dying
      idealLap = currentLap + Math.floor(tireLifeRemaining * 0.5);
    }

    // Clamp ideal between earliest and latest
    idealLap = Math.max(earliestLap, Math.min(latestLap, idealLap));

    return {
      earliestLap,
      latestLap,
      idealLap
    };
  }

  /**
   * Reset strategy state (new session)
   */
  reset() {
    this.previousPitStates.clear();
    this.lastOpportunityCheck = 0;
    console.log('🤖 Strategy calculator reset for new session');
  }
}

export default StrategyCalculator;

