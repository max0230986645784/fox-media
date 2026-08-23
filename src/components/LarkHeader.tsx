import { useState } from 'react';
import { Icon } from './Icon';
import type { SortKey } from '../types';

export type Tab = 'videos' | 'songs' | 'playlists' | 'folders' | 'artists' | 'albums';

const TABS: { key: Tab; label: string }[] = [
  { key: 'videos', label: 'Vidéos' },
  { key: 'songs', label: 'Titres' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'folders', label: 'Dossiers' },
  { key: 'artists', label: 'Artistes' },
  { key: 'albums', label: 'Albums' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Ajout récent' },
  { key: 'title', label: 'Titre (A-Z)' },
  { key: 'artist', label: 'Artiste (A-Z)' },
  { key: 'size', label: 'Taille' },
];

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  query: string;
  onQuery: (query: string) => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  referralDaysLeft: number | null;
  onSettings: () => void;
}

export function LarkHeader({
  tab,
  onTab,
  query,
  onQuery,
  sort,
  onSort,
  referralDaysLeft,
  onSettings,
}: Props) {
  const [searching, setSearching] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <header className="lark-header">
      {referralDaysLeft !== null && referralDaysLeft > 0 && (
        <p className="referral-strip">
          Parrainage : encore {referralDaysLeft} jour{referralDaysLeft > 1 ? 's' : ''}
        </p>
      )}

      <div className="header-row">
        {searching ? (
          <input
            className="header-search"
            type="search"
            autoFocus
            placeholder="Rechercher un titre, un artiste…"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            onBlur={() => query.length === 0 && setSearching(false)}
          />
        ) : (
          <div className="brand">
            <img className="brand-mark" src="icon-192.png" alt="" />
            <span className="brand-name">Fox Media</span>
          </div>
        )}

        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            title="Rechercher"
            onClick={() => {
              if (searching) {
                onQuery('');
                setSearching(false);
              } else {
                setSearching(true);
              }
            }}
          >
            <Icon name={searching ? 'close' : 'search'} />
          </button>

          <div className="menu-anchor">
            <button
              type="button"
              className="icon-button"
              title="Trier"
              onClick={() => setSortOpen((value) => !value)}
            >
              <Icon name="sort" />
            </button>
            {sortOpen && (
              <ul className="menu">
                {SORTS.map((entry) => (
                  <li key={entry.key}>
                    <button
                      type="button"
                      className={entry.key === sort ? 'menu-item active' : 'menu-item'}
                      onClick={() => {
                        onSort(entry.key);
                        setSortOpen(false);
                      }}
                    >
                      {entry.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button type="button" className="icon-button" title="Réglages" onClick={onSettings}>
            <Icon name="settings" />
          </button>
        </div>
      </div>

      <nav className="tab-row" aria-label="Sections">
        {TABS.map((entry, index) => (
          <span key={entry.key} className="tab-slot">
            <button
              type="button"
              className={entry.key === tab ? 'tab active' : 'tab'}
              onClick={() => onTab(entry.key)}
            >
              {entry.key === 'videos' && <Icon name="video" size={18} />}
              {entry.label}
            </button>
            {index === 0 && <span className="tab-divider" />}
          </span>
        ))}
      </nav>
    </header>
  );
}
