import type { ApiToken } from "./api";

export const LOCAL_SHARE_TOKEN_STORAGE_KEY = "fuekw-dropzone.admin.share-tokens";

export interface StoredShareToken {
  id: string;
  name: string;
  rawToken: string;
  createdAt: string | null;
  expiresAt: string | null;
}

function normalizeStoredShareToken(
  value: unknown,
): StoredShareToken | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;

  const id = typeof v.id === "string" ? v.id.trim() : "";
  const rawToken = typeof v.rawToken === "string" ? v.rawToken.trim() : "";
  if (!id || !rawToken) return null;

  return {
    id,
    name:
      typeof v.name === "string" && v.name.trim() ? v.name.trim() : "Unbenannt",
    rawToken,
    createdAt: typeof v.createdAt === "string" ? v.createdAt : null,
    expiresAt: typeof v.expiresAt === "string" ? v.expiresAt : null,
  };
}

function normalizeStoredShareTokens(
  entries: unknown[],
): StoredShareToken[] {
  if (!Array.isArray(entries)) return [];
  const normalized: StoredShareToken[] = [];
  const seenIds = new Set<string>();

  for (const entry of entries) {
    const candidate = normalizeStoredShareToken(entry);
    if (!candidate || seenIds.has(candidate.id)) continue;
    normalized.push(candidate);
    seenIds.add(candidate.id);
  }

  return normalized;
}

export function createLocalShareUrl(origin: string, token: string): string {
  return new URL(`/u/${encodeURIComponent(token)}`, origin).toString();
}

export function parseStoredShareTokens(serialized: string | null): StoredShareToken[] {
  if (typeof serialized !== "string" || serialized.trim() === "") return [];
  try {
    return normalizeStoredShareTokens(JSON.parse(serialized));
  } catch {
    return [];
  }
}

export function upsertStoredShareToken(
  entries: StoredShareToken[],
  entry: StoredShareToken,
): StoredShareToken[] {
  const normalizedEntries = normalizeStoredShareTokens(entries);
  const normalizedEntry = normalizeStoredShareToken(entry);
  if (!normalizedEntry) return normalizedEntries;
  return [
    normalizedEntry,
    ...normalizedEntries.filter((c) => c.id !== normalizedEntry.id),
  ];
}

export function reconcileStoredShareTokens(
  entries: StoredShareToken[],
  activeTokens: ApiToken[],
): StoredShareToken[] {
  const activeList = Array.isArray(activeTokens) ? activeTokens : [];
  const entriesById = new Map(
    normalizeStoredShareTokens(entries).map((e) => [e.id, e]),
  );
  const reconciled: StoredShareToken[] = [];

  for (const token of activeList) {
    const existing = entriesById.get(token.id);
    if (!existing) continue;
    reconciled.push({
      ...existing,
      name:
        typeof token.name === "string" && token.name.trim()
          ? token.name.trim()
          : existing.name,
      createdAt:
        typeof token.createdAt === "string"
          ? token.createdAt
          : existing.createdAt,
      expiresAt:
        typeof token.expiresAt === "string"
          ? token.expiresAt
          : existing.expiresAt,
    });
  }

  return reconciled;
}

export function getGeneratedShareLinkOptions(
  activeTokens: ApiToken[],
  storedEntries: StoredShareToken[],
): (ApiToken & { rawToken: string })[] {
  const storedById = new Map(
    reconcileStoredShareTokens(storedEntries, activeTokens).map((e) => [
      e.id,
      e,
    ]),
  );
  const options: (ApiToken & { rawToken: string })[] = [];

  for (const token of Array.isArray(activeTokens) ? activeTokens : []) {
    const stored = storedById.get(token.id);
    if (!stored?.rawToken) continue;
    options.push({ ...token, rawToken: stored.rawToken });
  }

  return options;
}

export function loadLocalShareTokens(): StoredShareToken[] {
  try {
    return parseStoredShareTokens(
      window.localStorage.getItem(LOCAL_SHARE_TOKEN_STORAGE_KEY),
    );
  } catch {
    return [];
  }
}

export function persistLocalShareTokens(tokens: StoredShareToken[]): boolean {
  try {
    window.localStorage.setItem(
      LOCAL_SHARE_TOKEN_STORAGE_KEY,
      JSON.stringify(tokens),
    );
    return true;
  } catch {
    return false;
  }
}
