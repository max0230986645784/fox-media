import { useCallback, useEffect, useRef, useState } from 'react';

export const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const PRESETS: Record<string, number[]> = {
  Normal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Basses +': [8, 7, 5, 2, 0, 0, 0, 0, 1, 2],
  'Voix +': [-2, -1, 0, 2, 5, 6, 4, 2, 0, -1],
  'Aigus +': [0, 0, 0, 0, 1, 2, 4, 6, 8, 9],
  Pop: [-1, 1, 3, 5, 4, 2, 0, -1, -1, 0],
  Rock: [6, 4, 2, -1, -2, 0, 3, 5, 6, 6],
  Jazz: [4, 3, 1, 2, -1, -1, 0, 2, 4, 5],
  Dance: [7, 6, 3, 0, 1, 3, 5, 5, 4, 2],
  Classique: [0, 0, 0, 0, 0, 0, -2, -3, -3, -4],
  'Hip-hop': [8, 6, 2, 3, -1, -1, 2, 1, 3, 4],
};

const STORAGE = 'fox-media-eq';

interface Stored {
  enabled: boolean;
  gains: number[];
  preset: string;
  bass: number;
  normalize: boolean;
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // Ignore unreadable storage and start from the flat preset.
  }
  return { enabled: false, gains: [...PRESETS.Normal], preset: 'Normal', bass: 0, normalize: false };
}

export interface EqualizerApi {
  enabled: boolean;
  gains: number[];
  preset: string;
  bass: number;
  normalize: boolean;
  available: boolean;
  setEnabled: (value: boolean) => void;
  setGain: (index: number, value: number) => void;
  setPreset: (name: string) => void;
  setBass: (value: number) => void;
  setNormalize: (value: boolean) => void;
  /** Current frequency levels (0-1) used to draw the live waveform. */
  levels: (out: Float32Array) => boolean;
}

/** Ten-band Web Audio equalizer wired onto the shared <audio> element. */
export function useEqualizer(audio: HTMLAudioElement | null): EqualizerApi {
  const [stored, setStored] = useState<Stored>(read);
  const [available, setAvailable] = useState(true);
  const context = useRef<AudioContext | null>(null);
  const filters = useRef<BiquadFilterNode[]>([]);
  const bassNode = useRef<BiquadFilterNode | null>(null);
  const compressor = useRef<DynamicsCompressorNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const spectrum = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const latest = useRef(stored);
  latest.current = stored;

  // The graph is built on the first play event: routing the element through a
  // Web Audio context that the browser keeps suspended (no user gesture yet)
  // would silently freeze playback.
  useEffect(() => {
    if (!audio) return;

    const build = () => {
      if (context.current) {
        if (context.current.state === 'suspended') void context.current.resume();
        return;
      }
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(audio);
        const chain = BANDS.map((frequency, index) => {
          const filter = ctx.createBiquadFilter();
          filter.type =
            index === 0 ? 'lowshelf' : index === BANDS.length - 1 ? 'highshelf' : 'peaking';
          filter.frequency.value = frequency;
          filter.Q.value = 1;
          filter.gain.value = 0;
          return filter;
        });
        const bass = ctx.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.value = 90;
        bass.gain.value = 0;

        // Kept in the chain with a neutral setting when normalisation is off.
        const limiter = ctx.createDynamicsCompressor();
        const meter = ctx.createAnalyser();
        meter.fftSize = 128;
        meter.smoothingTimeConstant = 0.75;

        let node: AudioNode = source;
        for (const filter of chain) {
          node.connect(filter);
          node = filter;
        }
        node.connect(bass);
        bass.connect(limiter);
        limiter.connect(meter);
        meter.connect(ctx.destination);

        context.current = ctx;
        filters.current = chain;
        bassNode.current = bass;
        compressor.current = limiter;
        analyser.current = meter;
        spectrum.current = new Uint8Array(meter.frequencyBinCount);
        apply(latest.current);
        void ctx.resume();
      } catch {
        setAvailable(false);
      }
    };

    audio.addEventListener('play', build);
    return () => audio.removeEventListener('play', build);
  }, [audio]);

  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify(stored));
    apply(stored);
  }, [stored]);

  const setEnabled = useCallback((value: boolean) => {
    setStored((current) => ({ ...current, enabled: value }));
  }, []);

  const setGain = useCallback((index: number, value: number) => {
    setStored((current) => {
      const gains = [...current.gains];
      gains[index] = value;
      return { ...current, gains, preset: 'Perso', enabled: true };
    });
  }, []);

  const setPreset = useCallback((name: string) => {
    const gains = PRESETS[name];
    if (!gains) return;
    setStored((current) => ({ ...current, gains: [...gains], preset: name, enabled: true }));
  }, []);

  const setBass = useCallback((value: number) => {
    setStored((current) => ({ ...current, bass: value, enabled: true }));
  }, []);

  const setNormalize = useCallback((value: boolean) => {
    setStored((current) => ({ ...current, normalize: value }));
  }, []);

  const levels = useCallback((out: Float32Array) => {
    const meter = analyser.current;
    const data = spectrum.current;
    if (!meter || !data) return false;
    meter.getByteFrequencyData(data);
    for (let index = 0; index < out.length; index += 1) {
      const bin = Math.floor((index / out.length) * data.length);
      out[index] = (data[bin] ?? 0) / 255;
    }
    return true;
  }, []);

  return {
    enabled: stored.enabled,
    gains: stored.gains,
    preset: stored.preset,
    bass: stored.bass,
    normalize: stored.normalize,
    available,
    setEnabled,
    setGain,
    setPreset,
    setBass,
    setNormalize,
    levels,
  };

  /** Pushes the stored settings onto the live graph, if it already exists. */
  function apply(settings: Stored) {
    const ctx = context.current;
    if (!ctx) return;
    void ctx.resume();
    filters.current.forEach((filter, index) => {
      filter.gain.value = settings.enabled ? (settings.gains[index] ?? 0) : 0;
    });
    if (bassNode.current) bassNode.current.gain.value = settings.enabled ? settings.bass : 0;
    const limiter = compressor.current;
    if (limiter) {
      limiter.threshold.value = settings.normalize ? -22 : 0;
      limiter.knee.value = settings.normalize ? 24 : 0;
      limiter.ratio.value = settings.normalize ? 8 : 1;
      limiter.attack.value = 0.005;
      limiter.release.value = 0.25;
    }
  }
}
