// Bouclier Nox : blocage pubs/trackers (fichier hosts), anti-DDoS (pare-feu durci) et PC invisible sur le réseau.
// Tout est réversible : le bloc hosts est délimité par des marqueurs, les règles pare-feu portent un préfixe "Nox".
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const IS_WINDOWS = process.platform === 'win32';
const HOSTS_FILE = IS_WINDOWS
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
  : '/etc/hosts';
const BEGIN = '# >>> Nox Booster : bloqueur pubs & trackers (ne pas modifier) >>>';
const END = '# <<< Nox Booster <<<';
const RULE_PREFIX = 'Nox Bouclier - ';
const MAX_ENTRIES = 150000;

// Listes publiques (domaine par ligne ou format hosts). StevenBlack = pubs + malware, oisd small = trackers, Peter Lowe = pubs.
const BLOCKLISTS = [
  { name: 'StevenBlack (pubs + malware)', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts' },
  { name: 'oisd small (trackers, sans casser les sites)', url: 'https://small.oisd.nl' },
  { name: 'Peter Lowe (pubs)', url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext' },
];

// Jamais bloqués : les jeux, lanceurs, plateformes et services Windows doivent passer (sinon connexions cassées).
const ALLOW = [
  /(^|\.)epicgames\.com$/, /(^|\.)unrealengine\.com$/, /(^|\.)fortnite\.com$/, /(^|\.)steampowered\.com$/,
  /(^|\.)steamcontent\.com$/, /(^|\.)riotgames\.com$/, /(^|\.)riotcdn\.net$/, /(^|\.)xboxlive\.com$/,
  /(^|\.)playstation\.(net|com)$/, /(^|\.)discord(app)?\.(com|gg|net)$/, /(^|\.)microsoft\.com$/,
  /(^|\.)windowsupdate\.com$/, /(^|\.)live\.com$/, /(^|\.)nvidia\.com$/, /(^|\.)amd\.com$/,
  /(^|\.)ea\.com$/, /(^|\.)battle\.net$/, /(^|\.)blizzard\.com$/, /(^|\.)ubisoft\.com$/, /(^|\.)rockstargames\.com$/,
  /(^|\.)twitch\.tv$/, /(^|\.)ttvnw\.net$/, /(^|\.)youtube\.com$/, /(^|\.)googlevideo\.com$/, /(^|\.)spotify\.com$/,
  /(^|\.)cloudflare\.com$/, /(^|\.)vpngate\.net$/, /(^|\.)ipwho\.is$/, /(^|\.)proxyscrape\.com$/,
];

function powershell(script, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout, encoding: 'utf8' },
      (error, stdout, stderr) => resolve({ ok: !error, out: `${stdout || ''}${stderr || ''}`.trim() }),
    );
  });
}

function cmd(file, args, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout, encoding: 'utf8' }, (error, stdout, stderr) =>
      resolve({ ok: !error, out: `${stdout || ''}${stderr || ''}`.trim() }),
    );
  });
}

// ---- Bloqueur pubs / trackers -------------------------------------------------

function parseDomains(text) {
  const domains = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    const abp = line.match(/^\|\|([a-z0-9.-]+)\^$/i);
    const parts = line.split(/\s+/);
    const domain = (abp ? abp[1] : parts.length > 1 ? parts[1] : parts[0]).toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) continue;
    if (['localhost', 'localhost.localdomain', 'broadcasthost', 'local'].includes(domain)) continue;
    if (ALLOW.some((rule) => rule.test(domain))) continue;
    domains.push(domain);
  }
  return domains;
}

async function fetchList(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'NoxBooster/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function downloadBlocklist(onProgress = () => {}) {
  const domains = new Set();
  const sources = [];
  for (const list of BLOCKLISTS) {
    onProgress({ label: `Téléchargement : ${list.name}…` });
    try {
      const before = domains.size;
      for (const domain of parseDomains(await fetchList(list.url))) domains.add(domain);
      sources.push({ name: list.name, ok: true, added: domains.size - before });
    } catch (error) {
      sources.push({ name: list.name, ok: false, error: error.message });
    }
  }
  return { domains: [...domains].slice(0, MAX_ENTRIES), sources };
}

function stripBlock(content) {
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1) return content.replace(/\s+$/, '');
  return (content.slice(0, start) + content.slice(end + END.length)).replace(/\s+$/, '');
}

async function readHosts() {
  try {
    return await fsp.readFile(HOSTS_FILE, 'utf8');
  } catch {
    return '';
  }
}

async function adblockStatus() {
  const content = await readHosts();
  const start = content.indexOf(BEGIN);
  if (start === -1) return { enabled: false, count: 0, updatedAt: null };
  const block = content.slice(start, content.indexOf(END));
  const stamp = block.match(/mis à jour : (\d+)/);
  return {
    enabled: true,
    count: (block.match(/^0\.0\.0\.0 /gm) || []).length,
    updatedAt: stamp ? Number(stamp[1]) : null,
  };
}

async function enableAdblock(onProgress = () => {}) {
  const { domains, sources } = await downloadBlocklist(onProgress);
  if (!domains.length) return { ok: false, error: 'Aucune liste téléchargée (pas de réseau ?)', sources };
  if (!IS_WINDOWS) return { ok: false, skipped: true, error: 'Aperçu : le fichier hosts n\'est modifié que sous Windows', count: domains.length, sources };
  onProgress({ label: `Écriture de ${domains.length} domaines bloqués…` });
  const base = stripBlock(await readHosts());
  const block = [BEGIN, `# ${domains.length} domaines, mis à jour : ${Date.now()}`, ...domains.map((d) => `0.0.0.0 ${d}`), END].join('\r\n');
  try {
    await fsp.writeFile(HOSTS_FILE, `${base}\r\n\r\n${block}\r\n`, 'utf8');
  } catch (error) {
    return { ok: false, error: `Écriture du fichier hosts refusée (${error.code || error.message}) : lance Nox Booster en administrateur`, sources };
  }
  await cmd('ipconfig.exe', ['/flushdns']);
  return { ok: true, count: domains.length, sources };
}

async function disableAdblock() {
  const content = await readHosts();
  if (content.indexOf(BEGIN) === -1) return { ok: true, count: 0 };
  if (!IS_WINDOWS) return { ok: false, skipped: true };
  try {
    await fsp.writeFile(HOSTS_FILE, `${stripBlock(content)}\r\n`, 'utf8');
  } catch (error) {
    return { ok: false, error: `Écriture du fichier hosts refusée (${error.code || error.message})` };
  }
  await cmd('ipconfig.exe', ['/flushdns']);
  return { ok: true, count: 0 };
}

// ---- Anti-DDoS + PC invisible --------------------------------------------------

// Règles pare-feu ajoutées (toutes entrantes, toutes réversibles). Le trafic sortant et les réponses aux
// connexions que TU ouvres (jeux, sites) ne sont jamais touchés : c'est le pare-feu Windows qui gère l'état.
const FIREWALL_RULES = [
  { name: 'Ping (ICMPv4) entrant bloqué', args: 'dir=in action=block protocol=icmpv4 enable=yes' },
  { name: 'Ping (ICMPv6) entrant bloqué', args: 'dir=in action=block protocol=icmpv6 enable=yes' },
  { name: 'Partage de fichiers SMB fermé', args: 'dir=in action=block protocol=TCP localport=139,445 enable=yes' },
  { name: 'NetBIOS fermé', args: 'dir=in action=block protocol=UDP localport=137,138 enable=yes' },
  { name: 'Bureau à distance fermé', args: 'dir=in action=block protocol=TCP localport=3389 enable=yes' },
  { name: 'Découverte réseau (LLMNR/SSDP/mDNS) fermée', args: 'dir=in action=block protocol=UDP localport=1900,5353,5355 enable=yes' },
  { name: 'WinRM / gestion à distance fermée', args: 'dir=in action=block protocol=TCP localport=5985,5986,135 enable=yes' },
];

const STEALTH_STEPS = [
  {
    id: 'fw-on',
    label: 'Pare-feu Windows actif sur tous les profils, entrant bloqué par défaut, mode furtif',
    apply: () => cmd('netsh.exe', ['advfirewall', 'set', 'allprofiles', 'state', 'on', 'firewallpolicy', 'blockinbound,allowoutbound']),
    restore: () => cmd('netsh.exe', ['advfirewall', 'set', 'allprofiles', 'firewallpolicy', 'blockinbound,allowoutbound']),
  },
  {
    id: 'fw-rules',
    label: 'Ping, partage de fichiers, NetBIOS, Bureau à distance et découverte réseau fermés',
    async apply() {
      for (const rule of FIREWALL_RULES) {
        await cmd('netsh.exe', ['advfirewall', 'firewall', 'delete', 'rule', `name=${RULE_PREFIX}${rule.name}`]);
        await cmd('netsh.exe', ['advfirewall', 'firewall', 'add', 'rule', `name=${RULE_PREFIX}${rule.name}`, ...rule.args.split(' ')]);
      }
    },
    async restore() {
      for (const rule of FIREWALL_RULES) {
        await cmd('netsh.exe', ['advfirewall', 'firewall', 'delete', 'rule', `name=${RULE_PREFIX}${rule.name}`]);
      }
    },
  },
  {
    id: 'discovery',
    label: 'PC invisible sur le réseau local (découverte réseau et partage coupés, profil Public)',
    apply: () =>
      powershell(
        "Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Public -ErrorAction SilentlyContinue; " +
          "Set-NetFirewallRule -DisplayGroup 'Network Discovery' -Enabled False -ErrorAction SilentlyContinue; " +
          "Set-NetFirewallRule -DisplayGroup 'File and Printer Sharing' -Enabled False -ErrorAction SilentlyContinue; " +
          "Set-Service -Name FDResPub -StartupType Disabled -ErrorAction SilentlyContinue; Stop-Service FDResPub -Force -ErrorAction SilentlyContinue; " +
          "Set-Service -Name SSDPSRV -StartupType Disabled -ErrorAction SilentlyContinue; Stop-Service SSDPSRV -Force -ErrorAction SilentlyContinue",
      ),
    restore: () =>
      powershell(
        "Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue; " +
          "Set-NetFirewallRule -DisplayGroup 'Network Discovery' -Enabled True -Profile Private -ErrorAction SilentlyContinue; " +
          "Set-Service -Name FDResPub -StartupType Manual -ErrorAction SilentlyContinue; " +
          "Set-Service -Name SSDPSRV -StartupType Manual -ErrorAction SilentlyContinue",
      ),
  },
  {
    id: 'tcp-flood',
    label: 'Anti-flood TCP (SYN attack protection, connexions semi-ouvertes limitées)',
    async apply() {
      const key = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters';
      for (const [name, value] of [['SynAttackProtect', '1'], ['TcpMaxHalfOpen', '100'], ['TcpMaxHalfOpenRetried', '80'], ['EnableDeadGWDetect', '0'], ['EnableICMPRedirect', '0']]) {
        await cmd('reg.exe', ['add', key, '/v', name, '/t', 'REG_DWORD', '/d', value, '/f']);
      }
    },
    async restore() {
      const key = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters';
      for (const name of ['SynAttackProtect', 'TcpMaxHalfOpen', 'TcpMaxHalfOpenRetried', 'EnableDeadGWDetect', 'EnableICMPRedirect']) {
        await cmd('reg.exe', ['delete', key, '/v', name, '/f']);
      }
    },
  },
  {
    id: 'upnp-off',
    label: "Ouverture automatique de ports par les programmes (UPnP Windows) désactivée",
    apply: () => powershell("Set-Service -Name upnphost -StartupType Disabled -ErrorAction SilentlyContinue; Stop-Service upnphost -Force -ErrorAction SilentlyContinue"),
    restore: () => powershell("Set-Service -Name upnphost -StartupType Manual -ErrorAction SilentlyContinue"),
  },
];

async function firewallStatus() {
  if (!IS_WINDOWS) return { enabled: false, rules: 0, steps: STEALTH_STEPS.map(({ id, label }) => ({ id, label })) };
  const result = await cmd('netsh.exe', ['advfirewall', 'firewall', 'show', 'rule', `name=all`], 60000);
  const rules = (result.out.match(new RegExp(`^Rule Name:\\s+${RULE_PREFIX}`, 'gmi')) || []).length
    + (result.out.match(new RegExp(`^Nom de la règle\\s*:\\s+${RULE_PREFIX}`, 'gmi')) || []).length;
  return { enabled: rules >= FIREWALL_RULES.length, rules, steps: STEALTH_STEPS.map(({ id, label }) => ({ id, label })) };
}

async function runSteps(direction, onProgress = () => {}) {
  const report = [];
  for (const step of STEALTH_STEPS) {
    onProgress({ label: step.label });
    if (!IS_WINDOWS) {
      report.push({ id: step.id, label: step.label, skipped: true });
      continue;
    }
    try {
      const result = await step[direction]();
      report.push({ id: step.id, label: step.label, ok: !result || result.ok !== false, detail: result && result.out ? result.out.split('\n')[0] : '' });
    } catch (error) {
      report.push({ id: step.id, label: step.label, ok: false, detail: error.message });
    }
  }
  return report;
}

const enableFirewall = (onProgress) => runSteps('apply', onProgress);
const disableFirewall = (onProgress) => runSteps('restore', onProgress);

async function status() {
  const [adblock, firewall] = await Promise.all([adblockStatus(), firewallStatus()]);
  return { adblock, firewall, hostsFile: HOSTS_FILE, platform: process.platform, hostsWritable: IS_WINDOWS && canWrite(HOSTS_FILE) };
}

function canWrite(file) {
  try {
    fs.accessSync(file, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = { status, enableAdblock, disableAdblock, enableFirewall, disableFirewall, BLOCKLISTS, parseDomains };
