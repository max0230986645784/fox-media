import type { MediaItem } from '../types';

const DB_NAME = 'fox-media';
const DB_VERSION = 2;
const STORE = 'items';
/** Files downloaded by the app, kept so they still play with no network. */
const BLOBS = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(BLOBS)) {
          db.createObjectStore(BLOBS);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function loadItems(): Promise<MediaItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = tx(db, 'readonly').getAll();
    request.onsuccess = () => resolve(request.result as MediaItem[]);
    request.onerror = () => reject(request.error);
  });
}

export async function saveItems(items: MediaItem[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    for (const item of items) store.put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteItem(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = tx(db, 'readwrite').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearItems(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = tx(db, 'readwrite').clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function blobStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(BLOBS, mode).objectStore(BLOBS);
}

/** Keeps a downloaded file on the device so it survives a reload. */
export async function saveBlob(id: string, file: File): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = blobStore(db, 'readwrite').put(file, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadBlobs(): Promise<Map<string, File>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = blobStore(db, 'readonly');
    const keys = store.getAllKeys();
    const values = store.getAll();
    keys.onerror = () => reject(keys.error);
    values.onerror = () => reject(values.error);
    values.onsuccess = () => {
      const map = new Map<string, File>();
      const ids = keys.result as IDBValidKey[];
      const blobs = values.result as File[];
      ids.forEach((id, index) => {
        const file = blobs[index];
        if (typeof id === 'string' && file) map.set(id, file);
      });
      resolve(map);
    };
  });
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = blobStore(db, 'readwrite').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearBlobs(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = blobStore(db, 'readwrite').clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
