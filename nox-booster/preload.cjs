const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('noxBooster', {
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
  speedTest: () => ipcRenderer.invoke('booster:speedtest'),
  vpnServers: (force) => ipcRenderer.invoke('vpn:servers', force),
  vpnStatus: () => ipcRenderer.invoke('vpn:status'),
  vpnConnect: (options) => ipcRenderer.invoke('vpn:connect', options),
  vpnDisconnect: () => ipcRenderer.invoke('vpn:disconnect'),
  shieldStatus: () => ipcRenderer.invoke('shield:status'),
  shieldAdblock: (enable) => ipcRenderer.invoke('shield:adblock', enable),
  shieldFirewall: (enable) => ipcRenderer.invoke('shield:firewall', enable),
  onShieldProgress: subscribe('shield:progress'),
  onSpeedTestProgress: subscribe('booster:speedtest-progress'),
  onVpnProgress: subscribe('vpn:progress'),
  onScanProgress: subscribe('booster:scan-progress'),
  onStatus: subscribe('booster:status'),
  onProgress: subscribe('booster:progress'),
  onMetrics: subscribe('booster:metrics'),
});
