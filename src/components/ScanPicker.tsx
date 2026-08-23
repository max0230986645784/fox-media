import { useMemo, useState } from 'react';
import type { ScanPreview } from '../hooks/useLibrary';
import { formatSize } from '../lib/format';

interface Props {
  preview: ScanPreview;
  /** Remaining slots before the trial limit; Infinity once a licence is active. */
  remaining: number;
  onImport: (ids: string[]) => void;
  onCancel: () => void;
}

/** Lets the user pick exactly which scanned films, series and songs get added. */
export function ScanPicker({ preview, remaining, onImport, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(preview.candidates.map((item) => item.id)),
  );
  const [filter, setFilter] = useState<'all' | 'video' | 'audio'>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return preview.candidates
      .filter((item) => filter === 'all' || item.kind === filter)
      .filter(
        (item) =>
          needle.length === 0 ||
          `${item.title} ${item.fileName} ${item.artist}`.toLowerCase().includes(needle),
      );
  }, [preview.candidates, filter, query]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAll = (value: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of visible) {
        if (value) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  };

  const overLimit = selected.size > remaining;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal picker-modal">
        <h2>Choisis ce que tu veux ajouter</h2>
        <p className="picker-summary">
          {preview.candidates.length} média(s) trouvé(s)
          {preview.duplicates > 0 && ` • ${preview.duplicates} déjà dans ta bibliothèque`}
          {preview.skipped > 0 && ` • ${preview.skipped} fichier(s) ignoré(s)`}
          {preview.relinked > 0 && ` • ${preview.relinked} média(s) rechargé(s)`}
        </p>

        <div className="picker-tools">
          <input
            type="search"
            className="search"
            placeholder="Filtrer…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="select"
            value={filter}
            onChange={(event) => setFilter(event.target.value as 'all' | 'video' | 'audio')}
            aria-label="Type"
          >
            <option value="all">Tout</option>
            <option value="video">Films &amp; séries</option>
            <option value="audio">Musiques</option>
          </select>
          <button type="button" className="button" onClick={() => setAll(true)}>
            Tout cocher
          </button>
          <button type="button" className="button" onClick={() => setAll(false)}>
            Tout décocher
          </button>
        </div>

        <ul className="picker-list">
          {visible.map((item) => (
            <li key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="picker-kind">{item.kind === 'video' ? '🎬' : '🎵'}</span>
                <span className="picker-title">{item.title}</span>
                <span className="picker-meta">
                  {item.artist || item.relativePath} • {formatSize(item.size)}
                </span>
              </label>
            </li>
          ))}
          {visible.length === 0 && <li className="picker-empty">Aucun média pour ce filtre.</li>}
        </ul>

        {overLimit && (
          <p className="licence-status">
            Version d&apos;essai : {remaining} média(s) maximum. Active une clé pour tout ajouter.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="button" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className="button primary"
            disabled={selected.size === 0 || overLimit}
            onClick={() => onImport([...selected])}
          >
            Ajouter {selected.size} média(s)
          </button>
        </div>
      </div>
    </div>
  );
}
