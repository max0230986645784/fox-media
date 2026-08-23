import { useCallback, useEffect, useRef, useState } from 'react';
import type { Library } from './useLibrary';
import type { MediaItem } from '../types';

export type RepeatMode = 'off' | 'one' | 'all';

export interface AudioPlayer {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  current: MediaItem | null;
  queue: string[];
  isPlaying: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  shuffle: boolean;
  repeat: RepeatMode;
  playList: (ids: string[], startId?: string) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  setRate: (value: number) => void;
  toggleMute: () => void;
  pause: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  stop: () => void;
  onTimeUpdate: () => void;
  onLoadedMetadata: () => void;
  onEnded: () => void;
}

export function useAudioPlayer(library: Library): AudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRateState] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  const currentId = index >= 0 ? (queue[index] ?? null) : null;
  const current = currentId
    ? (library.items.find((item) => item.id === currentId) ?? null)
    : null;
  const { urlFor, updateItem } = library;

  // Kept in refs so that saving playback stats (which changes the library, and
  // therefore urlFor) never restarts the track that is currently playing.
  const urlForRef = useRef(urlFor);
  urlForRef.current = urlFor;
  const updateItemRef = useRef(updateItem);
  updateItemRef.current = updateItem;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentId) return;
    const url = urlForRef.current(currentId);
    if (!url) {
      setIsPlaying(false);
      return;
    }
    audio.src = url;
    setTime(0);
    audio.play().then(
      () => setIsPlaying(true),
      () => setIsPlaying(false),
    );
    updateItemRef.current(currentId, { lastPlayedAt: Date.now() });
  }, [currentId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
      audio.muted = muted;
      audio.playbackRate = rate;
    }
  }, [volume, muted, rate]);

  const playList = useCallback((ids: string[], startId?: string) => {
    if (ids.length === 0) return;
    const start = startId ? Math.max(0, ids.indexOf(startId)) : 0;
    setQueue(ids);
    setIndex(start);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentId) return;
    if (audio.paused) {
      audio.play().then(
        () => setIsPlaying(true),
        () => setIsPlaying(false),
      );
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [currentId]);

  const step = useCallback(
    (delta: number) => {
      if (queue.length === 0) return;
      if (shuffle && queue.length > 1) {
        let candidate = index;
        while (candidate === index) {
          candidate = Math.floor(Math.random() * queue.length);
        }
        setIndex(candidate);
        return;
      }
      const target = index + delta;
      if (target < 0) {
        setIndex(repeat === 'all' ? queue.length - 1 : 0);
      } else if (target >= queue.length) {
        if (repeat === 'all') setIndex(0);
        else setIsPlaying(false);
      } else {
        setIndex(target);
      }
    },
    [index, queue, repeat, shuffle],
  );

  const next = useCallback(() => step(1), [step]);
  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    step(-1);
  }, [step]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setTime(seconds);
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    if (value > 0) setMuted(false);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    setIsPlaying(false);
    setIndex(-1);
    setQueue([]);
  }, []);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) setTime(audio.currentTime);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
    if (currentId && Number.isFinite(audio.duration)) {
      updateItem(currentId, { duration: audio.duration });
    }
  }, [currentId, updateItem]);

  const onEnded = useCallback(() => {
    const audio = audioRef.current;
    if (currentId) {
      const played = library.items.find((item) => item.id === currentId);
      updateItem(currentId, { playCount: (played?.playCount ?? 0) + 1 });
    }
    if (repeat === 'one' && audio) {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    next();
  }, [currentId, library.items, next, repeat, updateItem]);

  return {
    audioRef,
    current,
    queue,
    isPlaying,
    time,
    duration,
    volume,
    muted,
    rate,
    shuffle,
    repeat,
    playList,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    setRate: setRateState,
    toggleMute: () => setMuted((value) => !value),
    pause,
    toggleShuffle: () => setShuffle((value) => !value),
    cycleRepeat: () =>
      setRepeat((value) => (value === 'off' ? 'all' : value === 'all' ? 'one' : 'off')),
    stop,
    onTimeUpdate,
    onLoadedMetadata,
    onEnded,
  };
}
