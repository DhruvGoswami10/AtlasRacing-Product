#!/usr/bin/env python3
"""
Track SVG Generator from F1 Telemetry Data

This script generates SVG track maps from F1 24/25 telemetry recordings.
It reads position data from telemetry files and creates SVG paths with sector coloring.

Usage:
    python generate_track_svg.py <recording_file> <output_svg> [--track-name NAME]

The recording file should be a binary F1 25 telemetry recording (.f125 file).
Alternatively, you can provide a JSON file with world positions exported from telemetry.

Example:
    python generate_track_svg.py silverstone_lap.f125 silverstone.svg --track-name "Silverstone"
    python generate_track_svg.py positions.json miami.svg --track-name "Miami"
"""

import sys
import struct
import json
import argparse
from pathlib import Path
from typing import List, Tuple, Optional
import math


class Point:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y

    def __repr__(self):
        return f"Point({self.x:.2f}, {self.y:.2f})"


def distance(p1: Point, p2: Point) -> float:
    """Calculate distance between two points."""
    dx = p2.x - p1.x
    dy = p2.y - p1.y
    return math.sqrt(dx * dx + dy * dy)


def simplify_path(points: List[Point], tolerance: float = 2.0) -> List[Point]:
    """
    Simplify path using Douglas-Peucker algorithm.
    This reduces the number of points while preserving the shape.
    """
    if len(points) < 3:
        return points

    # Find the point with maximum distance from line between start and end
    max_dist = 0
    max_idx = 0
    start = points[0]
    end = points[-1]

    for i in range(1, len(points) - 1):
        dist = perpendicular_distance(points[i], start, end)
        if dist > max_dist:
            max_dist = dist
            max_idx = i

    # If max distance is greater than tolerance, recursively simplify
    if max_dist > tolerance:
        left = simplify_path(points[:max_idx + 1], tolerance)
        right = simplify_path(points[max_idx:], tolerance)
        return left[:-1] + right
    else:
        return [start, end]


def perpendicular_distance(point: Point, line_start: Point, line_end: Point) -> float:
    """Calculate perpendicular distance from point to line."""
    dx = line_end.x - line_start.x
    dy = line_end.y - line_start.y

    if dx == 0 and dy == 0:
        return distance(point, line_start)

    t = max(0, min(1, ((point.x - line_start.x) * dx + (point.y - line_start.y) * dy) / (dx * dx + dy * dy)))

    proj_x = line_start.x + t * dx
    proj_y = line_start.y + t * dy

    return distance(point, Point(proj_x, proj_y))


def smooth_path(points: List[Point], iterations: int = 2) -> List[Point]:
    """
    Apply Chaikin's corner cutting algorithm for smooth curves.
    """
    if len(points) < 3:
        return points

    result = points[:]
    for _ in range(iterations):
        new_points = [result[0]]
        for i in range(len(result) - 1):
            p1 = result[i]
            p2 = result[i + 1]

            # Create two new points at 1/4 and 3/4 of the segment
            q = Point(0.75 * p1.x + 0.25 * p2.x, 0.75 * p1.y + 0.25 * p2.y)
            r = Point(0.25 * p1.x + 0.75 * p2.x, 0.25 * p1.y + 0.75 * p2.y)

            new_points.append(q)
            new_points.append(r)

        new_points.append(result[-1])
        result = new_points

    return result


def points_to_svg_path(points: List[Point]) -> str:
    """Convert list of points to SVG path d attribute using bezier curves."""
    if len(points) < 2:
        return ""

    # Start with moveto
    d = f"M{points[0].x:.1f},{points[0].y:.1f}"

    if len(points) == 2:
        d += f"L{points[1].x:.1f},{points[1].y:.1f}"
        return d

    # Use cubic bezier curves for smooth path
    for i in range(1, len(points) - 1, 3):
        if i + 2 < len(points):
            # Full cubic bezier
            p1 = points[i]
            p2 = points[i + 1]
            p3 = points[i + 2]
            d += f"C{p1.x:.1f},{p1.y:.1f} {p2.x:.1f},{p2.y:.1f} {p3.x:.1f},{p3.y:.1f}"
        elif i + 1 < len(points):
            # Quadratic bezier for remaining 2 points
            p1 = points[i]
            p2 = points[i + 1]
            d += f"Q{p1.x:.1f},{p1.y:.1f} {p2.x:.1f},{p2.y:.1f}"
        else:
            # Line for single remaining point
            p1 = points[i]
            d += f"L{p1.x:.1f},{p1.y:.1f}"

    # Close the path
    d += "z"

    return d


def split_into_sectors(points: List[Point], lap_distance: List[float],
                       sector1_end: float, sector2_end: float) -> Tuple[List[Point], List[Point], List[Point]]:
    """
    Split track points into three sectors based on lap distance.

    Args:
        points: List of track points
        lap_distance: Corresponding lap distance for each point (in meters)
        sector1_end: Lap distance where sector 1 ends (meters)
        sector2_end: Lap distance where sector 2 ends (meters)

    Returns:
        Tuple of (sector1_points, sector2_points, sector3_points)
    """
    sector1 = []
    sector2 = []
    sector3 = []

    for i, (point, dist) in enumerate(zip(points, lap_distance)):
        if dist <= sector1_end:
            sector1.append(point)
        elif dist <= sector2_end:
            sector2.append(point)
        else:
            sector3.append(point)

    return sector1, sector2, sector3


def read_f125_recording(filepath: str) -> List[Tuple[float, float, float]]:
    """
    Read F1 25 recording file and extract world positions.

    Returns list of (x, y, lap_distance) tuples.
    """
    positions = []

    with open(filepath, 'rb') as f:
        while True:
            # Read packet header to get size
            header = f.read(4)
            if len(header) < 4:
                break

            packet_size = struct.unpack('<I', header)[0]
            if packet_size < 4 or packet_size > 65535:
                break

            # Read packet data
            data = f.read(packet_size - 4)
            if len(data) < packet_size - 4:
                break

            # Check packet type (Motion = 0, LapData = 2)
            if len(data) >= 7:
                packet_id = data[6]

                # Motion packet (packet ID 0)
                if packet_id == 0 and len(data) >= 1349:
                    # First car's position (player car at index 0)
                    # Motion packet header: 29 bytes
                    # CarMotionData: 60 bytes per car
                    # worldPositionX at offset 0 (float)
                    # worldPositionY at offset 4 (float)
                    # worldPositionZ at offset 8 (float)
                    offset = 29  # Skip header
                    x = struct.unpack('<f', data[offset:offset+4])[0]
                    y = struct.unpack('<f', data[offset+4:offset+8])[0]
                    z = struct.unpack('<f', data[offset+8:offset+12])[0]

                    if abs(x) < 10000 and abs(y) < 10000:  # Valid coordinates
                        positions.append((x, z, 0))  # Use X and Z for 2D map

                # Lap data packet (packet ID 2) - for lap distance
                if packet_id == 2 and len(data) >= 1131:
                    # LapData header: 29 bytes
                    # LapData: 50 bytes per car
                    # lapDistance at offset 8 (float)
                    offset = 29 + 8
                    lap_distance = struct.unpack('<f', data[offset:offset+4])[0]

                    if positions and len(positions[-1]) == 2:
                        x, y, _ = positions[-1]
                        positions[-1] = (x, y, lap_distance)

    return positions


def read_json_positions(filepath: str) -> List[Tuple[float, float, float]]:
    """
    Read positions from JSON file.

    Expected format:
    {
        "positions": [
            {"x": 1234.5, "y": 567.8, "lap_distance": 0},
            ...
        ]
    }
    or simply a list of [x, y, lap_distance] arrays.
    """
    with open(filepath, 'r') as f:
        data = json.load(f)

    positions = []

    if isinstance(data, dict) and 'positions' in data:
        for p in data['positions']:
            if isinstance(p, dict):
                positions.append((p.get('x', 0), p.get('y', 0), p.get('lap_distance', 0)))
            else:
                positions.append(tuple(p))
    elif isinstance(data, list):
        for p in data:
            if isinstance(p, dict):
                positions.append((p.get('x', 0), p.get('y', 0), p.get('lap_distance', 0)))
            else:
                positions.append(tuple(p))

    return positions


def generate_svg(points: List[Point],
                 sector1_points: List[Point],
                 sector2_points: List[Point],
                 sector3_points: List[Point],
                 track_name: str = "Track") -> str:
    """Generate SVG content from track points."""

    # Calculate bounding box
    min_x = min(p.x for p in points)
    max_x = max(p.x for p in points)
    min_y = min(p.y for p in points)
    max_y = max(p.y for p in points)

    # Add padding
    padding = max(max_x - min_x, max_y - min_y) * 0.1
    min_x -= padding
    max_x += padding
    min_y -= padding
    max_y += padding

    width = max_x - min_x
    height = max_y - min_y

    # Normalize points to viewBox
    def normalize(p: Point) -> Point:
        return Point(p.x - min_x, p.y - min_y)

    norm_points = [normalize(p) for p in points]
    norm_s1 = [normalize(p) for p in sector1_points]
    norm_s2 = [normalize(p) for p in sector2_points]
    norm_s3 = [normalize(p) for p in sector3_points]

    # Generate paths
    main_path = points_to_svg_path(norm_points)
    s1_path = points_to_svg_path(norm_s1) if norm_s1 else ""
    s2_path = points_to_svg_path(norm_s2) if norm_s2 else ""
    s3_path = points_to_svg_path(norm_s3) if norm_s3 else ""

    svg = f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Track: {track_name} - Generated from telemetry data -->
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="0 0 {width:.1f} {height:.1f}" style="enable-background:new 0 0 {width:.1f} {height:.1f};">
<style type="text/css">
    .st0{{fill:none;stroke:#374151;stroke-width:4.5474;stroke-miterlimit:2.2737;}}
    .st1{{fill:none;stroke:#EF4444;stroke-width:1.1368;stroke-miterlimit:2.2737;}}
    .st2{{fill:none;stroke:#3B82F6;stroke-width:1.1368;stroke-miterlimit:2.2737;}}
    .st3{{fill:none;stroke:#FBBF24;stroke-width:1.1368;stroke-miterlimit:2.2737;}}
</style>
<path vector-effect="non-scaling-stroke" class="st0" d="{main_path}"/>
'''

    if s1_path:
        svg += f'<path vector-effect="non-scaling-stroke" class="st1" d="{s1_path}"/>\n'
    if s2_path:
        svg += f'<path vector-effect="non-scaling-stroke" class="st2" d="{s2_path}"/>\n'
    if s3_path:
        svg += f'<path vector-effect="non-scaling-stroke" class="st3" d="{s3_path}"/>\n'

    svg += '</svg>\n'

    return svg


def main():
    parser = argparse.ArgumentParser(
        description='Generate SVG track map from F1 telemetry data.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('input', help='Input recording file (.f125) or JSON positions file')
    parser.add_argument('output', help='Output SVG file path')
    parser.add_argument('--track-name', '-n', default='Track', help='Track name for SVG metadata')
    parser.add_argument('--sector1-end', type=float, default=None,
                        help='Lap distance where sector 1 ends (meters). If not specified, uses 33%% of track.')
    parser.add_argument('--sector2-end', type=float, default=None,
                        help='Lap distance where sector 2 ends (meters). If not specified, uses 66%% of track.')
    parser.add_argument('--simplify', type=float, default=5.0,
                        help='Path simplification tolerance (default: 5.0)')
    parser.add_argument('--smooth', type=int, default=2,
                        help='Smoothing iterations (default: 2)')

    args = parser.parse_args()

    input_path = Path(args.input)

    if not input_path.exists():
        print(f"Error: Input file '{input_path}' not found.")
        sys.exit(1)

    # Read positions based on file type
    print(f"Reading positions from {input_path}...")

    if input_path.suffix.lower() == '.json':
        positions = read_json_positions(str(input_path))
    elif input_path.suffix.lower() in ('.f125', '.f124'):
        positions = read_f125_recording(str(input_path))
    else:
        print(f"Warning: Unknown file type '{input_path.suffix}', attempting to read as JSON...")
        try:
            positions = read_json_positions(str(input_path))
        except:
            positions = read_f125_recording(str(input_path))

    if not positions:
        print("Error: No valid positions found in input file.")
        sys.exit(1)

    print(f"Found {len(positions)} position samples.")

    # Convert to Point objects
    points = [Point(p[0], p[1]) for p in positions]
    lap_distances = [p[2] if len(p) > 2 else 0 for p in positions]

    # Remove duplicates and filter outliers
    filtered_points = []
    filtered_distances = []
    min_distance = 0.5  # Minimum distance between consecutive points

    for i, (point, dist) in enumerate(zip(points, lap_distances)):
        if not filtered_points or distance(point, filtered_points[-1]) >= min_distance:
            filtered_points.append(point)
            filtered_distances.append(dist)

    points = filtered_points
    lap_distances = filtered_distances

    print(f"After filtering: {len(points)} points.")

    # Simplify path
    if args.simplify > 0:
        points = simplify_path(points, args.simplify)
        print(f"After simplification: {len(points)} points.")

    # Smooth path
    if args.smooth > 0:
        points = smooth_path(points, args.smooth)
        print(f"After smoothing: {len(points)} points.")

    # Calculate track length and sector boundaries
    track_length = max(lap_distances) if lap_distances else sum(
        distance(points[i], points[i+1]) for i in range(len(points)-1)
    )

    sector1_end = args.sector1_end if args.sector1_end else track_length * 0.33
    sector2_end = args.sector2_end if args.sector2_end else track_length * 0.66

    print(f"Track length: {track_length:.0f}m")
    print(f"Sector 1 ends at: {sector1_end:.0f}m")
    print(f"Sector 2 ends at: {sector2_end:.0f}m")

    # Split into sectors (if we have lap distance data)
    if any(d > 0 for d in lap_distances):
        # Interpolate lap distances for smoothed/simplified points
        # For now, just use the full track for each sector
        s1_ratio = sector1_end / track_length
        s2_ratio = sector2_end / track_length

        s1_end_idx = int(len(points) * s1_ratio)
        s2_end_idx = int(len(points) * s2_ratio)

        sector1 = points[:s1_end_idx]
        sector2 = points[s1_end_idx:s2_end_idx]
        sector3 = points[s2_end_idx:]
    else:
        # No lap distance data, divide evenly
        n = len(points)
        sector1 = points[:n//3]
        sector2 = points[n//3:2*n//3]
        sector3 = points[2*n//3:]

    # Generate SVG
    svg_content = generate_svg(points, sector1, sector2, sector3, args.track_name)

    # Write output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        f.write(svg_content)

    print(f"SVG track map saved to: {output_path}")
    print(f"\nTo use this track:")
    print(f"1. Copy to: dashboard/frontend/public/resources/f1_2020/{output_path.stem}.svg")
    print(f"2. Add mapping in src/data/trackMappings.ts")


if __name__ == '__main__':
    main()
