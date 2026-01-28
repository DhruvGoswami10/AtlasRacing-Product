# Atlas Racing Dashboard - Widget Development Guide

## Overview

This guide provides comprehensive instructions for developers (both AI and human) on how to create custom widgets and dashboards for the Atlas Racing telemetry system. The system supports real-time telemetry data from multiple racing games including F1 24, Assetto Corsa, and planned support for ATS and ACC.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Telemetry Data Structure](#telemetry-data-structure)
3. [Widget Development Patterns](#widget-development-patterns)
4. [Common Telemetry Fields](#common-telemetry-fields)
5. [Widget Examples](#widget-examples)
6. [Game-Specific Implementation](#game-specific-implementation)
7. [Configuration System](#configuration-system)
8. [Best Practices](#best-practices)
9. [Testing and Debugging](#testing-and-debugging)

## System Architecture

### Data Flow
```
F1 24 → UDP :20777 → C++ Parser → Unified Server → WebSocket :8080 → React Dashboard
AC → Shared Memory → AC Parser → Unified Server → WebSocket :8080 → React Dashboard
```

### Key Components
- **Backend**: C++ unified telemetry server (`atlas_racing_server`) serving data via WebSocket at `http://localhost:8080`
- **Game Parsers**: F1 24 UDP parser and AC shared memory parser
- **Frontend**: React/TypeScript dashboard consuming telemetry via `useTelemetry` hook
- **Widgets**: React components that receive telemetry data via `WidgetProps` interface

## Telemetry Data Structure

### Core Interface
```typescript
interface TelemetryData {
  // Vehicle Dynamics
  speed: number;                    // Speed in km/h
  rpm: number;                      // Engine RPM
  gear: number;                     // Current gear (0=N, -1=R, 1-8=forward)
  throttle: number;                 // Throttle position (0-100%)
  brake: number;                    // Brake position (0-100%)
  
  // Performance Deltas
  speed_delta: number;              // Speed change from previous frame
  rpm_delta: number;                // RPM change from previous frame
  
  // Lap/Session Data
  current_lap_time: number;         // Current lap time in seconds
  last_lap_time: number;            // Previous lap time
  best_lap_time: number;            // Best lap time
  position: number;                 // Race position
  current_lap_num: number;          // Current lap number
  
  // Tire Data (F1 24)
  tire_compound: string;            // Tire compound (Soft, Medium, Hard, etc.)
  tire_age_laps: number;           // Tire age in laps
  tire_temps: {
    surface: number[];             // Surface temps [FL, FR, RL, RR]
    inner: number[];               // Inner temps [FL, FR, RL, RR]
  };
  tire_pressure: number[];         // Tire pressures [FL, FR, RL, RR]
  
  // Fuel & Energy
  fuel_in_tank: number;            // Fuel remaining in kg
  fuel_remaining_laps: number;     // Estimated laps remaining
  ers_store_energy: number;        // ERS energy stored (MJ)
  ers_deploy_mode: number;         // ERS deployment mode
  drs_allowed: number;             // DRS availability (0/1)
  
  // Assetto Corsa Specific
  tyreTempInner?: number[];        // AC inner tire temps [FL, FR, RL, RR]
  tyreTempMiddle?: number[];       // AC middle tire temps [FL, FR, RL, RR]
  tyreTempOuter?: number[];        // AC outer tire temps [FL, FR, RL, RR]
  tyreWear?: number[];             // AC tire wear values [FL, FR, RL, RR]
  performanceMeter?: number;       // AC performance vs best lap
  suspensionTravel?: number[];     // AC suspension travel [FL, FR, RL, RR]
  surfaceGrip?: number;            // AC surface grip
  
  // Session Environment
  weather?: number;
  track_temperature?: number;
  air_temperature?: number;
  safety_car_status?: number;
}
```

## Widget Development Patterns

### Basic Widget Structure
```typescript
import React from 'react';
import { WidgetProps } from '../types/telemetry';

export const SpeedWidget: React.FC<WidgetProps> = ({ telemetry, className = '' }) => {
  const { speed, speed_delta } = telemetry;
  
  return (
    <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
      <div className="text-white text-center">
        <div className="text-2xl font-bold">SPEED</div>
        <div className="text-6xl font-bold">{Math.round(speed)}</div>
        <div className="text-sm">km/h</div>
        <div className={`text-sm ${speed_delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {speed_delta > 0 ? '+' : ''}{speed_delta.toFixed(1)}
        </div>
      </div>
    </div>
  );
};
```

### Configurable Widget Pattern
```typescript
interface SpeedWidgetConfig {
  showDelta: boolean;
  unit: 'kph' | 'mph';
  maxSpeed: number;
}

interface SpeedWidgetProps extends WidgetProps {
  config?: SpeedWidgetConfig;
}

export const SpeedWidget: React.FC<SpeedWidgetProps> = ({ 
  telemetry, 
  className = '',
  config = { showDelta: true, unit: 'kph', maxSpeed: 350 }
}) => {
  const { speed, speed_delta } = telemetry;
  const { showDelta, unit, maxSpeed } = config;
  
  // Unit conversion
  const displaySpeed = unit === 'mph' ? speed * 0.621371 : speed;
  const speedPercentage = Math.min((displaySpeed / maxSpeed) * 100, 100);
  
  return (
    <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
      <div className="text-white text-center">
        <div className="text-2xl font-bold">SPEED</div>
        <div className="text-6xl font-bold">{Math.round(displaySpeed)}</div>
        <div className="text-sm">{unit.toUpperCase()}</div>
        
        {/* Speed bar */}
        <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
          <div 
            className="bg-blue-400 h-2 rounded-full transition-all duration-150"
            style={{ width: `${speedPercentage}%` }}
          />
        </div>
        
        {showDelta && (
          <div className={`text-sm mt-1 ${speed_delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {speed_delta > 0 ? '+' : ''}{speed_delta.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  );
};
```

## Common Telemetry Fields

### Vehicle Controls
```typescript
const { throttle, brake, clutch, steering } = telemetry;
// Use for input visualization widgets
// Values are typically 0-100 for throttle/brake, -100 to 100 for steering
```

### Engine Data
```typescript
const { rpm, gear, engine_temp } = telemetry;
// Use for RPM gauges, gear displays, temperature monitoring
```

### Timing Data
```typescript
const { current_lap_time, last_lap_time, best_lap_time, position } = telemetry;
// Use for lap time displays, position tracking, session analysis
```

### Tire Data (F1 24)
```typescript
const { tire_compound, tire_temps, tire_pressure, tire_age_laps } = telemetry;
// tire_temps.surface[0] = Front Left surface temperature
// tire_temps.surface[1] = Front Right surface temperature
// tire_temps.surface[2] = Rear Left surface temperature  
// tire_temps.surface[3] = Rear Right surface temperature
```

### Tire Data (Assetto Corsa)
```typescript
const { tyreTempInner, tyreTempMiddle, tyreTempOuter, tyreWear } = telemetry;
// AC provides more detailed tire temperature zones
// tyreTempInner[0] = Front Left inner temperature
// All arrays follow [FL, FR, RL, RR] pattern
```

## Widget Examples

### Simple Data Display Widget
```typescript
export const GearWidget: React.FC<WidgetProps> = ({ telemetry, className = '' }) => {
  const { gear } = telemetry;
  
  const getGearDisplay = () => {
    if (gear === 0) return 'N';
    if (gear === -1) return 'R';
    return gear.toString();
  };
  
  const getGearColor = () => {
    if (gear === 0) return 'text-yellow-400';
    if (gear === -1) return 'text-red-400';
    return 'text-green-400';
  };
  
  return (
    <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
      <div className="text-white text-center">
        <div className="text-xl font-bold">GEAR</div>
        <div className={`text-8xl font-bold ${getGearColor()}`}>
          {getGearDisplay()}
        </div>
      </div>
    </div>
  );
};
```

### Complex Processing Widget
```typescript
export const TyreWidget: React.FC<WidgetProps> = ({ telemetry, className = '' }) => {
  const { tire_temps, tire_pressure, tire_compound } = telemetry;
  
  const getTempColor = (temp: number) => {
    if (temp < 80) return 'text-blue-400';
    if (temp < 100) return 'text-green-400';
    if (temp < 120) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const tyrePositions = [
    { label: 'FL', index: 0 },
    { label: 'FR', index: 1 },
    { label: 'RL', index: 2 },
    { label: 'RR', index: 3 }
  ];
  
  return (
    <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
      <div className="text-white">
        <div className="text-xl font-bold mb-2">TYRES</div>
        <div className="text-sm mb-2">Compound: {tire_compound}</div>
        
        <div className="grid grid-cols-2 gap-2">
          {tyrePositions.map(({ label, index }) => (
            <div key={label} className="text-center">
              <div className="text-xs">{label}</div>
              <div className={`text-lg font-bold ${getTempColor(tire_temps?.surface?.[index] || 0)}`}>
                {Math.round(tire_temps?.surface?.[index] || 0)}°C
              </div>
              <div className="text-xs">
                {tire_pressure?.[index]?.toFixed(1) || '0.0'} bar
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

### Input Visualization Widget
```typescript
export const InputsWidget: React.FC<WidgetProps> = ({ telemetry, className = '' }) => {
  const { throttle, brake, clutch, steering } = telemetry;
  
  return (
    <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
      <div className="text-white">
        <div className="text-xl font-bold mb-4">INPUTS</div>
        
        {/* Throttle */}
        <div className="mb-3">
          <div className="flex justify-between text-sm">
            <span>Throttle</span>
            <span>{throttle?.toFixed(0) || 0}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-green-400 h-2 rounded-full transition-all duration-100"
              style={{ width: `${throttle || 0}%` }}
            />
          </div>
        </div>
        
        {/* Brake */}
        <div className="mb-3">
          <div className="flex justify-between text-sm">
            <span>Brake</span>
            <span>{brake?.toFixed(0) || 0}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-red-400 h-2 rounded-full transition-all duration-100"
              style={{ width: `${brake || 0}%` }}
            />
          </div>
        </div>
        
        {/* Clutch */}
        <div className="mb-3">
          <div className="flex justify-between text-sm">
            <span>Clutch</span>
            <span>{clutch?.toFixed(0) || 0}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-yellow-400 h-2 rounded-full transition-all duration-100"
              style={{ width: `${clutch || 0}%` }}
            />
          </div>
        </div>
        
        {/* Steering */}
        <div className="mb-3">
          <div className="flex justify-between text-sm">
            <span>Steering</span>
            <span>{steering?.toFixed(0) || 0}°</span>
          </div>
          <div className="relative w-full bg-gray-700 rounded-full h-2">
            <div className="absolute left-1/2 w-0.5 h-2 bg-white"></div>
            <div 
              className="bg-blue-400 h-2 rounded-full transition-all duration-100 absolute"
              style={{ 
                width: `${Math.abs(steering || 0) / 2}%`,
                left: steering > 0 ? '50%' : `${50 - Math.abs(steering || 0) / 2}%`
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
```

## Game-Specific Implementation

### F1 24 Widgets
Best suited for:
- **SpeedWidget**: Uses `speed`, `speed_delta`
- **RPMWidget**: Uses `rpm`, with redline at game-specific values
- **ERSWidget**: Uses `ers_store_energy`, `ers_deploy_mode`
- **DRSWidget**: Uses `drs_allowed`
- **TyreWidget**: Uses `tire_temps.surface`, `tire_temps.inner`, `tire_compound`

### Assetto Corsa Widgets
Best suited for:
- **DetailedTyreWidget**: Uses `tyreTempInner`, `tyreTempMiddle`, `tyreTempOuter`
- **SuspensionWidget**: Uses `suspensionTravel` array
- **PerformanceMeterWidget**: Uses `performanceMeter` for lap comparison
- **SurfaceGripWidget**: Uses `surfaceGrip` for track conditions
- **TrackConditionsWidget**: Uses `windSpeed`, `windDirection`, `air_temperature`, `track_temperature`

### AC-Specific Widget Example
```typescript
export const DetailedTyreWidget: React.FC<WidgetProps> = ({ telemetry, className = '' }) => {
  const { tyreTempInner, tyreTempMiddle, tyreTempOuter, tyreWear } = telemetry;
  
  // Only render if AC data is available
  if (!tyreTempInner || !tyreTempMiddle || !tyreTempOuter) {
    return (
      <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
        <div className="text-gray-400">AC Tire Data Not Available</div>
      </div>
    );
  }
  
  const getTempColor = (temp: number) => {
    if (temp < 70) return 'text-blue-400';
    if (temp < 85) return 'text-green-400';
    if (temp < 100) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const tyrePositions = [
    { label: 'FL', index: 0 },
    { label: 'FR', index: 1 },
    { label: 'RL', index: 2 },
    { label: 'RR', index: 3 }
  ];
  
  return (
    <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
      <div className="text-white">
        <div className="text-xl font-bold mb-2">AC TIRE TEMPS</div>
        
        <div className="grid grid-cols-2 gap-2">
          {tyrePositions.map(({ label, index }) => (
            <div key={label} className="text-center border border-gray-700 rounded p-2">
              <div className="text-xs font-bold mb-1">{label}</div>
              
              {/* Inner Temperature */}
              <div className="text-xs">Inner</div>
              <div className={`text-sm font-bold ${getTempColor(tyreTempInner[index])}`}>
                {Math.round(tyreTempInner[index])}°C
              </div>
              
              {/* Middle Temperature */}
              <div className="text-xs">Middle</div>
              <div className={`text-sm font-bold ${getTempColor(tyreTempMiddle[index])}`}>
                {Math.round(tyreTempMiddle[index])}°C
              </div>
              
              {/* Outer Temperature */}
              <div className="text-xs">Outer</div>
              <div className={`text-sm font-bold ${getTempColor(tyreTempOuter[index])}`}>
                {Math.round(tyreTempOuter[index])}°C
              </div>
              
              {/* Tire Wear */}
              {tyreWear && (
                <>
                  <div className="text-xs mt-1">Wear</div>
                  <div className="text-xs text-gray-400">
                    {(tyreWear[index] * 100).toFixed(1)}%
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

### AC Performance Meter Widget
```typescript
export const PerformanceMeterWidget: React.FC<WidgetProps> = ({ telemetry, className = '' }) => {
  const { performanceMeter } = telemetry;
  
  if (performanceMeter === undefined) {
    return (
      <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
        <div className="text-gray-400">AC Performance Data Not Available</div>
      </div>
    );
  }
  
  // Performance meter: -1 (slower) to +1 (faster) vs best lap
  const percentage = Math.abs(performanceMeter) * 100;
  const isPositive = performanceMeter > 0;
  
  return (
    <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
      <div className="text-white text-center">
        <div className="text-xl font-bold mb-2">PERFORMANCE</div>
        <div className="text-xs mb-2">vs Best Lap</div>
        
        <div className={`text-4xl font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? '+' : ''}{(performanceMeter * 100).toFixed(1)}%
        </div>
        
        {/* Performance bar */}
        <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              isPositive ? 'bg-green-400' : 'bg-red-400'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        
        <div className="text-xs mt-1 text-gray-400">
          {isPositive ? 'Faster' : 'Slower'} than best
        </div>
      </div>
    </div>
  );
};
```

### Universal Widgets
Work with all games:
- **SpeedWidget**: Basic speed display
- **GearWidget**: Gear position display
- **InputsWidget**: Throttle, brake, steering inputs
- **LapTimeWidget**: Lap timing information

## Configuration System

### Widget Registration
Add your widget to the `WidgetRenderer` component:

```typescript
// In WidgetRenderer.tsx
switch (widget.type) {
  case 'myCustomWidget':
    return <MyCustomWidget telemetry={telemetry} config={widget.config} />;
  // ... other cases
}
```

### Layout Configuration
Define widget placement in JSON layout files:

```json
{
  "widgets": [
    {
      "id": "customSpeed",
      "type": "MyCustomSpeedWidget",
      "position": { "x": 20, "y": 20 },
      "size": { "width": 200, "height": 150 },
      "config": {
        "showDelta": true,
        "unit": "kph",
        "maxSpeed": 350,
        "showSpeedBar": true,
        "colorTheme": "blue"
      }
    }
  ]
}
```

## Best Practices

### 1. Data Handling
- Always destructure telemetry data: `const { speed, rpm } = telemetry;`
- Use optional chaining for optional fields: `telemetry.tire_temps?.surface`
- Provide fallback values: `telemetry.speed || 0`
- Handle null/undefined values gracefully

### 2. Performance
- Use React.memo() for widgets that don't need frequent updates
- Implement smooth transitions with CSS transitions
- Avoid expensive calculations in render loops
- Cache derived values when possible

### 3. Visual Design
- Follow consistent color coding:
  - Green: Good/Optimal values
  - Yellow: Warning/Moderate values
  - Red: Critical/Dangerous values
  - Blue: Informational/Neutral values
- Use the existing Tailwind classes for consistency
- Ensure proper contrast for readability
- Size widgets appropriately for their content

### 4. TypeScript Usage
- Define interfaces for widget configurations
- Use proper typing for all props and state
- Implement type guards for optional data
- Export interfaces for reusability

### 5. Error Handling
```typescript
const SafeWidget: React.FC<WidgetProps> = ({ telemetry, className = '' }) => {
  try {
    const { speed } = telemetry;
    
    if (speed === undefined || speed === null) {
      return <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
        <div className="text-gray-400">No Speed Data</div>
      </div>;
    }
    
    return (
      <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
        <div className="text-white text-4xl">{Math.round(speed)}</div>
      </div>
    );
  } catch (error) {
    console.error('Widget error:', error);
    return <div className={`bg-red-900 rounded-lg p-4 ${className}`}>
      <div className="text-red-400">Widget Error</div>
    </div>;
  }
};
```

## Testing and Debugging

### 1. Development Tools
- Use React DevTools to inspect component state
- Monitor telemetry data in browser console
- Check network tab for SSE connection status
- Use TypeScript strict mode for better error detection

### 2. Testing Patterns
```typescript
// Mock telemetry data for testing
const mockTelemetry: TelemetryData = {
  speed: 250,
  rpm: 8500,
  gear: 5,
  throttle: 85,
  brake: 0,
  // ... other required fields
};

// Test widget rendering
const TestWidget = () => (
  <SpeedWidget telemetry={mockTelemetry} />
);
```

### 3. Common Issues
- **Data not updating**: Check SSE connection and backend status
- **Widget not appearing**: Verify widget registration in WidgetRenderer
- **Styling issues**: Ensure Tailwind classes are properly applied
- **Performance problems**: Check for expensive operations in render loops

### 4. Debugging Telemetry
```typescript
// Add debug logging to widgets
useEffect(() => {
  console.log('Telemetry update:', telemetry);
}, [telemetry]);

// Check specific field availability
if (telemetry.tire_temps?.surface) {
  console.log('Tire temps available:', telemetry.tire_temps.surface);
}
```

## Community Plugin Development

### Plugin Structure
For community developers creating external plugins:

```typescript
// Plugin interface
interface AtlasRacingPlugin {
  name: string;
  version: string;
  widgets: WidgetDefinition[];
  layouts?: LayoutDefinition[];
}

// Widget definition
interface WidgetDefinition {
  type: string;
  component: React.ComponentType<WidgetProps>;
  defaultConfig?: any;
  supportedGames?: string[];
}
```

### Plugin Registration
```typescript
// Register your plugin
export const registerPlugin = (plugin: AtlasRacingPlugin) => {
  // Plugin registration logic
  plugin.widgets.forEach(widget => {
    registerWidget(widget.type, widget.component, widget.defaultConfig);
  });
};
```

This documentation provides everything needed to create custom widgets and dashboards for the Atlas Racing telemetry system. The modular architecture allows for easy extension and customization while maintaining consistent data flow and visual design patterns.