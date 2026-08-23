import type { AudioTags, MediaItem, MediaKind } from '../types';
import { parseAudioTags, readAudioTags, TAG_READ_LENGTH } from './id3';
import type { NativeEntry } from './native';
import { nativeBridge } from './native';

const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv', 'avi'];
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'];

export const MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}

export function kindOfName(name: string, mimeType = ''): MediaKind | null {
  const extension = extensionOf(name);
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video';
  if (AUDIO_EXTENSIONS.includes(extension)) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

/** Stable id so edited metadata survives a rescan of the same folder. */
function idOf(path: string, size: number, lastModified: number): string {
  const seed = `${path}|${size}|${lastModified}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36) + size.toString(36);
}

/** "03 - My_Song.mp3" -> "My Song" */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{1,3}[\s._-]+/, '')
    .replace(/[_.]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface Descriptor {
  kind: MediaKind;
  fileName: string;
  relativePath: string;
  path: string | null;
  size: number;
  lastModified: number;
  tags: AudioTags;
}

function toItem(descriptor: Descriptor): MediaItem {
  const { tags } = descriptor;
  return {
    id: idOf(descriptor.relativePath, descriptor.size, descriptor.lastModified),
    kind: descriptor.kind,
    fileName: descriptor.fileName,
    relativePath: descriptor.relativePath,
    path: descriptor.path,
    size: descriptor.size,
    lastModified: descriptor.lastModified,
    title: tags.title ?? titleFromFileName(descriptor.fileName),
    artist: tags.artist ?? '',
    album: tags.album ?? '',
    year: tags.year ?? '',
    cover: tags.cover ?? null,
    duration: null,
    favorite: false,
    playCount: 0,
    lastPlayedAt: null,
    progress: 0,
    addedAt: Date.now(),
  };
}

export interface ScanResult {
  items: MediaItem[];
  files: Map<string, File>;
  skipped: number;
}

function pathOf(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return relative && relative.length > 0 ? relative : file.name;
}

/** Turns picked files into library entries, reading audio tags when available. */
export async function scanFiles(fileList: File[]): Promise<ScanResult> {
  const items: MediaItem[] = [];
  const files = new Map<string, File>();
  let skipped = 0;

  for (const file of fileList) {
    const kind = kindOfName(file.name, file.type);
    if (!kind) {
      skipped += 1;
      continue;
    }

    let tags: AudioTags = {};
    if (kind === 'audio') {
      try {
        tags = await readAudioTags(file);
      } catch {
        tags = {};
      }
    }

    const item = toItem({
      kind,
      fileName: file.name,
      relativePath: pathOf(file),
      path: null,
      size: file.size,
      lastModified: file.lastModified,
      tags,
    });
    if (files.has(item.id)) continue;
    files.set(item.id, file);
    items.push(item);
  }

  return { items, files, skipped };
}

/** Desktop scan: entries come from the Electron main process with real paths. */
export async function scanNativeEntries(entries: NativeEntry[]): Promise<MediaItem[]> {
  const bridge = nativeBridge();
  const items: MediaItem[] = [];

  for (const entry of entries) {
    const kind = kindOfName(entry.name);
    if (!kind) continue;

    let tags: AudioTags = {};
    if (kind === 'audio' && bridge) {
      try {
        const head = await bridge.readRange(entry.path, 0, TAG_READ_LENGTH);
        const tailStart = Math.max(0, entry.size - 128);
        const tail = await bridge.readRange(entry.path, tailStart, 128);
        tags = parseAudioTags(head, tail);
      } catch {
        tags = {};
      }
    }

    items.push(
      toItem({
        kind,
        fileName: entry.name,
        relativePath: entry.path,
        path: entry.path,
        size: entry.size,
        lastModified: entry.lastModified,
        tags,
      }),
    );
  }

  return items;
}

/** Flattens a drag & drop payload, walking dropped directories recursively. */
export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length === 0) return Array.from(dataTransfer.files);

  const files: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
      });
      if (file) files.push(file);
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    let batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(resolve, () => resolve([]));
    });
    while (batch.length > 0) {
      for (const child of batch) await walk(child);
      batch = await new Promise<FileSystemEntry[]>((resolve) => {
        reader.readEntries(resolve, () => resolve([]));
      });
    }
  };

  for (const entry of entries) await walk(entry);
  return files;
}
