const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, dashboard-only IPC surface
contextBridge.exposeInMainWorld('electronAPI', {
  onSwitchLayout: (callback) => {
    ipcRenderer.on('switch-layout', (_event, layout) => callback(layout));
  },
  onSwitchDashboard: (callback) => {
    const handler = (_event, dashboardId) => callback(dashboardId);
    ipcRenderer.on('switch-dashboard', handler);
    return () => ipcRenderer.removeListener('switch-dashboard', handler);
  },
  onConnectTelemetry: (callback) => {
    ipcRenderer.on('connect-telemetry', callback);
  },
  onDisconnectTelemetry: (callback) => {
    ipcRenderer.on('disconnect-telemetry', callback);
  },
  onTogglePitWall: (callback) => {
    ipcRenderer.on('toggle-pit-wall', callback);
  },
  getAppVersion: () => process.env.npm_package_version || '1.0.0',
  getPlatform: () => process.platform,
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
