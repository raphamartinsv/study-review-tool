// js/db.js
const DB_NAME = "study-review-db";
const DB_VERSION = 1;
const STORE = "datasets";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "datasetId" });
      }
    };

    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveDataset({ datasetId, studies }) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error);

    tx.objectStore(STORE).put({
      datasetId,
      createdAt: Date.now(),
      studies
    });

    tx.oncomplete = () => resolve();
  });
}

export async function loadDataset(datasetId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    tx.onerror = () => reject(tx.error);

    const req = tx.objectStore(STORE).get(datasetId);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || null);
  });
}