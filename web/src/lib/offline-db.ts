import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Memo, Visibility } from "@/types/proto/api/v1/memo_service_pb";

// A queued attachment to be uploaded when back online
export interface QueuedAttachment {
  filename: string;
  type: string;
  bytes: Uint8Array;
  previewUrl: string; // local blob URL for display while pending
}

// Status of a pending offline memo
export type OfflineQueueStatus = "pending" | "syncing" | "failed";

// A memo queued for creation while offline
export interface OfflineQueueItem {
  localId: string; // crypto.randomUUID()
  content: string;
  visibility: Visibility;
  createTime: Date;
  attachments: QueuedAttachment[];
  status: OfflineQueueStatus;
  error?: string;
}

// A cached server memo for offline reading
export interface CachedMemo {
  name: string; // memos/{id} — primary key
  data: Memo;
  cachedAt: Date;
}

interface MemosOfflineDB extends DBSchema {
  "offline-queue": {
    key: string; // localId
    value: OfflineQueueItem;
    indexes: { "by-status": OfflineQueueStatus };
  };
  "memos-cache": {
    key: string; // memo name
    value: CachedMemo;
    indexes: { "by-cachedAt": Date };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = "memos-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MemosOfflineDB>> | null = null;

export function getOfflineDB(): Promise<IDBPDatabase<MemosOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MemosOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Offline create queue
        const queueStore = db.createObjectStore("offline-queue", { keyPath: "localId" });
        queueStore.createIndex("by-status", "status");

        // 30-day memo cache
        const cacheStore = db.createObjectStore("memos-cache", { keyPath: "name" });
        cacheStore.createIndex("by-cachedAt", "cachedAt");

        // App metadata (lastCacheSync, etc.)
        db.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

// Queue operations
export async function enqueueOfflineMemo(item: OfflineQueueItem): Promise<void> {
  const db = await getOfflineDB();
  await db.put("offline-queue", item);
}

export async function getPendingQueueItems(): Promise<OfflineQueueItem[]> {
  const db = await getOfflineDB();
  return db.getAllFromIndex("offline-queue", "by-status", "pending");
}

export async function getAllQueueItems(): Promise<OfflineQueueItem[]> {
  const db = await getOfflineDB();
  return db.getAll("offline-queue");
}

export async function updateQueueItemStatus(localId: string, status: OfflineQueueStatus, error?: string): Promise<void> {
  const db = await getOfflineDB();
  const item = await db.get("offline-queue", localId);
  if (item) {
    await db.put("offline-queue", { ...item, status, error });
  }
}

export async function removeQueueItem(localId: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete("offline-queue", localId);
}

// Cache operations
export async function cacheMemos(memos: Memo[]): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction("memos-cache", "readwrite");
  const now = new Date();
  await Promise.all([...memos.map((memo) => tx.store.put({ name: memo.name, data: memo, cachedAt: now })), tx.done]);
}

export async function getCachedMemos(): Promise<Memo[]> {
  const db = await getOfflineDB();
  const entries = await db.getAll("memos-cache");
  return entries.map((e) => e.data);
}

export async function evictOldCachedMemos(cutoff: Date): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction("memos-cache", "readwrite");
  const index = tx.store.index("by-cachedAt");
  const range = IDBKeyRange.upperBound(cutoff);
  let cursor = await index.openCursor(range);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// Meta operations
export async function getMetaValue<T>(key: string): Promise<T | undefined> {
  const db = await getOfflineDB();
  const entry = await db.get("meta", key);
  return entry?.value as T | undefined;
}

export async function setMetaValue(key: string, value: unknown): Promise<void> {
  const db = await getOfflineDB();
  await db.put("meta", { key, value });
}
