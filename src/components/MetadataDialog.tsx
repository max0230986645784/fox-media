import { useRef, useState } from 'react';
import type { MediaItem } from '../types';

interface Props {
  item: MediaItem;
  onSave: (patch: Partial<MediaItem>) => void;
  onRemove: () => void;
  onClose: () => void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Lets the user fix downloads with missing tags: title, artist, album, year, cover. */
export function MetadataDialog({ item, onSave, onRemove, onClose }: Props) {
  const [title, setTitle] = useState(item.title);
  const [artist, setArtist] = useState(item.artist);
  const [album, setAlbum] = useState(item.album);
  const [year, setYear] = useState(item.year);
  const [cover, setCover] = useState(item.cover);
  const coverInput = useRef<HTMLInputElement | null>(null);

  const pickCover = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setCover(await readAsDataUrl(file));
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="Modifier les informations"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Modifier les infos</h2>
        <p className="modal-file">{item.relativePath}</p>

        <div className="modal-body">
          <div className="cover-picker">
            {cover ? (
              <img src={cover} alt="" className="cover-preview" />
            ) : (
              <div className="cover-preview empty">{item.kind === 'video' ? '🎬' : '🎵'}</div>
            )}
            <button type="button" className="button" onClick={() => coverInput.current?.click()}>
              Changer l'image
            </button>
            {cover && (
              <button type="button" className="button ghost" onClick={() => setCover(null)}>
                Retirer
              </button>
            )}
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={pickCover} />
          </div>

          <div className="fields">
            <label>
              Titre
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              {item.kind === 'video' ? 'Réalisateur / chaîne' : 'Artiste'}
              <input value={artist} onChange={(event) => setArtist(event.target.value)} />
            </label>
            <label>
              {item.kind === 'video' ? 'Collection' : 'Album'}
              <input value={album} onChange={(event) => setAlbum(event.target.value)} />
            </label>
            <label>
              Année
              <input
                value={year}
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => setYear(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="button danger ghost" onClick={onRemove}>
            Retirer de Fox Media
          </button>
          <span className="spacer" />
          <button type="button" className="button ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() =>
              onSave({
                title: title.trim() || item.fileName,
                artist: artist.trim(),
                album: album.trim(),
                year: year.trim(),
                cover,
              })
            }
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
