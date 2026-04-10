import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  HiOutlineCloudArrowUp,
  HiOutlineInformationCircle,
} from "react-icons/hi2";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Header } from "@/components/layout/header";
import { FileDropzone } from "@/components/upload/file-dropzone";
import { FileQueue } from "@/components/upload/file-queue";
import { useUpload } from "@/hooks/use-upload";
import {
  getSession,
  getUploadContext,
  logout,
  type SessionPayload,
  type UploadContext,
} from "@/lib/api";
import {
  formatFileSize,
  isShareLinkPath,
  resolveUploadPath,
  summarizeMimeTypes,
} from "@/lib/utils";

const NONE_CATEGORY = "__none__";

export function UploadPage() {
  const { token } = useParams<{ token: string }>();
  const shareMode = token ? true : isShareLinkPath(window.location.pathname);
  const uploadPath = token
    ? `/u/${token}/upload`
    : resolveUploadPath(window.location.pathname);

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [ctx, setCtx] = useState<UploadContext | null>(null);
  const [hint, setHint] = useState("");
  const [category, setCategory] = useState(NONE_CATEGORY);
  const [pageError, setPageError] = useState("");

  const upload = useUpload(uploadPath);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    const loadData = async () => {
      try {
        const [uploadCtx, sessionData] = await Promise.all([
          getUploadContext(token),
          shareMode ? Promise.resolve(null) : getSession(),
        ]);
        setCtx(uploadCtx);
        if (sessionData) setSession(sessionData);
      } catch (err: unknown) {
        const error = err as { status?: number; message?: string };
        if (
          !shareMode &&
          (error.status === 401 || error.message === "unauthorized")
        ) {
          window.location.href = `/?returnTo=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        if (
          shareMode &&
          (error.status === 401 ||
            error.status === 403)
        ) {
          window.location.href = "/?error=invalid_token";
          return;
        }
        setPageError("Seite konnte nicht vollständig geladen werden.");
      }
    };
    loadData();
  }, [token, shareMode]);

  const handleFiles = useCallback(
    (files: FileList) => {
      if (!ctxRef.current) return;
      upload.addFiles(files, ctxRef.current);
    },
    [upload],
  );

  const handleUpload = useCallback(async () => {
    await upload.startUpload(hint.trim(), category === NONE_CATEGORY ? "" : category);
  }, [upload, hint, category]);

  const handleReset = useCallback(() => {
    upload.clearQueue();
    setHint("");
    setCategory(NONE_CATEGORY);
  }, [upload]);

  const pendingItems = upload.queue.filter(
    (i) => i.status === "ready" || i.status === "failed",
  );
  const hasInvalid = upload.queue.some((i) => i.status === "invalid");
  const canUpload =
    !upload.isUploading && pendingItems.length > 0 && !hasInvalid;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        user={session?.user}
        showAdminLink={!shareMode}
        onLogout={logout}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="mb-6">
          <Badge variant="secondary" className="mb-2">
            {shareMode ? "Externer Upload-Zugang" : "Interner Upload"}
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">Dateien senden</h1>
          <p className="mt-1 text-muted-foreground">
            {shareMode
              ? "Freigabelink aktiv. Dateien auswählen und senden."
              : "Sitzung aktiv. Dateien auswählen und senden."}
          </p>
        </div>

        {ctx && (
          <div className="mb-6 flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Formate: </span>
              <span className="font-medium">
                {summarizeMimeTypes(ctx.allowedMimeTypes)}
              </span>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div>
              <span className="text-muted-foreground">Max. Größe: </span>
              <span className="font-medium">
                {formatFileSize(ctx.maxFileSizeBytes)}
              </span>
            </div>
          </div>
        )}

        {pageError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          <FileDropzone
            accept={ctx?.allowedMimeTypes?.join(",") ?? ""}
            disabled={upload.isUploading}
            onFiles={handleFiles}
          />

          <FileQueue
            items={upload.queue}
            isUploading={upload.isUploading}
            onRemove={upload.removeFile}
            onClear={upload.clearQueue}
          />

          {upload.queue.length > 0 && (
            <Card>
              <CardContent className="space-y-4 pt-5">
                <div className="space-y-2">
                  <Label htmlFor="hint">Hinweis</Label>
                  <Textarea
                    id="hint"
                    maxLength={ctx?.hintMaxLength ?? 500}
                    rows={3}
                    placeholder="Optionaler Hinweis zur Übermittlung"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    disabled={upload.isUploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. Wird zusammen mit der Übermittlung gespeichert.
                  </p>
                </div>

                {ctx && ctx.categories.length > 0 && (
                  <div className="space-y-2">
                    <Label>Kategorie</Label>
                    <Select
                      value={category}
                      onValueChange={setCategory}
                      disabled={upload.isUploading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Keine Kategorie" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_CATEGORY}>
                          Keine Kategorie
                        </SelectItem>
                        {ctx.categories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Optional. Hilft bei der Zuordnung im Zielordner.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {upload.isUploading && (
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Übertragung läuft</h3>
                  <span className="text-sm text-muted-foreground">
                    {upload.overallProgress}%
                  </span>
                </div>
                <Progress value={upload.overallProgress} className="h-2" />
              </CardContent>
            </Card>
          )}

          {upload.result && (
            <Alert
              variant={upload.result.failed > 0 ? "destructive" : "default"}
            >
              {upload.result.failed === 0 ? (
                <HiOutlineCloudArrowUp className="size-4" />
              ) : (
                <HiOutlineInformationCircle className="size-4" />
              )}
              <AlertTitle>
                {upload.result.failed === 0
                  ? "Übermittlung abgeschlossen"
                  : upload.result.success > 0
                    ? "Teilweise übermittelt"
                    : "Übermittlung fehlgeschlagen"}
              </AlertTitle>
              <AlertDescription>
                {upload.result.failed === 0
                  ? `${upload.result.success} Datei(en) erfolgreich gesendet.`
                  : `${upload.result.success} gesendet, ${upload.result.failed} fehlgeschlagen.`}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-end gap-3">
            {upload.result && (
              <Button variant="outline" onClick={handleReset}>
                Weitere Dateien senden
              </Button>
            )}
            <Button
              onClick={handleUpload}
              disabled={!canUpload}
            >
              <HiOutlineCloudArrowUp className="mr-2 size-4" />
              {pendingItems.some((i) => i.status === "failed") &&
              pendingItems.every((i) => i.status === "failed")
                ? "Erneut senden"
                : "Jetzt senden"}
            </Button>
          </div>
        </div>

        <div className="mt-8 space-y-1 text-xs text-muted-foreground">
          <p>
            {shareMode
              ? "Zeitlich begrenzter externer Upload-Zugang."
              : "Interner Upload mit aktiver Sitzung."}
          </p>
          <p>Format und Größe werden geprüft.</p>
        </div>
      </main>
    </div>
  );
}
