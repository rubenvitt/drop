import { useCallback, useRef, useState } from "react";
import { HiOutlineCloudArrowUp } from "react-icons/hi2";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  accept?: string;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
}

export function FileDropzone({ accept, disabled, onFiles }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      if (e.dataTransfer?.files) onFiles(e.dataTransfer.files);
    },
    [disabled, onFiles],
  );

  return (
    <div
      className={cn(
        "relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        dragOver && !disabled
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
        disabled && "pointer-events-none opacity-50",
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            onFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />
      <div className="flex flex-col items-center gap-2">
        <HiOutlineCloudArrowUp
          className={cn(
            "size-10 transition-colors",
            dragOver ? "text-primary" : "text-muted-foreground",
          )}
        />
        <p className="font-medium">
          {dragOver
            ? "Dateien hier ablegen"
            : "Dateien hier ablegen oder klicken"}
        </p>
        <p className="text-sm text-muted-foreground">
          Dateityp und Größe werden vor dem Upload geprüft.
        </p>
      </div>
    </div>
  );
}
