import type { MediaItem } from '../types';
import { coverInitials, fallbackCover } from '../lib/cover';
import { Icon } from './Icon';

interface Props {
  items: MediaItem[];
  current: MediaItem | null;
  isPlaying: boolean;
  isAvailable: (id: string) => boolean;
  onPlay: (id: string) => void;
  onMenu: (id: string) => void;
  onShuffleAll: () => void;
}

export function SongList({
  items,
  current,
  isPlaying,
  isAvailable,
  onPlay,
  onMenu,
  onShuffleAll,
}: Props) {
  return (
    <div className="song-list">
      <div className="list-head">
        <button type="button" className="shuffle-all" onClick={onShuffleAll}>
          <Icon name="shuffle" size={20} />
          Tout lire en aléatoire
        </button>
        <span className="list-count">{items.length} titre{items.length > 1 ? 's' : ''}</span>
      </div>

      <ul>
        {items.map((item) => {
          const active = current?.id === item.id;
          const available = isAvailable(item.id);
          return (
            <li key={item.id} className={active ? 'song-row active' : 'song-row'}>
              <button
                type="button"
                className="song-main"
                onClick={() => available && onPlay(item.id)}
                title={available ? 'Lire' : 'Fichier absent — relance un scan'}
              >
                <span
                  className="song-cover"
                  style={item.cover ? undefined : { background: fallbackCover(item.id) }}
                >
                  {item.cover ? (
                    <img src={item.cover} alt="" />
                  ) : (
                    <span className="cover-initials">{coverInitials(item.title)}</span>
                  )}
                  {active && (
                    <span className="song-cover-state">
                      <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
                    </span>
                  )}
                </span>
                <span className="song-text">
                  <strong>{item.title}</strong>
                  <span>{item.artist || 'Artiste inconnu'}</span>
                </span>
              </button>
              <button
                type="button"
                className="icon-button subtle"
                title="Plus d'options"
                onClick={() => onMenu(item.id)}
              >
                <Icon name="more" size={20} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
