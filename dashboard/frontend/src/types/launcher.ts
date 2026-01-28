export interface Game {
  id: string;
  name: string;
  fullName: string;
  description: string;
  available: boolean;
  version?: string;
  icon: string;
  status: 'Available' | 'Coming Soon';
  backgroundImage: string;
  color: string;
  comingSoon?: boolean;
  setupInstructions: string[];
  connectionInfo: {
    protocol: string;
    port: number | null;
    format?: string;
    sendRate?: string;
  };
}

export interface DashboardLayout {
  id: string;
  name: string;
  description: string;
  preview: string;
  category: 'minimal' | 'professional' | 'advanced' | 'analysis' | 'custom';
  features: string[];
  available: boolean;
  component?: string;
  gameSpecific?: string; // Optional game ID for game-specific dashboards
  isAnalysis?: boolean; // Flag for post-session analysis dashboards
}

export interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  message?: string;
  game?: string;
  lastUpdate?: Date;
}

export interface LauncherState {
  currentGame: Game | null;
  connectionStatus: ConnectionStatus;
  selectedDashboard: DashboardLayout | null;
  theme: 'light' | 'dark';
  isFullscreen: boolean;
}