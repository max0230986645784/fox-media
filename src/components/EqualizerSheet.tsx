import type { EqualizerApi } from '../hooks/useEqualizer';
import { BANDS, PRESETS } from '../hooks/useEqualizer';
import type { MediaItem } from '../types';
import { Icon } from './Icon';

interface Props {
  eq: EqualizerApi;
  current: MediaItem | null;
  isPlaying: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function label(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}K` : String(frequency);
}

export function EqualizerSheet({ eq, current, isPlaying, onToggle, onClose }: Props) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="eq-sheet"
        onClick={(event) => event.stopPropagation()}
        aria-label="Égaliseur"
      >
        {current && (
          <div className="eq-now">
            <span className="mini-cover">
              {current.cover ? <img src={current.cover} alt="" /> : <Icon name="album" size={22} />}
            </span>
            <span className="mini-text">
              <strong>{current.title}</strong>
              <span>{current.artist || 'Artiste inconnu'}</span>
            </span>
            <button type="button" className="icon-button light" onClick={onToggle} title="Lecture">
              <Icon name={isPlaying ? 'pause' : 'play'} size={24} />
            </button>
          </div>
        )}

        <div className="eq-head">
          <h2>Égaliseur</h2>
          <button
            type="button"
            className={eq.enabled ? 'switch on' : 'switch'}
            onClick={() => eq.setEnabled(!eq.enabled)}
            aria-pressed={eq.enabled}
            title="Activer l'égaliseur"
          >
            <span />
          </button>
        </div>

        {!eq.available && (
          <p className="hint">
            L'égaliseur n'est pas disponible sur ce fichier (format protégé par le navigateur).
          </p>
        )}

        <div className="eq-bands">
          {BANDS.map((frequency, index) => (
            <label key={frequency} className="eq-band">
              <span className="eq-gain">
                {(eq.gains[index] ?? 0) > 0 ? `+${eq.gains[index]}` : (eq.gains[index] ?? 0)}
              </span>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={eq.gains[index] ?? 0}
                onChange={(event) => eq.setGain(index, Number(event.target.value))}
                aria-label={`${label(frequency)} Hz`}
              />
              <span className="eq-freq">{label(frequency)}</span>
            </label>
          ))}
        </div>

        <label className="eq-bass">
          <span>Renfort de basses</span>
          <input
            type="range"
            min={0}
            max={12}
            step={1}
            value={eq.bass}
            onChange={(event) => eq.setBass(Number(event.target.value))}
          />
        </label>

        <div className="eq-head small">
          <span>Volume égalisé (évite les écarts entre morceaux)</span>
          <button
            type="button"
            className={eq.normalize ? 'switch on' : 'switch'}
            onClick={() => eq.setNormalize(!eq.normalize)}
            aria-pressed={eq.normalize}
            title="Égaliser le volume"
          >
            <span />
          </button>
        </div>

        <div className="eq-presets">
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              type="button"
              className={eq.preset === name ? 'preset active' : 'preset'}
              onClick={() => eq.setPreset(name)}
            >
              <Icon name="equalizer" size={20} />
              {name}
            </button>
          ))}
        </div>

        <button type="button" className="pill-button" onClick={onClose}>
          Fermer
        </button>
      </section>
    </div>
  );
}
