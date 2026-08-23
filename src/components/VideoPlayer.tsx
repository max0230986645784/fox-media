import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../types';
import { formatTime } from '../lib/format';
import { shiftVtt, srtToVtt } from '../lib/subtitles';
import { useSleepTimer } from '../hooks/useSleepTimer';
import { nativeBridge } from '../lib/native';
import { Icon } from './Icon';

interface Props {
  item: MediaItem;
  url: string;
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onProgress: (seconds: number, duration: number) => void;
  onClose: () => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];
const FITS = ['contain', 'cover', 'fill'] as const;
const SLEEP_CHOICES = [15, 30, 45, 60, 90];

type Fit = (typeof FITS)[number];

interface Gesture {
  x: number;
  y: number;
  time: number;
  volume: number;
  brightness: number;
  axis: 'none' | 'seek' | 'volume' | 'brightness';
  left: boolean;
}

/** Full-screen video player with the VLC-style extras: speed, subtitles, rotation, zoom. */
export function VideoPlayer({
  item,
  url,
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
  onProgress,
  onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const subtitleUrl = useRef<string | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(item.duration ?? 0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fit, setFit] = useState<Fit>('contain');
  const [locked, setLocked] = useState(false);
  const [visible, setVisible] = useState(true);
  const [panel, setPanel] = useState<'none' | 'speed' | 'subtitles' | 'sleep'>('none');
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [subtitleText, setSubtitleText] = useState<string | null>(null);
  const [subtitleSize, setSubtitleSize] = useState(100);
  const [subtitleDelay, setSubtitleDelay] = useState(0);
  const [brightness, setBrightness] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [flash, setFlash] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Playback falls back to the bundled ffmpeg when Chromium cannot decode the
  // file: first a fast repackaging, then a full conversion.
  const [fallback, setFallback] = useState<'none' | 'copy' | 'full'>('none');
  const [converting, setConverting] = useState(false);
  const bridge = nativeBridge();
  const convertible = Boolean(bridge?.convertUrl && item.path);
  const startAt = item.progress > 2 ? item.progress : 0;
  // The converted stream already starts at the resume point, so it must not be
  // seeked again once its metadata arrives.
  const source =
    fallback === 'none' || !bridge?.convertUrl || !item.path
      ? url
      : bridge.convertUrl(item.path, fallback === 'copy' ? 'copy' : '1', startAt);

  const wake = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), 3500);
  }, []);

  useEffect(() => {
    wake();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (subtitleUrl.current) URL.revokeObjectURL(subtitleUrl.current);
    };
  }, [wake]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
      setFlash(delta > 0 ? `+${delta} s` : `${delta} s`);
      window.setTimeout(() => setFlash(null), 700);
      wake();
    },
    [wake],
  );

  const changeVolume = useCallback((value: number) => {
    setVolume(value);
    if (videoRef.current) videoRef.current.volume = value;
  }, []);

  const changeSpeed = useCallback((value: number) => {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  }, []);

  const sleep = useSleepTimer(() => {
    videoRef.current?.pause();
    setFlash('Minuterie : lecture arrêtée');
    window.setTimeout(() => setFlash(null), 1500);
  });

  /** Floating window, like the pop-up player of MX Player. */
  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture().catch(() => undefined);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen().catch(() => undefined);
  }, []);

  const close = useCallback(() => {
    const video = videoRef.current;
    // A converted stream restarts its timeline at the resume point.
    const offset = fallback === 'none' ? 0 : startAt;
    if (video) onProgress(offset + video.currentTime, offset + video.duration);
    onClose();
  }, [fallback, onClose, onProgress, startAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (locked && event.key !== 'Escape') return;
      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          skip(10);
          break;
        case 'ArrowLeft':
          skip(-10);
          break;
        case 'ArrowUp':
          changeVolume(Math.min(1, volume + 0.1));
          break;
        case 'ArrowDown':
          changeVolume(Math.max(0, volume - 0.1));
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'Escape':
          if (!document.fullscreenElement) close();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeVolume, close, locked, skip, togglePlay, toggleFullscreen, volume]);

  /** Touch gestures: seek sideways, volume on the right, brightness on the left. */
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef(0);

  const onTouchStart = (event: React.TouchEvent) => {
    if (locked || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const bounds = event.currentTarget.getBoundingClientRect();
    gesture.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: videoRef.current?.currentTime ?? 0,
      volume,
      brightness,
      axis: 'none',
      left: touch.clientX - bounds.left < bounds.width / 2,
    };
  };

  const onTouchMove = (event: React.TouchEvent) => {
    const start = gesture.current;
    const video = videoRef.current;
    if (!start || !video || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (start.axis === 'none') {
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      start.axis =
        Math.abs(dx) > Math.abs(dy) ? 'seek' : start.left ? 'brightness' : 'volume';
    }
    if (start.axis === 'seek') {
      const target = Math.max(0, Math.min(video.duration || 0, start.time + dx * 0.35));
      video.currentTime = target;
      setTime(target);
      setFlash(formatTime(target));
      return;
    }
    const ratio = -dy / 220;
    if (start.axis === 'volume') {
      const value = Math.max(0, Math.min(1, start.volume + ratio));
      changeVolume(value);
      setFlash(`Volume ${Math.round(value * 100)} %`);
    } else {
      const value = Math.max(0.2, Math.min(1.6, start.brightness + ratio));
      setBrightness(value);
      setFlash(`Luminosité ${Math.round(value * 100)} %`);
    }
  };

  const onTouchEnd = () => {
    gesture.current = null;
    window.setTimeout(() => setFlash(null), 600);
  };

  /** Double tap on a side jumps 10 s, in the middle it pauses. */
  const onTap = (event: React.MouseEvent<HTMLVideoElement>) => {
    if (locked) return;
    const now = Date.now();
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    if (now - lastTap.current < 300) {
      if (ratio < 0.35) skip(-10);
      else if (ratio > 0.65) skip(10);
      else togglePlay();
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    setVisible(!visible);
  };

  /** Loads an .srt or .vtt file sitting next to the movie. */
  const loadSubtitle = async (file: File) => {
    const text = await file.text();
    setSubtitleText(file.name.toLowerCase().endsWith('.vtt') ? text : srtToVtt(text));
    setSubtitleDelay(0);
    setPanel('none');
  };

  // The delay is applied by regenerating the track with shifted cue times.
  useEffect(() => {
    if (subtitleUrl.current) {
      URL.revokeObjectURL(subtitleUrl.current);
      subtitleUrl.current = null;
    }
    if (!subtitleText) {
      setSubtitle(null);
      return;
    }
    const blob = new Blob([shiftVtt(subtitleText, subtitleDelay)], { type: 'text/vtt' });
    subtitleUrl.current = URL.createObjectURL(blob);
    setSubtitle(subtitleUrl.current);
  }, [subtitleDelay, subtitleText]);

  return (
    <div
      className={visible ? 'player-overlay' : 'player-overlay idle'}
      ref={containerRef}
      onMouseMove={wake}
    >
      <div className="player-head">
        <button type="button" className="icon-button light" onClick={close} title="Fermer">
          <Icon name="back" size={24} />
        </button>
        <div className="player-title">
          <strong>{item.title}</strong>
          <span>{[item.artist, item.year].filter(Boolean).join(' • ')}</span>
        </div>
        <button
          type="button"
          className={locked ? 'icon-button light active' : 'icon-button light'}
          onClick={() => setLocked(!locked)}
          title="Verrouiller l'écran"
        >
          <Icon name="lock" size={22} />
        </button>
      </div>

      <video
        ref={videoRef}
        className="player-video"
        src={source}
        autoPlay
        playsInline
        style={{
          transform: `rotate(${rotation}deg) scale(${zoom})`,
          objectFit: fit,
          filter: brightness === 1 ? undefined : `brightness(${brightness})`,
          maxHeight: rotation % 180 === 0 ? '100%' : '100vw',
          ['--subtitle-size' as string]: `${subtitleSize}%`,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onTap}
        onDoubleClick={() => undefined}
        onError={(event) => {
          const video = event.currentTarget;
          const code = video.error?.code ?? 0;
          const codec = code === 3 || code === 4;

          if (codec && convertible && fallback === 'none') {
            setConverting(true);
            setFallback('copy');
            return;
          }
          if (codec && convertible && fallback === 'copy') {
            setConverting(true);
            setFallback('full');
            return;
          }

          setConverting(false);
          setFailure(
            codec
              ? `Format non lisible : « ${item.fileName} » utilise un codec que le lecteur ne décode pas (MKV, AVI, H.265/HEVC, audio AC3…). Sur PC la conversion automatique s'en charge, sur téléphone il faut un MP4 H.264 + AAC.`
              : `Lecture impossible : le fichier « ${item.fileName} » n'a pas pu être lu (déplacé, renommé ou illisible ?).`,
          );
        }}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setFailure(null);
          setConverting(false);
          setDuration(video.duration);
          if (fallback === 'none' && startAt > 0 && startAt < video.duration - 5) {
            video.currentTime = startAt;
          }
        }}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          onProgress(0, duration);
          if (hasNext) onNext();
          else onClose();
        }}
      >
        {subtitle && <track kind="subtitles" src={subtitle} default label="Sous-titres" />}
      </video>

      {flash && <span className="player-flash">{flash}</span>}

      {converting && !failure && (
        <p className="player-error">Conversion du format en cours, la lecture démarre…</p>
      )}

      {failure && <p className="player-error">{failure}</p>}

      {!locked && (
        <div className="player-controls">
          <div className="player-seek-row">
            <span className="player-time">{formatTime(time)}</span>
            <input
              type="range"
              className="seek"
              min={0}
              max={Number.isFinite(duration) && duration > 0 ? duration : 0}
              step={0.5}
              value={time}
              onChange={(event) => {
                const value = Number(event.target.value);
                setTime(value);
                if (videoRef.current) videoRef.current.currentTime = value;
              }}
              aria-label="Progression"
            />
            <span className="player-time">{formatTime(duration)}</span>
          </div>

          <div className="player-buttons">
            <button
              type="button"
              className="icon-button light"
              disabled={!hasPrevious}
              onClick={onPrevious}
              title="Précédent"
            >
              <Icon name="previous" size={26} />
            </button>
            <button
              type="button"
              className="icon-button light"
              onClick={() => skip(-10)}
              title="-10 s"
            >
              <Icon name="rewind" size={26} />
            </button>
            <button type="button" className="play-button dark" onClick={togglePlay} title="Lecture">
              <Icon name={playing ? 'pause' : 'play'} size={40} />
            </button>
            <button
              type="button"
              className="icon-button light"
              onClick={() => skip(10)}
              title="+10 s"
            >
              <Icon name="forward" size={26} />
            </button>
            <button
              type="button"
              className="icon-button light"
              disabled={!hasNext}
              onClick={onNext}
              title="Suivant"
            >
              <Icon name="next" size={26} />
            </button>
          </div>

          <div className="player-tools">
            <label className="player-volume" title="Volume">
              <Icon name="volume" size={20} />
              <input
                type="range"
                className="volume"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                aria-label="Volume"
              />
            </label>
            <button
              type="button"
              className={panel === 'speed' ? 'pill-button primary' : 'pill-button'}
              onClick={() => setPanel(panel === 'speed' ? 'none' : 'speed')}
            >
              <Icon name="speed" size={18} />
              {speed}×
            </button>
            <button
              type="button"
              className={subtitle ? 'pill-button primary' : 'pill-button'}
              onClick={() => setPanel(panel === 'subtitles' ? 'none' : 'subtitles')}
            >
              <Icon name="subtitles" size={18} />
              Sous-titres
            </button>
            <button
              type="button"
              className="icon-button light"
              onClick={() => setRotation((rotation + 90) % 360)}
              title="Pivoter"
            >
              <Icon name="rotate" size={22} />
            </button>
            <button
              type="button"
              className="icon-button light"
              onClick={() => setFit(FITS[(FITS.indexOf(fit) + 1) % FITS.length])}
              title="Cadrage"
            >
              <Icon name="crop" size={22} />
            </button>
            <button
              type="button"
              className={zoom === 1 ? 'pill-button' : 'pill-button primary'}
              onClick={() => setZoom(zoom >= 2 ? 1 : Math.round((zoom + 0.25) * 100) / 100)}
              title="Zoom"
            >
              {zoom}×
            </button>
            <button
              type="button"
              className={sleep.minutesLeft ? 'pill-button primary' : 'pill-button'}
              onClick={() => setPanel(panel === 'sleep' ? 'none' : 'sleep')}
              title="Minuterie"
            >
              <Icon name="timer" size={18} />
              {sleep.minutesLeft ? `${sleep.minutesLeft} min` : 'Minuterie'}
            </button>
            <button
              type="button"
              className="icon-button light"
              onClick={() => void togglePip()}
              title="Fenêtre flottante"
            >
              <Icon name="pip" size={22} />
            </button>
            <button
              type="button"
              className="icon-button light"
              onClick={toggleFullscreen}
              title="Plein écran"
            >
              <Icon name="fullscreen" size={22} />
            </button>
          </div>

          {panel === 'speed' && (
            <div className="player-panel">
              {SPEEDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === speed ? 'chip active' : 'chip'}
                  onClick={() => changeSpeed(value)}
                >
                  {value}×
                </button>
              ))}
            </div>
          )}

          {panel === 'subtitles' && (
            <div className="player-panel">
              <label className="pill-button">
                <Icon name="subtitles" size={18} />
                Charger un fichier .srt / .vtt
                <input
                  type="file"
                  accept=".srt,.vtt"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void loadSubtitle(file);
                    event.target.value = '';
                  }}
                />
              </label>
              {subtitleText && (
                <>
                  <div className="player-row">
                    <span>Taille</span>
                    {[75, 100, 130, 170].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={value === subtitleSize ? 'chip active' : 'chip'}
                        onClick={() => setSubtitleSize(value)}
                      >
                        {value} %
                      </button>
                    ))}
                  </div>
                  <div className="player-row">
                    <span>Décalage {subtitleDelay > 0 ? `+${subtitleDelay}` : subtitleDelay} s</span>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => setSubtitleDelay(Math.round((subtitleDelay - 0.5) * 10) / 10)}
                    >
                      −0,5 s
                    </button>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => setSubtitleDelay(Math.round((subtitleDelay + 0.5) * 10) / 10)}
                    >
                      +0,5 s
                    </button>
                  </div>
                  <button
                    type="button"
                    className="chip active"
                    onClick={() => setSubtitleText(null)}
                  >
                    Désactiver
                  </button>
                </>
              )}
            </div>
          )}

          {panel === 'sleep' && (
            <div className="player-panel">
              {SLEEP_CHOICES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  onClick={() => {
                    sleep.arm(value);
                    setPanel('none');
                  }}
                >
                  {value} min
                </button>
              ))}
              {sleep.minutesLeft && (
                <button
                  type="button"
                  className="chip active"
                  onClick={() => {
                    sleep.cancel();
                    setPanel('none');
                  }}
                >
                  Annuler
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
