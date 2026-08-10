import { openDB, type IDBPDatabase } from "idb";
import type { Annotation, RecoveryDoc, VideoRecord } from "./types";

const DB_NAME = "videoink";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("annotations")) {
          const s = db.createObjectStore("annotations", { keyPath: "id" });
          s.createIndex("sourceKey", "sourceKey");
          s.createIndex("createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("videos")) {
          db.createObjectStore("videos", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("recovery")) {
          db.createObjectStore("recovery", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

export async function listAnnotations(): Promise<Annotation[]> {
  const db = await getDb();
  const all = (await db.getAll("annotations")) as Annotation[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function putAnnotation(a: Annotation) {
  const db = await getDb();
  await db.put("annotations", a);
}

export async function deleteAnnotation(id: string) {
  const db = await getDb();
  await db.delete("annotations", id);
}

export async function putVideo(v: VideoRecord) {
  const db = await getDb();
  await db.put("videos", v);
}

export async function getVideo(key: string): Promise<VideoRecord | undefined> {
  const db = await getDb();
  return (await db.get("videos", key)) as VideoRecord | undefined;
}

export async function saveRecovery(doc: RecoveryDoc) {
  const db = await getDb();
  await db.put("recovery", doc);
}

export async function loadRecovery(): Promise<RecoveryDoc | undefined> {
  const db = await getDb();
  return (await db.get("recovery", "active")) as RecoveryDoc | undefined;
}

export async function clearRecovery() {
  const db = await getDb();
  await db.delete("recovery", "active");
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const row = await db.get("settings", key);
  return row?.value as T | undefined;
}

export async function setSetting<T>(key: string, value: T) {
  const db = await getDb();
  await db.put("settings", { key, value });
}
