const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const express = require('express');
const localtunnel = require('localtunnel');
const crypto = require('crypto');

let mainWindow;
let publicUrl = '';
let sessionPin = crypto.randomInt(100000, 999999).toString();
let expressServer;
let tunnel;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Global error handler to prevent localtunnel from crashing the Electron app
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception (prevented crash):', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 940,
    title: 'Antigravity Remote',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${path.basename(sourceId)}:${line})`);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Start Express server to host mobile-app static files
  const expApp = express();
  const mobileAppPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'mobile-app')
    : path.join(__dirname, '../../mobile-app');
  console.log(`Serving mobile-app assets from: ${mobileAppPath}`);
  expApp.use(express.static(mobileAppPath));
  
  const os = require('os');
  function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  // Bind to 0.0.0.0 so local wifi devices can access it
  expressServer = expApp.listen(0, '0.0.0.0', async () => {
    const port = expressServer.address().port;
    console.log(`Express listening on ${port}`);
    
    const localIpUrl = `http://${getLocalIP()}:${port}`;
    console.log(`Local Network URL: ${localIpUrl}`);

    try {
      tunnel = await localtunnel({ port: port, local_host: '127.0.0.1' });
      publicUrl = tunnel.url;
      console.log(`Tunnel URL: ${publicUrl}`);
      console.log(`Session PIN: ${sessionPin}`);
      
      if (mainWindow) {
        mainWindow.webContents.send('tunnel-ready', { url: publicUrl, localUrl: localIpUrl, pin: sessionPin });
      }
    } catch (err) {
      console.error('Tunnel error:', err);
      // Fallback if localtunnel completely fails
      if (mainWindow) {
        mainWindow.webContents.send('tunnel-ready', { url: localIpUrl, localUrl: localIpUrl, pin: sessionPin });
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handler to fetch desktop sources
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});
