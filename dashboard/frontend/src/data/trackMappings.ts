// F1 24/25 Track ID to SVG filename mapping
// SVG files located in: dashboard/resources/f1_2020/

export interface TrackInfo {
  id: number;
  name: string;
  country: string;
  svgFile: string | null; // null if SVG not available
  trackLength: number; // in meters (approximate)
}

// F1 24/25 Track IDs based on game data
export const TRACK_MAPPINGS: Record<number, TrackInfo> = {
  0: { id: 0, name: 'Melbourne', country: 'Australia', svgFile: 'australia', trackLength: 5278 },
  1: { id: 1, name: 'Paul Ricard', country: 'France', svgFile: 'france', trackLength: 5842 },
  2: { id: 2, name: 'Shanghai', country: 'China', svgFile: 'china', trackLength: 5451 },
  3: { id: 3, name: 'Sakhir', country: 'Bahrain', svgFile: 'bahrain', trackLength: 5412 },
  4: { id: 4, name: 'Catalunya', country: 'Spain', svgFile: 'spain', trackLength: 4675 },
  5: { id: 5, name: 'Monaco', country: 'Monaco', svgFile: 'monaco', trackLength: 3337 },
  6: { id: 6, name: 'Montreal', country: 'Canada', svgFile: 'canada', trackLength: 4361 },
  7: { id: 7, name: 'Silverstone', country: 'Great Britain', svgFile: 'greatbritain', trackLength: 5891 },
  8: { id: 8, name: 'Hockenheim', country: 'Germany', svgFile: null, trackLength: 4574 },
  9: { id: 9, name: 'Hungaroring', country: 'Hungary', svgFile: 'hungary', trackLength: 4381 },
  10: { id: 10, name: 'Spa-Francorchamps', country: 'Belgium', svgFile: 'belgium', trackLength: 7004 },
  11: { id: 11, name: 'Monza', country: 'Italy', svgFile: 'italy', trackLength: 5793 },
  12: { id: 12, name: 'Marina Bay', country: 'Singapore', svgFile: 'singapore', trackLength: 5063 },
  13: { id: 13, name: 'Suzuka', country: 'Japan', svgFile: 'japan', trackLength: 5807 },
  14: { id: 14, name: 'Yas Marina', country: 'Abu Dhabi', svgFile: 'abudhabi', trackLength: 5281 },
  15: { id: 15, name: 'COTA', country: 'USA', svgFile: 'usa', trackLength: 5513 },
  16: { id: 16, name: 'Interlagos', country: 'Brazil', svgFile: 'brazil', trackLength: 4309 },
  17: { id: 17, name: 'Red Bull Ring', country: 'Austria', svgFile: 'austria', trackLength: 4318 },
  18: { id: 18, name: 'Sochi', country: 'Russia', svgFile: 'russia', trackLength: 5848 },
  19: { id: 19, name: 'Hermanos Rodriguez', country: 'Mexico', svgFile: 'mexico', trackLength: 4304 },
  20: { id: 20, name: 'Baku', country: 'Azerbaijan', svgFile: 'azerbaijan', trackLength: 6003 },
  21: { id: 21, name: 'Sakhir Short', country: 'Bahrain', svgFile: null, trackLength: 3543 },
  22: { id: 22, name: 'Silverstone Short', country: 'Great Britain', svgFile: null, trackLength: 3660 },
  23: { id: 23, name: 'COTA Short', country: 'USA', svgFile: null, trackLength: 3426 },
  24: { id: 24, name: 'Suzuka Short', country: 'Japan', svgFile: null, trackLength: 3274 },
  25: { id: 25, name: 'Jeddah', country: 'Saudi Arabia', svgFile: null, trackLength: 6174 },
  26: { id: 26, name: 'Lusail', country: 'Qatar', svgFile: null, trackLength: 5419 },
  27: { id: 27, name: 'Miami', country: 'USA', svgFile: null, trackLength: 5412 },
  28: { id: 28, name: 'Las Vegas', country: 'USA', svgFile: null, trackLength: 6201 },
  29: { id: 29, name: 'Zandvoort', country: 'Netherlands', svgFile: 'netherlands', trackLength: 4259 },
  30: { id: 30, name: 'Imola', country: 'Italy', svgFile: null, trackLength: 4909 },
  31: { id: 31, name: 'Portimao', country: 'Portugal', svgFile: null, trackLength: 4653 },
  32: { id: 32, name: 'Hanoi', country: 'Vietnam', svgFile: 'vietnam', trackLength: 5607 },
};

// Get track info by ID
export function getTrackInfo(trackId: number): TrackInfo | null {
  return TRACK_MAPPINGS[trackId] || null;
}

// Get SVG path for a track
export function getTrackSvgPath(trackId: number): string | null {
  const track = TRACK_MAPPINGS[trackId];
  if (!track || !track.svgFile) return null;
  return `/resources/f1_2020/${track.svgFile}.svg`;
}

// Check if track has SVG available
export function hasTrackSvg(trackId: number): boolean {
  const track = TRACK_MAPPINGS[trackId];
  return track?.svgFile !== null;
}

// F1 Team colors for driver dots
export const TEAM_COLORS: Record<number, string> = {
  0: '#00D2BE',  // Mercedes - Teal
  1: '#DC0000',  // Ferrari - Red
  2: '#0600EF',  // Red Bull - Blue
  3: '#FF8700',  // McLaren - Papaya
  4: '#006F62',  // Aston Martin - British Racing Green
  5: '#0090FF',  // Alpine - Blue
  6: '#900000',  // Alfa Romeo / Sauber - Maroon
  7: '#2B4562',  // AlphaTauri / RB - Navy
  8: '#B6BABD',  // Haas - Gray/White
  9: '#64C4FF',  // Williams - Light Blue
  10: '#FF87BC', // My Team (default pink)
  255: '#808080', // Unknown/Spectator - Gray
};

// Get team color by team ID
export function getTeamColor(teamId: number): string {
  return TEAM_COLORS[teamId] || TEAM_COLORS[255];
}

// Track name aliases for display
export const TRACK_DISPLAY_NAMES: Record<string, string> = {
  'australia': 'MELBOURNE',
  'france': 'PAUL RICARD',
  'china': 'SHANGHAI',
  'bahrain': 'BAHRAIN',
  'spain': 'BARCELONA',
  'monaco': 'MONACO',
  'canada': 'MONTREAL',
  'greatbritain': 'SILVERSTONE',
  'hungary': 'BUDAPEST',
  'belgium': 'SPA',
  'italy': 'MONZA',
  'singapore': 'SINGAPORE',
  'japan': 'SUZUKA',
  'abudhabi': 'ABU DHABI',
  'usa': 'AUSTIN',
  'brazil': 'INTERLAGOS',
  'austria': 'SPIELBERG',
  'russia': 'SOCHI',
  'mexico': 'MEXICO CITY',
  'azerbaijan': 'BAKU',
  'netherlands': 'ZANDVOORT',
  'vietnam': 'HANOI',
};
