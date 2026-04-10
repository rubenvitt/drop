import { Button } from "@/components/ui/button";
import { FileItem } from "./file-item";
import { formatFileSize } from "@/lib/utils";
import type { QueueItem } from "@/hooks/use-upload";

interface FileQueueProps {
  items: QueueItem[];
  isUploading: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function FileQueue({
  items,
  isUploading,
  onRemove,
  onClear,
}: FileQueueProps) {
  if (items.length === 0) return null;

  const totalBytes = items.reduce((s, i) => s + i.file.size, 0);
  const readyCount = items.filter(
    (i) => i.status === "ready" || i.status === "failed",
  ).length;
  const invalidCount = items.filter((i) => i.status === "invalid").length;

  let summary: string;
  if (invalidCount > 0) {
    summary = `${items.length} Datei(en), ${formatFileSize(totalBytes)} — ${invalidCount} ungültig`;
  } else {
    summary = `${items.length} Datei(en), ${formatFileSize(totalBytes)} — ${readyCount} bereit`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Ausgewählte Dateien</h3>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isUploading}
        >
          Auswahl leeren
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <FileItem
            key={item.id}
            item={item}
            disabled={isUploading}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
