const api = window.noxBooster;
const $ = (id) => document.getElementById(id);

const history = [];
const MAX_POINTS = 90;
let currentState = null;
let scanItems = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatSpeed(bytesPerSecond) {
  const mbps = (bytesPerSecond * 8) / 1_000_000;
  return `${mbps >= 100 ? mbps.toFixed(0) : mbps.toFixed(1)} Mb/s`;
}

function formatBytes(bytes) {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} Go`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} Mo`;
  return `${Math.round(bytes / 1e3)} Ko`;
}

function pingClass(ms) {
  if (ms === null) return 'bad';
  if (ms <= 40) return 'good';
  if (ms <= 90) return 'meh';
  return 'bad';
}

// ---- Réglages appliqués ------------------------------------------------------

async function renderTweaks() {
  const { tweaks, antiCrash } = await api.tweaks();
  for (const list of ['network', 'download', 'fps', 'anticrash']) $(`list-${list}`).replaceChildren();
  for (const tweak of tweaks) {
    const li = el('li');
    li.dataset.id = tweak.id;
    li.append(el('span', 'dot'), el('span', '', tweak.label));
    $(`list-${tweak.group}`).append(li);
  }
  for (const step of antiCrash) {
    const li = el('li');
    li.dataset.id = step.id;
    li.append(el('span', 'dot'), el('span', '', step.label));
    $('list-anticrash').append(li);
  }
  const dns = el('li');
  dns.dataset.id = 'dns';
  dns.append(el('span', 'dot'), el('span', '', 'DNS rapides sur la carte réseau active'));
  $('list-network').append(dns);
}

function markProgress(entry) {
  const li = document.querySelector(`li[data-id="${entry.id}"]`);
  if (!li) return;
  li.classList.remove('ok', 'ko', 'skip');
  li.classList.add(entry.skipped ? 'skip' : entry.ok ? 'ok' : 'ko');
  if (entry.id === 'dns' && entry.label) li.lastChild.textContent = entry.label;
}

function renderState(state) {
  currentState = state;
  const button = $('boost-btn');
  button.classList.toggle('active', state.boosted);
  button.classList.toggle('busy', state.boosting);
  button.disabled = state.boosting;
  $('boost-hint').textContent = state.boosting
    ? 'Optimisation en cours…'
    : state.boosted
      ? state.platform === 'win32' ? 'Boost actif · cliquer pour réappliquer' : 'Aperçu : rien appliqué hors Windows'
      : 'Cliquer pour optimiser';
  $('version').textContent = `v${state.version}`;
  const admin = $('admin-badge');
  if (state.platform !== 'win32') {
    admin.textContent = 'Aperçu (Windows requis)';
    admin.className = 'badge warn';
  } else if (state.admin) {
    admin.textContent = 'Mode administrateur';
    admin.className = 'badge ok';
  } else {
    admin.textContent = 'Relance en administrateur pour tout appliquer';
    admin.className = 'badge warn';
  }
  $('game').textContent = state.games.length ? state.games.join(', ') : 'aucun';
  for (const entry of state.lastReport) markProgress(entry);
  if (!state.lastReport.length && !state.boosting) {
    document.querySelectorAll('.tweaks li').forEach((li) => li.classList.remove('ok', 'ko', 'skip'));
  }
  $('opt-autostart').checked = state.settings.autoStart;
  $('opt-autoboost').checked = state.settings.autoBoost;
  $('opt-anticrash').checked = state.settings.antiCrash;
  $('opt-hogs').checked = state.settings.closeHogs;
  $('opt-killswitch').checked = Boolean(state.settings.killSwitch);
  $('opt-dns').value = state.settings.dns;
  $('opt-hosts').value = state.settings.pingHosts.join(', ');
  $('ping-hosts').textContent = state.settings.pingHosts.join(' · ');
}

// ---- Métriques et graphique --------------------------------------------------

function renderMetrics(metrics) {
  const values = metrics.pings.map((p) => p.ms).filter((ms) => ms !== null);
  const best = values.length ? Math.min(...values) : null;
  history.push(best);
  if (history.length > MAX_POINTS) history.shift();

  const pingNow = $('ping-now');
  pingNow.textContent = best === null ? 'perte' : `${best} ms`;
  pingNow.className = `v ${pingClass(best)}`;
  $('ping-detail').textContent = metrics.pings.map((p) => `${p.host}: ${p.ms === null ? 'x' : `${p.ms} ms`}`).join('  ·  ');

  const recent = history.slice(-15).filter((ms) => ms !== null);
  if (recent.length >= 3) {
    let jitter = 0;
    for (let index = 1; index < recent.length; index += 1) jitter += Math.abs(recent[index] - recent[index - 1]);
    jitter = Math.round(jitter / (recent.length - 1));
    const node = $('jitter');
    node.textContent = `${jitter} ms`;
    node.className = `v ${jitter <= 5 ? 'good' : jitter <= 15 ? 'meh' : 'bad'}`;
    const lost = history.slice(-30).filter((ms) => ms === null).length;
    $('jitter-detail').textContent = lost ? `${lost} paquet(s) perdu(s) sur la dernière minute` : 'aucune perte de paquet';
  }

  $('down').textContent = formatSpeed(metrics.traffic.down);
  $('up').textContent = `↑ ${formatSpeed(metrics.traffic.up)}`;
  drawChart();
}

function drawChart() {
  const canvas = $('chart');
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const valid = history.filter((ms) => ms !== null);
  const max = Math.max(60, ...valid) * 1.15;
  const step = width / (MAX_POINTS - 1);

  ctx.strokeStyle = '#262638';
  ctx.lineWidth = 1;
  for (const guide of [20, 50, 100]) {
    if (guide > max) continue;
    const y = height - (guide / max) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = '#8c8ca3';
    ctx.font = '11px Segoe UI, sans-serif';
    ctx.fillText(`${guide} ms`, 6, y - 4);
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.45)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.beginPath();
  let started = false;
  history.forEach((ms, index) => {
    if (ms === null) return;
    const x = index * step;
    const y = height - (ms / max) * height;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineTo((history.length - 1) * step, height);
  ctx.lineTo(0, height);
  ctx.fillStyle = gradient;
  ctx.fill();

  history.forEach((ms, index) => {
    if (ms !== null) return;
    ctx.fillStyle = '#ff5c5c';
    ctx.fillRect(index * step - 1, 0, 3, height);
  });
}

// ---- Scanner de virus --------------------------------------------------------

function selectedIds() {
  return [...document.querySelectorAll('#threats input[type=checkbox]:checked')].map((box) => box.dataset.id);
}

function updateQuarantineButton() {
  $('quarantine-btn').disabled = selectedIds().length === 0;
}

function renderThreats() {
  const list = $('threats');
  list.replaceChildren();
  $('scan-results').classList.remove('hidden');
  if (!scanItems.length) {
    list.append(el('li', 'empty', 'Aucune menace trouvée dans tes dossiers et applications.'));
    $('select-all').parentElement.classList.add('hidden');
    updateQuarantineButton();
    return;
  }
  $('select-all').parentElement.classList.remove('hidden');
  const order = { high: 0, medium: 1, low: 2 };
  for (const item of [...scanItems].sort((a, b) => order[a.severity] - order[b.severity])) {
    const li = el('li');
    if (item.handled) li.classList.add('handled');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.id = item.id;
    box.checked = item.severity === 'high' && !item.handled;
    box.addEventListener('change', updateQuarantineButton);
    const info = el('div');
    info.append(el('div', 'name', item.name), el('div', 'reason', `${item.reason} — ${item.source}`), el('div', 'path', item.type === 'registry' ? `${item.key} → ${item.command}` : item.path));
    const sev = el('span', `sev ${item.severity}`, item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'suspect' : 'info');
    li.append(box, info, sev);
    list.append(li);
  }
  $('select-all').checked = false;
  updateQuarantineButton();
}

async function renderQuarantine() {
  const items = await api.quarantineList();
  $('quarantine-count').textContent = items.length;
  const list = $('quarantine-list');
  list.replaceChildren();
  if (!items.length) {
    list.append(el('li', 'muted', 'Rien en quarantaine.'));
    return;
  }
  for (const item of items) {
    const li = el('li');
    const info = el('div');
    info.append(el('div', 'name', item.name), el('div', 'path', item.type === 'registry' ? `${item.key} → ${item.command}` : item.path));
    const actions = el('div');
    const restore = el('button', 'mini secondary', 'Restaurer');
    restore.addEventListener('click', async () => {
      await api.quarantineRestore(item.metaFile);
      renderQuarantine();
    });
    const remove = el('button', 'mini danger', 'Supprimer définitivement');
    remove.addEventListener('click', async () => {
      await api.quarantineDelete(item.metaFile);
      renderQuarantine();
    });
    actions.append(restore, document.createTextNode(' '), remove);
    li.append(el('span'), info, actions);
    list.append(li);
  }
}

async function runScan() {
  const button = $('scan-btn');
  button.disabled = true;
  $('scan-status').textContent = 'Préparation…';
  $('scan-results').classList.add('hidden');
  const result = await api.scan({ defenderQuickScan: $('opt-defender').checked });
  button.disabled = false;
  if (!result) {
    $('scan-status').textContent = 'Une analyse est déjà en cours.';
    return;
  }
  scanItems = result.items;
  $('scan-status').textContent = `${result.scanned.toLocaleString('fr-FR')} éléments analysés en ${Math.round(result.duration / 1000)} s · ${result.items.length} trouvé(s)`;
  renderThreats();
}

async function runQuarantine() {
  const ids = selectedIds();
  if (!ids.length) return;
  $('quarantine-btn').disabled = true;
  const results = await api.quarantine(ids);
  const done = new Set(results.filter((r) => r.ok).map((r) => r.id));
  const failed = results.filter((r) => !r.ok);
  scanItems = scanItems.filter((item) => !done.has(item.id));
  renderThreats();
  renderQuarantine();
  $('scan-status').textContent = failed.length
    ? `${done.size} mis en quarantaine, ${failed.length} impossible(s) : ${failed[0].error}`
    : `${done.size} élément(s) mis en quarantaine (restaurables plus bas).`;
}

// ---- Speed test --------------------------------------------------------------

const mbps = (bitsPerSecond) => (bitsPerSecond / 1e6).toFixed(bitsPerSecond >= 1e8 ? 0 : 1);

function renderSpeedProgress(step) {
  if (step.phase === 'latency') {
    $('speed-status').textContent = 'Mesure de la latence…';
    if (step.value !== null) $('speed-ping').textContent = step.value;
  } else {
    const isDown = step.phase === 'down';
    $('speed-status').textContent = isDown ? 'Téléchargement en cours…' : 'Envoi en cours…';
    $(isDown ? 'speed-down' : 'speed-up').textContent = mbps(step.value);
    $('speed-bar').style.width = `${Math.round((isDown ? 0 : 50) + (step.progress || 0) * 50)}%`;
  }
}

async function runSpeedTest() {
  const button = $('speed-btn');
  button.disabled = true;
  for (const id of ['speed-down', 'speed-up', 'speed-ping']) $(id).textContent = '…';
  $('speed-jitter').textContent = 'ms';
  $('speed-bar').style.width = '0%';
  const result = await api.speedTest();
  button.disabled = false;
  if (!result) {
    $('speed-status').textContent = 'Un test est déjà en cours.';
    return;
  }
  $('speed-down').textContent = mbps(result.down);
  $('speed-up').textContent = mbps(result.up);
  $('speed-ping').textContent = result.latency.ms === null ? 'perte' : result.latency.ms;
  $('speed-jitter').textContent = result.latency.jitter === null ? 'ms' : `ms · jitter ${result.latency.jitter} ms`;
  $('speed-bar').style.width = '100%';
  $('speed-status').textContent = `${result.server} · ${new Date(result.at).toLocaleTimeString('fr-FR')}`;
}

// ---- Nox VPN -----------------------------------------------------------------

let vpnServers = null;
let vpnBusy = false;

function fillCountries() {
  const select = $('vpn-country');
  const mode = $('vpn-mode').value;
  const wanted = select.value || (currentState && currentState.settings.vpnCountry) || 'FR';
  select.replaceChildren();
  if (!vpnServers || !vpnServers.countries.length) {
    select.append(new Option(vpnServers && vpnServers.errors.length ? 'Serveurs indisponibles (hors ligne ?)' : 'Chargement des serveurs…', ''));
    return;
  }
  const list = vpnServers.countries.filter((country) => country[mode] > 0);
  for (const country of list) {
    select.append(new Option(`${country.name} · ${country[mode]} serveur${country[mode] > 1 ? 's' : ''}`, country.code));
  }
  if (!list.length) select.append(new Option('Aucun serveur pour ce mode, réessaie plus tard', ''));
  select.value = list.some((country) => country.code === wanted) ? wanted : list.length ? list[0].code : '';
  const other = mode === 'vpn' ? 'proxy' : 'vpn';
  const missing = (currentState && currentState.settings.vpnCountry) || 'FR';
  if (select.value !== missing && vpnServers.countries.some((country) => country.code === missing && country[other] > 0)) {
    $('vpn-status').textContent = `${vpnServers.countries.find((country) => country.code === missing).name} : dispo dans l'autre mode`;
  }
}

async function loadVpnServers(force = false) {
  $('vpn-refresh').disabled = true;
  vpnServers = await api.vpnServers(force);
  $('vpn-refresh').disabled = false;
  fillCountries();
  if (vpnServers.errors.length) $('vpn-status').textContent = vpnServers.errors.join(' · ');
  else if (!$('vpn-status').textContent) $('vpn-status').textContent = `${vpnServers.total} serveurs gratuits trouvés dans ${vpnServers.countries.length} pays`;
}

function renderVpn(status) {
  const badge = $('vpn-badge');
  const button = $('vpn-btn');
  const country = status.country ? (vpnServers && vpnServers.countries.find((c) => c.code === status.country)) : null;
  if (status.connecting || vpnBusy) {
    badge.textContent = 'Connexion…';
    badge.className = 'badge busy';
  } else if (status.connected) {
    badge.textContent = `Connecté · ${country ? country.name : status.country}${status.mode === 'proxy' ? ' (navigateur)' : ''}`;
    badge.className = 'badge on';
  } else {
    badge.textContent = 'Déconnecté';
    badge.className = 'badge muted';
  }
  button.textContent = status.connected ? 'Se déconnecter' : 'Se connecter';
  button.classList.toggle('primary', !status.connected);
  button.classList.toggle('danger', status.connected);
  button.disabled = Boolean(status.connecting || vpnBusy);
  $('vpn-country').disabled = Boolean(status.connected);
  $('vpn-mode').disabled = Boolean(status.connected);
  if (status.ip) {
    $('vpn-ip').textContent = status.ip.ip;
    $('vpn-ip-where').textContent = `${status.ip.city ? `${status.ip.city}, ` : ''}${status.ip.countryName}`;
  } else {
    $('vpn-ip').textContent = 'IP inconnue';
    $('vpn-ip-where').textContent = 'pas de connexion Internet ?';
  }
  if (status.error) $('vpn-status').textContent = status.error;
  else if (status.connected && status.server) $('vpn-status').textContent = `Serveur ${status.server.ip}${status.server.port ? `:${status.server.port}` : ''}`;
}

async function toggleVpn() {
  if (vpnBusy) return;
  vpnBusy = true;
  const status = await api.vpnStatus();
  renderVpn(status);
  let next;
  if (status.connected) {
    next = await api.vpnDisconnect();
    $('vpn-status').textContent = 'Déconnecté, IP d’origine rétablie.';
  } else {
    const country = $('vpn-country').value;
    if (!country) {
      vpnBusy = false;
      renderVpn(status);
      return;
    }
    $('vpn-status').textContent = 'Recherche du meilleur serveur…';
    next = await api.vpnConnect({ country, mode: $('vpn-mode').value });
  }
  vpnBusy = false;
  renderVpn(next);
}

// ---- Bouclier Nox ------------------------------------------------------------

let shieldBusy = false;

function renderShield(status) {
  const preview = status.platform !== 'win32';
  const ad = $('adblock-badge');
  ad.textContent = status.adblock.enabled ? `Actif · ${status.adblock.count.toLocaleString('fr-FR')} domaines` : 'Inactif';
  ad.className = `badge ${status.adblock.enabled ? 'on' : 'muted'}`;
  $('adblock-btn').textContent = status.adblock.enabled ? 'Désactiver' : 'Activer';
  $('adblock-btn').classList.toggle('primary', !status.adblock.enabled);
  $('adblock-btn').classList.toggle('secondary', status.adblock.enabled);
  if (status.adblock.updatedAt) $('adblock-detail').textContent = `Listes du ${new Date(status.adblock.updatedAt).toLocaleDateString('fr-FR')}`;

  const fw = $('firewall-badge');
  fw.textContent = status.firewall.enabled ? 'Actif · PC invisible' : preview ? 'Aperçu' : 'Inactif';
  fw.className = `badge ${status.firewall.enabled ? 'on' : 'muted'}`;
  $('firewall-btn').textContent = status.firewall.enabled ? 'Désactiver' : 'Activer';
  $('firewall-btn').classList.toggle('primary', !status.firewall.enabled);
  $('firewall-btn').classList.toggle('secondary', status.firewall.enabled);
  const list = $('firewall-steps');
  if (!list.children.length) {
    for (const step of status.firewall.steps) {
      const li = el('li');
      li.dataset.id = `shield-${step.id}`;
      li.append(el('span', 'dot'), el('span', '', step.label));
      list.append(li);
    }
  }
  if (status.firewall.enabled) list.querySelectorAll('li').forEach((li) => li.classList.add('ok'));
}

async function toggleShield(kind) {
  if (shieldBusy) return;
  shieldBusy = true;
  const status = await api.shieldStatus();
  const enabled = kind === 'adblock' ? status.adblock.enabled : status.firewall.enabled;
  const button = $(`${kind}-btn`);
  const detail = $(`${kind}-detail`);
  button.disabled = true;
  detail.textContent = enabled ? 'Désactivation…' : 'Activation…';
  const result = kind === 'adblock' ? await api.shieldAdblock(!enabled) : await api.shieldFirewall(!enabled);
  button.disabled = false;
  shieldBusy = false;
  if (kind === 'adblock') {
    detail.textContent = result.ok
      ? `${result.count.toLocaleString('fr-FR')} domaines bloqués`
      : result.error || 'Erreur';
    if (result.skipped && result.count) detail.textContent = `Aperçu : ${result.count.toLocaleString('fr-FR')} domaines téléchargés, hosts modifié uniquement sous Windows`;
  } else {
    for (const entry of result.report) {
      const li = document.querySelector(`li[data-id="shield-${entry.id}"]`);
      if (!li) continue;
      li.classList.remove('ok', 'ko', 'skip');
      li.classList.add(entry.skipped ? 'skip' : entry.ok ? 'ok' : 'ko');
    }
    const failed = result.report.filter((entry) => !entry.ok && !entry.skipped);
    detail.textContent = result.report.every((entry) => entry.skipped)
      ? 'Aperçu : les règles pare-feu ne s’appliquent que sous Windows'
      : failed.length ? `${failed.length} étape(s) refusée(s) : lance en administrateur` : enabled ? 'Règles retirées, réglages Windows par défaut' : 'PC protégé et invisible sur le réseau';
    if (enabled) $('firewall-steps').querySelectorAll('li').forEach((li) => li.classList.remove('ok'));
  }
  renderShield(result.status);
}

// ---- Boutons -----------------------------------------------------------------

$('boost-btn').addEventListener('click', async () => {
  document.querySelectorAll('.tweaks li').forEach((li) => li.classList.remove('ok', 'ko', 'skip'));
  await api.boost();
});

$('restore-btn').addEventListener('click', async () => {
  if (!window.confirm('Remettre les réglages Windows par défaut ? Le boost sera désactivé.')) return;
  await api.restore();
});

$('repair-btn').addEventListener('click', async () => {
  if (!window.confirm('Lancer DISM + SFC ? Cela peut prendre 10 à 20 minutes, laisse le PC allumé.')) return;
  const button = $('repair-btn');
  button.disabled = true;
  button.textContent = 'Réparation en cours…';
  const result = await api.repair();
  button.disabled = false;
  button.textContent = 'Réparer les fichiers système (long)';
  window.alert(result && result.ok ? 'Réparation terminée. Redémarre le PC si des fichiers ont été corrigés.' : 'Réparation impossible (droits administrateur requis).');
});

$('save-btn').addEventListener('click', async () => {
  const settings = await api.saveSettings({
    autoStart: $('opt-autostart').checked,
    autoBoost: $('opt-autoboost').checked,
    antiCrash: $('opt-anticrash').checked,
    closeHogs: $('opt-hogs').checked,
    killSwitch: $('opt-killswitch').checked,
    dns: $('opt-dns').value,
    pingHosts: $('opt-hosts').value.split(','),
  });
  $('opt-hosts').value = settings.pingHosts.join(', ');
  $('ping-hosts').textContent = settings.pingHosts.join(' · ');
  history.length = 0;
  const button = $('save-btn');
  button.textContent = 'Enregistré';
  setTimeout(() => { button.textContent = 'Enregistrer'; }, 1500);
});

$('speed-btn').addEventListener('click', runSpeedTest);
$('adblock-btn').addEventListener('click', () => toggleShield('adblock'));
$('firewall-btn').addEventListener('click', () => toggleShield('firewall'));
$('vpn-btn').addEventListener('click', toggleVpn);
$('vpn-refresh').addEventListener('click', () => loadVpnServers(true));
$('vpn-mode').addEventListener('change', fillCountries);
$('scan-btn').addEventListener('click', runScan);
$('quarantine-btn').addEventListener('click', runQuarantine);
$('select-all').addEventListener('change', (event) => {
  document.querySelectorAll('#threats input[type=checkbox]').forEach((box) => { box.checked = event.target.checked; });
  updateQuarantineButton();
});

api.onStatus(renderState);
api.onProgress(markProgress);
api.onMetrics(renderMetrics);
api.onScanProgress((step) => { $('scan-status').textContent = step.label; });
api.onSpeedTestProgress(renderSpeedProgress);
api.onVpnProgress((step) => { $('vpn-status').textContent = step.label; });
api.onShieldProgress((step) => { $('shield-status').textContent = step.label; });

(async () => {
  await renderTweaks();
  renderState(await api.getState());
  $('vpn-mode').value = currentState.settings.vpnMode;
  renderQuarantine();
  api.shieldStatus().then(renderShield);
  drawChart();
  loadVpnServers().then(() => api.vpnStatus()).then(renderVpn);
  setInterval(async () => { if (!vpnBusy) renderVpn(await api.vpnStatus()); }, 30000);
})();
