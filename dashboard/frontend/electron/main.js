const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// isDev will be set when app is ready
let isDev = true;

const resolveBuildResource = (asset) => {
  if (isDev) {
    return path.join(__dirname, '..', 'buildResources', asset);
  }
  return path.join(process.resourcesPath, 'buildResources', asset);
};

const getAppIconPath = () => {
  return process.platform === 'win32'
    ? resolveBuildResource('icon.ico')
    : resolveBuildResource('icon-256.png');
};

let mainWindow = null;
let splashWindow = null;
let devWindows = {}; // Track dev panel windows

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: getAppIconPath()
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

// Create a new window for dev panels (multi-window support)
function createDevWindow(route, title, width = 600, height = 800) {
  // If window already exists, focus it
  if (devWindows[route] && !devWindows[route].isDestroyed()) {
    devWindows[route].focus();
    return;
  }

  const devWindow = new BrowserWindow({
    width,
    height,
    minWidth: 400,
    minHeight: 400,
    title: `Atlas Racing - ${title}`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: getAppIconPath()
  });

  // Load the route using hash-based routing
  const baseUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  devWindow.loadURL(`${baseUrl}#${route}`).catch((error) => {
    console.error(`[DevWindow:${route}] Failed to load URL:`, error);
  });

  devWindow.on('closed', () => {
    delete devWindows[route];
  });

  devWindows[route] = devWindow;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Atlas Racing Dashboard',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: getAppIconPath()
  });

  if (process.platform !== 'darwin') {
    try {
      mainWindow.setIcon(getAppIconPath());
    } catch (error) {
      console.warn('[MainWindow] Failed to set window icon:', error);
    }
  }

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl).catch((error) => {
    console.error('[MainWindow] Failed to load URL:', error);
  });

  mainWindow.once('ready-to-show', () => {
    // Close splash screen and show main window
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    if (!mainWindow?.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[MainWindow] Load failed', { errorCode, errorDescription });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

function createMenu() {
  const template = [
    {
      label: 'Atlas Racing',
      submenu: [
        { role: 'about', label: 'About Atlas Racing Dashboard' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            console.log('Preferences clicked');
          }
        },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Atlas Racing', accelerator: 'Command+H' },
        { role: 'hideothers', label: 'Hide Others', accelerator: 'Command+Alt+H' },
        { role: 'unhide', label: 'Show All' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload()
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow?.webContents.reloadIgnoringCache()
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools()
        },
        { type: 'separator' },
        { role: 'resetzoom', label: 'Actual Size', accelerator: 'CmdOrCtrl+0' },
        { role: 'zoomin', label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus' },
        { role: 'zoomout', label: 'Zoom Out', accelerator: 'CmdOrCtrl+-' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Fullscreen', accelerator: 'Ctrl+Command+F' }
      ]
    },
    {
      label: 'Dashboard',
      submenu: [
        {
          label: 'F1 Pro Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendToRenderer('switch-dashboard', 'f1-pro')
        },
        {
          label: 'GT Endurance Dashboard',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendToRenderer('switch-dashboard', 'gt-endurance')
        },
        {
          label: 'Live Race Analysis',
          accelerator: 'CmdOrCtrl+3',
          click: () => sendToRenderer('switch-dashboard', 'live-analysis')
        },
        { type: 'separator' },
        {
          label: 'Connect to F1 25',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => sendToRenderer('connect-telemetry')
        },
        {
          label: 'Disconnect',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => sendToRenderer('disconnect-telemetry')
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', label: 'Minimize', accelerator: 'CmdOrCtrl+M' },
        { role: 'close', label: 'Close', accelerator: 'CmdOrCtrl+W' },
        { type: 'separator' },
        {
          label: 'Open Dev Windows',
          submenu: [
            {
              label: 'Telemetry Panel',
              accelerator: 'CmdOrCtrl+Shift+T',
              click: () => createDevWindow('/dev/telemetry', 'Telemetry', 600, 800)
            },
            {
              label: 'Strategy Panel',
              accelerator: 'CmdOrCtrl+Shift+S',
              click: () => createDevWindow('/dev/strategy', 'Strategy', 700, 900)
            },
            {
              label: 'Race Panel',
              accelerator: 'CmdOrCtrl+Shift+R',
              click: () => createDevWindow('/dev/race', 'Race', 700, 800)
            },
            {
              label: 'AI Engineer',
              accelerator: 'CmdOrCtrl+Shift+E',
              click: () => createDevWindow('/dev/engineer', 'AI Engineer', 500, 700)
            }
          ]
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'F1 25 Setup Guide',
          click: () => shell.openExternal('https://github.com/f1-dashboard/setup-guide')
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/f1-dashboard/issues')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  // Now that app is ready, we can check isPackaged
  isDev = !app.isPackaged;

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.atlasracing.dashboard');
  }

  // Show splash screen immediately
  createSplashWindow();

  createMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
});
