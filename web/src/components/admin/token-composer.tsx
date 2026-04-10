import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HiOutlinePlusCircle } from "react-icons/hi2";
import { createToken, type CreateTokenResponse } from "@/lib/api";

interface TokenComposerProps {
  onCreated: (result: CreateTokenResponse) => void;
}

export function TokenComposer({ onCreated }: TokenComposerProps) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("12");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setBusy(true);
    setStatus({ message: "Neuer Upload-Zugang wird erstellt...", type: "info" });

    try {
      const result = await createToken(name.trim(), expiry);
      setStatus({
        message: "Upload-Zugang erstellt. Sie können ihn jetzt teilen.",
        type: "success",
      });
      setName("");
      setExpiry("12");
      onCreated(result);
    } catch (err: unknown) {
      setStatus({
        message: (err as Error).message || "Fehler beim Erstellen.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HiOutlinePlusCircle className="size-5" />
          Freigabe vorbereiten
        </CardTitle>
        <CardDescription>
          Beschreiben Sie den Zweck des Zugangs und legen Sie die Gültigkeitsdauer fest.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status && (
          <Alert
            variant={status.type === "error" ? "destructive" : "default"}
            className="mb-4"
          >
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tokenName">Wofür ist dieser Zugang?</Label>
            <Input
              id="tokenName"
              maxLength={64}
              placeholder="z. B. Unterlagen Lagebesprechung"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              Die Bezeichnung hilft intern bei der Einordnung.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Wie lange soll der Zugang aktiv bleiben?</Label>
            <Select value={expiry} onValueChange={setExpiry} disabled={busy}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Stunde</SelectItem>
                <SelectItem value="2">2 Stunden</SelectItem>
                <SelectItem value="6">6 Stunden</SelectItem>
                <SelectItem value="12">12 Stunden</SelectItem>
                <SelectItem value="24">24 Stunden</SelectItem>
                <SelectItem value="48">2 Tage</SelectItem>
                <SelectItem value="72">3 Tage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Wird erstellt..." : "Upload-Zugang erstellen"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
