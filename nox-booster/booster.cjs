// Moteur d'optimisation Windows de Nox Booster : réglages réseau (ping, stabilité,
// téléchargements) et FPS (plan d'alimentation, priorité des jeux, Game Mode).
// Chaque réglage sait s'appliquer et se restaurer aux valeurs Windows par défaut.
const { exec, execFile } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const IS_WINDOWS = process.platform === 'win32';

function run(command, timeout = 15000) {
  return new Promise((resolve) => {
    exec(command, { windowsHide: true, timeout, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ ok: !error, out: `${stdout || ''}${stderr || ''}`.trim() });
    });
  });
}

function powershell(script, timeout = 20000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout, encoding: 'utf8' },
      (error, stdout, stderr) => resolve({ ok: !error, out: `${stdout || ''}${stderr || ''}`.trim() }),
    );
  });
}

function reg(key, name, type, value) {
  return run(`reg add "${key}" /v "${name}" /t ${type} /d ${value} /f`);
}

function regDelete(key, name) {
  return run(`reg delete "${key}" /v "${name}" /f`);
}

const HKLM = 'HKLM';
const SYSTEM_PROFILE = `${HKLM}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile`;
const GAMES_TASK = `${SYSTEM_PROFILE}\\Tasks\\Games`;
const TCPIP_INTERFACES = `${HKLM}\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces`;
const HIGH_PERF_PLAN = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const ULTIMATE_PLAN = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
const BALANCED_PLAN = '381b4222-f694-41f0-9685-ff5bb260df2e';

const DNS_PROFILES = {
  cloudflare: ['1.1.1.1', '1.0.0.1'],
  google: ['8.8.8.8', '8.8.4.4'],
  quad9: ['9.9.9.9', '149.112.112.112'],
};

/** Adaptateurs réseau actifs (câble ou Wi-Fi) : nom + GUID pour les clés registre. */
async function activeAdapters() {
  if (!IS_WINDOWS) return [];
  const result = await powershell(
    "Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and -not $_.Virtual } | ForEach-Object { $_.InterfaceAlias + '|' + $_.InterfaceGuid }",
  );
  if (!result.ok || !result.out) return [];
  return result.out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [alias, guid] = line.split('|');
      return { alias, guid };
    })
    .filter((adapter) => adapter.alias && adapter.guid);
}

async function setDns(servers) {
  const adapters = await activeAdapters();
  for (const adapter of adapters) {
    if (!servers) {
      await run(`netsh interface ip set dns name="${adapter.alias}" source=dhcp`);
      continue;
    }
    await run(`netsh interface ip set dns name="${adapter.alias}" static ${servers[0]} primary`);
    await run(`netsh interface ip add dns name="${adapter.alias}" ${servers[1]} index=2`);
  }
  await run('ipconfig /flushdns');
  return adapters.length;
}

/**
 * Liste des réglages. `group` : network (ping/stabilité), download (débit),
 * fps (performances). Les commandes qui n'existent pas sur une version de Windows
 * échouent silencieusement : on garde ce qui marche.
 */
const TWEAKS = [
  {
    id: 'tcp-tuning',
    group: 'network',
    label: 'Pile TCP optimisée (moins de latence, connexion plus stable)',
    async apply() {
      await run('netsh int tcp set global autotuninglevel=normal');
      await run('netsh int tcp set global rss=enabled');
      await run('netsh int tcp set global ecncapability=disabled');
      await run('netsh int tcp set global timestamps=disabled');
      await run('netsh int tcp set global initialrto=2000');
      await run('netsh int tcp set global nonsackrttresiliency=disabled');
      await run('netsh int tcp set heuristics disabled');
      await run('netsh int tcp set supplemental internet congestionprovider=ctcp');
    },
    async restore() {
      await run('netsh int tcp set global autotuninglevel=normal');
      await run('netsh int tcp set global ecncapability=default');
      await run('netsh int tcp set global timestamps=default');
      await run('netsh int tcp set global initialrto=3000');
      await run('netsh int tcp set heuristics default');
      await run('netsh int tcp set supplemental internet congestionprovider=default');
    },
  },
  {
    id: 'nagle',
    group: 'network',
    label: "Algorithme de Nagle désactivé (paquets de jeu envoyés immédiatement)",
    async apply() {
      for (const adapter of await activeAdapters()) {
        const key = `${TCPIP_INTERFACES}\\${adapter.guid}`;
        await reg(key, 'TcpAckFrequency', 'REG_DWORD', 1);
        await reg(key, 'TCPNoDelay', 'REG_DWORD', 1);
        await reg(key, 'TcpDelAckTicks', 'REG_DWORD', 0);
      }
    },
    async restore() {
      for (const adapter of await activeAdapters()) {
        const key = `${TCPIP_INTERFACES}\\${adapter.guid}`;
        await regDelete(key, 'TcpAckFrequency');
        await regDelete(key, 'TCPNoDelay');
        await regDelete(key, 'TcpDelAckTicks');
      }
    },
  },
  {
    id: 'throttling',
    group: 'network',
    label: 'Limiteur réseau multimédia de Windows désactivé',
    async apply() {
      await reg(SYSTEM_PROFILE, 'NetworkThrottlingIndex', 'REG_DWORD', 0xffffffff);
      await reg(SYSTEM_PROFILE, 'SystemResponsiveness', 'REG_DWORD', 0);
    },
    async restore() {
      await reg(SYSTEM_PROFILE, 'NetworkThrottlingIndex', 'REG_DWORD', 10);
      await reg(SYSTEM_PROFILE, 'SystemResponsiveness', 'REG_DWORD', 20);
    },
  },
  {
    id: 'qos',
    group: 'download',
    label: 'Bande passante réservée par Windows (20 %) libérée',
    async apply() {
      await reg(`${HKLM}\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched`, 'NonBestEffortLimit', 'REG_DWORD', 0);
    },
    async restore() {
      await regDelete(`${HKLM}\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched`, 'NonBestEffortLimit');
    },
  },
  {
    id: 'delivery-optimization',
    group: 'download',
    label: 'Partage de mises à jour en P2P coupé (ta bande passante reste pour toi)',
    async apply() {
      await reg(`${HKLM}\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization`, 'DODownloadMode', 'REG_DWORD', 0);
    },
    async restore() {
      await regDelete(`${HKLM}\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization`, 'DODownloadMode');
    },
  },
  {
    id: 'power-plan',
    group: 'fps',
    label: "Plan d'alimentation Performances ultimes",
    async apply() {
      const list = await run('powercfg /list');
      if (!list.out.toLowerCase().includes(ULTIMATE_PLAN)) {
        await run(`powercfg -duplicatescheme ${ULTIMATE_PLAN}`);
      }
      const ultimate = await run(`powercfg /setactive ${ULTIMATE_PLAN}`);
      if (!ultimate.ok) await run(`powercfg /setactive ${HIGH_PERF_PLAN}`);
    },
    async restore() {
      await run(`powercfg /setactive ${BALANCED_PLAN}`);
    },
  },
  {
    id: 'game-priority',
    group: 'fps',
    label: 'Priorité CPU/GPU maximale pour les jeux (planificateur Windows)',
    async apply() {
      await reg(GAMES_TASK, 'GPU Priority', 'REG_DWORD', 8);
      await reg(GAMES_TASK, 'Priority', 'REG_DWORD', 6);
      await reg(GAMES_TASK, 'Scheduling Category', 'REG_SZ', 'High');
      await reg(GAMES_TASK, 'SFIO Priority', 'REG_SZ', 'High');
      await reg(GAMES_TASK, 'Affinity', 'REG_DWORD', 0);
      await reg(GAMES_TASK, 'Background Only', 'REG_SZ', 'False');
    },
    async restore() {
      await reg(GAMES_TASK, 'GPU Priority', 'REG_DWORD', 8);
      await reg(GAMES_TASK, 'Priority', 'REG_DWORD', 2);
      await reg(GAMES_TASK, 'Scheduling Category', 'REG_SZ', 'Medium');
      await reg(GAMES_TASK, 'SFIO Priority', 'REG_SZ', 'Normal');
    },
  },
  {
    id: 'game-mode',
    group: 'fps',
    label: 'Mode Jeu activé, enregistrement Game DVR/Xbox coupé',
    async apply() {
      await reg('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 'REG_DWORD', 1);
      await reg('HKCU\\Software\\Microsoft\\GameBar', 'AllowAutoGameMode', 'REG_DWORD', 1);
      await reg('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', 0);
      await reg('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', 2);
      await reg(`${HKLM}\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR`, 'AllowGameDVR', 'REG_DWORD', 0);
    },
    async restore() {
      await reg('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 'REG_DWORD', 1);
      await reg('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', 1);
      await regDelete('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode');
      await regDelete(`${HKLM}\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR`, 'AllowGameDVR');
    },
  },
  {
    id: 'hags',
    group: 'fps',
    label: 'Planification GPU à accélération matérielle (actif après redémarrage)',
    async apply() {
      await reg(`${HKLM}\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers`, 'HwSchMode', 'REG_DWORD', 2);
    },
    async restore() {
      await reg(`${HKLM}\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers`, 'HwSchMode', 'REG_DWORD', 1);
    },
  },
  {
    id: 'flush',
    group: 'network',
    label: 'Cache DNS vidé et table ARP nettoyée',
    async apply() {
      await run('ipconfig /flushdns');
      await run('arp -d *');
      await run('nbtstat -R');
    },
    async restore() {},
  },
];

/** Processus des jeux connus : passés en priorité Haute dès qu'ils tournent. */
const GAME_PROCESSES = [
  'FortniteClient-Win64-Shipping',
  'VALORANT-Win64-Shipping',
  'cs2',
  'csgo',
  'RocketLeague',
  'GTA5',
  'GTA5_Enhanced',
  'FiveM',
  'FiveM_GTAProcess',
  'r5apex',
  'r5apex_dx12',
  'ModernWarfare',
  'cod',
  'Overwatch',
  'LeagueofLegends',
  'League of Legends',
  'RainbowSix',
  'RainbowSix_Vulkan',
  'Minecraft.Windows',
  'javaw',
  'destiny2',
  'PUBG',
  'TslGame',
  'EscapeFromTarkov',
  'RustClient',
  'DeadByDaylight-Win64-Shipping',
  'FallGuys_client_game',
  'RobloxPlayerBeta',
  'eldenring',
  'Warframe.x64',
  'HuntGame',
  'Palworld-Win64-Shipping',
  'SoTGame',
  'Marvel-Win64-Shipping',
];

async function boostRunningGames() {
  if (!IS_WINDOWS) return [];
  const names = GAME_PROCESSES.map((name) => `'${name.replace(/'/g, "''")}'`).join(',');
  const result = await powershell(
    `$names=@(${names}); Get-Process | Where-Object { $names -contains $_.ProcessName } | ForEach-Object { try { if ($_.PriorityClass -ne 'High') { $_.PriorityClass = 'High' } } catch {}; $_.ProcessName } | Sort-Object -Unique`,
  );
  if (!result.ok || !result.out) return [];
  return result.out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/**
 * Anti-crash : les causes les plus fréquentes de plantage de jeu sont un fichier
 * d'échange désactivé/trop petit, le pilote GPU coupé par Windows au bout de 2 s
 * (TDR) et les optimisations plein écran. On corrige les trois.
 */
const ANTI_CRASH = [
  {
    id: 'pagefile',
    label: "Mémoire virtuelle gérée par Windows (évite les crashs 'mémoire insuffisante')",
    async apply() {
      await powershell(
        "$cs = Get-CimInstance Win32_ComputerSystem; if (-not $cs.AutomaticManagedPagefile) { Set-CimInstance -InputObject $cs -Property @{AutomaticManagedPagefile=$true} }",
      );
    },
  },
  {
    id: 'tdr',
    label: "Délai GPU allongé à 10 s (évite 'pilote graphique ne répond plus')",
    async apply() {
      const key = `${HKLM}\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers`;
      await reg(key, 'TdrDelay', 'REG_DWORD', 10);
      await reg(key, 'TdrDdiDelay', 'REG_DWORD', 10);
    },
  },
  {
    id: 'fse',
    label: 'Optimisations plein écran désactivées (moins de freezes / alt-tab)',
    async apply() {
      await reg('HKCU\\System\\GameConfigStore', 'GameDVR_DXGIHonorFSEWindowsCompatible', 'REG_DWORD', 1);
      await reg('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', 1);
      await reg('HKCU\\System\\GameConfigStore', 'GameDVR_EFSEFeatureFlags', 'REG_DWORD', 0);
    },
  },
  {
    id: 'crash-dumps',
    label: 'Rapports de plantage Windows en mode minimal (pas de blocage après crash)',
    async apply() {
      await reg(`${HKLM}\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting`, 'DontShowUI', 'REG_DWORD', 1);
    },
  },
];

/** Processus d'arrière-plan sans intérêt en jeu, fermés quand un jeu tourne. */
const BACKGROUND_HOGS = [
  'OneDrive',
  'GameBarFTServer',
  'GameBar',
  'YourPhone',
  'PhoneExperienceHost',
  'Widgets',
  'WidgetService',
  'msedgewebview2',
  'SearchApp',
  'Cortana',
];

async function applyAntiCrash() {
  const report = [];
  for (const step of ANTI_CRASH) {
    if (!IS_WINDOWS) {
      report.push({ id: step.id, label: step.label, ok: false, skipped: true });
      continue;
    }
    try {
      await step.apply();
      report.push({ id: step.id, label: step.label, ok: true });
    } catch (error) {
      report.push({ id: step.id, label: step.label, ok: false, error: String(error) });
    }
  }
  return report;
}

async function closeBackgroundHogs() {
  if (!IS_WINDOWS) return [];
  const names = BACKGROUND_HOGS.map((name) => `'${name}'`).join(',');
  const result = await powershell(
    `$names=@(${names}); Get-Process | Where-Object { $names -contains $_.ProcessName } | ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop; $_.ProcessName } catch {} } | Sort-Object -Unique`,
  );
  if (!result.ok || !result.out) return [];
  return result.out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/** Réparation des fichiers système (long : plusieurs minutes). */
async function repairSystem() {
  if (!IS_WINDOWS) return { ok: false, out: 'Windows uniquement' };
  const dism = await run('DISM /Online /Cleanup-Image /RestoreHealth', 30 * 60 * 1000);
  const sfc = await run('sfc /scannow', 30 * 60 * 1000);
  return { ok: dism.ok || sfc.ok, out: `${dism.out}\n${sfc.out}`.trim() };
}

async function isAdmin() {
  if (!IS_WINDOWS) return false;
  const result = await run('net session', 5000);
  return result.ok;
}

/** Ping d'un hôte en ms, ou null si perte de paquet. */
async function ping(host) {
  const command = IS_WINDOWS ? `ping -n 1 -w 1500 ${host}` : `ping -c 1 -W 2 ${host}`;
  const result = await run(command, 5000);
  const match = result.out.match(/[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/i);
  if (!match) return null;
  return Math.round(Number(match[1].replace(',', '.')));
}

let lastBytes = null;
let lastBytesAt = 0;

/** Débit réseau instantané (octets/s) en additionnant tous les adaptateurs actifs. */
async function throughput() {
  if (!IS_WINDOWS) return { down: 0, up: 0 };
  const result = await powershell(
    "$s = Get-NetAdapterStatistics | Measure-Object -Property ReceivedBytes,SentBytes -Sum; ($s | Where-Object Property -eq 'ReceivedBytes').Sum; ($s | Where-Object Property -eq 'SentBytes').Sum",
    8000,
  );
  const [received, sent] = result.out.split(/\r?\n/).map((value) => Number(value.trim()));
  if (!Number.isFinite(received) || !Number.isFinite(sent)) return { down: 0, up: 0 };
  const now = Date.now();
  const previous = lastBytes;
  const elapsed = (now - lastBytesAt) / 1000;
  lastBytes = { received, sent };
  lastBytesAt = now;
  if (!previous || elapsed <= 0) return { down: 0, up: 0 };
  return {
    down: Math.max(0, (received - previous.received) / elapsed),
    up: Math.max(0, (sent - previous.sent) / elapsed),
  };
}

async function applyAll(options, onProgress) {
  const report = [];
  for (const tweak of TWEAKS) {
    if (!IS_WINDOWS) {
      report.push({ id: tweak.id, label: tweak.label, group: tweak.group, ok: false, skipped: true });
      continue;
    }
    try {
      await tweak.apply();
      report.push({ id: tweak.id, label: tweak.label, group: tweak.group, ok: true });
    } catch (error) {
      report.push({ id: tweak.id, label: tweak.label, group: tweak.group, ok: false, error: String(error) });
    }
    if (onProgress) onProgress(report[report.length - 1]);
  }
  if (IS_WINDOWS && options.dns && DNS_PROFILES[options.dns]) {
    const count = await setDns(DNS_PROFILES[options.dns]);
    const entry = {
      id: 'dns',
      group: 'network',
      label: `DNS rapides ${options.dns} (${DNS_PROFILES[options.dns].join(', ')}) sur ${count} carte(s)`,
      ok: count > 0,
    };
    report.push(entry);
    if (onProgress) onProgress(entry);
  }
  return report;
}

async function restoreAll() {
  const report = [];
  for (const tweak of TWEAKS) {
    if (!IS_WINDOWS) continue;
    try {
      await tweak.restore();
      report.push({ id: tweak.id, label: tweak.label, ok: true });
    } catch (error) {
      report.push({ id: tweak.id, label: tweak.label, ok: false, error: String(error) });
    }
  }
  if (IS_WINDOWS) await setDns(null);
  return report;
}

// ---------------------------------------------------------------------------
// Scanner de menaces. Deux sources : Windows Defender (analyse rapide + menaces
// détectées) et une analyse heuristique des dossiers utilisateur. Rien n'est
// supprimé automatiquement : la liste est cochée par l'utilisateur, puis mise en
// quarantaine (déplacement réversible). Tout ce qui appartient à Windows /
// Microsoft (dossier Windows, WindowsApps, fichiers signés Microsoft) est ignoré.
// ---------------------------------------------------------------------------

const EXEC_EXT = new Set(['.exe', '.scr', '.bat', '.cmd', '.vbs', '.vbe', '.js', '.jse', '.ps1', '.com', '.pif', '.wsf', '.hta', '.msi']);
const SCRIPT_EXT = new Set(['.scr', '.pif', '.jse', '.vbe', '.vbs', '.wsf', '.hta', '.bat', '.cmd']);
const DOC_EXT = 'pdf|jpe?g|png|gif|docx?|xlsx?|pptx?|txt|mp4|mp3|zip|rar|7z';
const DOUBLE_EXT = new RegExp(`\\.(${DOC_EXT})\\.(exe|scr|bat|cmd|vbs|js|jse|ps1|com|pif|wsf|hta)$`, 'i');
const SYSTEM_NAMES = new Set(['svchost.exe', 'explorer.exe', 'csrss.exe', 'lsass.exe', 'winlogon.exe', 'services.exe', 'smss.exe', 'dwm.exe', 'wininit.exe', 'taskhost.exe', 'rundll32.exe', 'conhost.exe']);
const MAX_SCAN_ENTRIES = 60000;
const MAX_SCAN_DEPTH = 6;

function lower(value) {
  return String(value || '').toLowerCase();
}

/** Chemins Windows / Microsoft : jamais analysés ni touchés. */
function isProtectedPath(target) {
  const p = lower(target).replace(/\//g, '\\');
  const windir = lower(process.env.WINDIR || 'c:\\windows');
  const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432].filter(Boolean).map(lower);
  if (p.startsWith(windir)) return true;
  if (p.includes('\\windowsapps\\') || p.includes('\\microsoft\\edge\\') || p.includes('\\microsoft\\onedrive\\')) return true;
  if (programFiles.some((dir) => p.startsWith(`${dir}\\microsoft`) || p.startsWith(`${dir}\\windows`))) return true;
  if (p.includes('\\noxbooster\\quarantine\\')) return true;
  return false;
}

function userScanRoots() {
  const env = process.env;
  const home = env.USERPROFILE || '';
  const roots = [
    { dir: path.join(home, 'Downloads'), zone: 'downloads' },
    { dir: path.join(home, 'Desktop'), zone: 'desktop' },
    { dir: path.join(home, 'Documents'), zone: 'documents' },
    { dir: env.TEMP || env.TMP, zone: 'temp' },
    { dir: path.join(env.LOCALAPPDATA || '', 'Temp'), zone: 'temp' },
    { dir: env.APPDATA, zone: 'appdata' },
    { dir: env.LOCALAPPDATA, zone: 'appdata' },
    { dir: env.PUBLIC || 'C:\\Users\\Public', zone: 'public' },
  ];
  const seen = new Set();
  return roots.filter((root) => {
    if (!root.dir) return false;
    const key = lower(root.dir);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function suspicionFor(file, zone) {
  const name = path.basename(file);
  const ext = path.extname(name).toLowerCase();
  if (DOUBLE_EXT.test(name)) return { severity: 'high', reason: 'Fausse extension (document qui est en réalité un programme)' };
  if (SYSTEM_NAMES.has(lower(name)) && !isProtectedPath(file)) return { severity: 'high', reason: 'Nom de processus Windows hors du dossier Windows' };
  if (zone === 'temp' && EXEC_EXT.has(ext)) return { severity: 'medium', reason: 'Programme dans un dossier temporaire' };
  if ((zone === 'downloads' || zone === 'desktop' || zone === 'documents' || zone === 'public') && SCRIPT_EXT.has(ext)) {
    return { severity: 'medium', reason: 'Script exécutable dans un dossier personnel' };
  }
  if (/^[a-z0-9]{16,}\.exe$/i.test(name) && zone === 'appdata') return { severity: 'low', reason: 'Programme au nom aléatoire dans AppData' };
  return null;
}

async function walk(root, zone, found, counter, depth = 0) {
  if (depth > MAX_SCAN_DEPTH || counter.count > MAX_SCAN_ENTRIES) return;
  let entries = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (counter.count > MAX_SCAN_ENTRIES) return;
    counter.count += 1;
    const full = path.join(root, entry.name);
    if (isProtectedPath(full)) continue;
    if (entry.isDirectory()) {
      if (lower(entry.name) === 'node_modules' || lower(entry.name) === 'packages') continue;
      await walk(full, zone, found, counter, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    const suspicion = suspicionFor(full, zone);
    if (suspicion) found.push({ type: 'file', path: full, name: entry.name, source: 'heuristique', ...suspicion });
  }
}

/** Signatures Authenticode : les fichiers signés valides par Microsoft sont écartés. */
async function filterMicrosoftSigned(items) {
  const files = items.filter((item) => item.path && /\.(exe|dll|msi|ps1|sys)$/i.test(item.path)).map((item) => item.path);
  if (!files.length || !IS_WINDOWS) return items;
  const list = files.map((file) => `'${file.replace(/'/g, "''")}'`).join(',');
  const result = await powershell(
    `@(${list}) | ForEach-Object { $s = Get-AuthenticodeSignature -LiteralPath $_ -ErrorAction SilentlyContinue; if ($s -and $s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match 'Microsoft') { $_ } }`,
    60000,
  );
  const trusted = new Set(result.out.split(/\r?\n/).map((line) => lower(line.trim())).filter(Boolean));
  return items.filter((item) => !item.path || !trusted.has(lower(item.path)));
}

function commandPath(command) {
  const text = String(command || '').trim();
  const quoted = text.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  const match = text.match(/^(.*?\.(exe|bat|cmd|vbs|js|ps1|scr|com|pif|hta|wsf))(\s|$)/i);
  return match ? match[1] : text.split(/\s+/)[0];
}

/** Entrées de démarrage automatique : programmes douteux ou fichiers disparus. */
async function scanAutostart() {
  const keys = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    'HKLM\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
  ];
  const found = [];
  for (const key of keys) {
    const result = await run(`reg query "${key}"`);
    if (!result.ok) continue;
    for (const line of result.out.split(/\r?\n/)) {
      const match = line.match(/^\s{2,}(.+?)\s{2,}REG_(?:EXPAND_)?SZ\s{2,}(.+)$/);
      if (!match) continue;
      const [, valueName, command] = match;
      const target = commandPath(command).replace(/%([^%]+)%/g, (_m, name) => process.env[name] || `%${name}%`);
      if (isProtectedPath(target)) continue;
      const exists = fs.existsSync(target);
      const low = lower(target);
      const suspicious = /\\temp\\|\\downloads\\|\\public\\|\\appdata\\local\\temp\\/.test(low) || SYSTEM_NAMES.has(lower(path.basename(low)));
      if (!exists) {
        found.push({ type: 'registry', key, valueName, command, path: target, name: valueName, source: 'démarrage', severity: 'low', reason: "Entrée de démarrage cassée : le programme n'existe plus (ralentit le démarrage)" });
      } else if (suspicious) {
        found.push({ type: 'registry', key, valueName, command, path: target, name: valueName, source: 'démarrage', severity: 'high', reason: 'Programme lancé au démarrage depuis un dossier temporaire' });
      }
    }
  }
  const startup = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  try {
    for (const entry of await fsp.readdir(startup)) {
      const ext = path.extname(entry).toLowerCase();
      if (SCRIPT_EXT.has(ext) || ext === '.js' || ext === '.ps1') {
        found.push({ type: 'file', path: path.join(startup, entry), name: entry, source: 'démarrage', severity: 'high', reason: 'Script dans le dossier Démarrage' });
      }
    }
  } catch {
    // pas de dossier Démarrage
  }
  return found;
}

/** Menaces vues par Windows Defender (analyse rapide + historique récent). */
async function scanDefender(onProgress, quick) {
  if (quick) {
    if (onProgress) onProgress({ step: 'defender', label: 'Analyse rapide Windows Defender en cours…' });
    await powershell('Start-MpScan -ScanType QuickScan', 20 * 60 * 1000);
  }
  const result = await powershell(
    "Get-MpThreatDetection -ErrorAction SilentlyContinue | ForEach-Object { $d = $_; $t = Get-MpThreat -ThreatID $d.ThreatID -ErrorAction SilentlyContinue; foreach ($r in $d.Resources) { ($t.ThreatName) + '|' + $t.SeverityID + '|' + $r + '|' + $d.ActionSuccess } }",
    60000,
  );
  const found = [];
  for (const line of result.out.split(/\r?\n/)) {
    const [threatName, severityId, resource, actionSuccess] = line.split('|');
    if (!resource) continue;
    const file = resource.replace(/^(file|containerfile|process):_/i, '');
    if (isProtectedPath(file)) continue;
    const severity = Number(severityId) >= 4 ? 'high' : Number(severityId) >= 2 ? 'medium' : 'low';
    found.push({
      type: 'file',
      path: file,
      name: path.basename(file),
      source: 'Windows Defender',
      severity,
      reason: `${threatName || 'Menace'}${lower(actionSuccess) === 'true' ? ' (déjà neutralisée par Defender)' : ''}`,
      handled: lower(actionSuccess) === 'true' || !fs.existsSync(file),
    });
  }
  return found;
}

async function scanThreats(options, onProgress) {
  if (!IS_WINDOWS) return { items: [], scanned: 0, duration: 0 };
  const started = Date.now();
  const counter = { count: 0 };
  let items = [];
  for (const root of userScanRoots()) {
    if (onProgress) onProgress({ step: 'files', label: `Analyse de ${root.dir}` });
    await walk(root.dir, root.zone, items, counter);
  }
  if (onProgress) onProgress({ step: 'autostart', label: 'Vérification des programmes au démarrage' });
  items = items.concat(await scanAutostart());
  if (onProgress) onProgress({ step: 'signatures', label: 'Vérification des signatures Microsoft' });
  items = await filterMicrosoftSigned(items);
  items = items.concat(await scanDefender(onProgress, options.defenderQuickScan !== false));
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = `${item.type}|${lower(item.path)}|${item.key || ''}|${item.valueName || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...item, id: `t${unique.length}-${Date.now()}` });
  }
  return { items: unique, scanned: counter.count, duration: Date.now() - started };
}

function quarantineDir() {
  return path.join(process.env.LOCALAPPDATA || process.env.HOME || '.', 'NoxBooster', 'Quarantine');
}

/** Met en quarantaine les éléments cochés : fichiers déplacés, entrées Run supprimées (sauvegardées). */
async function quarantine(items) {
  const dir = quarantineDir();
  await fsp.mkdir(dir, { recursive: true });
  const results = [];
  for (const item of items) {
    if (!item || isProtectedPath(item.path)) {
      results.push({ id: item && item.id, ok: false, error: 'Élément protégé (Windows / Microsoft)' });
      continue;
    }
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const meta = path.join(dir, `${stamp}.json`);
    try {
      if (item.type === 'registry') {
        await regDelete(item.key, item.valueName);
        await fsp.writeFile(meta, JSON.stringify({ ...item, quarantinedAt: Date.now() }, null, 2));
        results.push({ id: item.id, ok: true });
        continue;
      }
      const destination = path.join(dir, `${stamp}-${path.basename(item.path)}.quarantine`);
      await fsp.rename(item.path, destination).catch(async () => {
        await fsp.copyFile(item.path, destination);
        await fsp.rm(item.path, { force: true });
      });
      await fsp.writeFile(meta, JSON.stringify({ ...item, stored: destination, quarantinedAt: Date.now() }, null, 2));
      results.push({ id: item.id, ok: true });
    } catch (error) {
      results.push({ id: item.id, ok: false, error: String(error && error.message ? error.message : error) });
    }
  }
  return results;
}

async function listQuarantine() {
  const dir = quarantineDir();
  let entries = [];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const items = [];
  for (const entry of entries.filter((name) => name.endsWith('.json'))) {
    try {
      const meta = JSON.parse(await fsp.readFile(path.join(dir, entry), 'utf8'));
      items.push({ ...meta, metaFile: entry });
    } catch {
      // méta illisible
    }
  }
  return items.sort((a, b) => b.quarantinedAt - a.quarantinedAt);
}

async function restoreQuarantine(metaFile) {
  const dir = quarantineDir();
  const metaPath = path.join(dir, path.basename(metaFile));
  const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
  if (meta.type === 'registry') {
    await reg(meta.key, meta.valueName, 'REG_SZ', `"${String(meta.command).replace(/"/g, '\\"')}"`);
  } else if (meta.stored) {
    await fsp.mkdir(path.dirname(meta.path), { recursive: true });
    await fsp.rename(meta.stored, meta.path);
  }
  await fsp.rm(metaPath, { force: true });
  return true;
}

async function deleteQuarantine(metaFile) {
  const dir = quarantineDir();
  const metaPath = path.join(dir, path.basename(metaFile));
  const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
  if (meta.stored) await fsp.rm(meta.stored, { force: true });
  await fsp.rm(metaPath, { force: true });
  return true;
}

module.exports = {
  deleteQuarantine,
  IS_WINDOWS,
  ANTI_CRASH: ANTI_CRASH.map(({ id, label }) => ({ id, label })),
  applyAntiCrash,
  closeBackgroundHogs,
  repairSystem,
  scanThreats,
  quarantine,
  listQuarantine,
  restoreQuarantine,
  TWEAKS: TWEAKS.map(({ id, group, label }) => ({ id, group, label })),
  DNS_PROFILES,
  GAME_PROCESSES,
  applyAll,
  restoreAll,
  boostRunningGames,
  isAdmin,
  ping,
  throughput,
  activeAdapters,
};
