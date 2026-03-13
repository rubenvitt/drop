export const LOCAL_SHARE_TOKEN_STORAGE_KEY = 'fuekw-dropzone.admin.share-tokens';

function normalizeStoredShareToken(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const rawToken = typeof value.rawToken === 'string' ? value.rawToken.trim() : '';

  if (!id || !rawToken) {
    return null;
  }

  return {
    id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Unbenannt',
    rawToken,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null
  };
}

function normalizeStoredShareTokens(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const normalized = [];
  const seenIds = new Set();

  for (const entry of entries) {
    const candidate = normalizeStoredShareToken(entry);
    if (!candidate || seenIds.has(candidate.id)) {
      continue;
    }

    normalized.push(candidate);
    seenIds.add(candidate.id);
  }

  return normalized;
}

export function createLocalShareUrl(origin, token) {
  return new URL(`/u/${encodeURIComponent(token)}`, origin).toString();
}

export function parseStoredShareTokens(serialized) {
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    return [];
  }

  try {
    return normalizeStoredShareTokens(JSON.parse(serialized));
  } catch {
    return [];
  }
}

export function upsertStoredShareToken(entries, entry) {
  const normalizedEntries = normalizeStoredShareTokens(entries);
  const normalizedEntry = normalizeStoredShareToken(entry);

  if (!normalizedEntry) {
    return normalizedEntries;
  }

  return [normalizedEntry, ...normalizedEntries.filter((candidate) => candidate.id !== normalizedEntry.id)];
}

export function reconcileStoredShareTokens(entries, activeTokens) {
  const activeList = Array.isArray(activeTokens) ? activeTokens : [];
  const entriesById = new Map(
    normalizeStoredShareTokens(entries).map((entry) => [entry.id, entry])
  );
  const reconciled = [];

  for (const token of activeList) {
    const existing = entriesById.get(token.id);
    if (!existing) {
      continue;
    }

    reconciled.push({
      ...existing,
      name: typeof token.name === 'string' && token.name.trim() ? token.name.trim() : existing.name,
      createdAt: typeof token.createdAt === 'string' ? token.createdAt : existing.createdAt,
      expiresAt: typeof token.expiresAt === 'string' ? token.expiresAt : existing.expiresAt
    });
  }

  return reconciled;
}

export function getGeneratedShareLinkOptions(activeTokens, storedEntries) {
  const storedById = new Map(
    reconcileStoredShareTokens(storedEntries, activeTokens).map((entry) => [entry.id, entry])
  );
  const options = [];

  for (const token of Array.isArray(activeTokens) ? activeTokens : []) {
    const stored = storedById.get(token.id);
    if (!stored?.rawToken) {
      continue;
    }

    options.push({
      ...token,
      rawToken: stored.rawToken
    });
  }

  return options;
}
