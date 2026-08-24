import { useState } from 'react';
import type { ThemeApi } from '../hooks/useTheme';
import { ACCENTS } from '../hooks/useTheme';
import { Icon } from './Icon';
import { ImportButtons } from './ImportButtons';
import { PRICE_EUR } from '../config';

interface Props {
  theme: ThemeApi;
  scanning: boolean;
  onFiles: (files: File[]) => void;
  onNative: (mode: 'folder' | 'files') => void;
  onLink: () => void;
  onEqualizer: () => void;
  onLicence: () => void;
  onAccount: () => void;
  onShare: () => void;
  sleepMinutes: number | null;
  onSleep: (minutes: number | null) => void;
  licenceLabel: string;
  /** Opens the owner wallet when the secret code matches. */
  onOwner: (code: string) => boolean;
  onClose: () => void;
}

const MODES: { key: ThemeApi['mode']; label: string; icon: 'moon' | 'sun' | 'system' }[] = [
  { key: 'dark', label: 'Sombre', icon: 'moon' },
  { key: 'light', label: 'Clair', icon: 'sun' },
  { key: 'system', label: 'Système', icon: 'system' },
];

const SLEEP = [10, 20, 30, 60];

export function SettingsSheet({
  theme,
  scanning,
  onFiles,
  onNative,
  onLink,
  onEqualizer,
  onLicence,
  onAccount,
  onShare,
  sleepMinutes,
  onSleep,
  licenceLabel,
  onOwner,
  onClose,
}: Props) {
  const [taps, setTaps] = useState(0);
  const [code, setCode] = useState('');

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="settings-sheet"
        onClick={(event) => event.stopPropagation()}
        aria-label="Réglages"
      >
        <div className="sheet-head">
          <h2>Réglages</h2>
          <button type="button" className="icon-button" onClick={onClose} title="Fermer">
            <Icon name="close" size={22} />
          </button>
        </div>

        <h3>Thème</h3>
        <div className="theme-modes">
          {MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              className={theme.mode === mode.key ? 'theme-mode active' : 'theme-mode'}
              onClick={() => theme.setMode(mode.key)}
            >
              <Icon name={mode.icon} size={26} />
              {mode.label}
            </button>
          ))}
        </div>

        <h3>Couleur</h3>
        <div className="accent-row">
          {ACCENTS.map((accent) => (
            <button
              key={accent.key}
              type="button"
              className={theme.accent.key === accent.key ? 'accent-dot active' : 'accent-dot'}
              style={{ background: accent.color }}
              onClick={() => theme.setAccent(accent.key)}
              title={accent.key}
              aria-label={`Couleur ${accent.key}`}
            />
          ))}
        </div>

        <h3>Bibliothèque</h3>
        <ImportButtons
          onFiles={onFiles}
          onNative={onNative}
          onLink={onLink}
          scanning={scanning}
        />

        <h3>Audio</h3>
        <button type="button" className="settings-row" onClick={onEqualizer}>
          <Icon name="equalizer" size={22} />
          Égaliseur et effets
        </button>

        <div className="sleep-row">
          <span>
            <Icon name="timer" size={20} /> Minuteur de sommeil
          </span>
          <span className="sleep-options">
            {SLEEP.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={sleepMinutes === minutes ? 'chip active' : 'chip'}
                onClick={() => onSleep(sleepMinutes === minutes ? null : minutes)}
              >
                {minutes} min
              </button>
            ))}
          </span>
        </div>

        <h3>Compte et licence</h3>
        <button type="button" className="settings-row" onClick={onAccount}>
          <Icon name="user" size={22} />
          Mon compte et sauvegarde Google Drive
        </button>
        <button type="button" className="settings-row" onClick={onLicence}>
          <Icon name="key" size={22} />
          {licenceLabel || `Débloquer Fox Media (${PRICE_EUR} €)`}
        </button>
        <button type="button" className="settings-row" onClick={onShare}>
          <Icon name="share" size={22} />
          Partager Fox Media (parrainage)
        </button>

        {/* Tapping this line 5 times reveals the owner-only wallet. */}
        <p
          className="hint"
          onClick={() => setTaps(taps + 1)}
        >
          Tes films et tes musiques restent sur ton appareil : Fox Media ne les envoie jamais en
          ligne.
        </p>

        {taps >= 5 && (
          <div className="wallet-form">
            <input
              type="password"
              placeholder="Code propriétaire"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (!onOwner(code)) setCode('');
              }}
            >
              Ouvrir MoneyFox
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
