// Minimal IndexedDB wrapper. Stores: 'qr' and 'tags', keyPath 'id'.

const DB_NAME = 'mezastar-wallet';
const DB_VERSION = 1;
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['qr', 'tags']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export const dbPut = (store, obj) => run(store, 'readwrite', (s) => s.put(obj));
export const dbGet = (store, id) => run(store, 'readonly', (s) => s.get(id));
export const dbAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const dbDelete = (store, id) => run(store, 'readwrite', (s) => s.delete(id));
export const dbClear = (store) => run(store, 'readwrite', (s) => s.clear());
