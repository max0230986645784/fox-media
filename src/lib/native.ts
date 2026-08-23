export interface NativeEntry {
  path: string;
  name: string;
  size: number;
  lastModified: number;
}

export interface NativeFolder {
  folder: string;
  entries: NativeEntry[];
}

/** Bridge exposed by the Electron preload script; absent in the browser build. */
export interface FoxNative {
  version: string;
  platform: string;
  pickFolder: () => Promise<NativeFolder | null>;
  pickFiles: () => Promise<NativeFolder | null>;
  readRange: (path: string, start: number, length: number) => Promise<Uint8Array>;
  mediaUrl: (path: string) => string;
  /** Same file served through ffmpeg for formats Chromium cannot decode. */
  convertUrl?: (path: string, mode: 'copy' | '1', at: number) => string;
  readLicence: () => Promise<string | null>;
  writeLicence: (contents: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    foxNative?: FoxNative;
  }
}

export function nativeBridge(): FoxNative | null {
  return typeof window === 'undefined' ? null : (window.foxNative ?? null);
}

export function isDesktop(): boolean {
  return nativeBridge() !== null;
}

/** Opens a payment page in the system browser on desktop, a new tab on the web. */
export function openExternal(url: string): void {
  const bridge = nativeBridge();
  if (bridge) void bridge.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
