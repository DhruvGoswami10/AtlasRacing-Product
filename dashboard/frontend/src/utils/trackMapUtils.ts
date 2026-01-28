// Track Map Utilities
// SVG path parsing and position calculation for driver positions on track

export interface Point {
  x: number;
  y: number;
}

export interface PathSegment {
  type: 'M' | 'L' | 'C' | 'Q' | 'Z';
  points: Point[];
  length: number;
  startLength: number; // cumulative length at start of this segment
}

export interface ParsedPath {
  segments: PathSegment[];
  totalLength: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

// Parse SVG path d attribute into segments
export function parseSvgPath(d: string): ParsedPath {
  const segments: PathSegment[] = [];
  let currentPos: Point = { x: 0, y: 0 };
  let startPos: Point = { x: 0, y: 0 };
  let totalLength = 0;

  // Bounds tracking
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const updateBounds = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  // Tokenize the path
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?[0-9]*\.?[0-9]+/g) || [];

  let i = 0;
  let currentCommand = '';

  while (i < tokens.length) {
    const token = tokens[i];

    // Check if it's a command letter
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(token)) {
      currentCommand = token;
      i++;
      continue;
    }

    // Parse numbers based on current command
    switch (currentCommand.toUpperCase()) {
      case 'M': { // MoveTo
        const x = parseFloat(tokens[i]);
        const y = parseFloat(tokens[i + 1]);
        const isRelative = currentCommand === 'm';

        currentPos = isRelative
          ? { x: currentPos.x + x, y: currentPos.y + y }
          : { x, y };
        startPos = { ...currentPos };
        updateBounds(currentPos);

        // After M, subsequent coordinates are treated as L
        currentCommand = isRelative ? 'l' : 'L';
        i += 2;
        break;
      }

      case 'L': { // LineTo
        const x = parseFloat(tokens[i]);
        const y = parseFloat(tokens[i + 1]);
        const isRelative = currentCommand === 'l';

        const endPos = isRelative
          ? { x: currentPos.x + x, y: currentPos.y + y }
          : { x, y };

        const length = distance(currentPos, endPos);
        segments.push({
          type: 'L',
          points: [{ ...currentPos }, endPos],
          length,
          startLength: totalLength
        });
        totalLength += length;

        currentPos = endPos;
        updateBounds(currentPos);
        i += 2;
        break;
      }

      case 'H': { // Horizontal LineTo
        const x = parseFloat(tokens[i]);
        const isRelative = currentCommand === 'h';

        const endPos = isRelative
          ? { x: currentPos.x + x, y: currentPos.y }
          : { x, y: currentPos.y };

        const length = Math.abs(endPos.x - currentPos.x);
        segments.push({
          type: 'L',
          points: [{ ...currentPos }, endPos],
          length,
          startLength: totalLength
        });
        totalLength += length;

        currentPos = endPos;
        updateBounds(currentPos);
        i += 1;
        break;
      }

      case 'V': { // Vertical LineTo
        const y = parseFloat(tokens[i]);
        const isRelative = currentCommand === 'v';

        const endPos = isRelative
          ? { x: currentPos.x, y: currentPos.y + y }
          : { x: currentPos.x, y };

        const length = Math.abs(endPos.y - currentPos.y);
        segments.push({
          type: 'L',
          points: [{ ...currentPos }, endPos],
          length,
          startLength: totalLength
        });
        totalLength += length;

        currentPos = endPos;
        updateBounds(currentPos);
        i += 1;
        break;
      }

      case 'C': { // Cubic Bezier
        const isRelative = currentCommand === 'c';

        let cp1: Point, cp2: Point, end: Point;
        if (isRelative) {
          cp1 = { x: currentPos.x + parseFloat(tokens[i]), y: currentPos.y + parseFloat(tokens[i + 1]) };
          cp2 = { x: currentPos.x + parseFloat(tokens[i + 2]), y: currentPos.y + parseFloat(tokens[i + 3]) };
          end = { x: currentPos.x + parseFloat(tokens[i + 4]), y: currentPos.y + parseFloat(tokens[i + 5]) };
        } else {
          // Absolute coordinates - use values directly
          cp1 = { x: parseFloat(tokens[i]), y: parseFloat(tokens[i + 1]) };
          cp2 = { x: parseFloat(tokens[i + 2]), y: parseFloat(tokens[i + 3]) };
          end = { x: parseFloat(tokens[i + 4]), y: parseFloat(tokens[i + 5]) };
        }

        const length = cubicBezierLength(currentPos, cp1, cp2, end);
        segments.push({
          type: 'C',
          points: [{ ...currentPos }, cp1, cp2, end],
          length,
          startLength: totalLength
        });
        totalLength += length;

        currentPos = end;
        updateBounds(cp1);
        updateBounds(cp2);
        updateBounds(end);
        i += 6;
        break;
      }

      case 'S': { // Smooth Cubic Bezier
        const isRelative = currentCommand === 's';

        // Reflect previous control point
        const prevSeg = segments[segments.length - 1];
        let cp1: Point;
        if (prevSeg && prevSeg.type === 'C') {
          const prevCp2 = prevSeg.points[2];
          cp1 = { x: 2 * currentPos.x - prevCp2.x, y: 2 * currentPos.y - prevCp2.y };
        } else {
          cp1 = { ...currentPos };
        }

        let cp2: Point, end: Point;
        if (isRelative) {
          cp2 = { x: currentPos.x + parseFloat(tokens[i]), y: currentPos.y + parseFloat(tokens[i + 1]) };
          end = { x: currentPos.x + parseFloat(tokens[i + 2]), y: currentPos.y + parseFloat(tokens[i + 3]) };
        } else {
          // Absolute coordinates
          cp2 = { x: parseFloat(tokens[i]), y: parseFloat(tokens[i + 1]) };
          end = { x: parseFloat(tokens[i + 2]), y: parseFloat(tokens[i + 3]) };
        }

        const length = cubicBezierLength(currentPos, cp1, cp2, end);
        segments.push({
          type: 'C',
          points: [{ ...currentPos }, cp1, cp2, end],
          length,
          startLength: totalLength
        });
        totalLength += length;

        currentPos = end;
        updateBounds(cp1);
        updateBounds(cp2);
        updateBounds(end);
        i += 4;
        break;
      }

      case 'Q': { // Quadratic Bezier
        const isRelative = currentCommand === 'q';

        let cp: Point, end: Point;
        if (isRelative) {
          cp = { x: currentPos.x + parseFloat(tokens[i]), y: currentPos.y + parseFloat(tokens[i + 1]) };
          end = { x: currentPos.x + parseFloat(tokens[i + 2]), y: currentPos.y + parseFloat(tokens[i + 3]) };
        } else {
          // Absolute coordinates
          cp = { x: parseFloat(tokens[i]), y: parseFloat(tokens[i + 1]) };
          end = { x: parseFloat(tokens[i + 2]), y: parseFloat(tokens[i + 3]) };
        }

        const length = quadraticBezierLength(currentPos, cp, end);
        segments.push({
          type: 'Q',
          points: [{ ...currentPos }, cp, end],
          length,
          startLength: totalLength
        });
        totalLength += length;

        currentPos = end;
        updateBounds(cp);
        updateBounds(end);
        i += 4;
        break;
      }

      case 'Z': { // ClosePath
        const length = distance(currentPos, startPos);
        if (length > 0.001) {
          segments.push({
            type: 'Z',
            points: [{ ...currentPos }, { ...startPos }],
            length,
            startLength: totalLength
          });
          totalLength += length;
        }
        currentPos = startPos;
        i++;
        break;
      }

      default:
        // Skip unknown commands
        i++;
    }
  }

  return {
    segments,
    totalLength,
    bounds: { minX, minY, maxX, maxY }
  };
}

// Calculate distance between two points
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Approximate cubic bezier curve length using sampling
function cubicBezierLength(p0: Point, p1: Point, p2: Point, p3: Point, samples = 50): number {
  let length = 0;
  let prevPoint = p0;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const point = cubicBezierPoint(p0, p1, p2, p3, t);
    length += distance(prevPoint, point);
    prevPoint = point;
  }

  return length;
}

// Get point on cubic bezier curve at parameter t
function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  };
}

// Approximate quadratic bezier curve length
function quadraticBezierLength(p0: Point, p1: Point, p2: Point, samples = 50): number {
  let length = 0;
  let prevPoint = p0;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const point = quadraticBezierPoint(p0, p1, p2, t);
    length += distance(prevPoint, point);
    prevPoint = point;
  }

  return length;
}

// Get point on quadratic bezier curve at parameter t
function quadraticBezierPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  return {
    x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
    y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y
  };
}

// Get position on path at given distance (0 to totalLength)
export function getPointAtLength(path: ParsedPath, targetLength: number): Point {
  // Clamp to valid range
  targetLength = Math.max(0, Math.min(targetLength, path.totalLength));

  // Find the segment containing this length
  for (const segment of path.segments) {
    const segmentEnd = segment.startLength + segment.length;

    if (targetLength <= segmentEnd) {
      const localT = (targetLength - segment.startLength) / segment.length;

      switch (segment.type) {
        case 'L':
        case 'Z':
          // Linear interpolation
          return {
            x: segment.points[0].x + localT * (segment.points[1].x - segment.points[0].x),
            y: segment.points[0].y + localT * (segment.points[1].y - segment.points[0].y)
          };

        case 'C':
          return cubicBezierPoint(
            segment.points[0],
            segment.points[1],
            segment.points[2],
            segment.points[3],
            localT
          );

        case 'Q':
          return quadraticBezierPoint(
            segment.points[0],
            segment.points[1],
            segment.points[2],
            localT
          );

        default:
          return segment.points[0];
      }
    }
  }

  // Should not reach here, but return last point as fallback
  const lastSeg = path.segments[path.segments.length - 1];
  return lastSeg ? lastSeg.points[lastSeg.points.length - 1] : { x: 0, y: 0 };
}

// Get position on path at given lap distance (0.0 to 1.0)
export function getPointAtLapDistance(path: ParsedPath, lapDistance: number): Point {
  // lapDistance is 0.0 at start/finish, 1.0 at end of lap
  // Clamp to [0, 1] and convert to actual path length
  const normalizedDistance = Math.max(0, Math.min(1, lapDistance));
  const targetLength = normalizedDistance * path.totalLength;
  return getPointAtLength(path, targetLength);
}

// Cache for parsed paths
const pathCache = new Map<string, ParsedPath>();

// Parse path with caching
export function parsePathCached(d: string): ParsedPath {
  if (!pathCache.has(d)) {
    pathCache.set(d, parseSvgPath(d));
  }
  return pathCache.get(d)!;
}

// Extract path data from SVG string
export function extractMainPath(svgContent: string): string | null {
  // Look for the main track path (st0 class - gray track outline)
  const pathMatch = svgContent.match(/<path[^>]*class="st0"[^>]*d="([^"]+)"/);
  if (pathMatch) {
    return pathMatch[1];
  }

  // Fallback: find any path with a d attribute
  const anyPathMatch = svgContent.match(/<path[^>]*d="([^"]+)"/);
  return anyPathMatch ? anyPathMatch[1] : null;
}

// Get SVG viewBox dimensions
export function extractViewBox(svgContent: string): { width: number; height: number } | null {
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
    if (parts.length >= 4) {
      return { width: parts[2], height: parts[3] };
    }
  }
  return null;
}

// Driver position data structure
export interface DriverPosition {
  index: number;           // Array index (0-21)
  position: number;        // Race position (1-22)
  lapDistance: number;     // 0.0-1.0 progress around lap
  teamId: number;          // Team ID for color
  isPlayer: boolean;       // Is this the player's car
  name: string;            // Driver name or abbreviation
  currentLap: number;      // Current lap number
}

// Calculate driver dot position on track
export function calculateDriverPosition(
  path: ParsedPath,
  lapDistance: number,
  viewBox: { width: number; height: number }
): Point {
  const point = getPointAtLapDistance(path, lapDistance);
  return point;
}
