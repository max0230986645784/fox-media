import { useState } from 'react';
import type { PlaylistApi } from '../hooks/usePlaylists';
import type { MediaItem } from '../types';
import { Icon } from './Icon';

interface Props {
  api: PlaylistApi;
  items: MediaItem[];
  favorites: MediaItem[];
  onOpen: (name: string, itemIds: string[]) => void;
}

export function PlaylistsView({ api, items, favorites, onOpen }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className="playlists-view">
      <button type="button" className="group-row create" onClick={() => setCreating(true)}>
        <span className="group-cover accent">
          <Icon name="plus" size={26} />
        </span>
        <span className="group-text">
          <strong>Nouvelle playlist</strong>
          <span>Regroupe tes titres préférés</span>
        </span>
      </button>

      {creating && (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            api.create(name);
            setName('');
            setCreating(false);
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nom de la playlist"
            maxLength={40}
          />
          <button type="submit" className="pill-button primary">
            Créer
          </button>
        </form>
      )}

      <ul className="group-list">
        <li>
          <button
            type="button"
            className="group-row"
            onClick={() => onOpen('Favoris', favorites.map((item) => item.id))}
          >
            <span className="group-cover">
              <Icon name="heart-filled" size={24} />
            </span>
            <span className="group-text">
              <strong>Favoris</strong>
              <span>{favorites.length} titre{favorites.length > 1 ? 's' : ''}</span>
            </span>
            <Icon name="back" size={18} />
          </button>
        </li>

        {api.playlists.map((playlist) => {
          const known = playlist.itemIds.filter((id) => items.some((item) => item.id === id));
          return (
            <li key={playlist.id}>
              <button
                type="button"
                className="group-row"
                onClick={() => onOpen(playlist.name, known)}
              >
                <span className="group-cover">
                  <Icon name="playlist" size={24} />
                </span>
                <span className="group-text">
                  <strong>{playlist.name}</strong>
                  <span>{known.length} titre{known.length > 1 ? 's' : ''}</span>
                </span>
              </button>
              <button
                type="button"
                className="icon-button subtle"
                title="Supprimer la playlist"
                onClick={() => api.remove(playlist.id)}
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
