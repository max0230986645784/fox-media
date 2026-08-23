import { LICENCE_PUBLIC_KEY, LICENCE_SERVER, TRIAL_DAYS } from '../config';
import { nativeBridge } from './native';

export type LicencePlan = 'paid' | 'founder' | 'referral';

const PLANS: LicencePlan[] = ['paid', 'founder', 'referral'];

export interface LicencePayload {
  /** Licence id, printed on the receipt so you can revoke or support a buyer. */
  id: string;
  plan: LicencePlan;
  /** Buyer email, empty for anonymous founder keys. */
  email: string;
  /** Name or nickname the holder signed the key with. */
  name?: string;
  /** Issue date, epoch ms. */
  issuedAt: number;
}

export interface LicenceState {
  key: string;
  payload: LicencePayload;
}

export interface TrialState {
  startedAt: number;
}

interface StoredLicence {
  key?: string;
  trialStartedAt?: number;
  deviceId?: string;
  /** Last successful online re-check, epoch ms. */
  checkedAt?: number;
}

const STORAGE_KEY = 'fox-media.licence';
/** A key is re-checked online at most once a week; offline use keeps working. */
const RECHECK_MS = 7 * 86_400_000;

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Keys look like FOX-<base64url payload>-<base64url signature>. */
export function normalizeKey(input: string): string {
  return input.trim().replace(/\s+/g, '');
}

async function verifyKey(key: string): Promise<LicencePayload | null> {
  if (!LICENCE_PUBLIC_KEY) return null;
  const match = /^FOX-([A-Za-z0-9_-]+)-([A-Za-z0-9_-]+)$/.exec(normalizeKey(key));
  if (!match) return null;

  const [, encodedPayload, encodedSignature] = match;
  try {
    const publicKey = await crypto.subtle.importKey(
      'spki',
      base64ToBytes(LICENCE_PUBLIC_KEY) as unknown as ArrayBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const payloadBytes = base64UrlToBytes(encodedPayload);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlToBytes(encodedSignature) as unknown as ArrayBuffer,
      payloadBytes as unknown as ArrayBuffer,
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as LicencePayload;
    if (!PLANS.includes(payload.plan)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function readStore(): Promise<StoredLicence> {
  const bridge = nativeBridge();
  try {
    const raw = bridge ? await bridge.readLicence() : localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredLicence) : {};
  } catch {
    return {};
  }
}

async function writeStore(store: StoredLicence): Promise<void> {
  const bridge = nativeBridge();
  const raw = JSON.stringify(store);
  if (bridge) await bridge.writeLicence(raw);
  else localStorage.setItem(STORAGE_KEY, raw);
}

/** Stable per-install id, used to bind a key to its devices. */
function newDeviceId(): string {
  return crypto.randomUUID();
}

export async function deviceId(): Promise<string> {
  const store = await readStore();
  if (store.deviceId) return store.deviceId;
  const id = newDeviceId();
  await writeStore({ ...store, deviceId: id });
  return id;
}

async function callServer(
  route: 'activate' | 'validate',
  key: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!LICENCE_SERVER) return { ok: true };
  const device = await deviceId();
  const response = await fetch(`${LICENCE_SERVER}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: normalizeKey(key), device }),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return response.ok ? { ok: true } : { ok: false, error: data.error };
}

export interface LicenceSnapshot {
  licence: LicenceState | null;
  trial: TrialState;
  trialDaysLeft: number;
}

/** Loads the stored key (verifying it again) and starts the trial on first run. */
export async function loadLicence(): Promise<LicenceSnapshot> {
  const store = await readStore();
  const trialStartedAt = store.trialStartedAt ?? Date.now();
  if (!store.trialStartedAt) await writeStore({ ...store, trialStartedAt });

  const payload = store.key ? await verifyKey(store.key) : null;
  const elapsedDays = (Date.now() - trialStartedAt) / 86_400_000;

  // Revoked or over-shared keys are dropped, but only when the server actually
  // answers: no network must never lock a paying user out.
  let revoked = false;
  if (payload && store.key && LICENCE_SERVER && Date.now() - (store.checkedAt ?? 0) > RECHECK_MS) {
    try {
      const result = await callServer('validate', store.key);
      if (result.ok) await writeStore({ ...store, checkedAt: Date.now() });
      else revoked = true;
    } catch {
      revoked = false;
    }
  }
  if (revoked) {
    await writeStore({ ...store, key: undefined, checkedAt: Date.now() });
  }

  return {
    licence: payload && store.key && !revoked ? { key: store.key, payload } : null,
    trial: { startedAt: trialStartedAt },
    trialDaysLeft: Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays)),
  };
}

export interface ActivationResult {
  licence: LicenceState | null;
  error?: string;
}

/**
 * Verifies the signature locally, then binds the key to this device on the
 * server so a key posted online stops working after a couple of installs.
 */
export async function activateKey(key: string): Promise<ActivationResult> {
  const payload = await verifyKey(key);
  if (!payload) return { licence: null, error: 'Clé invalide' };

  const normalized = normalizeKey(key);
  if (LICENCE_SERVER) {
    try {
      const result = await callServer('activate', normalized);
      if (!result.ok) return { licence: null, error: result.error ?? 'Clé refusée' };
    } catch {
      return { licence: null, error: 'Serveur injoignable, réessaie connecté' };
    }
  }

  const store = await readStore();
  await writeStore({ ...store, key: normalized, checkedAt: Date.now() });
  return { licence: { key: normalized, payload } };
}
