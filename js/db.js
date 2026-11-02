import { matchTest, reportGroupKey, specimenFromName } from "./match.js";
import { newId as makeId } from "./id.js";

const DB_NAME = "healthlog";
const DB_VERSION = 2;

export const STORES = ["reports", "results", "followups", "customTests", "bp", "weights", "glucose", "meds", "visits"];

let dbPromise;

function createStores(db, names) {
  names.forEach((name) => {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
  });
}

function migrateLabs(tx, labs) {
  const results = tx.objectStore("results");
  const reports = tx.objectStore("reports");
  const custom = tx.objectStore("customTests");
  const groups = new Map();
  labs.forEach((lab) => {
    const key = reportGroupKey(lab.date, lab.lab);
    if (!groups.has(key)) {
      const report = {
        id: makeId(),
        dateCollected: String(lab.date || "").slice(0, 10),
        patientName: "",
        lab: String(lab.lab || "").trim(),
        labNumber: "",
        doctor: "",
        fasting: null,
        notes: "Brought in from an earlier HealthLog backup.",
        sample: lab.sample === true,
        createdAt: lab.createdAt || "",
        updatedAt: lab.updatedAt || "",
      };
      groups.set(key, report);
      reports.put(report);
    }
    const report = groups.get(key);
    const matched = matchTest(lab.testName);
    let testId = matched?.id || "";
    if (!testId) {
      testId = `custom-${lab.id || makeId()}`;
      custom.put({
        id: testId,
        name: lab.testName || "Custom test",
        aliases: [],
        panel: "custom",
        unit: lab.unit || "",
        resultType: "numeric",
        ref: lab.refLow != null || lab.refHigh != null ? {
          low: lab.refLow ?? null,
          high: lab.refHigh ?? null,
          lowInclusive: lab.lowInclusive !== false,
          highInclusive: lab.highInclusive !== false,
          text: lab.refText || "",
        } : null,
        about: "Saved from an earlier HealthLog entry.",
        sample: lab.sample === true,
      });
    }
    results.put({
      id: lab.id || makeId(),
      testId,
      name: lab.testName || "",
      reportId: report.id,
      date: String(lab.date || "").slice(0, 10),
      numeric: lab.value ?? null,
      comparator: "",
      qualitative: "",
      unit: lab.unit || matched?.unit || "",
      secondaryNumeric: null,
      secondaryUnit: "",
      specimen: specimenFromName(lab.testName),
      refLow: lab.refLow ?? null,
      refHigh: lab.refHigh ?? null,
      lowInclusive: lab.lowInclusive !== false,
      highInclusive: lab.highInclusive !== false,
      refText: lab.refText || "",
      flag: lab.flag || "",
      notes: lab.notes || "",
      sample: lab.sample === true,
      createdAt: lab.createdAt || "",
      updatedAt: lab.updatedAt || "",
    });
  });
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = req.transaction;
        createStores(db, ["bp", "weights", "glucose", "meds", "visits", ...STORES]);
        if (db.objectStoreNames.contains("labs")) {
          const request = tx.objectStore("labs").getAll();
          request.onsuccess = () => {
            migrateLabs(tx, request.result || []);
            db.deleteObjectStore("labs");
          };
        }
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
  return makeId();
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

export async function putMany(entries) {
  const db = await getDb();
  const names = [...new Set(entries.map((entry) => entry.store))];
  const tx = db.transaction(names, "readwrite");
  entries.forEach((entry) => tx.objectStore(entry.store).put(entry.record));
  await txDone(tx);
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
