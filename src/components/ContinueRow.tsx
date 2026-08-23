import type { MediaItem } from '../types';
import { formatTime } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  items: MediaItem[];
  onPlay: (item: MediaItem) => void;
}

export function ContinueRow({ items, onPlay }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="continue">
      <h3>Reprendre</h3>
      <ul>
        {items.map((item) => {
          const ratio = item.duration ? Math.min(100, (item.progress / item.duration) * 100) : 0;
          return (
            <li key={item.id}>
              <button type="button" onClick={() => onPlay(item)} title={item.title}>
                <span className="continue-thumb">
                  {item.cover ? (
                    <img src={item.cover} alt="" />
                  ) : (
                    <Icon name={item.kind === 'video' ? 'video' : 'album'} size={24} />
                  )}
                  <span className="continue-bar" style={{ width: `${ratio}%` }} />
                </span>
                <strong>{item.title}</strong>
                <span className="continue-left">
                  {item.duration
                    ? `${formatTime(item.duration - item.progress)} restant`
                    : formatTime(item.progress)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
