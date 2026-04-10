export interface ApiError extends Error {
  status: number;
}

export async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });

  const text = await response.text();
  let payload: T | null = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    let message =
      (payload as Record<string, string> | null)?.error ||
      `Anfrage fehlgeschlagen (${response.status})`;
    if (response.status === 401 || response.status === 403) {
      message =
        "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.";
    } else if (response.status === 429) {
      message =
        "Zu viele Anfragen in kurzer Zeit. Bitte warten Sie einen Moment.";
    } else if (response.status >= 500) {
      message =
        "Der Server ist derzeit nicht erreichbar. Bitte versuchen Sie es erneut.";
    }
    const error = new Error(message) as ApiError;
    error.status = response.status;
    throw error;
  }

  return payload as T;
}

export interface SessionPayload {
  session: { id: string; expiresAt: string };
  user: { id: string; email: string; name: string; image: string | null };
}

export interface UploadContext {
  mode: "session" | "share-link";
  maxFileSizeMb: number;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  categories: Array<{ value: string; label: string }>;
  hintMaxLength: number;
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  start: string | null;
  displayToken: string;
  enabled: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface CreateTokenResponse {
  token: ApiToken;
  rawToken: string;
  shareUrl: string;
}

export function getSession() {
  return fetchJson<SessionPayload>("/api/session");
}

export function getUploadContext(token?: string) {
  const url = token
    ? `/api/u/${encodeURIComponent(token)}/upload/context`
    : "/api/upload/context";
  return fetchJson<UploadContext>(url);
}

export function createToken(name: string, expiresInHours: string) {
  return fetchJson<CreateTokenResponse>("/api/admin/tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, expiresInHours }),
  });
}

export function listTokens() {
  return fetchJson<{ tokens: ApiToken[] }>("/api/admin/tokens");
}

export function deleteToken(id: string) {
  return fetchJson<{ success: boolean }>(`/api/admin/tokens/${id}`, {
    method: "DELETE",
  });
}

export function generateQrCode(data: string) {
  return fetchJson<{ dataUrl: string }>("/api/admin/qrcode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data }),
  });
}

export async function logout() {
  const response = await fetch("/logout", {
    method: "POST",
    credentials: "same-origin",
  });

  if (response.redirected) {
    window.location.href = response.url;
    return;
  }
  window.location.href = "/";
}
