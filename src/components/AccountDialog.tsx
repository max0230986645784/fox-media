import { useState } from 'react';
import { GOOGLE_CLIENT_ID, PRICE_EUR, SHARE_URL } from '../config';
import type { AccountApi } from '../hooks/useAccount';
import type { MediaItem } from '../types';
import { backupToDrive, restoreFromDrive } from '../lib/drive';

interface Props {
  api: AccountApi;
  items: MediaItem[];
  onRestore: (items: MediaItem[]) => Promise<number>;
  onClose: () => void;
}

function referralFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('ref')?.toUpperCase() ?? '';
  } catch {
    return '';
  }
}

/** Email + password only: no verification code, no email to click. */
export function AccountDialog({ api, items, onRestore, onClose }: Props) {
  const [mode, setMode] = useState<'signup' | 'login'>(api.account ? 'login' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referral, setReferral] = useState(referralFromUrl);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const account = api.account;
  const shareLink = account ? `${SHARE_URL}?ref=${account.referralCode}` : SHARE_URL;

  const submit = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result =
        mode === 'signup'
          ? await api.register(email, password, referral, name)
          : await api.login(email, password);
      setStatus(
        result.key
          ? 'Compte prêt et clé gratuite obtenue 🦊'
          : `Compte prêt. Il te faut une clé (${PRICE_EUR} €) ou un parrainage.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setBusy(false);
    }
  };

  const backup = async () => {
    setBusy(true);
    try {
      const count = await backupToDrive(items);
      setStatus(`${count} média(s) sauvegardés dans ton Google Drive.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sauvegarde impossible');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const restored = await restoreFromDrive();
      const added = await onRestore(restored);
      setStatus(`${added} média(s) restaurés depuis ton Drive.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Restauration impossible');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setStatus('Lien de parrainage copié !');
    } catch {
      setStatus(shareLink);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal licence-modal">
        <h2>{account ? 'Mon compte Fox Media' : 'Créer mon compte'}</h2>

        {account ? (
          <>
            <p className="licence-intro">
              Connecté en tant que <strong>{account.email}</strong>
              {account.plan && ` — clé ${account.plan}`}.
            </p>
            <label className="field">
              <span>Mon lien de parrainage ({account.referralsLeft} restant(s))</span>
              <input value={shareLink} readOnly onFocus={(event) => event.target.select()} />
            </label>
            <div className="licence-actions">
              <button type="button" className="button primary" onClick={copyLink}>
                Copier mon lien
              </button>
              <button type="button" className="button" onClick={api.logout}>
                Se déconnecter
              </button>
            </div>

            {GOOGLE_CLIENT_ID && (
              <>
                <p className="licence-intro">
                  Sauvegarde de ta bibliothèque (titres, artistes, pochettes) dans ton propre
                  Google Drive. Les fichiers restent sur ton appareil.
                </p>
                <div className="licence-actions">
                  <button type="button" className="button" disabled={busy} onClick={backup}>
                    Sauvegarder sur Drive
                  </button>
                  <button type="button" className="button" disabled={busy} onClick={restore}>
                    Restaurer depuis Drive
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="licence-intro">
              {mode === 'signup'
                ? 'Juste un email et un mot de passe, aucune vérification à faire.'
                : 'Content de te revoir.'}
            </p>
            {mode === 'signup' && (
              <label className="field">
                <span>Ton nom ou pseudo (signature de ta clé)</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex. Mathéo"
                  maxLength={40}
                />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span>Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
            {mode === 'signup' && (
              <label className="field">
                <span>Code de parrainage (optionnel — clé gratuite)</span>
                <input
                  value={referral}
                  onChange={(event) => setReferral(event.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                />
              </label>
            )}
            <div className="licence-actions">
              <button
                type="button"
                className="button primary"
                disabled={
                  busy ||
                  email.length === 0 ||
                  password.length === 0 ||
                  (mode === 'signup' && name.trim().length < 2)
                }
                onClick={submit}
              >
                {mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
              >
                {mode === 'signup' ? "J'ai déjà un compte" : 'Créer un compte'}
              </button>
            </div>
          </>
        )}

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
