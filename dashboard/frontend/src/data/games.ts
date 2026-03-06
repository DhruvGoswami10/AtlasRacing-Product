import { Game } from '../types/launcher';

export const games: Game[] = [
  {
    id: 'f1-24',
    name: 'F1 24',
    fullName: 'Formula 1 24',
    description: 'Real-time telemetry dashboard for F1 24 with professional pit wall features',
    available: true,
    version: '1.0.0',
    icon: '/images/f1.jpg',
    status: 'Available',
    backgroundImage: '/images/f1-24.png',
    color: 'from-red-600 to-red-800',
    setupInstructions: [
      'Open F1 24 Game',
      'Go to Settings > Telemetry Settings',
      'Set UDP Telemetry to "On"',
      'Set UDP Port to 20777',
      'Set UDP Format to 2024',
      'Set UDP Send Rate to 60Hz',
      'Set UDP IP Address to 127.0.0.1',
      'Start a Practice, Qualifying, or Race session'
    ],
    connectionInfo: {
      protocol: 'UDP',
      port: 20777,
      format: '2024',
      sendRate: '60Hz'
    }
  },
  {
    id: 'ats',
    name: 'ATS',
    fullName: 'American Truck Simulator',
    description: 'Professional trucking telemetry and route planning dashboard',
    available: true,
    version: '1.0.0',
    icon: '/images/ats.jpg',
    status: 'Available',
    backgroundImage: '/images/ats.png',
    color: 'from-blue-600 to-blue-800',
    setupInstructions: [
      'Launch American Truck Simulator',
      'Atlas Core reads telemetry via shared memory automatically',
      'No additional game configuration needed',
      'Start driving — data flows immediately'
    ],
    connectionInfo: {
      protocol: 'Shared Memory',
      port: null,
      format: 'SCS Telemetry SDK',
      sendRate: 'Real-time'
    }
  },
  {
    id: 'ac',
    name: 'AC',
    fullName: 'Assetto Corsa',
    description: 'Track-focused racing telemetry with detailed tire and suspension analysis',
    available: true,
    version: '1.0.0',
    icon: '/images/asc.jpg',
    status: 'Available',
    backgroundImage: '/images/ac.png',
    color: 'from-green-600 to-green-800',
    setupInstructions: [
      'Launch Assetto Corsa (any session type)',
      'Telemetry data is automatically shared via Windows shared memory',
      'No additional setup required - works with Steam, AC Content Manager, or any AC launcher',
      'Start Practice, Qualifying, Race, Hotlap, or Time Attack session',
      'Dashboard will auto-connect when AC session is active'
    ],
    connectionInfo: {
      protocol: 'Shared Memory',
      port: null,
      format: 'AC Native',
      sendRate: 'Real-time'
    }
  },
  {
    id: 'acc',
    name: 'ACC',
    fullName: 'Assetto Corsa Competizione',
    description: 'GT racing telemetry with advanced setup analysis and strategy',
    available: true,
    version: '1.0.0',
    icon: '/images/acc.png',
    status: 'Available',
    backgroundImage: '/images/acc.png',
    color: 'from-purple-600 to-purple-800',
    setupInstructions: [
      'Launch Assetto Corsa Competizione',
      'Atlas Core reads telemetry via shared memory automatically',
      'No additional game configuration needed',
      'Start a Practice, Qualifying, or Race session'
    ],
    connectionInfo: {
      protocol: 'Shared Memory',
      port: null,
      format: 'ACC Native',
      sendRate: 'Real-time'
    }
  }
];
