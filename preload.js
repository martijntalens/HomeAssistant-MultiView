'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('haApi', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (s) => ipcRenderer.send('state:save', s),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
  clearSession: () => ipcRenderer.invoke('session:clear'),
  setPaneZoom: (wcId, zoom, width, height) => ipcRenderer.send('pane:zoom', wcId, zoom, width, height),
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_e, name, wcId) => cb(name, wcId)),
  onWebviewFocus: (cb) => ipcRenderer.on('webview-focus', (_e, wcId) => cb(wcId)),
  onOpenInPane: (cb) => ipcRenderer.on('open-in-pane', (_e, url, wcId) => cb(url, wcId)),
});
