// Track Data Service - Integration with lovely-track-data repository
// Provides comprehensive track analysis for AC mistake detection and coaching

export interface TrackTurn {
  name: string;
  marker: number; // Track position as decimal (0.0 to 1.0)
}

export interface TrackSector {
  name: string;
  marker: number; // Sector position as decimal
}

export interface TrackTime {
  name: string;
  time: string; // Lap time format "1:23.456"
}

export interface TrackTimeData {
  gt3?: TrackTime[];
  // Add more classes as needed
}

export interface TrackCompanion {
  top: number;
  left: number;
  rotation: number;
  scale: number;
}

export interface TrackData {
  name: string;
  country: string;
  length: number; // meters
  turn: TrackTurn[];
  sector: TrackSector[];
  time: TrackTimeData;
  companion: TrackCompanion;
}

export interface CornerAnalysis {
  current_corner?: TrackTurn;
  upcoming_corner?: TrackTurn;
  distance_to_corner: number;
  corner_type: 'approach' | 'braking' | 'apex' | 'exit' | 'straight';
  coaching_tip: string;
}

export class TrackDataService {
  private trackDataCache: Map<string, TrackData> = new Map();
  private readonly BASE_URL = 'https://raw.githubusercontent.com/Lovely-Sim-Racing/lovely-track-data/main/data';

  /**
   * Fetch track data from lovely-track-data repository
   */
  async fetchTrackData(trackName: string): Promise<TrackData | null> {
    if (this.trackDataCache.has(trackName)) {
      return this.trackDataCache.get(trackName)!;
    }

    try {
      const fileName = this.mapTrackNameToFile(trackName);
      const url = `${this.BASE_URL}/assettocorsa/${fileName}.json`;

      console.log(`[TrackData] Fetching track data: ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[TrackData] Track data not found: ${trackName}`);
        return null;
      }

      const trackData: TrackData = await response.json();
      this.trackDataCache.set(trackName, trackData);

      console.log(`[TrackData] Loaded track data for ${trackName}:`, {
        turns: trackData.turn?.length || 0,
        sectors: trackData.sector?.length || 0,
        length: trackData.length,
      });

      return trackData;
    } catch (error) {
      console.error(`[TrackData] Failed to fetch track data for ${trackName}:`, error);
      return null;
    }
  }

  /**
   * Get corner analysis for current track position
   */
  getCornerAnalysis(trackData: TrackData, lapDistance: number): CornerAnalysis {
    if (!trackData || !trackData.turn || trackData.turn.length === 0) {
      return {
        distance_to_corner: 0,
        corner_type: 'straight',
        coaching_tip: 'No track data available'
      };
    }

    // Convert lap distance to track position (0.0 to 1.0)
    const trackPosition = lapDistance / trackData.length;
    
    // Find current and upcoming corners
    let currentCorner: TrackTurn | undefined;
    let upcomingCorner: TrackTurn | undefined;
    let minDistance = Infinity;

    for (const turn of trackData.turn) {
      const distance = this.calculateTrackDistance(trackPosition, turn.marker);
      
      if (distance < minDistance) {
        currentCorner = upcomingCorner;
        upcomingCorner = turn;
        minDistance = distance;
      }
    }

    // Determine corner type based on distance
    const distanceToCorner = minDistance * trackData.length; // Convert back to meters
    let cornerType: 'approach' | 'braking' | 'apex' | 'exit' | 'straight' = 'straight';
    let coachingTip = 'Maintain racing line';

    if (distanceToCorner < 50) {
      cornerType = 'apex';
      coachingTip = upcomingCorner ? `Hit the apex of ${upcomingCorner.name}` : 'Focus on apex speed';
    } else if (distanceToCorner < 150) {
      cornerType = 'braking';
      coachingTip = upcomingCorner ? `Braking zone for ${upcomingCorner.name}` : 'Prepare for braking';
    } else if (distanceToCorner < 300) {
      cornerType = 'approach';
      coachingTip = upcomingCorner ? `Approaching ${upcomingCorner.name}` : 'Corner ahead';
    }

    return {
      current_corner: currentCorner,
      upcoming_corner: upcomingCorner,
      distance_to_corner: distanceToCorner,
      corner_type: cornerType,
      coaching_tip: coachingTip
    };
  }

  /**
   * Get optimal lap time for car category
   */
  getOptimalLapTime(trackData: TrackData, carCategory: string = 'gt3'): string | null {
    if (!trackData.time) return null;

    const categoryTimes = (trackData.time as any)[carCategory];
    if (!categoryTimes || categoryTimes.length === 0) return null;

    // Return the first (presumably fastest) time
    return categoryTimes[0].time;
  }

  /**
   * Calculate distance between two track positions (handling wrap-around)
   */
  private calculateTrackDistance(pos1: number, pos2: number): number {
    const direct = Math.abs(pos2 - pos1);
    const wraparound = 1.0 - direct;
    return Math.min(direct, wraparound);
  }

  /**
   * Map AC internal track names to repository file names
   * This will need to be expanded as more tracks are added to the repository
   */
  private mapTrackNameToFile(trackName: string): string {
    const trackMapping: Record<string, string> = {
      'rt_lime_rock_park': 'rt_lime_rock_park',
      'limerock': 'rt_lime_rock_park',
      'lime_rock_park': 'rt_lime_rock_park',
      // Add more mappings as tracks are added to the repository
    };

    const normalized = trackName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return trackMapping[normalized] || normalized;
  }

  /**
   * Get available tracks in the repository
   */
  async getAvailableTracks(): Promise<string[]> {
    let tracks: string[] = [];
    try {
      // For now, return known tracks. This could be enhanced to dynamically fetch from GitHub API
      tracks = ['rt_lime_rock_park'];
    } catch (error) {
      console.error('[TrackData] Failed to fetch available tracks:', error);
    }

    return tracks;
  }

  /**
   * Clear cache (useful for development)
   */
  clearCache(): void {
    this.trackDataCache.clear();
    console.log('[TrackData] Cache cleared');
  }
}

// Singleton instance
export const trackDataService = new TrackDataService();


