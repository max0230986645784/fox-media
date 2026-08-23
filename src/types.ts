export type MediaKind = 'video' | 'audio';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  fileName: string;
  relativePath: string;
  /** Absolute path on disk, set by the desktop build so playback survives restarts. */
  path: string | null;
  size: number;
  lastModified: number;
  title: string;
  artist: string;
  album: string;
  year: string;
  cover: string | null;
  /** Plain-text lyrics pasted by the user. */
  lyrics?: string;
  duration: number | null;
  favorite: boolean;
  playCount: number;
  lastPlayedAt: number | null;
  progress: number;
  addedAt: number;
}

export interface AudioTags {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  cover?: string;
}

export type Section = 'video' | 'music';

export type SortKey = 'title' | 'artist' | 'recent' | 'size';
