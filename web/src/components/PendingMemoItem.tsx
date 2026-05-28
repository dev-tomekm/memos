import { AlertCircleIcon, ClockIcon, RefreshCwIcon } from "lucide-react";
import type { OfflineQueueItem } from "@/lib/offline-db";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { MEMO_CARD_BASE_CLASSES } from "./MemoView/constants";
import { Button } from "./ui/button";

interface Props {
  item: OfflineQueueItem;
  onRetry?: (localId: string) => void;
}

const PendingMemoItem = ({ item, onRetry }: Props) => {
  const t = useTranslate();
  const isFailed = item.status === "failed";

  return (
    <div className={cn(MEMO_CARD_BASE_CLASSES, "opacity-75 border-dashed")}>
      {/* Status badge */}
      <div className="flex items-center gap-1.5 text-xs">
        {isFailed ? (
          <span className="flex items-center gap-1 text-red-500 font-medium">
            <AlertCircleIcon className="size-3.5" />
            {t("offline.sync-failed")}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
            <ClockIcon className="size-3.5" />
            {t("offline.pending-sync")}
          </span>
        )}
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{item.createTime.toLocaleTimeString()}</span>
      </div>

      {/* Memo content preview */}
      <p className="w-full text-sm text-foreground whitespace-pre-wrap line-clamp-6 break-words">{item.content}</p>

      {/* Attachment previews */}
      {item.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.attachments.map((att, idx) =>
            att.type.startsWith("image/") ? (
              <img key={idx} src={att.previewUrl} alt={att.filename} className="h-20 w-auto rounded object-cover border border-border" />
            ) : (
              <span key={idx} className="text-xs text-muted-foreground px-2 py-1 rounded bg-muted">
                {att.filename}
              </span>
            ),
          )}
        </div>
      )}

      {/* Retry button for failed items */}
      {isFailed && onRetry && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onRetry(item.localId)}>
            <RefreshCwIcon className="size-3.5 mr-1" />
            {t("offline.retry")}
          </Button>
          {item.error && (
            <span className="text-xs text-red-500 truncate max-w-xs" title={item.error}>
              {item.error}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default PendingMemoItem;
