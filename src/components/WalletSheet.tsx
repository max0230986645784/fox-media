import { useState } from 'react';
import type { Wallet } from '../hooks/useWallet';
import { ADS_CONTACT, ADS_PAYMENT_URL, ADS_PLANS } from '../config';
import { openExternal } from '../lib/native';
import { Icon } from './Icon';

interface Props {
  wallet: Wallet;
  onClose: () => void;
}

function formatDate(value: number): string {
  return new Date(value).toLocaleDateString('fr-FR');
}

/** Owner-only screen: what advertisers owe, what they paid, and the offers. */
export function WalletSheet({ wallet, onClose }: Props) {
  const [advertiser, setAdvertiser] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState(ADS_PLANS[0]);

  const submit = () => {
    if (!advertiser.trim()) return;
    wallet.add({
      advertiser: advertiser.trim(),
      email: email.trim(),
      months: plan.months,
      amount: plan.price,
      startedAt: Date.now(),
      paid: false,
    });
    setAdvertiser('');
    setEmail('');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="settings-sheet"
        onClick={(event) => event.stopPropagation()}
        aria-label="Porte-monnaie"
      >
        <div className="sheet-head">
          <h2>Mon porte-monnaie</h2>
          <button type="button" className="icon-button light" onClick={onClose} title="Fermer">
            <Icon name="close" size={22} />
          </button>
        </div>

        <div className="wallet-totals">
          <div>
            <strong>{wallet.paidTotal.toFixed(2)} €</strong>
            <span>Encaissé</span>
          </div>
          <div>
            <strong>{wallet.pendingTotal.toFixed(2)} €</strong>
            <span>En attente</span>
          </div>
          <div>
            <strong>{wallet.activeCount}</strong>
            <span>Pubs en cours</span>
          </div>
        </div>

        <h3>Ajouter une pub vendue</h3>
        <div className="wallet-form">
          <input
            type="text"
            placeholder="Annonceur"
            value={advertiser}
            onChange={(event) => setAdvertiser(event.target.value)}
          />
          <input
            type="email"
            placeholder="Email de l'annonceur"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <select
            value={plan.months}
            onChange={(event) => {
              const months = Number(event.target.value);
              setPlan(ADS_PLANS.find((option) => option.months === months) ?? ADS_PLANS[0]);
            }}
          >
            {ADS_PLANS.map((option) => (
              <option key={option.months} value={option.months}>
                {option.months} mois — {option.price} €
              </option>
            ))}
          </select>
          <button type="button" className="primary" onClick={submit}>
            Enregistrer
          </button>
        </div>

        <h3>Ventes</h3>
        {wallet.sales.length === 0 ? (
          <p className="hint">
            Aucune pub vendue. Les annonceurs te contactent sur {ADS_CONTACT}.
          </p>
        ) : (
          <ul className="wallet-list">
            {wallet.sales.map((sale) => (
              <li key={sale.id}>
                <span className="wallet-line">
                  <strong>{sale.advertiser}</strong>
                  <span>
                    {sale.months} mois • {sale.amount.toFixed(2)} € • depuis{' '}
                    {formatDate(sale.startedAt)}
                  </span>
                  {sale.email && <span className="hint">{sale.email}</span>}
                </span>
                <button
                  type="button"
                  className={sale.paid ? 'pill on' : 'pill'}
                  onClick={() => wallet.togglePaid(sale.id)}
                >
                  {sale.paid ? 'Payé' : 'À encaisser'}
                </button>
                <button
                  type="button"
                  className="icon-button light"
                  onClick={() => wallet.remove(sale.id)}
                  title="Supprimer"
                >
                  <Icon name="close" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {ADS_PAYMENT_URL && (
          <button type="button" className="primary" onClick={() => openExternal(ADS_PAYMENT_URL)}>
            Ouvrir ma page de paiement
          </button>
        )}
      </section>
    </div>
  );
}
