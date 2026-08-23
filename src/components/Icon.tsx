interface Props {
  name: IconName;
  size?: number;
}

export type IconName =
  | 'search'
  | 'sort'
  | 'settings'
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'heart'
  | 'heart-filled'
  | 'more'
  | 'equalizer'
  | 'lyrics'
  | 'queue'
  | 'shuffle'
  | 'repeat'
  | 'repeat-one'
  | 'back'
  | 'down'
  | 'video'
  | 'folder'
  | 'playlist'
  | 'artist'
  | 'album'
  | 'plus'
  | 'moon'
  | 'sun'
  | 'system'
  | 'timer'
  | 'scan'
  | 'user'
  | 'share'
  | 'key'
  | 'edit'
  | 'close'
  | 'fullscreen'
  | 'rotate'
  | 'subtitles'
  | 'speed'
  | 'volume'
  | 'lock'
  | 'crop'
  | 'rewind'
  | 'forward'
  | 'grid'
  | 'pip'
  | 'list';

const PATHS: Record<IconName, string> = {
  search: 'M10.5 3a7.5 7.5 0 105.06 13.06l4.19 4.19 1.41-1.41-4.19-4.19A7.5 7.5 0 0010.5 3zm0 2a5.5 5.5 0 110 11 5.5 5.5 0 010-11z',
  sort: 'M3 5h12v2H3V5zm0 4h9v2H3V9zm0 4h6v2H3v-2zm14.5-6.5v9.67l2.15-2.14 1.41 1.41-4.56 4.56-4.56-4.56 1.41-1.41 2.15 2.14V6.5h2z',
  settings:
    'M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2zm0 2.3L6 7.7v6.6l6 3.4 6-3.4V7.7l-6-3.4zm0 3.2a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  play: 'M8 5l12 7-12 7V5z',
  pause: 'M7 5h4v14H7V5zm6 0h4v14h-4V5z',
  next: 'M4 5l9 7-9 7V5zm12 0h3v14h-3V5z',
  previous: 'M20 5l-9 7 9 7V5zM5 5h3v14H5V5z',
  heart:
    'M12 21s-7.5-4.6-9.3-9A5.4 5.4 0 0112 5.6 5.4 5.4 0 0121.3 12c-1.8 4.4-9.3 9-9.3 9zm0-2.6c2.2-1.5 6-4.4 7.4-7.3a3.4 3.4 0 00-6-2.4L12 9.9l-1.4-1.2a3.4 3.4 0 00-6 2.4c1.4 2.9 5.2 5.8 7.4 7.3z',
  'heart-filled': 'M12 21s-7.5-4.6-9.3-9A5.4 5.4 0 0112 5.6 5.4 5.4 0 0121.3 12c-1.8 4.4-9.3 9-9.3 9z',
  more: 'M12 4a2 2 0 110 4 2 2 0 010-4zm0 6a2 2 0 110 4 2 2 0 010-4zm0 6a2 2 0 110 4 2 2 0 010-4z',
  equalizer:
    'M5 3h2v7H5V3zm0 9h2v9H5v-9zm6-9h2v4h-2V3zm0 6h2v12h-2V9zm6-6h2v11h-2V3zm0 13h2v5h-2v-5z',
  lyrics:
    'M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4V4zm2 2v11.2L8.3 15H20V6H6zm2 2h9v2H8V8zm0 4h6v2H8v-2z',
  queue: 'M3 6h12v2H3V6zm0 4h12v2H3v-2zm0 4h8v2H3v-2zm14-8l4 4-4 4V6z',
  shuffle:
    'M17 3l4 4-4 4V8.5h-1.6L12 12l-3.4 3.5H3v-2h4.8L11 10 7.8 6.5H3v-2h5.6L12 8l1.4-1.5H17V3zm0 10l4 4-4 4v-2.5h-3.6L12 17l1.4-1.5H17V13z',
  repeat: 'M7 4h10l3 3-3 3V8H7a3 3 0 00-3 3v1H2v-1a5 5 0 015-5V4zm10 8h2v1a5 5 0 01-5 5H7v2l-3-3 3-3v2h7a3 3 0 003-3v-1z',
  'repeat-one':
    'M7 4h10l3 3-3 3V8H7a3 3 0 00-3 3v1H2v-1a5 5 0 015-5V4zm10 8h2v1a5 5 0 01-5 5H7v2l-3-3 3-3v2h7a3 3 0 003-3v-1zm-6-1h2v6h-2v-4H9.8l1.2-2z',
  back: 'M15.4 4.6L14 3.2 5.2 12l8.8 8.8 1.4-1.4L8 12l7.4-7.4z',
  down: 'M12 15.6l-7.4-7.4 1.4-1.4L12 12.8l6-6 1.4 1.4-7.4 7.4z',
  video: 'M3 5h12a2 2 0 012 2v2.2l4-2.4v10.4l-4-2.4V17a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2z',
  folder: 'M3 5h6l2 2h10a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1z',
  playlist: 'M3 5h12v2H3V5zm0 4h12v2H3V9zm0 4h8v2H3v-2zm12 0v6l5-3-5-3z',
  artist: 'M12 3a4 4 0 110 8 4 4 0 010-8zm0 10c4.4 0 8 2.2 8 5v3H4v-3c0-2.8 3.6-5 8-5z',
  album:
    'M12 3a9 9 0 100 18 9 9 0 000-18zm0 2a7 7 0 110 14 7 7 0 010-14zm0 5a2 2 0 110 4 2 2 0 010-4z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z',
  moon: 'M14 3a9 9 0 106.9 14.4A9.5 9.5 0 0114 3z',
  sun: 'M12 6a6 6 0 110 12 6 6 0 010-12zm0-5h0v3h0V1zm0 19v3m9-11h3M1 12h3m14.4-7.4l2.1-2.1M3.5 20.5l2.1-2.1m12.8 2.1l2.1 2.1M3.5 3.5l2.1 2.1',
  system: 'M12 3a9 9 0 100 18V3z',
  timer: 'M12 4a8 8 0 110 16 8 8 0 010-16zm1 3h-2v6l5 3 1-1.7-4-2.3V7zM9 1h6v2H9V1z',
  scan: 'M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 0h2v6h-6v-2h4v-4zM7 11h10v2H7v-2z',
  user: 'M12 3a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0 11c4.4 0 8 2.4 8 5.3V21H4v-1.7c0-2.9 3.6-5.3 8-5.3z',
  share:
    'M14 3l7 7-7 7v-4c-4 0-6.7 1.3-9 4 .7-4.7 3.3-7.7 9-8.3V3z',
  key: 'M14 3a7 7 0 00-6.7 9L2 17.3V22h4.7l1-1v-2h2v-2h2l1.3-1.3A7 7 0 1014 3zm2.5 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3z',
  edit: 'M4 17.2L16.9 4.3l2.8 2.8L6.8 20H4v-2.8zm14.6-14l1.4 1.4-1.6 1.6-1.4-1.4 1.6-1.6z',
  close: 'M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z',
  grid: 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z',
  list: 'M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z',
  fullscreen: 'M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm16 0h2v7h-7v-2h5v-5z',
  rotate:
    'M12 5V2L7 6l5 4V7a5 5 0 11-5 5H5a7 7 0 107-7zm3.5 9h5v7h-5v-7z',
  subtitles:
    'M3 4h18a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1zm2 10h6v2H5v-2zm8 0h6v2h-6v-2zM5 10h4v2H5v-2zm6 0h8v2h-8v-2z',
  speed:
    'M12 4a9 9 0 018.5 12h-2.2A7 7 0 1012 6V4zm1 3v6l4.5 2.7-1 1.7L11 14V7h2z',
  volume: 'M4 9h3l5-4v14l-5-4H4V9zm12.5-1.5A6 6 0 0119 12a6 6 0 01-2.5 4.5l-1.2-1.6A4 4 0 0017 12a4 4 0 00-1.7-2.9l1.2-1.6z',
  lock: 'M7 10V7a5 5 0 0110 0v3h1a1 1 0 011 1v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h6V7a3 3 0 00-6 0v3z',
  crop: 'M5 3h2v14h14v2H5V3zm12 4h2v9h-2V7zM7 5h9v2H7V5z',
  rewind: 'M11 12l9-6v12l-9-6zm-9 0l9-6v12l-9-6z',
  forward: 'M13 12L4 6v12l9-6zm9 0l-9-6v12l9-6z',
  pip: 'M3 4h18a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1zm1 2v12h16V6H4zm8 5h7v6h-7v-6z',
};

export function Icon({ name, size = 22 }: Props) {
  const stroke = name === 'sun';
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={stroke ? 'none' : 'currentColor'}
      stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? 2 : undefined}
      strokeLinecap="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
