import { useState } from "react";
import { toast } from "sonner";
import {
  HiOutlineClipboardDocument,
  HiOutlineQrCode,
  HiOutlineTrash,
  HiOutlineArrowDownTray,
} from "react-icons/hi2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ApiToken } from "@/lib/api";
import { generateQrCode } from "@/lib/api";
import { createLocalShareUrl } from "@/lib/share-tokens";

interface TokenItemProps {
  token: ApiToken;
  localRawToken?: string;
  qrCache: Map<string, string>;
  onRevoke: (id: string) => void;
  onQrGenerated: (id: string, dataUrl: string) => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return "Ohne Ablauf";
  return new Date(value).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRelativeExpiry(value: string | null): string {
  if (!value) return "Aktiv ohne Ablauf";
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "Bereits abgelaufen";
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `In ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `In ${hours} Std.`;
  return `In ${Math.round(hours / 24)} Tagen`;
}

function getStateBadge(token: ApiToken): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (!token.expiresAt) return { label: "Aktiv", variant: "default" };
  const diff = new Date(token.expiresAt).getTime() - Date.now();
  if (diff <= 0) return { label: "Abgelaufen", variant: "destructive" };
  if (diff <= 6 * 60 * 60 * 1000) return { label: "Läuft bald ab", variant: "secondary" };
  return { label: "Aktiv", variant: "default" };
}

export function TokenItem({
  token,
  localRawToken,
  qrCache,
  onRevoke,
  onQrGenerated,
}: TokenItemProps) {
  const [showQr, setShowQr] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const state = getStateBadge(token);
  const shareUrl = localRawToken
    ? createLocalShareUrl(window.location.origin, localRawToken)
    : null;
  const cachedQr = qrCache.get(token.id);

  async function toggleQr() {
    if (showQr) {
      setShowQr(false);
      return;
    }
    setShowQr(true);
    if (!cachedQr && shareUrl) {
      setQrLoading(true);
      try {
        const result = await generateQrCode(shareUrl);
        onQrGenerated(token.id, result.dataUrl);
      } catch {
        toast.error("QR-Code konnte nicht erzeugt werden.");
      } finally {
        setQrLoading(false);
      }
    }
  }

  function downloadQr() {
    const dataUrl = qrCache.get(token.id);
    if (!dataUrl) return;
    const baseName = token.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${baseName || "freigabe"}-qr.png`;
    link.click();
    toast.success("QR-Code heruntergeladen.");
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{token.name}</h3>
            <Badge variant={state.variant}>{state.label}</Badge>
            {localRawToken && (
              <Badge variant="outline">Teilbar</Badge>
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {token.displayToken}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Erstellt: {formatDateTime(token.createdAt)}</span>
            <span>Ablauf: {formatDateTime(token.expiresAt)}</span>
            <span className="font-medium">
              {formatRelativeExpiry(token.expiresAt)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={!localRawToken}
            title={localRawToken ? "Link kopieren" : "Nur für lokal erzeugte Freigaben"}
            onClick={() => {
              if (shareUrl) {
                navigator.clipboard.writeText(shareUrl);
                toast.success(`Link für "${token.name}" kopiert.`);
              }
            }}
          >
            <HiOutlineClipboardDocument className="mr-1 size-4" />
            Link
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!localRawToken}
            onClick={toggleQr}
          >
            <HiOutlineQrCode className="mr-1 size-4" />
            QR
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <HiOutlineTrash className="mr-1 size-4" />
                Sperren
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Zugang sperren?</AlertDialogTitle>
                <AlertDialogDescription>
                  Möchten Sie den Upload-Zugang „{token.name}" wirklich sperren?
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onRevoke(token.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Sperren
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {showQr && localRawToken && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="space-y-2">
            <Label>Freigabelink</Label>
            <Input value={shareUrl ?? ""} readOnly className="font-mono text-xs" />
          </div>

          {qrLoading && (
            <p className="text-sm text-muted-foreground">
              QR-Code wird geladen...
            </p>
          )}

          {cachedQr && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">QR-Code</span>
                <Button variant="ghost" size="sm" onClick={downloadQr}>
                  <HiOutlineArrowDownTray className="mr-1 size-4" />
                  Herunterladen
                </Button>
              </div>
              <div className="flex justify-center rounded-lg bg-white p-3">
                <img
                  src={cachedQr}
                  alt={`QR-Code für ${token.name}`}
                  className="size-40"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (shareUrl) {
                  navigator.clipboard.writeText(shareUrl);
                  toast.success("Link kopiert.");
                }
              }}
            >
              <HiOutlineClipboardDocument className="mr-1 size-4" />
              Link kopieren
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(localRawToken);
                toast.success("Zugangscode kopiert.");
              }}
            >
              <HiOutlineClipboardDocument className="mr-1 size-4" />
              Code kopieren
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
