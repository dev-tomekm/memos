import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { attachmentServiceClient, memoServiceClient } from "@/connect";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";
import { getAllQueueItems, type OfflineQueueItem, removeQueueItem, updateQueueItemStatus } from "./offline-db";

const SYNC_LOCK_NAME = "memos-offline-sync";

// Listeners notified after each queue item is processed
type SyncListener = () => void;
const syncListeners = new Set<SyncListener>();

export function onSyncComplete(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

async function processQueueItem(item: OfflineQueueItem): Promise<void> {
  await updateQueueItemStatus(item.localId, "syncing");

  // 1. Upload all queued attachments and collect server names
  const serverAttachments = [];
  for (const queued of item.attachments) {
    const attachment = await attachmentServiceClient.createAttachment({
      attachment: create(AttachmentSchema, {
        filename: queued.filename,
        type: queued.type,
        content: queued.bytes,
      }),
    });
    serverAttachments.push(create(AttachmentSchema, { name: attachment.name }));
  }

  // 2. Create the memo with server attachment references
  await memoServiceClient.createMemo({
    memo: create(MemoSchema, {
      content: item.content,
      visibility: item.visibility,
      attachments: serverAttachments,
      createTime: timestampFromDate(item.createTime),
    }),
  });

  await removeQueueItem(item.localId);
}

export async function syncOfflineQueue(): Promise<void> {
  if (!navigator.onLine) return;

  // Web Locks: ensure only one tab/context processes the queue at a time
  if (typeof navigator.locks !== "undefined") {
    await navigator.locks.request(SYNC_LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) return; // Another tab holds the lock — skip
      await runSync();
    });
  } else {
    // Fallback for browsers without Web Locks API
    await runSync();
  }

  // Notify UI subscribers so they can refetch memo lists
  for (const listener of syncListeners) {
    listener();
  }
}

async function runSync(): Promise<void> {
  const items = await getAllQueueItems();
  const pending = items.filter((item) => item.status === "pending" || item.status === "syncing");

  for (const item of pending) {
    try {
      await processQueueItem(item);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateQueueItemStatus(item.localId, "failed", message);
    }
  }
}

export async function retryFailedQueueItem(localId: string): Promise<void> {
  await updateQueueItemStatus(localId, "pending");
  await syncOfflineQueue();
}
