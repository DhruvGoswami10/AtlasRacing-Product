/// <reference types="react-scripts" />

// JSON module declarations
declare module "*.json" {
  const value: any;
  export default value;
}

export {};

declare global {
  interface Window {
    electronAPI?: {
      onSwitchLayout: (callback: (layout: string) => void) => void;
      onSwitchDashboard: (callback: (dashboardId: string) => void) => (() => void) | void;
      onConnectTelemetry: (callback: () => void) => void;
      onDisconnectTelemetry: (callback: () => void) => void;
      onTogglePitWall?: (callback: () => void) => void;
      getAppVersion: () => string;
      getPlatform: () => string;
      removeAllListeners: (channel: string) => void;
    };
    dev?: {
      openDevTools: () => void;
    };
  }
}
