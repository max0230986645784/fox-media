import { useCallback, useEffect, useState } from 'react';

export interface Playlist {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: number;
}

const STORAGE = 'fox-media-playlists';

function read(): Playlist[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return JSON.parse(raw) as Playlist[];
  } catch {
    // Corrupted storage: start with no playlist.
  }
  return [];
}

export interface PlaylistApi {
  playlists: Playlist[];
  create: (name: string) => Playlist;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  addTo: (id: string, itemId: string) => void;
  removeFrom: (id: string, itemId: string) => void;
}

export function usePlaylists(): PlaylistApi {
  const [playlists, setPlaylists] = useState<Playlist[]>(read);

  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify(playlists));
  }, [playlists]);

  const create = useCallback((name: string) => {
    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Nouvelle playlist',
      itemIds: [],
      createdAt: Date.now(),
    };
    setPlaylists((current) => [...current, playlist]);
    return playlist;
  }, []);

  const rename = useCallback((id: string, name: string) => {
    setPlaylists((current) =>
      current.map((playlist) => (playlist.id === id ? { ...playlist, name } : playlist)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setPlaylists((current) => current.filter((playlist) => playlist.id !== id));
  }, []);

  const addTo = useCallback((id: string, itemId: string) => {
    setPlaylists((current) =>
      current.map((playlist) =>
        playlist.id === id && !playlist.itemIds.includes(itemId)
          ? { ...playlist, itemIds: [...playlist.itemIds, itemId] }
          : playlist,
      ),
    );
  }, []);

  const removeFrom = useCallback((id: string, itemId: string) => {
    setPlaylists((current) =>
      current.map((playlist) =>
        playlist.id === id
          ? { ...playlist, itemIds: playlist.itemIds.filter((entry) => entry !== itemId) }
          : playlist,
      ),
    );
  }, []);

  return { playlists, create, rename, remove, addTo, removeFrom };
}
