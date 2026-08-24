import { useCallback, useEffect, useState } from 'react';
import { FREE_MODE, LICENCE_SERVER, TRIAL_ITEM_LIMIT } from '../config';
import type { LicenceState } from '../lib/licence';
import { activateKey, adsFreeDaysLeft, adsRemoved, deviceId, loadLicence } from '../lib/licence';

export interface Licence {
  ready: boolean;
  licence: LicenceState | null;
  trialDaysLeft: number;
  /** True while the app is unlocked: paid key, founder key, or trial still open. */
  unlocked: boolean;
  /** Items allowed in the library; Infinity once a key is active. */
  itemLimit: number;
  /** True while an ad-free plan is running: no banner is rendered. */
  adsFree: boolean;
  /** Days left without ads; Infinity for the lifetime plan. */
  adsFreeDaysLeft: number;
  activate: (key: string) => Promise<{ ok: boolean; message: string }>;
  /** Free founder key: the holder signs it with a name or nickname. */
  claimFreeKey: (name: string, email: string) => Promise<{ ok: boolean; message: string }>;
}

export function useLicence(): Licence {
  const [ready, setReady] = useState(false);
  const [licence, setLicence] = useState<LicenceState | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadLicence()
      .then((snapshot) => {
        if (cancelled) return;
        setLicence(snapshot.licence);
        setTrialDaysLeft(snapshot.trialDaysLeft);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activate = useCallback(async (key: string) => {
    const result = await activateKey(key);
    if (result.licence) {
      setLicence(result.licence);
      return { ok: true, message: 'Clé activée, merci !' };
    }
    return { ok: false, message: result.error ?? 'Clé invalide' };
  }, []);

  const claimFreeKey = useCallback(async (name: string, email: string) => {
    if (!LICENCE_SERVER) {
      return { ok: false, message: "Le serveur de licences n'est pas configuré." };
    }
    if (name.trim().length < 2) {
      return { ok: false, message: 'Mets ton nom ou ton pseudo pour signer ta clé.' };
    }
    try {
      const response = await fetch(`${LICENCE_SERVER}/free-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          device: await deviceId(),
        }),
      });
      const data = (await response.json()) as { key?: string; error?: string };
      if (!response.ok || !data.key) {
        return { ok: false, message: data.error ?? 'Plus de clés gratuites disponibles.' };
      }
      const result = await activateKey(data.key);
      if (!result.licence) {
        return { ok: false, message: result.error ?? 'Clé refusée par la vérification.' };
      }
      setLicence(result.licence);
      return {
        ok: true,
        message: email.trim()
          ? `Clé founder activée et envoyée à ${email.trim()}, merci ${name.trim()} !`
          : `Clé founder activée, merci ${name.trim()} !`,
      };
    } catch {
      return { ok: false, message: 'Serveur de licences injoignable.' };
    }
  }, []);

  return {
    ready,
    licence,
    trialDaysLeft,
    unlocked: FREE_MODE || licence !== null || trialDaysLeft > 0,
    itemLimit:
      FREE_MODE || licence !== null ? Number.POSITIVE_INFINITY : TRIAL_ITEM_LIMIT,
    adsFree: adsRemoved(licence),
    adsFreeDaysLeft: adsFreeDaysLeft(licence),
    activate,
    claimFreeKey,
  };
}
