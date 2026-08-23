import type { MediaItem } from '../types';

/** Media started but not finished, like the "continue watching" row of Lark Player. */
export function resumable(items: MediaItem[]): MediaItem[] {
  return items
    .filter((item) => {
      if (item.progress <= 15) return false;
      if (!item.duration) return true;
      return item.progress < item.duration - 30;
    })
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .slice(0, 12);
}
