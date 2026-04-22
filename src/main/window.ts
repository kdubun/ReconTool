import { BrowserWindow } from 'electron';
import path from 'node:path';

export const createMainWindow = (): BrowserWindow => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    webPreferences: {
      // Forge Vite emits preload bundle as index.js in .vite/build
      preload: path.join(__dirname, 'index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
};
