// Nox VPN : serveurs gratuits trouvés en ligne, choix du pays, connexion pour tout le PC.
//  - mode "vpn"   : serveurs bénévoles VPN Gate (L2TP/IPsec ou SSTP) via le client VPN intégré de Windows
//  - mode "proxy" : proxys publics (HTTP/SOCKS5) appliqués comme proxy système Windows (navigateurs, apps web)
// Rien n'est installé : on utilise rasdial / Add-VpnConnection et la clé Internet Settings, tout est réversible.
const net = require('node:net');
const { execFile } = require('node:child_process');

const IS_WINDOWS = process.platform === 'win32';
const CONNECTION_NAME = 'Nox VPN';
const VPNGATE_URL = 'https://www.vpngate.net/api/iphone/';
const PROXY_URL =
  'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http,socks5&proxy_format=protocolipport&format=json&timeout=3000';
const IP_URL = 'https://ipwho.is/';
const PROXY_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const CACHE_TTL = 10 * 60 * 1000;

const countryNames = new Intl.DisplayNames(['fr'], { type: 'region' });

function powershell(script, timeout = 60000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout, encoding: 'utf8' },
      (error, stdout, stderr) => resolve({ ok: !error, out: `${stdout || ''}${stderr || ''}`.trim() }),
    );
  });
}

function cmd(file, args, timeout = 60000) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout, encoding: 'utf8' }, (error, stdout, stderr) =>
      resolve({ ok: !error, out: `${stdout || ''}${stderr || ''}`.trim() }),
    );
  });
}

async function fetchText(url, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'NoxBooster/1.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function countryName(code) {
  try {
    return countryNames.of(code) || code;
  } catch {
    return code;
  }
}

// ---- Sources de serveurs -----------------------------------------------------

async function vpnGateServers() {
  const csv = await fetchText(VPNGATE_URL);
  const servers = [];
  for (const line of csv.split('\n')) {
    if (!line || line.startsWith('*') || line.startsWith('#')) continue;
    const cols = line.split(',');
    if (cols.length < 15) continue;
    const [host, ip, score, ping, speed, , countryCode, sessions, uptime] = cols;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^[A-Z]{2}$/.test(countryCode) || !/^[a-z0-9-]{1,63}$/i.test(host)) continue;
    servers.push({
      id: `vpn:${ip}`,
      mode: 'vpn',
      host: `${host}.opengw.net`,
      ip,
      country: countryCode,
      score: Number(score) || 0,
      ping: Number(ping) || null,
      speedMbps: Math.round((Number(speed) || 0) / 125000),
      sessions: Number(sessions) || 0,
      uptimeDays: Math.round((Number(uptime) || 0) / 86400000),
    });
  }
  return servers;
}

async function proxyServers() {
  const data = JSON.parse(await fetchText(PROXY_URL));
  const servers = [];
  for (const proxy of data.proxies || []) {
    const country = proxy.ip_data && proxy.ip_data.countryCode;
    if (!proxy.alive || !country || !/^[A-Z]{2}$/.test(country)) continue;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(proxy.ip) || !(Number(proxy.port) > 0 && Number(proxy.port) < 65536)) continue;
    if (proxy.protocol !== 'http' && proxy.protocol !== 'socks5') continue;
    servers.push({
      id: `proxy:${proxy.protocol}:${proxy.ip}:${proxy.port}`,
      mode: 'proxy',
      protocol: proxy.protocol,
      ip: proxy.ip,
      port: Number(proxy.port),
      country,
      city: (proxy.ip_data && proxy.ip_data.city) || '',
      ping: Math.round(proxy.timeout || proxy.average_timeout || 0) || null,
      uptime: Math.round(proxy.uptime || 0),
      score: (proxy.uptime || 0) * 1000 - (proxy.timeout || 5000),
    });
  }
  return servers;
}

let cache = { at: 0, servers: [], errors: [] };

async function listServers(force = false) {
  if (!force && Date.now() - cache.at < CACHE_TTL && cache.servers.length) return summary();
  const errors = [];
  const [vpn, proxies] = await Promise.all([
    vpnGateServers().catch((error) => { errors.push(`VPN Gate : ${error.message}`); return []; }),
    proxyServers().catch((error) => { errors.push(`Proxys : ${error.message}`); return []; }),
  ]);
  cache = { at: Date.now(), servers: [...vpn, ...proxies], errors };
  return summary();
}

function summary() {
  const byCountry = new Map();
  for (const server of cache.servers) {
    const entry = byCountry.get(server.country) || { code: server.country, name: countryName(server.country), vpn: 0, proxy: 0 };
    entry[server.mode] += 1;
    byCountry.set(server.country, entry);
  }
  const countries = [...byCountry.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return { at: cache.at, countries, servers: cache.servers, errors: cache.errors, total: cache.servers.length };
}

function candidates(country, mode) {
  return cache.servers
    .filter((server) => server.country === country && server.mode === mode)
    .sort((a, b) => b.score - a.score);
}

// ---- Test des proxys (avant de les appliquer au PC) --------------------------

function socks5Connect(socket, host, port) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const fail = (message) => reject(new Error(message));
    socket.once('error', (error) => fail(error.message));
    socket.write(Buffer.from([0x05, 0x01, 0x00]));
    socket.on('data', function onData(data) {
      chunks.push(data);
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 2) {
        if (buffer[1] !== 0x00) return fail('SOCKS auth refusée');
        chunks.length = 0;
        const hostBytes = Buffer.from(host);
        socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBytes.length]), hostBytes, Buffer.from([port >> 8, port & 0xff])]));
        return undefined;
      }
      if (buffer.length >= 4) {
        socket.removeListener('data', onData);
        if (buffer[1] !== 0x00) return fail(`SOCKS connect refusé (${buffer[1]})`);
        return resolve();
      }
      return undefined;
    });
  });
}

/** Vérifie qu'un proxy répond réellement et renvoie l'IP publique vue derrière lui. */
function probeProxy(server, timeout = 6000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host: server.ip, port: server.port });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeout);
    socket.setNoDelay(true);
    socket.once('error', () => finish(null));
    socket.once('connect', async () => {
      try {
        if (server.protocol === 'socks5') await socks5Connect(socket, 'ipwho.is', 80);
        const target = server.protocol === 'socks5' ? '/' : 'http://ipwho.is/';
        socket.write(`GET ${target} HTTP/1.1\r\nHost: ipwho.is\r\nUser-Agent: NoxBooster/1.0\r\nConnection: close\r\n\r\n`);
        let body = '';
        socket.on('data', (data) => { body += data.toString('utf8'); });
        socket.once('end', () => {
          clearTimeout(timer);
          const json = body.slice(body.indexOf('{'));
          try {
            const info = JSON.parse(json);
            if (!/^HTTP\/1\.[01] 200/.test(body) || !info.ip) return finish(null);
            return finish({ ms: Date.now() - started, ip: info.ip, country: info.country_code });
          } catch {
            return finish(null);
          }
        });
      } catch {
        finish(null);
      }
    });
  });
}

async function fastestProxy(country, onProgress) {
  const pool = candidates(country, 'proxy').slice(0, 12);
  onProgress({ label: `Test de ${pool.length} proxys ${countryName(country)}…` });
  const probes = await Promise.all(pool.map(async (server) => ({ server, probe: await probeProxy(server) })));
  const alive = probes.filter((entry) => entry.probe && entry.probe.country === country).sort((a, b) => a.probe.ms - b.probe.ms);
  return alive[0] || null;
}

// ---- État / connexion ----------------------------------------------------------

const state = { connected: false, mode: null, server: null, country: null, connecting: false, error: null, since: null, killSwitch: false, killSwitchActive: false, homeIp: null };

// Kill switch : si le tunnel VPN tombe, tout le trafic sortant est coupé jusqu'à reconnexion/déconnexion
// manuelle, pour que ta vraie IP ne fuite jamais.
async function engageKillSwitch() {
  if (!IS_WINDOWS || state.killSwitchActive) return;
  state.killSwitchActive = true;
  await cmd('netsh.exe', ['advfirewall', 'set', 'allprofiles', 'firewallpolicy', 'blockinbound,blockoutbound']);
}

async function releaseKillSwitch() {
  if (!state.killSwitchActive) return;
  state.killSwitchActive = false;
  if (IS_WINDOWS) await cmd('netsh.exe', ['advfirewall', 'set', 'allprofiles', 'firewallpolicy', 'blockinbound,allowoutbound']);
}

function setKillSwitch(enabled) {
  state.killSwitch = Boolean(enabled);
  if (!state.killSwitch) return releaseKillSwitch();
  return Promise.resolve();
}

/** Pays avec le meilleur serveur pour ce mode (connexion rapide). */
function bestCountry(mode) {
  const best = cache.servers.filter((server) => server.mode === mode).sort((a, b) => b.score - a.score)[0];
  return best ? best.country : null;
}

async function publicIp(fetcher = fetch) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetcher(IP_URL, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    const info = await response.json();
    if (!info.ip) return null;
    return { ip: info.ip, country: info.country_code, countryName: countryName(info.country_code), city: info.city || '' };
  } catch {
    return null;
  }
}

async function windowsVpnConnected() {
  if (!IS_WINDOWS) return false;
  const result = await cmd('rasdial.exe', []);
  return result.out.includes(CONNECTION_NAME);
}

async function status(fetcher) {
  const connected = state.mode === 'vpn' ? await windowsVpnConnected() : state.connected;
  if (state.mode === 'vpn' && !connected && state.connected) {
    state.connected = false;
    state.error = 'Connexion VPN perdue';
    if (state.killSwitch) await engageKillSwitch();
  }
  const ip = state.killSwitchActive ? null : await publicIp(fetcher);
  if (!state.connected && !state.connecting && ip) state.homeIp = ip;
  return { ...state, connected, ip, platform: process.platform };
}

// Réglages proxy de l'utilisateur avant la session, remis tels quels à la déconnexion.
let savedProxy = null;

async function readProxyValue(name) {
  const result = await cmd('reg.exe', ['query', PROXY_KEY, '/v', name]);
  if (!result.ok) return null;
  const match = result.out.match(new RegExp(`${name}\\s+REG_\\w+\\s+(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

async function writeProxyValue(name, type, value) {
  if (value === null) await cmd('reg.exe', ['delete', PROXY_KEY, '/v', name, '/f']);
  else await cmd('reg.exe', ['add', PROXY_KEY, '/v', name, '/t', type, '/d', value, '/f']);
}

async function setSystemProxy(server) {
  if (!savedProxy) {
    savedProxy = {
      ProxyEnable: await readProxyValue('ProxyEnable'),
      ProxyServer: await readProxyValue('ProxyServer'),
      ProxyOverride: await readProxyValue('ProxyOverride'),
    };
  }
  const value = server.protocol === 'socks5' ? `socks=${server.ip}:${server.port}` : `${server.ip}:${server.port}`;
  await cmd('reg.exe', ['add', PROXY_KEY, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', value, '/f']);
  await cmd('reg.exe', ['add', PROXY_KEY, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', '<local>;192.168.*;10.*', '/f']);
  await cmd('reg.exe', ['add', PROXY_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
  await refreshWinInet();
}

async function restoreSystemProxy() {
  if (!savedProxy) return;
  await writeProxyValue('ProxyEnable', 'REG_DWORD', savedProxy.ProxyEnable === null ? '0' : String(parseInt(savedProxy.ProxyEnable, 16) || 0));
  await writeProxyValue('ProxyServer', 'REG_SZ', savedProxy.ProxyServer);
  await writeProxyValue('ProxyOverride', 'REG_SZ', savedProxy.ProxyOverride);
  savedProxy = null;
  await refreshWinInet();
}

/** Prévient Windows/navigateurs que le proxy a changé (sinon pris en compte à la prochaine ouverture). */
function refreshWinInet() {
  return powershell(
    "$sig='[DllImport(\"wininet.dll\")] public static extern bool InternetSetOption(IntPtr h,int o,IntPtr b,int l);';" +
      "$w=Add-Type -MemberDefinition $sig -Name WinInet -Namespace Nox -PassThru;" +
      '$w::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0) | Out-Null;$w::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0) | Out-Null',
    15000,
  );
}

async function windowsVpnConnect(server, tunnel, onProgress) {
  const address = tunnel === 'Sstp' ? server.host : server.ip;
  onProgress({ label: `Connexion ${tunnel === 'Sstp' ? 'SSTP' : 'L2TP/IPsec'} à ${address} (${countryName(server.country)})…` });
  await cmd('rasdial.exe', [CONNECTION_NAME, '/disconnect'], 15000);
  const l2tp = tunnel === 'L2tp' ? "-L2tpPsk 'vpn' -AuthenticationMethod Pap,MSChapv2 -EncryptionLevel Optional" : "-AuthenticationMethod MSChapv2 -EncryptionLevel Optional";
  const created = await powershell(
    `Remove-VpnConnection -Name '${CONNECTION_NAME}' -Force -ErrorAction SilentlyContinue; ` +
      `Add-VpnConnection -Name '${CONNECTION_NAME}' -ServerAddress '${address}' -TunnelType ${tunnel} ${l2tp} -RememberCredential -SplitTunneling:$false -Force -PassThru | Out-Null`,
    30000,
  );
  if (!created.ok) return { ok: false, error: created.out.split('\n')[0] };
  const dial = await cmd('rasdial.exe', [CONNECTION_NAME, 'vpn', 'vpn'], 45000);
  return dial.ok ? { ok: true } : { ok: false, error: dial.out.split('\n').filter(Boolean).pop() || 'échec rasdial' };
}

async function connect({ country, mode = 'vpn' }, onProgress = () => {}, fetcher) {
  if (state.connecting) return status(fetcher);
  if (!/^[A-Z]{2}$/.test(String(country))) return { ...(await status(fetcher)), error: 'Pays invalide' };
  state.connecting = true;
  state.error = null;
  try {
    await connectInner(country, mode, onProgress);
  } catch (error) {
    state.error = `Connexion impossible : ${error.message}`;
  } finally {
    state.connecting = false;
  }
  return status(fetcher);
}

async function connectInner(country, mode, onProgress) {
  await releaseKillSwitch();
  await listServers();
  if (!IS_WINDOWS) {
    const server = candidates(country, mode)[0] || null;
    state.error = server ? 'Aperçu : la connexion réelle nécessite Windows' : `Aucun serveur ${mode} disponible pour ${countryName(country)}`;
    return;
  }
  if (state.connected) await disconnect(onProgress);
  if (mode === 'proxy') {
    const best = await fastestProxy(country, onProgress);
    if (!best) {
      state.error = `Aucun proxy ${countryName(country)} ne répond pour l'instant, réessaie ou change de pays`;
      return;
    }
    onProgress({ label: `Application du proxy ${best.server.ip}:${best.server.port} (${best.probe.ms} ms)…` });
    try {
      await setSystemProxy(best.server);
    } catch (error) {
      await restoreSystemProxy();
      state.error = `Proxy non appliqué : ${error.message}`;
      return;
    }
    Object.assign(state, { connected: true, mode, server: best.server, country, since: Date.now() });
    return;
  }
  // L2TP derrière une box (NAT) : Windows exige cette clé, active après redémarrage ; SSTP sert de secours immédiat.
  await cmd('reg.exe', ['add', 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\PolicyAgent', '/v', 'AssumeUDPEncapsulationContextOnSendRule', '/t', 'REG_DWORD', '/d', '2', '/f']);
  const errors = [];
  for (const server of candidates(country, 'vpn').slice(0, 4)) {
    for (const tunnel of ['Sstp', 'L2tp']) {
      const result = await windowsVpnConnect(server, tunnel, onProgress);
      if (result.ok) {
        Object.assign(state, { connected: true, mode, server, country, since: Date.now() });
        onProgress({ label: 'Connecté, vérification de ta nouvelle IP…' });
        return;
      }
      errors.push(`${server.ip} ${tunnel} : ${result.error}`);
    }
  }
  state.error = errors.length ? `Aucun serveur ${countryName(country)} n'a accepté la connexion (${errors[0]})` : `Aucun serveur VPN disponible pour ${countryName(country)}`;
}

async function disconnect(onProgress = () => {}, fetcher) {
  onProgress({ label: 'Déconnexion…' });
  if (IS_WINDOWS) {
    await cmd('rasdial.exe', [CONNECTION_NAME, '/disconnect'], 15000);
    await powershell(`Remove-VpnConnection -Name '${CONNECTION_NAME}' -Force -ErrorAction SilentlyContinue`, 20000);
    await restoreSystemProxy();
  }
  await releaseKillSwitch();
  Object.assign(state, { connected: false, mode: null, server: null, country: null, since: null, error: null });
  return status(fetcher);
}

const hasSession = () => state.connected || savedProxy !== null || state.killSwitchActive;

module.exports = { listServers, connect, disconnect, status, hasSession, countryName, setKillSwitch, bestCountry, CONNECTION_NAME };
