// Speed test intégré : latence, débit descendant et montant via les serveurs Cloudflare (speed.cloudflare.com).
const crypto = require('node:crypto');

const DOWN_URL = 'https://speed.cloudflare.com/__down?bytes=';
const UP_URL = 'https://speed.cloudflare.com/__up';
const LATENCY_SAMPLES = 8;
const DOWN_STREAMS = 6;
const UP_STREAMS = 3;
const PHASE_MS = 8000;
const CHUNK = 25_000_000;
const UP_BODY = crypto.randomBytes(2_000_000);

let running = false;

async function measureLatency(onProgress) {
  const samples = [];
  for (let index = 0; index < LATENCY_SAMPLES; index += 1) {
    const started = performance.now();
    try {
      await fetch(`${DOWN_URL}0&r=${Math.random()}`, { cache: 'no-store' });
      samples.push(performance.now() - started);
    } catch {
      // paquet perdu : ignoré pour la moyenne
    }
    onProgress({ phase: 'latency', value: samples.length ? Math.round(Math.min(...samples)) : null });
  }
  if (!samples.length) return { ms: null, jitter: null };
  const sorted = [...samples].sort((a, b) => a - b);
  let jitter = 0;
  for (let index = 1; index < samples.length; index += 1) jitter += Math.abs(samples[index] - samples[index - 1]);
  return { ms: Math.round(sorted[Math.floor(sorted.length / 2)]), jitter: Math.round(jitter / (samples.length - 1)) };
}

/** Lance `streams` transferts en parallèle pendant PHASE_MS et renvoie le débit en bits/s. */
async function measurePhase(phase, streams, transfer, onProgress) {
  const controller = new AbortController();
  let bytes = 0;
  const started = performance.now();
  const report = () => {
    const seconds = (performance.now() - started) / 1000;
    if (seconds > 0.5) onProgress({ phase, value: (bytes * 8) / seconds });
  };
  const ticker = setInterval(report, 250);
  const pending = new Set();
  const workers = Array.from({ length: streams }, async () => {
    while (!controller.signal.aborted) {
      const request = new AbortController();
      pending.add(request);
      try {
        await transfer(request.signal, (count) => { bytes += count; });
      } catch {
        if (controller.signal.aborted) return;
        await new Promise((resolve) => setTimeout(resolve, 300));
      } finally {
        pending.delete(request);
      }
    }
  });
  setTimeout(() => {
    controller.abort();
    for (const request of pending) request.abort();
  }, PHASE_MS);
  await Promise.all(workers);
  clearInterval(ticker);
  const seconds = (performance.now() - started) / 1000;
  return (bytes * 8) / seconds;
}

async function downloadOnce(signal, onBytes) {
  const response = await fetch(`${DOWN_URL}${CHUNK}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    onBytes(value.byteLength);
  }
}

async function uploadOnce(signal, onBytes) {
  const response = await fetch(UP_URL, { method: 'POST', body: UP_BODY, signal, headers: { 'Content-Type': 'application/octet-stream' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  onBytes(UP_BODY.byteLength);
}

async function speedTest(onProgress = () => {}) {
  if (running) return null;
  running = true;
  try {
    const startedAt = Date.now();
    const latency = await measureLatency(onProgress);
    const down = await measurePhase('down', DOWN_STREAMS, downloadOnce, onProgress);
    const up = await measurePhase('up', UP_STREAMS, uploadOnce, onProgress);
    return { at: startedAt, duration: Date.now() - startedAt, latency, down, up, server: 'Cloudflare' };
  } finally {
    running = false;
  }
}

module.exports = { speedTest };
