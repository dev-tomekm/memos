import { WifiOffIcon } from "lucide-react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTranslate } from "@/utils/i18n";

const OfflineBanner = () => {
  const isOnline = useOnlineStatus();
  const { pendingItems } = useOfflineQueue();
  const t = useTranslate();

  if (isOnline && pendingItems.length === 0) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
        isOnline ? "bg-amber-500/90 text-white" : "bg-neutral-800/90 text-white"
      }`}
    >
      <WifiOffIcon className="size-4 shrink-0" />
      {isOnline ? <span>{t("offline.syncing", { count: pendingItems.length })}</span> : <span>{t("offline.offline-mode")}</span>}
    </div>
  );
};

export default OfflineBanner;
