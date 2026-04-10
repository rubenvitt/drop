import {
  HiOutlineCheck,
  HiOutlineExclamationTriangle,
  HiOutlineXMark,
  HiOutlineDocument,
} from "react-icons/hi2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/lib/utils";
import type { QueueItem } from "@/hooks/use-upload";

interface FileItemProps {
  item: QueueItem;
  disabled?: boolean;
  onRemove: (id: string) => void;
}

const statusConfig = {
  ready: { label: "Bereit", variant: "secondary" as const, icon: HiOutlineDocument },
  invalid: { label: "Ungültig", variant: "destructive" as const, icon: HiOutlineExclamationTriangle },
  uploading: { label: "Wird gesendet", variant: "secondary" as const, icon: HiOutlineDocument },
  uploaded: { label: "Gesendet", variant: "default" as const, icon: HiOutlineCheck },
  failed: { label: "Fehlgeschlagen", variant: "destructive" as const, icon: HiOutlineExclamationTriangle },
};

export function FileItem({ item, disabled, onRemove }: FileItemProps) {
  const config = statusConfig[item.status];
  const Icon = config.icon;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 overflow-hidden">
          <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{item.file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(item.file.size)}
              {item.file.type ? ` · ${item.file.type}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={config.variant}>
            {item.status === "uploading" ? `${item.progress}%` : config.label}
          </Badge>
          {!disabled && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => onRemove(item.id)}
            >
              <HiOutlineXMark className="size-4" />
              <span className="sr-only">Entfernen</span>
            </Button>
          )}
        </div>
      </div>

      {(item.status === "uploading" || item.status === "uploaded") && (
        <Progress
          value={item.status === "uploaded" ? 100 : item.progress}
          className="mt-2 h-1.5"
        />
      )}

      {(item.error || item.responseMessage) && (
        <p
          className={`mt-1.5 text-xs ${item.error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {item.error || item.responseMessage}
        </p>
      )}
    </div>
  );
}
