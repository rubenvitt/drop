import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  HiOutlineClipboardDocument,
  HiOutlineArrowDownTray,
  HiOutlineQrCode,
} from "react-icons/hi2";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { generateQrCode } from "@/lib/api";

interface ShareKitProps {
  tokenName: string;
  shareUrl: string;
  rawToken: string;
  tokenId: string;
  onQrGenerated?: (tokenId: string, dataUrl: string) => void;
}

export function ShareKit({
  tokenName,
  shareUrl,
  rawToken,
  tokenId,
  onQrGenerated,
}: ShareKitProps) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrLoading, setQrLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQrLoading(true);

    generateQrCode(shareUrl)
      .then((result) => {
        if (!cancelled) {
          setQrDataUrl(result.dataUrl);
          setQrLoading(false);
          onQrGenerated?.(tokenId, result.dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setQrLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [shareUrl, tokenId, onQrGenerated]);

  function copyToClipboard(value: string, label: string) {
    navigator.clipboard.writeText(value).then(() => {
      toast.success(`${label} kopiert.`);
    });
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const baseName = tokenName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `${baseName || "freigabe"}-qr.png`;
    link.click();
    toast.success("QR-Code heruntergeladen.");
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HiOutlineQrCode className="size-5" />
          Freigabe bereit
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{tokenName}</span> — Link und Code zum Teilen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Freigabelink</Label>
          <div className="flex gap-2">
            <Input value={shareUrl} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(shareUrl, "Freigabelink")}
              title="Link kopieren"
            >
              <HiOutlineClipboardDocument className="size-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Zugangscode</Label>
          <div className="flex gap-2">
            <Input value={rawToken} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(rawToken, "Zugangscode")}
              title="Code kopieren"
            >
              <HiOutlineClipboardDocument className="size-4" />
            </Button>
          </div>
        </div>

        {qrLoading && (
          <p className="text-sm text-muted-foreground">
            QR-Code wird erzeugt...
          </p>
        )}

        {qrDataUrl && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">QR-Code</h4>
              <Button variant="ghost" size="sm" onClick={downloadQr}>
                <HiOutlineArrowDownTray className="mr-2 size-4" />
                Herunterladen
              </Button>
            </div>
            <div className="flex justify-center rounded-lg bg-white p-4">
              <img
                src={qrDataUrl}
                alt={`QR-Code für ${tokenName}`}
                className="size-48"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
