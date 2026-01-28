import svgPaths from "./svg-fk98goifky";

interface TyreTemperatures {
  frontLeft: { tyre: number; brake: number };
  frontRight: { tyre: number; brake: number };
  rearLeft: { tyre: number; brake: number };
  rearRight: { tyre: number; brake: number };
}

interface Rectangle41Props {
  temperatures?: TyreTemperatures;
  getGradientColors?: (temp: number) => { from: string; to: string };
}

export default function Rectangle41({ temperatures, getGradientColors }: Rectangle41Props = {}) {
  // Default temperatures if none provided
  const defaultTemps: TyreTemperatures = {
    frontLeft: { tyre: 75, brake: 85 },
    frontRight: { tyre: 78, brake: 90 },
    rearLeft: { tyre: 72, brake: 80 },
    rearRight: { tyre: 74, brake: 82 },
  };

  const temps = temperatures || defaultTemps;
  
  // Helper function to interpolate between two hex colors
  const interpolateColor = (color1: string, color2: string, factor: number) => {
    factor = Math.max(0, Math.min(1, factor));
    
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    
    const r1 = parseInt(hex1.substr(0, 2), 16);
    const g1 = parseInt(hex1.substr(2, 2), 16);
    const b1 = parseInt(hex1.substr(4, 2), 16);
    
    const r2 = parseInt(hex2.substr(0, 2), 16);
    const g2 = parseInt(hex2.substr(2, 2), 16);
    const b2 = parseInt(hex2.substr(4, 2), 16);
    
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // Default gradient function if none provided
  const defaultGradientColors = (temp: number) => {
    // Create smooth color interpolation between temperature ranges
    if (temp < 50) {
      // Cold: Blue
      const progress = temp / 50;
      return { from: '#0066FF', to: interpolateColor('#0066FF', '#4DA6FF', progress) };
    } else if (temp < 75) {
      // Cool: Blue to Light Blue
      const progress = (temp - 50) / 25;
      return { from: interpolateColor('#0066FF', '#4DA6FF', progress), to: interpolateColor('#4DA6FF', '#00CC00', progress) };
    } else if (temp < 90) {
      // Optimal: Light Blue to Green
      const progress = (temp - 75) / 15;
      return { from: interpolateColor('#4DA6FF', '#00CC00', progress), to: interpolateColor('#00CC00', '#FFFF00', progress) };
    } else if (temp < 105) {
      // Warm: Green to Yellow
      const progress = (temp - 90) / 15;
      return { from: interpolateColor('#00CC00', '#FFFF00', progress), to: interpolateColor('#FFFF00', '#FF0000', progress) };
    } else if (temp < 120) {
      // Hot: Yellow to Red
      const progress = (temp - 105) / 15;
      return { from: interpolateColor('#FFFF00', '#FF0000', progress), to: interpolateColor('#FF0000', '#CC0000', progress) };
    } else {
      // Critical: Red to Dark Red
      const progress = Math.min((temp - 120) / 20, 1);
      return { from: interpolateColor('#FF0000', '#CC0000', progress), to: '#CC0000' };
    }
  };

  const gradientFn = getGradientColors || defaultGradientColors;

  // Get colors for each component
  const frontLeftTyre = gradientFn(temps.frontLeft.tyre);
  const frontLeftBrake = gradientFn(temps.frontLeft.brake);
  const frontRightTyre = gradientFn(temps.frontRight.tyre);
  const frontRightBrake = gradientFn(temps.frontRight.brake);
  const rearLeftTyre = gradientFn(temps.rearLeft.tyre);
  const rearLeftBrake = gradientFn(temps.rearLeft.brake);
  const rearRightTyre = gradientFn(temps.rearRight.tyre);
  const rearRightBrake = gradientFn(temps.rearRight.brake);

  return (
    <div className="relative size-full" data-name="Rectangle 4 1">
      <style>
        {`
          .temp-transition {
            transition: fill 1.2s cubic-bezier(0.25, 0.1, 0.25, 1);
          }
          
          .temp-transition stop {
            transition: stop-color 1.2s cubic-bezier(0.25, 0.1, 0.25, 1);
          }
          
          /* Add subtle glow effect for critical temperatures */
          .critical-glow {
            filter: drop-shadow(0 0 8px rgba(255, 0, 0, 0.6));
            animation: pulse-glow 2s ease-in-out infinite alternate;
          }
          
          @keyframes pulse-glow {
            from {
              filter: drop-shadow(0 0 8px rgba(255, 0, 0, 0.4));
            }
            to {
              filter: drop-shadow(0 0 12px rgba(255, 0, 0, 0.8));
            }
          }
        `}
      </style>
      
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 414 325">
        <defs>
          {/* Gradient definitions for each tyre and brake with transitions - Bottom to Top */}
          <linearGradient id="frontLeftTyreGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={frontLeftTyre.from} className="temp-transition" />
            <stop offset="100%" stopColor={frontLeftTyre.to} className="temp-transition" />
          </linearGradient>
          <linearGradient id="frontLeftBrakeGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={frontLeftBrake.from} className="temp-transition" />
            <stop offset="100%" stopColor={frontLeftBrake.to} className="temp-transition" />
          </linearGradient>
          <linearGradient id="frontRightTyreGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={frontRightTyre.from} className="temp-transition" />
            <stop offset="100%" stopColor={frontRightTyre.to} className="temp-transition" />
          </linearGradient>
          <linearGradient id="frontRightBrakeGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={frontRightBrake.from} className="temp-transition" />
            <stop offset="100%" stopColor={frontRightBrake.to} className="temp-transition" />
          </linearGradient>
          <linearGradient id="rearLeftTyreGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={rearLeftTyre.from} className="temp-transition" />
            <stop offset="100%" stopColor={rearLeftTyre.to} className="temp-transition" />
          </linearGradient>
          <linearGradient id="rearLeftBrakeGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={rearLeftBrake.from} className="temp-transition" />
            <stop offset="100%" stopColor={rearLeftBrake.to} className="temp-transition" />
          </linearGradient>
          <linearGradient id="rearRightTyreGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={rearRightTyre.from} className="temp-transition" />
            <stop offset="100%" stopColor={rearRightTyre.to} className="temp-transition" />
          </linearGradient>
          <linearGradient id="rearRightBrakeGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={rearRightBrake.from} className="temp-transition" />
            <stop offset="100%" stopColor={rearRightBrake.to} className="temp-transition" />
          </linearGradient>
          <clipPath id="clip0_14026_58">
            <rect fill="white" height="325" width="414" />
          </clipPath>
        </defs>
        
        <g clipPath="url(#clip0_14026_58)" id="Rectangle 4 1">
          {/* Main border */}
          <path d={svgPaths.p172ef900} id="Vector" stroke="var(--stroke-0, #B90C0C)" strokeWidth="3" />
          
          {/* Rear Left Tyre */}
          <path 
            d={svgPaths.p187d7c00} 
            fill="url(#rearLeftTyreGrad)" 
            id="Vector_2" 
            stroke="var(--stroke-0, black)" 
            className={`temp-transition ${temps.rearLeft.tyre > 120 ? 'critical-glow' : ''}`}
          />
          
          {/* Rear Right Tyre */}
          <path 
            d={svgPaths.p25a62a80} 
            fill="url(#rearRightTyreGrad)" 
            id="Vector_3" 
            stroke="var(--stroke-0, black)" 
            className={`temp-transition ${temps.rearRight.tyre > 120 ? 'critical-glow' : ''}`}
          />
          
          {/* Front Left Tyre */}
          <path 
            d={svgPaths.pcacc400} 
            fill="url(#frontLeftTyreGrad)" 
            id="Vector_4" 
            stroke="var(--stroke-0, black)" 
            className={`temp-transition ${temps.frontLeft.tyre > 120 ? 'critical-glow' : ''}`}
          />
          
          {/* Front Right Tyre */}
          <path 
            d={svgPaths.p1a52d500} 
            fill="url(#frontRightTyreGrad)" 
            id="Vector_5" 
            stroke="var(--stroke-0, black)" 
            className={`temp-transition ${temps.frontRight.tyre > 120 ? 'critical-glow' : ''}`}
          />
          
          {/* Center lines */}
          <path d="M0 162.5H414" id="Vector_6" stroke="var(--stroke-0, #2A2A2A)" />
          <path d="M207.5 0V325" id="Vector_7" stroke="var(--stroke-0, #2A2A2A)" />
          
          {/* Rear Left Brake */}
          <path 
            d={svgPaths.p37730000} 
            fill="url(#rearLeftBrakeGrad)" 
            id="Vector_8" 
            className={`temp-transition ${temps.rearLeft.brake > 120 ? 'critical-glow' : ''}`}
          />
          
          {/* Front Left Brake */}
          <path 
            d={svgPaths.p36e3aa00} 
            fill="url(#frontLeftBrakeGrad)" 
            id="Vector_10" 
            className={`temp-transition ${temps.frontLeft.brake > 120 ? 'critical-glow' : ''}`}
          />
          
          {/* Front Right Brake */}
          <path 
            d={svgPaths.p24294d00} 
            fill="url(#frontRightBrakeGrad)" 
            id="Vector_9" 
            className={`temp-transition ${temps.frontRight.brake > 120 ? 'critical-glow' : ''}`}
          />
          
          {/* Rear Right Brake */}
          <path 
            d={svgPaths.p5337380} 
            fill="url(#rearRightBrakeGrad)" 
            id="Vector_11" 
            className={`temp-transition ${temps.rearRight.brake > 120 ? 'critical-glow' : ''}`}
          />
        </g>
      </svg>
    </div>
  );
}