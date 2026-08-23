import type { AudioPlayer } from '../hooks/useAudioPlayer';
import { coverInitials, fallbackCover } from '../lib/cover';
import { Icon } from './Icon';

interface Props {
  player: AudioPlayer;
  onExpand: () => void;
}

export function MiniPlayer({ player, onExpand }: Props) {
  const { current } = player;
  if (!current) return null;
  const ratio = player.duration > 0 ? (player.time / player.duration) * 100 : 0;

  return (
    <div className="mini-player">
      <button type="button" className="mini-main" onClick={onExpand}>
        <span
          className="mini-cover"
          style={current.cover ? undefined : { background: fallbackCover(current.id) }}
        >
          {current.cover ? (
            <img src={current.cover} alt="" />
          ) : (
            <span className="cover-initials">{coverInitials(current.title)}</span>
          )}
        </span>
        <span className="mini-text">
          <strong>{current.title}</strong>
          <span>{current.artist || 'Artiste inconnu'}</span>
        </span>
      </button>
      <div className="mini-actions">
        <button
          type="button"
          className="icon-button light big"
          onClick={player.toggle}
          title="Lecture"
        >
          <Icon name={player.isPlaying ? 'pause' : 'play'} size={34} />
        </button>
        <button
          type="button"
          className="icon-button light big"
          onClick={player.next}
          title="Suivant"
        >
          <Icon name="next" size={34} />
        </button>
      </div>
      <span className="mini-progress" style={{ width: `${ratio}%` }} />
    </div>
  );
}
