const DB_NAME = "healthlog";
const DB_VERSION = 1;

export const STORES = ["labs", "bp", "weights", "glucose", "meds", "visits"];

let dbPromise;

export function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id" });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error("IndexedDB could not be opened."));
      };
    });
  }
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Could not save on this device."));
    tx.onabort = () => reject(tx.error || new Error("The save was cancelled."));
  });
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function stamp(record, existing) {
  const now = new Date().toISOString();
  return {
    ...record,
    createdAt: existing?.createdAt || record.createdAt || now,
    updatedAt: now,
  };
}

export async function list(store) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, record) {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(record);
  await txDone(tx);
  return record;
}

export async function remove(store, id) {
  const db = await getDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

export async function dump() {
  const data = {};
  for (const store of STORES) data[store] = await list(store);
  return data;
}

export async function clearStores() {
  const db = await getDb();
  const tx = db.transaction(STORES, "readwrite");
  STORES.forEach((store) => tx.objectStore(store).clear());
  await txDone(tx);
}

export async function writeAll(data, mode) {
  const db = await getDb();
  const tx = db.transaction(STORES, "readwrite");
  STORES.forEach((store) => {
    const os = tx.objectStore(store);
    if (mode === "replace") os.clear();
    (data[store] || []).forEach((record) => os.put(record));
  });
  await txDone(tx);
}

export async function removeSample() {
  for (const store of STORES) {
    const rows = await list(store);
    for (const row of rows) {
      if (row.sample) await remove(store, row.id);
    }
  }
}
