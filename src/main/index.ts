import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { initDatabase } from '@main/database/init';
import { registerIpcHandlers } from '@main/services/ipc.handlers';
import { createMainWindow } from '@main/window';

if (started) {
  app.quit();
}

const bootstrap = (): void => {
  initDatabase();
  registerIpcHandlers();
  createMainWindow();
};

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
