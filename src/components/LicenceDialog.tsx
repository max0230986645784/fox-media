import { useState } from 'react';
import { CHECKOUT_URL, NOADS_PLANS } from '../config';
import type { Licence } from '../hooks/useLicence';
import { openExternal } from '../lib/native';

interface Props {
  licence: Licence;
  /** Blocking mode: trial is over, the dialog cannot be dismissed. */
  locked: boolean;
  onClose: () => void;
}

export function LicenceDialog({ licence, locked, onClose }: Props) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    setBusy(true);
    setStatus(null);
    const result = await licence.activate(key);
    setBusy(false);
    setStatus(result.message);
    if (result.ok && !locked) onClose();
  };

  const claim = async () => {
    setBusy(true);
    setStatus(null);
    const result = await licence.claimFreeKey(name, email);
    setBusy(false);
    setStatus(result.message);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal licence-modal">
        <h2>Fox Media sans pub</h2>
        {licence.adsFree ? (
          <p className="licence-active">
            Sans pub{licence.licence?.payload.name ? ` pour ${licence.licence.payload.name}` : ''}{' '}
            {licence.adsFreeDaysLeft === Number.POSITIVE_INFINITY
              ? '— à vie, merci !'
              : `— ${licence.adsFreeDaysLeft} jour(s) restant(s), merci !`}
          </p>
        ) : (
          <>
            <p className="licence-intro">
              L&apos;appli est gratuite et complète, même sans réseau. Payer enlève seulement
              les pubs :
            </p>
            <ul className="plan-list">
              {NOADS_PLANS.map((plan) => (
                <li key={plan.id}>
                  <strong>{plan.price} €</strong> — {plan.label}
                </li>
              ))}
            </ul>
          </>
        )}

        <label className="field">
          <span>Ton nom ou pseudo (signature de la clé)</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. Mathéo"
            maxLength={40}
          />
        </label>

        <label className="field">
          <span>Ton email (la clé y est envoyée)</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="toi@exemple.com"
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>Clé de licence</span>
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="FOX-..."
            spellCheck={false}
          />
        </label>

        <div className="licence-actions">
          <button type="button" className="button primary" disabled={busy || key.length === 0} onClick={activate}>
            Activer
          </button>
          <button
            type="button"
            className="button"
            disabled={busy || name.trim().length < 2 || !email.includes('@')}
            onClick={claim}
          >
            Clé gratuite (founder)
          </button>
          {CHECKOUT_URL && !licence.adsFree && (
            <button type="button" className="button" onClick={() => openExternal(CHECKOUT_URL)}>
              Payer pour enlever les pubs
            </button>
          )}
        </div>

        {status && <p className="licence-status">{status}</p>}

        <div className="modal-actions">
          {locked && !licence.licence ? (
            <span className="hint">Une clé est nécessaire pour continuer.</span>
          ) : (
            <button type="button" className="button" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
