import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../types';
import {
  clearBlobs,
  clearItems,
  deleteBlob,
  deleteItem,
  loadBlobs,
  loadItems,
  saveBlob,
  saveItems,
} from '../lib/db';
import { scanFiles, scanNativeEntries } from '../lib/scan';
import { nativeBridge, type NativeEntry } from '../lib/native';

export interface ScanPreview {
  /** Media found by the scan and not already in the library. */
  candidates: MediaItem[];
  /** Files that were neither audio nor video. */
  skipped: number;
  /** Media already present in the library. */
  duplicates: number;
  /** Existing entries whose file was re-attached by this scan. */
  relinked: number;
}

export interface Library {
  items: MediaItem[];
  ready: boolean;
  scanning: boolean;
  missingCount: number;
  /** Scan result waiting for the user to choose what to import. */
  preview: ScanPreview | null;
  scanFilesForPreview: (files: File[]) => Promise<void>;
  scanNativeForPreview: (mode: 'folder' | 'files') => Promise<void>;
  importSelection: (ids: string[]) => Promise<number>;
  /** Merges entries restored from a Drive backup, keeping existing ones. */
  mergeItems: (restored: MediaItem[]) => Promise<number>;
  /** Adds files already on disk (desktop downloads) without asking again. */
  addNativeEntries: (entries: NativeEntry[]) => Promise<number>;
  /**
   * Adds in-memory files without asking again. `keep` stores the file itself on
   * the device (browser downloads), so it still plays after a reload.
   */
  addFiles: (picked: File[], keep?: boolean) => Promise<number>;
  cancelPreview: () => void;
  updateItem: (id: string, patch: Partial<MediaItem>) => void;
  removeItem: (id: string) => void;
  clearLibrary: () => void;
  urlFor: (id: string) => string | null;
  isAvailable: (id: string) => boolean;
}

/**
 * Library metadata lives in IndexedDB. On desktop the absolute path is stored
 * too, so playback survives a restart. In the browser, files picked by hand stay
 * in memory (a rescan is needed after a reload) while downloaded files are kept
 * in IndexedDB and replay offline.
 */
export function useLibrary(): Library {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [availableIds, setAvailableIds] = useState<Set<string>>(() => new Set());
  const files = useRef(new Map<string, File>());
  const pendingFiles = useRef(new Map<string, File>());
  const urls = useRef(new Map<string, string>());
  const knownIds = useRef(new Set<string>());

  useEffect(() => {
    knownIds.current = new Set(items.map((item) => item.id));
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadItems(), loadBlobs().catch(() => new Map<string, File>())])
      .then(([stored, blobs]) => {
        if (cancelled) return;
        for (const [id, file] of blobs) files.current.set(id, file);
        if (blobs.size > 0) setAvailableIds(new Set(files.current.keys()));
        setItems(stored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cache = urls.current;
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  const scanFilesForPreview = useCallback(async (picked: File[]) => {
    setScanning(true);
    try {
      const result = await scanFiles(picked);
      pendingFiles.current = result.files;
      const candidates = result.items.filter((item) => !knownIds.current.has(item.id));

      let relinked = 0;
      for (const [id, file] of result.files) {
        if (knownIds.current.has(id) && !files.current.has(id)) {
          files.current.set(id, file);
          relinked += 1;
        }
      }
      if (relinked > 0) setAvailableIds(new Set(files.current.keys()));

      if (candidates.length === 0 && relinked > 0) {
        pendingFiles.current = new Map();
        return;
      }

      setPreview({
        candidates,
        skipped: result.skipped,
        duplicates: result.items.length - candidates.length,
        relinked,
      });
    } finally {
      setScanning(false);
    }
  }, []);

  const scanNativeForPreview = useCallback(async (mode: 'folder' | 'files') => {
    const bridge = nativeBridge();
    if (!bridge) return;
    const picked = mode === 'folder' ? await bridge.pickFolder() : await bridge.pickFiles();
    if (!picked) return;

    setScanning(true);
    try {
      const scanned = await scanNativeEntries(picked.entries);
      pendingFiles.current = new Map();
      const candidates = scanned.filter((item) => !knownIds.current.has(item.id));
      setPreview({
        candidates,
        skipped: 0,
        duplicates: scanned.length - candidates.length,
        relinked: 0,
      });
    } finally {
      setScanning(false);
    }
  }, []);

  const cancelPreview = useCallback(() => {
    pendingFiles.current = new Map();
    setPreview(null);
  }, []);

  /** Adds only what the user selected in the scan preview. */
  const importSelection = useCallback(
    async (ids: string[]) => {
      if (!preview) return 0;
      const wanted = new Set(ids);
      const chosen = preview.candidates.filter((item) => wanted.has(item.id));

      for (const item of chosen) {
        const file = pendingFiles.current.get(item.id);
        if (file) files.current.set(item.id, file);
      }
      setAvailableIds(new Set(files.current.keys()));
      setItems((current) => [...current, ...chosen]);
      await saveItems(chosen);

      pendingFiles.current = new Map();
      setPreview(null);
      return chosen.length;
    },
    [preview],
  );

  const mergeItems = useCallback(async (restored: MediaItem[]) => {
    const fresh = restored.filter((item) => !knownIds.current.has(item.id));
    if (fresh.length === 0) return 0;
    setItems((current) => [...current, ...fresh]);
    await saveItems(fresh);
    return fresh.length;
  }, []);

  const addNativeEntries = useCallback(async (entries: NativeEntry[]) => {
    const scanned = await scanNativeEntries(entries);
    const fresh = scanned.filter((item) => !knownIds.current.has(item.id));
    if (fresh.length === 0) return 0;
    setItems((current) => [...current, ...fresh]);
    await saveItems(fresh);
    return fresh.length;
  }, []);

  const addFiles = useCallback(async (picked: File[], keep = false) => {
    const result = await scanFiles(picked);
    const fresh = result.items.filter((item) => !knownIds.current.has(item.id));
    for (const item of fresh) {
      const file = result.files.get(item.id);
      if (!file) continue;
      files.current.set(item.id, file);
      if (keep) await saveBlob(item.id, file);
    }
    if (fresh.length === 0) return 0;
    setAvailableIds(new Set(files.current.keys()));
    setItems((current) => [...current, ...fresh]);
    await saveItems(fresh);
    return fresh.length;
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<MediaItem>) => {
    setItems((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
      const updated = next.find((item) => item.id === id);
      if (updated) void saveItems([updated]);
      return next;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    const url = urls.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      urls.current.delete(id);
    }
    files.current.delete(id);
    setAvailableIds(new Set(files.current.keys()));
    setItems((current) => current.filter((item) => item.id !== id));
    void deleteItem(id);
    void deleteBlob(id);
  }, []);

  const clearLibrary = useCallback(() => {
    for (const url of urls.current.values()) URL.revokeObjectURL(url);
    urls.current.clear();
    files.current.clear();
    setAvailableIds(new Set());
    setItems([]);
    void clearItems();
    void clearBlobs();
  }, []);

  const pathsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) if (item.path) map.set(item.id, item.path);
    return map;
  }, [items]);

  const urlFor = useCallback(
    (id: string) => {
      const bridge = nativeBridge();
      const path = pathsById.get(id);
      if (bridge && path) return bridge.mediaUrl(path);

      const cached = urls.current.get(id);
      if (cached) return cached;
      const file = files.current.get(id);
      if (!file) return null;
      const url = URL.createObjectURL(file);
      urls.current.set(id, url);
      return url;
    },
    [pathsById],
  );

  const isAvailable = useCallback(
    (id: string) => availableIds.has(id) || pathsById.has(id),
    [availableIds, pathsById],
  );

  const missingCount = useMemo(
    () => items.filter((item) => !availableIds.has(item.id) && !item.path).length,
    [items, availableIds],
  );

  return {
    items,
    ready,
    scanning,
    missingCount,
    preview,
    scanFilesForPreview,
    scanNativeForPreview,
    importSelection,
    mergeItems,
    addNativeEntries,
    addFiles,
    cancelPreview,
    updateItem,
    removeItem,
    clearLibrary,
    urlFor,
    isAvailable,
  };
}
