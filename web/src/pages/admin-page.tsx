import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HiOutlineArrowPath } from "react-icons/hi2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Header } from "@/components/layout/header";
import { TokenComposer } from "@/components/admin/token-composer";
import { ShareKit } from "@/components/admin/share-kit";
import { TokenItem } from "@/components/admin/token-item";
import {
  getSession,
  listTokens,
  deleteToken,
  logout,
  type ApiToken,
  type CreateTokenResponse,
  type SessionPayload,
} from "@/lib/api";
import {
  createLocalShareUrl,
  getGeneratedShareLinkOptions,
  loadLocalShareTokens,
  persistLocalShareTokens,
  reconcileStoredShareTokens,
  upsertStoredShareToken,
  type StoredShareToken,
} from "@/lib/share-tokens";

export function AdminPage() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [localTokens, setLocalTokens] = useState<StoredShareToken[]>(
    loadLocalShareTokens,
  );
  const [pageError, setPageError] = useState("");
  const [tokensLoading, setTokensLoading] = useState(false);
  const [shareKit, setShareKit] = useState<{
    tokenName: string;
    shareUrl: string;
    rawToken: string;
    tokenId: string;
  } | null>(null);
  const [qrCache, setQrCache] = useState<Map<string, string>>(new Map());

  const localTokensRef = useRef(localTokens);
  localTokensRef.current = localTokens;

  const loadData = useCallback(async () => {
    try {
      const [sessionData, tokenData] = await Promise.all([
        getSession(),
        listTokens(),
      ]);
      setSession(sessionData);
      setTokens(tokenData.tokens);

      const reconciled = reconcileStoredShareTokens(
        localTokensRef.current,
        tokenData.tokens,
      );
      setLocalTokens(reconciled);
      persistLocalShareTokens(reconciled);
    } catch (err: unknown) {
      const error = err as { status?: number };
      if (error.status === 401 || error.status === 403) {
        window.location.href = "/?returnTo=/admin";
        return;
      }
      setPageError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleRefresh() {
    setTokensLoading(true);
    try {
      const tokenData = await listTokens();
      setTokens(tokenData.tokens);
      const reconciled = reconcileStoredShareTokens(
        localTokensRef.current,
        tokenData.tokens,
      );
      setLocalTokens(reconciled);
      persistLocalShareTokens(reconciled);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setTokensLoading(false);
    }
  }

  function handleTokenCreated(result: CreateTokenResponse) {
    const updated = upsertStoredShareToken(localTokensRef.current, {
      id: result.token.id,
      name: result.token.name,
      rawToken: result.rawToken,
      createdAt: result.token.createdAt,
      expiresAt: result.token.expiresAt,
    });
    setLocalTokens(updated);
    persistLocalShareTokens(updated);

    setShareKit({
      tokenName: result.token.name,
      shareUrl: createLocalShareUrl(window.location.origin, result.rawToken),
      rawToken: result.rawToken,
      tokenId: result.token.id,
    });

    handleRefresh();
  }

  async function handleRevoke(id: string) {
    try {
      await deleteToken(id);
      const updatedLocal = localTokensRef.current.filter((t) => t.id !== id);
      setLocalTokens(updatedLocal);
      persistLocalShareTokens(updatedLocal);

      setQrCache((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      await handleRefresh();
      toast.success("Upload-Zugang gesperrt.");
    } catch (err: unknown) {
      toast.error((err as Error).message);
    }
  }

  function handleQrGenerated(tokenId: string, dataUrl: string) {
    setQrCache((prev) => new Map(prev).set(tokenId, dataUrl));
  }

  const knownMap = new Map(
    getGeneratedShareLinkOptions(tokens, localTokens).map((t) => [
      t.id,
      t.rawToken,
    ]),
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        user={session?.user}
        showUploadLink
        onLogout={logout}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6">
          <Badge variant="secondary" className="mb-2">
            Freigaben verwalten
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">
            Upload-Zugänge erstellen, teilen und sperren.
          </h1>
          <p className="mt-1 text-muted-foreground">
            Vergeben Sie zeitlich begrenzte Upload-Zugänge und behalten Sie
            aktive Freigaben im Blick.
          </p>
        </div>

        {pageError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <TokenComposer onCreated={handleTokenCreated} />
          {shareKit && (
            <ShareKit
              {...shareKit}
              onQrGenerated={handleQrGenerated}
            />
          )}
        </div>

        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Aktive Upload-Zugänge</h2>
              <p className="text-sm text-muted-foreground">
                {tokens.length === 0
                  ? "Keine aktiven Zugänge."
                  : `${tokens.length} Zugang/Zugänge`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={tokensLoading}
            >
              <HiOutlineArrowPath
                className={`mr-2 size-4 ${tokensLoading ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </Button>
          </div>

          {tokens.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground">
                Keine aktiven Freigaben. Erstellen Sie oben einen neuen
                Upload-Zugang.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map((token) => (
                <TokenItem
                  key={token.id}
                  token={token}
                  localRawToken={knownMap.get(token.id)}
                  qrCache={qrCache}
                  onRevoke={handleRevoke}
                  onQrGenerated={handleQrGenerated}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <p className="font-medium">Hinweis zum Teilen</p>
          <p className="mt-1">
            Link und QR-Code stehen nur für Freigaben bereit, die in diesem
            Browser erstellt wurden. Ältere Einträge bleiben sichtbar, aber Link
            und QR können nicht rekonstruiert werden.
          </p>
        </div>
      </main>
    </div>
  );
}
