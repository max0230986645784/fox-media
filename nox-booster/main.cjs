const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const booster = require('./booster.cjs');

const DEFAULT_SETTINGS = {
  autoStart: true,
  autoBoost: true,
  antiCrash: true,
  closeHogs: true,
  dns: 'cloudflare',
  pingHosts: ['1.1.1.1', '8.8.8.8'],
};

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

let settings = loadSettings();
let win = null;
let tray = null;
let quitting = false;
const state = {
  boosted: false,
  boosting: false,
  admin: false,
  lastReport: [],
  lastBoostAt: null,
  games: [],
};

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function applyAutoStart() {
  app.setLoginItemSettings({
    openAtLogin: settings.autoStart,
    args: ['--hidden'],
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: '#0b0b12',
    title: 'Nox Booster',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: !process.argv.includes('--hidden'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  const refresh = () => {
    tray.setToolTip(state.boosted ? 'Nox Booster : boost actif' : 'Nox Booster : en veille');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Ouvrir Nox Booster', click: () => win.show() },
        { label: state.boosted ? 'Boost actif' : 'Lancer le boost', enabled: !state.boosted && !state.boosting, click: () => boost() },
        { type: 'separator' },
        { label: 'Quitter', click: () => { quitting = true; app.quit(); } },
      ]),
    );
  };
  tray.on('click', () => win.show());
  refresh();
  return refresh;
}

let refreshTray = () => {};

async function boost() {
  if (state.boosting) return state.lastReport;
  state.boosting = true;
  send('booster:status', publicState());
  const report = await booster.applyAll({ dns: settings.dns }, (entry) => send('booster:progress', entry));
  if (settings.antiCrash) {
    for (const entry of await booster.applyAntiCrash()) {
      const item = { ...entry, group: 'anticrash' };
      report.push(item);
      send('booster:progress', item);
    }
  }
  state.lastReport = report;
  state.boosted = report.some((entry) => entry.ok || entry.skipped);
  state.lastBoostAt = Date.now();
  state.boosting = false;
  refreshTray();
  send('booster:status', publicState());
  return report;
}

async function restore() {
  state.boosting = true;
  send('booster:status', publicState());
  const report = await booster.restoreAll();
  state.boosted = false;
  state.boosting = false;
  state.lastReport = [];
  refreshTray();
  send('booster:status', publicState());
  return report;
}

function publicState() {
  return { ...state, settings, platform: process.platform, version: app.getVersion() };
}

/** Boucle de surveillance : ping/jitter, débit, jeux détectés (priorité Haute). */
function startMonitoring() {
  let tick = 0;
  const loop = async () => {
    const hosts = settings.pingHosts.slice(0, 3);
    const pings = await Promise.all(hosts.map((host) => booster.ping(host)));
    const traffic = await booster.throughput();
    send('booster:metrics', {
      at: Date.now(),
      pings: hosts.map((host, index) => ({ host, ms: pings[index] })),
      traffic,
    });
    tick += 1;
    if (tick % 3 === 0) {
      const games = await booster.boostRunningGames();
      if (games.join() !== state.games.join()) {
        state.games = games;
        send('booster:status', publicState());
      }
      if (games.length && settings.closeHogs) {
        const closed = await booster.closeBackgroundHogs();
        if (closed.length) send('booster:progress', { id: 'hogs', group: 'anticrash', label: `Fermé pendant le jeu : ${closed.join(', ')}`, ok: true });
      }
    }
    setTimeout(loop, 2000);
  };
  loop();
}

ipcMain.handle('booster:get-state', () => publicState());
ipcMain.handle('booster:boost', () => boost());
ipcMain.handle('booster:restore', () => restore());
ipcMain.handle('booster:tweaks', () => ({ tweaks: booster.TWEAKS, antiCrash: booster.ANTI_CRASH }));
let scanning = false;
let lastScan = null;
ipcMain.handle('booster:scan', async (_event, options) => {
  if (scanning) return null;
  scanning = true;
  try {
    lastScan = await booster.scanThreats(options || {}, (step) => send('booster:scan-progress', step));
    return lastScan;
  } finally {
    scanning = false;
  }
});
ipcMain.handle('booster:quarantine', async (_event, ids) => {
  if (!lastScan || !Array.isArray(ids)) return [];
  const wanted = new Set(ids);
  const items = lastScan.items.filter((item) => wanted.has(item.id));
  const results = await booster.quarantine(items);
  const done = new Set(results.filter((r) => r.ok).map((r) => r.id));
  lastScan.items = lastScan.items.filter((item) => !done.has(item.id));
  return results;
});
ipcMain.handle('booster:quarantine-list', () => booster.listQuarantine());
ipcMain.handle('booster:quarantine-restore', (_event, metaFile) => booster.restoreQuarantine(String(metaFile)));
ipcMain.handle('booster:quarantine-delete', (_event, metaFile) => booster.deleteQuarantine(String(metaFile)));
let repairing = false;
ipcMain.handle('booster:repair', async () => {
  if (repairing) return null;
  repairing = true;
  try {
    return await booster.repairSystem();
  } finally {
    repairing = false;
  }
});
ipcMain.handle('booster:save-settings', (_event, next) => {
  const hosts = Array.isArray(next.pingHosts)
    ? next.pingHosts.map((host) => String(host).trim()).filter((host) => /^[a-z0-9.:-]+$/i.test(host)).slice(0, 3)
    : settings.pingHosts;
  settings = {
    autoStart: Boolean(next.autoStart),
    autoBoost: Boolean(next.autoBoost),
    antiCrash: Boolean(next.antiCrash),
    closeHogs: Boolean(next.closeHogs),
    dns: booster.DNS_PROFILES[next.dns] ? next.dns : 'none',
    pingHosts: hosts.length ? hosts : DEFAULT_SETTINGS.pingHosts,
  };
  saveSettings(settings);
  applyAutoStart();
  return settings;
});
ipcMain.handle('booster:open-external', (_event, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('booster:hide', () => win.hide());

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) win.show();
  });

  app.whenReady().then(async () => {
    state.admin = await booster.isAdmin();
    createWindow();
    refreshTray = createTray();
    applyAutoStart();
    startMonitoring();
    if (settings.autoBoost && booster.IS_WINDOWS) boost();
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('window-all-closed', (event) => {
    if (event && event.preventDefault) event.preventDefault();
  });
}
