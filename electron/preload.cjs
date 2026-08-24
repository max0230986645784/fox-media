const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('foxNative', {
  version: '1.0.0',
  platform: process.platform,
  pickFolder: () => ipcRenderer.invoke('fox:pick-folder'),
  pickFiles: () => ipcRenderer.invoke('fox:pick-files'),
  readRange: (path, start, length) => ipcRenderer.invoke('fox:read-range', path, start, length),
  mediaUrl: (path) => `fox-media://local/stream?path=${encodeURIComponent(path)}`,
  convertUrl: (path, mode, at) =>
    `fox-media://local/stream?path=${encodeURIComponent(path)}&convert=${mode}&at=${Math.floor(at)}`,
  readLicence: () => ipcRenderer.invoke('fox:store-read'),
  writeLicence: (contents) => ipcRenderer.invoke('fox:store-write', contents),
  openExternal: (url) => ipcRenderer.invoke('fox:open-external', url),
  download: (url) => ipcRenderer.invoke('fox:download', url),
  openDownloads: () => ipcRenderer.invoke('fox:open-folder'),
  onDownloadProgress: (listener) => {
    const handler = (_event, percent) => listener(percent);
    ipcRenderer.on('fox:download-progress', handler);
    return () => ipcRenderer.removeListener('fox:download-progress', handler);
  },
});
