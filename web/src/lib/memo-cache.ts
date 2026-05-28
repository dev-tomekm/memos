import { create } from "@bufbuild/protobuf";
import { memoServiceClient } from "@/connect";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { ListMemosRequestSchema } from "@/types/proto/api/v1/memo_service_pb";
import { cacheMemos, evictOldCachedMemos, getCachedMemos, getMetaValue, setMetaValue } from "./offline-db";

const LAST_CACHE_SYNC_KEY = "lastCacheSync";
const CACHE_WINDOW_DAYS = 30;
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function thirtyDaysAgoEpoch(): number {
  const d = new Date();
  d.setDate(d.getDate() - CACHE_WINDOW_DAYS);
  return Math.floor(d.getTime() / 1000);
}

async function fetchAllMemosInWindow(): Promise<Memo[]> {
  const epochCutoff = thirtyDaysAgoEpoch();
  // CEL filter: create_time is an integer (Unix epoch seconds)
  const filter = `create_time >= ${epochCutoff}`;

  const allMemos: Memo[] = [];
  let pageToken = "";

  do {
    const response = await memoServiceClient.listMemos(
      create(ListMemosRequestSchema, {
        pageSize: 200,
        pageToken,
        state: State.NORMAL,
        orderBy: "create_time desc",
        filter,
      } as Record<string, unknown>),
    );
    allMemos.push(...response.memos);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return allMemos;
}

export async function syncMemoCache(): Promise<void> {
  const now = Date.now();
  const lastSync = await getMetaValue<number>(LAST_CACHE_SYNC_KEY);

  if (lastSync && now - lastSync < MIN_SYNC_INTERVAL_MS) {
    return; // Synced recently enough
  }

  const memos = await fetchAllMemosInWindow();
  await cacheMemos(memos);

  // Evict cached entries older than 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_WINDOW_DAYS);
  await evictOldCachedMemos(cutoff);

  await setMetaValue(LAST_CACHE_SYNC_KEY, now);
}

export async function getOfflineMemoList(): Promise<Memo[]> {
  const memos = await getCachedMemos();
  // Sort by createTime descending (most recent first)
  return memos.sort((a, b) => {
    const aTime = a.createTime ? Number(a.createTime.seconds) : 0;
    const bTime = b.createTime ? Number(b.createTime.seconds) : 0;
    return bTime - aTime;
  });
}
