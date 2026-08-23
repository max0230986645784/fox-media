import type { MediaItem } from '../types';

export interface Group {
  key: string;
  label: string;
  subtitle: string;
  cover: string | null;
  items: MediaItem[];
}

function folderOf(item: MediaItem): string {
  const raw = item.relativePath || item.fileName;
  const parts = raw.split('/').slice(0, -1);
  return parts.length > 0 ? parts.join('/') : 'Racine';
}

function build(
  items: MediaItem[],
  keyOf: (item: MediaItem) => string,
  unknown: string,
): Group[] {
  const map = new Map<string, MediaItem[]>();
  for (const item of items) {
    const key = keyOf(item).trim() || unknown;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      label: key,
      subtitle: `${list.length} titre${list.length > 1 ? 's' : ''}`,
      cover: list.find((item) => item.cover)?.cover ?? null,
      items: list,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

export function byArtist(items: MediaItem[]): Group[] {
  return build(items, (item) => item.artist, 'Artiste inconnu');
}

export function byAlbum(items: MediaItem[]): Group[] {
  return build(items, (item) => item.album, 'Album inconnu');
}

export function byFolder(items: MediaItem[]): Group[] {
  return build(items, folderOf, 'Racine').map((group) => ({
    ...group,
    subtitle: `${group.items.length} fichier${group.items.length > 1 ? 's' : ''}`,
  }));
}
