import { DashboardLayout } from '../types/launcher';

export const dashboards: DashboardLayout[] = [
  // F1 24 Specific Dashboards
  {
    id: 'f1-minimal',
    name: 'Minimal',
    description: 'Essential F1 24 telemetry for clean, focused racing',
    preview: '/images/minimal-preview.jpg',
    category: 'minimal',
    features: [
      'Speed, RPM, Gear display',
      'Lap times and sectors',
      'Position and gaps',
      'ERS and DRS status',
      'Minimal UI footprint',
      'High refresh rate'
    ],
    available: true,
    component: 'MinimalDashboard',
    gameSpecific: 'f1-24'
  },
  {
    id: 'f1-professional',
    name: 'Professional',
    description: 'Complete F1 24 pit wall experience with all telemetry',
    preview: '/images/professional-preview.jpg',
    category: 'professional',
    features: [
      'Full F1 24 telemetry suite',
      'Tyre wear and temperatures',
      'ERS and fuel management',
      'Weather and track conditions',
      'Multi-car comparison',
      'F1-specific strategy recommendations'
    ],
    available: true,
    component: 'ProfessionalDashboard',
    gameSpecific: 'f1-24'
  },
  {
    id: 'f1-pit-wall',
    name: 'Pit Wall',
    description: 'Multi-screen F1 24 setup for race teams and broadcasters',
    preview: '/images/pit-wall-preview.jpg',
    category: 'advanced',
    features: [
      'Multi-driver F1 monitoring',
      'Live F1 leaderboard',
      'F1 timing tower',
      'F1 strategy overlay',
      'Broadcast graphics',
      'Team radio integration'
    ],
    available: true,
    component: 'PitWallDashboard',
    gameSpecific: 'f1-24'
  },
  // AC Specific Dashboards  
  {
    id: 'ac-competition',
    name: 'AC Competition',
    description: 'Competition-focused dashboard for hotlap attacks and time trials',
    preview: '/images/ac-competition-preview.jpg',
    category: 'minimal',
    features: [
      'GT3-optimized display',
      'Detailed tire temperature zones',
      'Suspension travel monitoring',
      'Lap time comparison vs personal best',
      'Track conditions analysis',
      'Mistake detection alerts'
    ],
    available: true,
    component: 'ACCompetitionDashboard',
    gameSpecific: 'ac'
  },
  {
    id: 'ac-professional',
    name: 'AC Professional', 
    description: 'Complete AC telemetry suite with advanced suspension and tire analysis',
    preview: '/images/ac-professional-preview.jpg',
    category: 'professional',
    features: [
      'Full AC telemetry suite',
      'Advanced suspension analysis',
      '3-zone tire temperature monitoring',
      'Aero damage detection',
      'Setup optimization hints',
      'Track surface grip analysis'
    ],
    available: true,
    component: 'ACProfessionalDashboard',
    gameSpecific: 'ac'
  },
  // Shared Dashboards (work with all games)
  {
    id: 'live-analysis',
    name: 'Live Analysis',
    description: 'Advanced telemetry analysis with lap comparison and performance insights',
    preview: '/images/analysis-preview.jpg',
    category: 'analysis',
    features: [
      'Real-time lap comparison vs personal best',
      'Comprehensive tyre analysis with optimal ranges',
      'Input smoothness and efficiency tracking',
      'Performance trends and consistency metrics',
      'Lockup and spin detection',
      'Proactive analysis alerts'
    ],
    available: true,
    component: 'LiveAnalysisDashboard'
  },
  {
    id: 'builder',
    name: 'Dashboard Builder',
    description: 'Build your own dashboard with drag-and-drop widgets',
    preview: '/images/builder-preview.jpg',
    category: 'custom',
    features: [
      'Professional drag-and-drop interface',
      'Complete widget library',
      'Grid-based layout system',
      'Save and export configurations',
      'Real-time preview mode',
      'Undo/redo functionality'
    ],
    available: true,
    component: 'DashboardBuilder'
  },
  // Legacy AC Dashboards (keeping for backward compatibility)  
  {
    id: 'ac-trackday',
    name: 'AC Track Day',
    description: 'Track day optimized layout with detailed tire analysis',
    preview: '/images/ac-trackday-preview.jpg',
    category: 'professional',
    features: [
      'Detailed tire temperature analysis',
      'Suspension travel monitoring',
      'Performance vs best lap',
      'Track conditions display',
      'AC-specific telemetry',
      'Clean track day interface'
    ],
    available: true,
    component: 'ACTrackDayDashboard',
    gameSpecific: 'ac'
  },
  {
    id: 'ac-hotlap',
    name: 'AC Hot Lap',
    description: 'Time attack focused for lap time improvement',
    preview: '/images/ac-hotlap-preview.jpg',
    category: 'minimal',
    features: [
      'Performance meter vs best lap',
      'Detailed tire analysis',
      'Suspension optimization',
      'Lap time comparison',
      'Sector time analysis',
      'Minimal distractions'
    ],
    available: true,
    component: 'ACHotLapDashboard',
    gameSpecific: 'ac'
  }
];
