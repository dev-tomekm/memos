import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getAllQueueItems, type OfflineQueueItem } from "@/lib/offline-db";
import { onSyncComplete, retryFailedQueueItem, syncOfflineQueue } from "@/lib/offline-sync";
import { memoKeys } from "./useMemoQueries";
import { userKeys } from "./useUserQueries";

export function useOfflineQueue() {
  const [items, setItems] = useState<OfflineQueueItem[]>([]);
  const queryClient = useQueryClient();
  const mountedRef = useRef(true);

  const refresh = async () => {
    const all = await getAllQueueItems();
    if (mountedRef.current) {
      setItems(all);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    // Subscribe to sync completion events to refresh UI state
    const unsubscribe = onSyncComplete(() => {
      void refresh();
      // Invalidate React Query caches so the server memo replaces the local one
      queryClient.invalidateQueries({ queryKey: memoKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.stats() });
    });

    // Sync when coming back online
    const handleOnline = () => {
      void syncOfflineQueue();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      mountedRef.current = false;
      unsubscribe();
      window.removeEventListener("online", handleOnline);
    };
  }, [queryClient]);

  const retry = async (localId: string) => {
    await retryFailedQueueItem(localId);
    await refresh();
  };

  return {
    items,
    pendingItems: items.filter((i) => i.status === "pending" || i.status === "syncing"),
    failedItems: items.filter((i) => i.status === "failed"),
    refresh,
    retry,
  };
}
