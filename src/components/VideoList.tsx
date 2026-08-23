import { useEffect, useState } from 'react';
import type { MediaItem } from '../types';
import { formatSize, formatTime } from '../lib/format';
import { captureThumbnail } from '../lib/thumbnail';
import { Icon } from './Icon';

interface Props {
  items: MediaItem[];
  urlFor: (id: string) => string | null;
  isAvailable: (id: string) => boolean;
  onPlay: (id: string) => void;
  onMenu: (id: string) => void;
  onThumbnail: (id: string, cover: string, duration: number) => void;
}

export function VideoList({
  items,
  urlFor,
  isAvailable,
  onPlay,
  onMenu,
  onThumbnail,
}: Props) {
  const [layout, setLayout] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    let cancelled = false;
    const pending = items.filter((item) => !item.cover && isAvailable(item.id)).slice(0, 12);

    void (async () => {
      for (const item of pending) {
        if (cancelled) return;
        const url = urlFor(item.id);
        if (!url) continue;
        try {
          const { cover, duration } = await captureThumbnail(url);
          if (!cancelled) onThumbnail(item.id, cover, duration);
        } catch {
          // Unsupported codec (some .mkv): keep the placeholder poster.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, isAvailable, urlFor, onThumbnail]);

  return (
    <div className={layout === 'grid' ? 'video-list grid' : 'video-list'}>
      <div className="list-head">
        <span className="list-count">
          {items.length} vidéo{items.length > 1 ? 's' : ''}
        </span>
        <span className="layout-switch">
          <button
            type="button"
            className={layout === 'list' ? 'icon-button active' : 'icon-button'}
            title="Liste"
            onClick={() => setLayout('list')}
          >
            <Icon name="list" size={20} />
          </button>
          <button
            type="button"
            className={layout === 'grid' ? 'icon-button active' : 'icon-button'}
            title="Grille"
            onClick={() => setLayout('grid')}
          >
            <Icon name="grid" size={20} />
          </button>
        </span>
      </div>

      <ul>
        {items.map((item) => {
          const available = isAvailable(item.id);
          const progress =
            item.progress > 0 && item.duration
              ? Math.min(100, (item.progress / item.duration) * 100)
              : 0;
          return (
            <li key={item.id} className="video-row">
              <button
                type="button"
                className="video-thumb"
                onClick={() => available && onPlay(item.id)}
                title={available ? 'Lire' : 'Fichier absent — relance un scan'}
              >
                {item.cover ? <img src={item.cover} alt="" /> : <Icon name="video" size={28} />}
                <span className="thumb-play">
                  <Icon name="play" size={18} />
                </span>
                {item.duration ? (
                  <span className="thumb-duration">{formatTime(item.duration)}</span>
                ) : null}
                {progress > 0 && <span className="thumb-progress" style={{ width: `${progress}%` }} />}
              </button>
              <button
                type="button"
                className="video-text"
                onClick={() => available && onPlay(item.id)}
                title={available ? 'Lire' : 'Fichier absent — relance un scan'}
              >
                <strong>{item.title}</strong>
                <span>
                  {[item.artist, formatSize(item.size)].filter(Boolean).join(' • ')}
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
