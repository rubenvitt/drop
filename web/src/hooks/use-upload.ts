import { useState, useCallback, useRef } from "react";
import type { UploadContext } from "@/lib/api";
import { formatFileSize } from "@/lib/utils";

export interface QueueItem {
  id: string;
  file: File;
  status: "ready" | "invalid" | "uploading" | "uploaded" | "failed";
  progress: number;
  error: string;
  responseMessage: string;
  uploadedName: string;
}

interface UploadRun {
  ids: string[];
  totalBytes: number;
}

let actionSequence = 0;

function validateFile(file: File, ctx: UploadContext): string {
  if (ctx.maxFileSizeBytes && file.size > ctx.maxFileSizeBytes) {
    return `Die Datei ist größer als ${formatFileSize(ctx.maxFileSizeBytes)}.`;
  }
  const allowed = ctx.allowedMimeTypes ?? [];
  if (allowed.length > 0 && file.type && !allowed.includes(file.type)) {
    return `Der Dateityp ${file.type} ist nicht freigegeben.`;
  }
  return "";
}

function getUploadErrorMessage(
  status: number,
  payload: Record<string, unknown> | null,
): string {
  const rawError = String(payload?.error ?? "");
  if (status === 401 || status === 403)
    return "Der Upload-Zugang ist nicht mehr gültig.";
  if (status === 413) return "Die Datei ist zu groß.";
  if (status === 415) return "Der Dateityp ist nicht freigegeben.";
  if (status === 429) return "Zu viele Upload-Versuche. Bitte warten.";
  if (rawError.includes("EACCES") || rawError.includes("/uploads"))
    return "Server kann die Datei nicht speichern.";
  if (status >= 500) return "Serverfehler. Bitte erneut versuchen.";
  return `Upload abgelehnt (Status ${status}).`;
}

export function useUpload(uploadPath: string) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [result, setResult] = useState<{
    success: number;
    failed: number;
  } | null>(null);

  const queueRef = useRef(queue);
  queueRef.current = queue;

  const uploadRunRef = useRef<UploadRun | null>(null);

  const addFiles = useCallback(
    (files: FileList | File[], ctx: UploadContext) => {
      const newItems: QueueItem[] = Array.from(files).map((file) => {
        const validationError = validateFile(file, ctx);
        return {
          id: `file-${actionSequence++}`,
          file,
          status: validationError ? "invalid" : "ready",
          progress: 0,
          error: validationError,
          responseMessage: "",
          uploadedName: "",
        };
      });
      setQueue((prev) => [...prev, ...newItems]);
      setResult(null);
    },
    [],
  );

  const removeFile = useCallback((fileId: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== fileId));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setResult(null);
    setOverallProgress(0);
  }, []);

  const revalidate = useCallback((ctx: UploadContext) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.status === "uploaded") return item;
        const err = validateFile(item.file, ctx);
        if (err)
          return { ...item, status: "invalid" as const, error: err, progress: 0 };
        return {
          ...item,
          status: item.status === "invalid" ? ("ready" as const) : item.status,
          error: item.status === "invalid" ? "" : item.error,
        };
      }),
    );
  }, []);

  const uploadFile = useCallback(
    (item: QueueItem, hint: string, category: string): Promise<boolean> => {
      return new Promise((resolve) => {
        setQueue((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "uploading" as const, progress: 0, error: "", responseMessage: "" }
              : i,
          ),
        );

        const xhr = new XMLHttpRequest();
        const form = new FormData();
        form.append("hint", hint);
        form.append("category", category);
        form.append("files", item.file, item.file.name);

        xhr.upload.addEventListener("progress", (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          setQueue((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, progress: percent } : i,
            ),
          );

          const run = uploadRunRef.current;
          if (run && run.totalBytes > 0) {
            let completedBytes = 0;
            for (const id of run.ids) {
              const cur = queueRef.current.find((c) => c.id === id);
              if (!cur) continue;
              if (cur.id === item.id) {
                completedBytes += Math.min(event.loaded, cur.file.size);
              } else if (cur.status === "uploaded") {
                completedBytes += cur.file.size;
              }
            }
            setOverallProgress(
              Math.round((completedBytes / run.totalBytes) * 100),
            );
          }
        });

        xhr.addEventListener("load", () => {
          let payload: Record<string, unknown> | null = null;
          try {
            payload = JSON.parse(xhr.responseText);
          } catch { /* ignore */ }

          const typedPayload = payload as { uploaded?: Array<{ filename?: string }>; error?: string } | null;
          const success =
            xhr.status >= 200 &&
            xhr.status < 300 &&
            Array.isArray(typedPayload?.uploaded) &&
            (typedPayload?.uploaded?.length ?? 0) > 0;

          if (success) {
            const uploaded = typedPayload!.uploaded!;
            setQueue((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: "uploaded" as const,
                      progress: 100,
                      uploadedName: uploaded[0]?.filename ?? item.file.name,
                      responseMessage: "Datei erfolgreich übermittelt.",
                    }
                  : i,
              ),
            );
            resolve(true);
          } else {
            setQueue((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: "failed" as const,
                      progress: 0,
                      error: getUploadErrorMessage(xhr.status, payload),
                    }
                  : i,
              ),
            );
            resolve(false);
          }
        });

        xhr.addEventListener("error", () => {
          setQueue((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: "failed" as const,
                    progress: 0,
                    error: "Netzwerkfehler. Bitte erneut versuchen.",
                  }
                : i,
            ),
          );
          resolve(false);
        });

        xhr.open("POST", uploadPath);
        xhr.send(form);
      });
    },
    [uploadPath],
  );

  const startUpload = useCallback(
    async (hint: string, category: string) => {
      const sendable = queueRef.current.filter(
        (i) => i.status === "ready" || i.status === "failed",
      );
      if (sendable.length === 0) return;

      setIsUploading(true);
      setResult(null);
      setOverallProgress(0);

      uploadRunRef.current = {
        ids: sendable.map((i) => i.id),
        totalBytes: sendable.reduce((s, i) => s + i.file.size, 0),
      };

      let successCount = 0;
      for (const item of sendable) {
        const ok = await uploadFile(item, hint, category);
        if (ok) successCount++;
      }

      setIsUploading(false);
      uploadRunRef.current = null;
      setResult({ success: successCount, failed: sendable.length - successCount });
    },
    [uploadFile],
  );

  return {
    queue,
    isUploading,
    overallProgress,
    result,
    addFiles,
    removeFile,
    clearQueue,
    revalidate,
    startUpload,
    setResult,
  };
}
