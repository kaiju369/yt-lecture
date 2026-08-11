import { openDB, type IDBPDatabase } from "idb";
import type { Annotation, Page, PageObject, RecoveryDoc, Stroke, VideoRecord } from "./types";
import { SCHEMA_VERSION } from "./types";

const DB_NAME = "videoink";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

/** Upgrade legacy v1 annotations (flat strokes) into canonical pages. */
export function annotationToPage(a: Annotation, rank: number): Page {
  const objects: PageObject[] = (a.strokes ?? []).map((s, i) => ({
    ...(s as Stroke),
    kind: "stroke" as const,
    tool: (s as Stroke).tool === "highlighter" ? ("highlighter" as const) : ("pen" as const),
    z: i + 1,
    createdAt: a.createdAt,
  }));
  return {
    id: a.id,
    schemaVersion: SCHEMA_VERSION,
    type: "video",
    createdRank: rank,
    currentOrder: rank,
    title: `${a.title}`,
    sourceType: a.sourceType,
    sourceKey: a.sourceKey,
    sourceUrl: a.sourceUrl,
    youtubeVideoId: a.youtubeVideoId,
    videoTitle: a.title,
    timestamp: a.timestamp,
    duration: a.duration,
    aspectRatio: a.videoAspectRatio,
    objects,
    snapshot: a.snapshot,
    thumbnail: a.snapshot?.dataUrl,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function getDb() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
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
        if (!db.objectStoreNames.contains("pages")) {
          const p = db.createObjectStore("pages", { keyPath: "id" });
          p.createIndex("createdRank", "createdRank");
          p.createIndex("currentOrder", "currentOrder");
          p.createIndex("sourceKey", "sourceKey");
        }
        if (oldVersion === 1) {
          // migrate existing annotations into pages, preserving order by creation
          const legacy = (await tx.objectStore("annotations").getAll()) as Annotation[];
          legacy.sort((a, b) => a.createdAt - b.createdAt);
          const store = tx.objectStore("pages");
          legacy.forEach((a, i) => {
            void store.put(annotationToPage(a, i + 1));
          });
          // legacy recovery docs are dropped (schema changed)
          void tx.objectStore("recovery").clear();
        }
      },
    });
  }
  return dbPromise;
}

/* ------------------------------- pages ------------------------------ */

export async function listPages(): Promise<Page[]> {
  const db = await getDb();
  const all = (await db.getAll("pages")) as Page[];
  return all.sort((a, b) => a.currentOrder - b.currentOrder);
}

export async function putPage(p: Page) {
  const db = await getDb();
  await db.put("pages", p);
}

export async function putPages(pages: Page[]) {
  const db = await getDb();
  const tx = db.transaction("pages", "readwrite");
  for (const p of pages) void tx.store.put(p);
  await tx.done;
}

export async function getPage(id: string): Promise<Page | undefined> {
  const db = await getDb();
  return (await db.get("pages", id)) as Page | undefined;
}

export async function deletePage(id: string) {
  const db = await getDb();
  await db.delete("pages", id);
}

export async function nextRanks(): Promise<{ rank: number; order: number }> {
  const pages = await listPages();
  return {
    rank: pages.reduce((m, p) => Math.max(m, p.createdRank), 0) + 1,
    order: pages.reduce((m, p) => Math.max(m, p.currentOrder), 0) + 1,
  };
}

/* ------------------------------ videos ------------------------------ */

export async function putVideo(v: VideoRecord) {
  const db = await getDb();
  await db.put("videos", v);
}

export async function getVideo(key: string): Promise<VideoRecord | undefined> {
  const db = await getDb();
  return (await db.get("videos", key)) as VideoRecord | undefined;
}

/* ----------------------------- recovery ----------------------------- */

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

/* ----------------------------- settings ----------------------------- */

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const row = await db.get("settings", key);
  return row?.value as T | undefined;
}

export async function setSetting<T>(key: string, value: T) {
  const db = await getDb();
  await db.put("settings", { key, value });
}
