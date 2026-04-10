import { useState } from "react";
import { useSearchParams } from "react-router";
import { HiOutlineKey, HiOutlineFingerPrint } from "react-icons/hi2";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { normalizeShareTokenInput } from "@/lib/utils";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const presetToken = normalizeShareTokenInput(searchParams.get("token") || "");
  const returnTo = searchParams.get("returnTo") || "/admin";

  const [tokenValue, setTokenValue] = useState(presetToken);
  const [tokenError, setTokenError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const errorMessages: Record<string, string> = {
    oidc_failed:
      "Die Anmeldung mit Ihrer I&K ID konnte nicht gestartet werden. Bitte versuchen Sie es erneut.",
    invalid_token:
      "Dieser Zugangscode ist ungültig oder bereits abgelaufen. Bitte prüfen Sie den Code oder fordern Sie einen neuen Freigabelink an.",
  };

  function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeShareTokenInput(tokenValue);
    if (!normalized) {
      setTokenError(
        "Bitte geben Sie einen Zugangscode oder einen vollständigen Freigabelink ein.",
      );
      return;
    }
    setTokenError("");
    setSubmitting(true);
    window.location.href = `/u/${encodeURIComponent(normalized)}`;
  }

  function handlePocketIdLogin() {
    setLoginLoading(true);
    window.location.href = `/login/pocketid?returnTo=${encodeURIComponent(returnTo)}`;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="absolute right-4 top-4">
        <ThemeSwitcher />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            FüKw Dropzone
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sicherer Dateieingang für externe Unterlagen und interne Freigaben.
          </p>
        </div>

        {error && errorMessages[error] && (
          <Alert variant="destructive" className="mb-6 max-w-md">
            <AlertDescription>{errorMessages[error]}</AlertDescription>
          </Alert>
        )}

        <div className="flex w-full max-w-md flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HiOutlineKey className="size-5" />
                Zugangscode eingeben
              </CardTitle>
              <CardDescription>
                Geben Sie einen Zugangscode oder Freigabelink ein, um Dateien zu
                senden.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTokenSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="shareToken">
                    Zugangscode oder Freigabelink
                  </Label>
                  <Input
                    id="shareToken"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="z. B. dz-k234-5678-abcd oder https://..."
                    value={tokenValue}
                    onChange={(e) => {
                      setTokenValue(e.target.value);
                      setTokenError("");
                    }}
                    aria-invalid={!!tokenError}
                    required
                  />
                  {tokenError && (
                    <p className="text-sm text-destructive">{tokenError}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Wird geöffnet..." : "Upload öffnen"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HiOutlineFingerPrint className="size-5" />
                Mit I&K ID anmelden
              </CardTitle>
              <CardDescription>
                Melden Sie sich mit Ihrer Organisation an.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handlePocketIdLogin}
                disabled={loginLoading}
              >
                {loginLoading ? "Anmeldung wird vorbereitet..." : "Login starten"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
