import { useCallback, useEffect, useRef, useState } from 'react';

export interface SleepTimer {
  /** Minutes left, or null when no timer is armed. */
  minutesLeft: number | null;
  arm: (minutes: number) => void;
  cancel: () => void;
}

/** Stops playback after a delay, like the sleep timer of Poweramp or VLC. */
export function useSleepTimer(onElapsed: () => void): SleepTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const elapsed = useRef(onElapsed);
  elapsed.current = onElapsed;

  useEffect(() => {
    if (endsAt === null) {
      setMinutesLeft(null);
      return;
    }
    const tick = () => {
      const remaining = endsAt - Date.now();
      if (remaining <= 0) {
        setEndsAt(null);
        setMinutesLeft(null);
        elapsed.current();
        return;
      }
      setMinutesLeft(Math.ceil(remaining / 60000));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const arm = useCallback((minutes: number) => {
    setEndsAt(minutes > 0 ? Date.now() + minutes * 60000 : null);
  }, []);

  return { minutesLeft, arm, cancel: () => setEndsAt(null) };
}
