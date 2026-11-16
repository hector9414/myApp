/*
 * Aplicación de escritorio (Electron) del simulador AN/PRC-117F + SKL AN/PYQ-10.
 * Abre la misma página web (index.html) en una ventana propia, sin conexión a red.
 */
'use strict';
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TITLE = 'Simulador AN/PRC-117F + SKL AN/PYQ-10';

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 940,
    minWidth: 380,
    minHeight: 600,
    title: TITLE,
    backgroundColor: '#11151a',
    icon: path.join(ROOT, 'build', 'icon.png'),
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(ROOT, 'index.html'));
  win.on('page-title-updated', (e) => e.preventDefault());

  // Sin navegación fuera de la aplicación: los enlaces externos se abren en el navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) e.preventDefault();
  });
}

function buildMenu() {
  const template = [
    {
      label: 'Simulador',
      submenu: [
        { label: 'Recargar', accelerator: 'F5', click: () => win && win.reload() },
        { type: 'separator' },
        { label: 'Salir', role: 'quit' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Pantalla completa', role: 'togglefullscreen' },
        { label: 'Aumentar zoom', role: 'zoomIn' },
        { label: 'Reducir zoom', role: 'zoomOut' },
        { label: 'Zoom normal', role: 'resetZoom' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: 'Acerca de',
            message: TITLE,
            detail: `Versión ${app.getVersion()}\n\nSimulador de entrenamiento con fines educativos. No está afiliado a ningún fabricante ni organismo. `
              + 'Todas las claves, frecuencias y estaciones son ficticias y no contiene material criptográfico real.',
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
