import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import type { PayoutMethod, Wallet } from '../hooks/useWallet';
import { NOADS_PLANS, PAYOUT_URL } from '../config';
import { openExternal } from '../lib/native';
import { Icon } from './Icon';

interface Props {
  wallet: Wallet;
  onClose: () => void;
}

function formatDate(value: number): string {
  return new Date(value).toLocaleDateString('fr-FR');
}

function euros(value: number): string {
  return value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

const METHODS: { key: PayoutMethod; label: string }[] = [
  { key: 'paypal', label: 'PayPal' },
  { key: 'carte', label: 'Carte' },
  { key: 'virement', label: 'Virement' },
];

/**
 * MoneyFox — owner-only screen: what the ad-free plans brought in, the QR code
 * buyers scan to pay, and every withdrawal.
 */
export function WalletSheet({ wallet, onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayoutMethod>('paypal');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payLink = PAYOUT_URL;

  useEffect(() => {
    if (!payLink) return;
    // Generated on the device: the QR code also shows up with no network.
    toDataURL(payLink, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [payLink]);

  const addNoAds = (price: number, months: number) => {
    wallet.add({
      advertiser: 'Sans pub',
      email: '',
      months,
      amount: price,
      startedAt: Date.now(),
      paid: true,
      kind: 'noads',
    });
  };

  const payout = () => {
    const value = Number(amount.replace(',', '.'));
    if (!(value > 0)) {
      setError('Entre un montant supérieur à 0 €.');
      return;
    }
    if (value > wallet.balance) {
      setError(`Tu ne peux pas retirer plus que ton solde (${euros(wallet.balance)}).`);
      return;
    }
    setError(null);
    wallet.withdraw(value, method, '');
    setAmount('');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="settings-sheet"
        onClick={(event) => event.stopPropagation()}
        aria-label="MoneyFox"
      >
        <div className="sheet-head">
          <h2>MoneyFox 🦊</h2>
          <button type="button" className="icon-button light" onClick={onClose} title="Fermer">
            <Icon name="close" size={22} />
          </button>
        </div>

        <div className="wallet-totals">
          <div>
            <strong>{euros(wallet.balance)}</strong>
            <span>Disponible</span>
          </div>
          <div>
            <strong>{euros(wallet.paidTotal)}</strong>
            <span>Encaissé</span>
          </div>
          <div>
            <strong>{euros(wallet.pendingTotal)}</strong>
            <span>En attente</span>
          </div>
          <div>
            <strong>{euros(wallet.payoutTotal)}</strong>
            <span>Retiré</span>
          </div>
        </div>

        <h3>Retirer sur ma carte ou PayPal</h3>
        <div className="wallet-form">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Montant en €"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <select value={method} onChange={(event) => setMethod(event.target.value as PayoutMethod)}>
            {METHODS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="primary" onClick={payout}>
            Retirer
          </button>
        </div>
        {error && <p className="licence-error">{error}</p>}
        {payLink ? (
          <button type="button" className="settings-row" onClick={() => openExternal(payLink)}>
            <Icon name="wallet" size={22} />
            Ouvrir {method === 'paypal' ? 'PayPal' : 'ma page de paiement'}
          </button>
        ) : (
          <p className="hint">
            Ajoute ton lien PayPal.me ou Stripe (VITE_PAYOUT_URL) pour encaisser et afficher le QR
            code.
          </p>
        )}

        {qr && (
          <>
            <h3>QR code de paiement</h3>
            <div className="wallet-qr">
              <img src={qr} alt="QR code de paiement" />
              <p className="hint">
                On scanne ce code pour te payer : l&apos;argent arrive sur ton compte.
              </p>
            </div>
          </>
        )}

        <h3>Encaisser un « sans pub »</h3>
        <div className="wallet-plans">
          {NOADS_PLANS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="pill"
              onClick={() => addNoAds(option.price, option.months)}
            >
              +{option.price} € · {option.label}
            </button>
          ))}
        </div>

        <h3>Ventes</h3>
        {wallet.sales.length === 0 ? (
          <p className="hint">Aucune vente pour le moment.</p>
        ) : (
          <ul className="wallet-list">
            {wallet.sales.map((sale) => (
              <li key={sale.id}>
                <span className="wallet-line">
                  <strong>{sale.advertiser}</strong>
                  <span>
                    {sale.months === 0 ? 'à vie' : `${sale.months} mois`} • {euros(sale.amount)} •
                    depuis {formatDate(sale.startedAt)}
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

        {wallet.payouts.length > 0 && (
          <>
            <h3>Retraits</h3>
            <ul className="wallet-list">
              {wallet.payouts.map((entry) => (
                <li key={entry.id}>
                  <span className="wallet-line">
                    <strong>{euros(entry.amount)}</strong>
                    <span>
                      {METHODS.find((option) => option.key === entry.method)?.label} •{' '}
                      {formatDate(entry.at)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="icon-button light"
                    onClick={() => wallet.removePayout(entry.id)}
                    title="Supprimer"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
