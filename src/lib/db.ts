import type { MediaItem } from '../types';

const DB_NAME = 'fox-media';
const DB_VERSION = 1;
const STORE = 'items';

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
