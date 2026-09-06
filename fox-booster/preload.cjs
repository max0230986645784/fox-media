const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('foxBooster', {
  getState: () => ipcRenderer.invoke('booster:get-state'),
  boost: () => ipcRenderer.invoke('booster:boost'),
  restore: () => ipcRenderer.invoke('booster:restore'),
  tweaks: () => ipcRenderer.invoke('booster:tweaks'),
  saveSettings: (settings) => ipcRenderer.invoke('booster:save-settings', settings),
  openExternal: (url) => ipcRenderer.invoke('booster:open-external', url),
  hide: () => ipcRenderer.invoke('booster:hide'),
  scan: (options) => ipcRenderer.invoke('booster:scan', options),
  quarantine: (ids) => ipcRenderer.invoke('booster:quarantine', ids),
  quarantineList: () => ipcRenderer.invoke('booster:quarantine-list'),
  quarantineRestore: (metaFile) => ipcRenderer.invoke('booster:quarantine-restore', metaFile),
  quarantineDelete: (metaFile) => ipcRenderer.invoke('booster:quarantine-delete', metaFile),
  repair: () => ipcRenderer.invoke('booster:repair'),
  onScanProgress: subscribe('booster:scan-progress'),
  onStatus: subscribe('booster:status'),
  onProgress: subscribe('booster:progress'),
  onMetrics: subscribe('booster:metrics'),
});
