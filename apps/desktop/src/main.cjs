const path = require('node:path');

const { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu } = require('electron');

const serverUrl = process.env.ABLEPATH_SERVER_URL || 'http://localhost:4317';

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 540,
    minWidth: 320,
    minHeight: 420,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    transparent: false,
    title: 'AblePath',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--ablepath-server-url=${serverUrl}`],
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('AblePath');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show AblePath', click: () => mainWindow?.show() },
    { label: 'Hide', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
}

ipcMain.handle('ablepath:window:minimize', () => mainWindow?.minimize());
ipcMain.handle('ablepath:window:hide', () => mainWindow?.hide());
ipcMain.handle('ablepath:window:close', () => app.quit());

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else mainWindow?.show();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
  mainWindow?.hide();
});
