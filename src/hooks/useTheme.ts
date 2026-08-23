import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Accent {
  key: string;
  color: string;
  strong: string;
}

export const ACCENTS: Accent[] = [
  { key: 'fox', color: '#ff7a1a', strong: '#c94b00' },
  { key: 'blue', color: '#1f8bff', strong: '#0b3d91' },
  { key: 'green', color: '#12c46a', strong: '#06693a' },
  { key: 'pink', color: '#ef3fb5', strong: '#8d1470' },
  { key: 'violet', color: '#8a5cff', strong: '#3f1f9e' },
  { key: 'sun', color: '#ffc21a', strong: '#9a6b00' },
];

const STORAGE = 'fox-media-theme';

interface Stored {
  mode: ThemeMode;
  accent: string;
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // First run or private mode: fall back to the defaults.
  }
  return { mode: 'dark', accent: 'fox' };
}

export interface ThemeApi {
  mode: ThemeMode;
  accent: Accent;
  setMode: (mode: ThemeMode) => void;
  setAccent: (key: string) => void;
}

export function useTheme(): ThemeApi {
  const [stored, setStored] = useState<Stored>(read);
  const accent = ACCENTS.find((entry) => entry.key === stored.accent) ?? ACCENTS[0];

  useEffect(() => {
    const dark =
      stored.mode === 'dark' ||
      (stored.mode === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--accent', accent.color);
    root.style.setProperty('--accent-strong', accent.strong);
    localStorage.setItem(STORAGE, JSON.stringify(stored));
  }, [stored, accent]);

  const setMode = useCallback((mode: ThemeMode) => {
    setStored((current) => ({ ...current, mode }));
  }, []);

  const setAccent = useCallback((key: string) => {
    setStored((current) => ({ ...current, accent: key }));
  }, []);

  return { mode: stored.mode, accent, setMode, setAccent };
}
