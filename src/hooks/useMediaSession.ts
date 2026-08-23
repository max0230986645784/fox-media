import { useEffect } from 'react';
import type { MediaItem } from '../types';

interface Handlers {
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek?: (seconds: number) => void;
}

/**
 * Publishes the current track to the system: Android notification, iOS lock
 * screen, Windows media overlay and headset buttons.
 */
export function useMediaSession(
  item: MediaItem | null,
  playing: boolean,
  handlers: Handlers,
): void {
  const { play, pause, next, previous, seek } = handlers;

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    if (!item) {
      session.metadata = null;
      session.playbackState = 'none';
      return;
    }
    session.metadata = new MediaMetadata({
      title: item.title,
      artist: item.artist || 'Artiste inconnu',
      album: item.album || 'Fox Media',
      artwork: item.cover ? [{ src: item.cover, sizes: '512x512' }] : [],
    });
    session.playbackState = playing ? 'playing' : 'paused';
  }, [item, playing]);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    session.setActionHandler('play', play);
    session.setActionHandler('pause', pause);
    session.setActionHandler('nexttrack', next);
    session.setActionHandler('previoustrack', previous);
    session.setActionHandler(
      'seekto',
      seek ? (details) => seek(details.seekTime ?? 0) : null,
    );
    return () => {
      session.setActionHandler('play', null);
      session.setActionHandler('pause', null);
      session.setActionHandler('nexttrack', null);
      session.setActionHandler('previoustrack', null);
      session.setActionHandler('seekto', null);
    };
  }, [next, pause, play, previous, seek]);
}
