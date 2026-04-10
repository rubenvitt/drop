const SHARE_TOKEN_PREFIX = 'dz-';
const SHARE_TOKEN_BODY_LENGTH = 12;
const SHARE_TOKEN_GROUP_LENGTH = 4;

const MIME_LABELS = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'text/plain': 'Text'
};

export function resolveUploadPath(pathname) {
  const pathParts = pathname.split('/').filter(Boolean);
  return pathParts[0] === 'u' && pathParts[1] ? `/u/${pathParts[1]}/upload` : '/upload';
}

export function resolveUploadContextPath(pathname) {
  const pathParts = pathname.split('/').filter(Boolean);
  return pathParts[0] === 'u' && pathParts[1] ? `/api/u/${pathParts[1]}/upload/context` : '/api/upload/context';
}

export function isShareLinkPath(pathname) {
  const pathParts = pathname.split('/').filter(Boolean);
  return pathParts[0] === 'u' && Boolean(pathParts[1]);
}

function extractTokenCandidate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (raw.startsWith('/u/')) {
    return raw.split('/').filter(Boolean)[1] ?? '';
  }

  try {
    const url = new URL(raw);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'u' && pathParts[1]) return pathParts[1];
  } catch {
    return raw;
  }

  return raw;
}

function groupTokenBody(value) {
  const groups = [];
  for (let index = 0; index < value.length; index += SHARE_TOKEN_GROUP_LENGTH) {
    groups.push(value.slice(index, index + SHARE_TOKEN_GROUP_LENGTH));
  }
  return groups.join('-');
}

export function normalizeShareTokenInput(value) {
  const token = extractTokenCandidate(value).trim().toLowerCase();
  if (!token) return '';

  if (token.startsWith('dz_')) return token.replace(/\s+/g, '');

  const compact = token.replace(/[^a-z0-9-]/g, '');

  if (compact.startsWith(SHARE_TOKEN_PREFIX)) {
    const body = compact.slice(SHARE_TOKEN_PREFIX.length).replace(/-/g, '');
    if (!body) return '';
    return body.length === SHARE_TOKEN_BODY_LENGTH
      ? `${SHARE_TOKEN_PREFIX}${groupTokenBody(body)}`
      : `${SHARE_TOKEN_PREFIX}${body}`;
  }

  if (compact.startsWith('dz')) {
    const body = compact.slice(2).replace(/-/g, '');
    if (!body) return '';
    return body.length === SHARE_TOKEN_BODY_LENGTH
      ? `${SHARE_TOKEN_PREFIX}${groupTokenBody(body)}`
      : `${SHARE_TOKEN_PREFIX}${body}`;
  }

  if (/^[a-z0-9]+$/.test(compact) && compact.length === SHARE_TOKEN_BODY_LENGTH) {
    return `${SHARE_TOKEN_PREFIX}${groupTokenBody(compact)}`;
  }

  return compact;
}

export function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function labelMimeType(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'Unbekannt';
  return MIME_LABELS[value] ?? value.split('/').pop()?.toUpperCase() ?? value;
}

export function summarizeMimeTypes(values, maxItems = 4) {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  if (list.length === 0) return 'Wird serverseitig geprüft';

  const labels = list.slice(0, maxItems).map(labelMimeType);
  if (list.length <= maxItems) return labels.join(', ');
  return `${labels.join(', ')} und weitere`;
}
