import { useState } from 'react';
import { PRICE_EUR, SHARE_URL } from '../config';
import type { AccountApi } from '../hooks/useAccount';
import { openExternal } from '../lib/native';

interface Props {
  api: AccountApi;
  onClose: () => void;
}

/** Share sheet: referral link for friends and family, plus ready-made messages. */
export function ShareDialog({ api, onClose }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const account = api.account;
  const link = account ? `${SHARE_URL}?ref=${account.referralCode}` : SHARE_URL;
  const message = `Fox Media 🦊 : tes films, séries et musiques de ton téléphone dans un seul lecteur. Avec mon lien c'est gratuit : ${link}`;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Fox Media', text: message, url: link });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      setStatus('Message copié, colle-le où tu veux !');
    } catch {
      setStatus(message);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal licence-modal">
        <h2>Partager Fox Media</h2>
        <p className="licence-intro">
          {account
            ? `Chaque ami qui installe avec ton lien reçoit Fox Media gratuitement (${account.referralsLeft} parrainage(s) restant(s)).`
            : `Crée ton compte pour avoir ton lien de parrainage : tes amis auront Fox Media gratuit au lieu de ${PRICE_EUR} €.`}
          {api.referralDaysLeft !== null &&
            api.referralDaysLeft > 0 &&
            ` Il reste ${api.referralDaysLeft} jour(s) de parrainage.`}
        </p>

        <label className="field">
          <span>Lien à envoyer</span>
          <input value={link} readOnly onFocus={(event) => event.target.select()} />
        </label>

        <div className="licence-actions">
          <button type="button" className="button primary" onClick={share}>
            Partager
          </button>
          <button
            type="button"
            className="button"
            onClick={() =>
              openExternal(`https://wa.me/?text=${encodeURIComponent(message)}`)
            }
          >
            WhatsApp
          </button>
          <button
            type="button"
            className="button"
            onClick={() => openExternal(`mailto:?subject=Fox%20Media&body=${encodeURIComponent(message)}`)}
          >
            Email
          </button>
        </div>

        {status && <p className="licence-status">{status}</p>}

        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
