import { useEffect, useRef, useState } from 'react';
import type { AudioPlayer } from '../hooks/useAudioPlayer';
import type { EqualizerApi } from '../hooks/useEqualizer';
import type { MediaItem } from '../types';
import { coverInitials, fallbackCover } from '../lib/cover';
import { dominantColor } from '../lib/dominant';
import { formatTime } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  player: AudioPlayer;
  equalizer: EqualizerApi;
  items: MediaItem[];
  onClose: () => void;
  onEdit: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onLyrics: (id: string, lyrics: string) => void;
  onEqualizer: () => void;
}

const BAR_COUNT = 40;
const IDLE_BARS = Array.from({ length: BAR_COUNT }, (_, index) => 18 + ((index * 37) % 70));

export function FullPlayer({
  player,
  equalizer,
  items,
  onClose,
  onEdit,
  onToggleFavorite,
  onLyrics,
  onEqualizer,
}: Props) {
  const [panel, setPanel] = useState<'none' | 'lyrics' | 'queue' | 'speed'>('none');
  const [draft, setDraft] = useState('');
  const bars = useRef<HTMLDivElement | null>(null);
  const [tint, setTint] = useState<string | null>(null);

  // The background follows the artwork colours, like Lark Player does.
  const cover = player.current?.cover;
  useEffect(() => {
    if (!cover) {
      setTint(null);
      return;
    }
    let alive = true;
    void dominantColor(cover).then((colour) => {
      if (alive) setTint(colour);
    });
    return () => {
      alive = false;
    };
  }, [cover]);

  // The waveform is driven by the real audio spectrum, so it reacts to the
  // music instead of animating blindly.
  const { levels } = equalizer;
  const playing = player.isPlaying;
  useEffect(() => {
    const host = bars.current;
    if (!host || !playing) return;
    const data = new Float32Array(BAR_COUNT);
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (!levels(data)) return;
      const children = host.children;
      for (let index = 0; index < children.length; index += 1) {
        const bar = children[index];
        if (bar instanceof HTMLElement) {
          bar.style.height = `${Math.max(6, data[index] * 100)}%`;
        }
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [levels, playing]);

  const current = player.current;
  if (!current) return null;

  const played = player.duration > 0 ? player.time / player.duration : 0;
  const queueItems = player.queue
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is MediaItem => Boolean(item));

  return (
    <div
      className="full-player"
      style={
        tint
          ? { background: `linear-gradient(180deg, ${tint} -10%, #06070b 62%)` }
          : undefined
      }
    >
      <div className="full-top">
        <button type="button" className="icon-button light" onClick={onClose} title="Réduire">
          <Icon name="down" size={26} />
        </button>
        <button
          type="button"
          className="icon-button light"
          onClick={() => onEdit(current.id)}
          title="Modifier les infos"
        >
          <Icon name="edit" size={22} />
        </button>
      </div>

      <div
        className="full-cover"
        style={current.cover ? undefined : { background: fallbackCover(current.id) }}
      >
        {current.cover ? (
          <img src={current.cover} alt="" />
        ) : (
          <span className="cover-initials big">{coverInitials(current.title)}</span>
        )}
      </div>

      <h2 className="full-title">{current.title}</h2>
      <div className="full-sub">
        <span>{current.artist || 'Artiste inconnu'}</span>
        <button
          type="button"
          className="icon-button light"
          onClick={() => onToggleFavorite(current.id)}
          title="Favori"
        >
          <Icon name={current.favorite ? 'heart-filled' : 'heart'} size={22} />
        </button>
      </div>

      <div className={playing ? 'waveform live' : 'waveform'} aria-hidden="true" ref={bars}>
        {IDLE_BARS.map((height, index) => (
          <span
            key={index}
            className={index / BAR_COUNT <= played ? 'wave on' : 'wave'}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <input
        className="full-seek"
        type="range"
        min={0}
        max={Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0}
        value={player.time}
        onChange={(event) => player.seek(Number(event.target.value))}
        aria-label="Position"
      />
      <div className="full-times">
        <span>{formatTime(player.time)}</span>
        <span>{formatTime(player.duration)}</span>
      </div>

      <div className="full-controls">
        <button
          type="button"
          className={player.shuffle ? 'icon-button light active' : 'icon-button light'}
          onClick={player.toggleShuffle}
          title="Aléatoire"
        >
          <Icon name="shuffle" size={22} />
        </button>
        <button type="button" className="icon-button light big" onClick={player.previous} title="Précédent">
          <Icon name="previous" size={38} />
        </button>
        <button type="button" className="play-button" onClick={player.toggle} title="Lecture">
          <Icon name={player.isPlaying ? 'pause' : 'play'} size={44} />
        </button>
        <button type="button" className="icon-button light big" onClick={player.next} title="Suivant">
          <Icon name="next" size={38} />
        </button>
        <button
          type="button"
          className={player.repeat === 'off' ? 'icon-button light' : 'icon-button light active'}
          onClick={player.cycleRepeat}
          title="Répéter"
        >
          <Icon name={player.repeat === 'one' ? 'repeat-one' : 'repeat'} size={22} />
        </button>
      </div>

      <div className="full-bottom">
        <button type="button" className="icon-button light" onClick={onEqualizer} title="Égaliseur">
          <Icon name="equalizer" size={22} />
        </button>
        <button
          type="button"
          className={panel === 'lyrics' ? 'pill-button primary' : 'pill-button'}
          onClick={() => setPanel(panel === 'lyrics' ? 'none' : 'lyrics')}
        >
          <Icon name="lyrics" size={18} />
          Paroles
        </button>
        <button
          type="button"
          className={player.rate === 1 ? 'pill-button' : 'pill-button primary'}
          onClick={() => setPanel(panel === 'speed' ? 'none' : 'speed')}
          title="Vitesse de lecture"
        >
          <Icon name="speed" size={18} />
          {player.rate}×
        </button>
        <button
          type="button"
          className={panel === 'queue' ? 'icon-button light active' : 'icon-button light'}
          onClick={() => setPanel(panel === 'queue' ? 'none' : 'queue')}
          title="File d'attente"
        >
          <Icon name="queue" size={22} />
        </button>
      </div>

      {panel === 'speed' && (
        <div className="full-panel row">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
            <button
              key={value}
              type="button"
              className={value === player.rate ? 'chip active' : 'chip'}
              onClick={() => player.setRate(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      )}

      {panel === 'lyrics' && (
        <div className="full-panel">
          {current.lyrics ? (
            <>
              <pre className="lyrics">{current.lyrics}</pre>
              <button
                type="button"
                className="pill-button"
                onClick={() => onLyrics(current.id, '')}
              >
                Effacer les paroles
              </button>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onLyrics(current.id, draft);
                setDraft('');
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Colle les paroles de ta musique ici…"
                rows={6}
              />
              <button type="submit" className="pill-button primary">
                Enregistrer
              </button>
            </form>
          )}
        </div>
      )}

      {panel === 'queue' && (
        <div className="full-panel">
          <ol className="queue-list">
            {queueItems.map((item) => (
              <li key={item.id} className={item.id === current.id ? 'active' : ''}>
                <button type="button" onClick={() => player.playList(player.queue, item.id)}>
                  <strong>{item.title}</strong>
                  <span>{item.artist || 'Artiste inconnu'}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
