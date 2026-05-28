import { useEffect } from "react";
import { syncMemoCache } from "@/lib/memo-cache";

const CACHE_REFRESH_ON_ONLINE_DEBOUNCE_MS = 2000;

export function useMemoCache() {
  useEffect(() => {
    // Initial sync on mount (only if online)
    if (navigator.onLine) {
      void syncMemoCache();
    }

    // Debounced re-sync when coming back online
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleOnline = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void syncMemoCache();
      }, CACHE_REFRESH_ON_ONLINE_DEBOUNCE_MS);
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      if (timer) clearTimeout(timer);
    };
  }, []);
}
