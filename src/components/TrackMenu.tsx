import type { PlaylistApi } from '../hooks/usePlaylists';
import type { MediaItem } from '../types';
import { Icon } from './Icon';

interface Props {
  item: MediaItem;
  playlists: PlaylistApi;
  onPlay: () => void;
  onEdit: () => void;
  onToggleFavorite: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function TrackMenu({
  item,
  playlists,
  onPlay,
  onEdit,
  onToggleFavorite,
  onRemove,
  onClose,
}: Props) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="track-menu"
        onClick={(event) => event.stopPropagation()}
        aria-label="Options du média"
      >
        <header>
          <span className="mini-cover">
            {item.cover ? <img src={item.cover} alt="" /> : <Icon name="album" size={22} />}
          </span>
          <span className="mini-text">
            <strong>{item.title}</strong>
            <span>{item.artist || 'Artiste inconnu'}</span>
          </span>
        </header>

        <button type="button" className="settings-row" onClick={onPlay}>
          <Icon name="play" size={20} /> Lire
        </button>
        <button type="button" className="settings-row" onClick={onToggleFavorite}>
          <Icon name={item.favorite ? 'heart-filled' : 'heart'} size={20} />
          {item.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        </button>
        <button type="button" className="settings-row" onClick={onEdit}>
          <Icon name="edit" size={20} /> Modifier titre, artiste, pochette
        </button>

        {playlists.playlists.length > 0 && (
          <>
            <h3>Ajouter à une playlist</h3>
            {playlists.playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className="settings-row"
                onClick={() => {
                  playlists.addTo(playlist.id, item.id);
                  onClose();
                }}
              >
                <Icon name="playlist" size={20} /> {playlist.name}
              </button>
            ))}
          </>
        )}

        <button type="button" className="settings-row danger" onClick={onRemove}>
          <Icon name="close" size={20} /> Retirer de Fox Media
        </button>
      </section>
    </div>
  );
}
