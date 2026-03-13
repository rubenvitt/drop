const SHARE_TOKEN_PREFIX = 'dz-';
const SHARE_TOKEN_BODY_LENGTH = 12;
const SHARE_TOKEN_GROUP_LENGTH = 4;

export function resolveUploadPath(pathname) {
  const pathParts = pathname.split('/').filter(Boolean);
  return pathParts[0] === 'u' && pathParts[1] ? `/u/${pathParts[1]}/upload` : '/upload';
}

export function isShareLinkPath(pathname) {
  const pathParts = pathname.split('/').filter(Boolean);
  return pathParts[0] === 'u' && Boolean(pathParts[1]);
}

function extractTokenCandidate(value) {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return '';
  }

  if (raw.startsWith('/u/')) {
    return raw.split('/').filter(Boolean)[1] ?? '';
  }

  try {
    const url = new URL(raw);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'u' && pathParts[1]) {
      return pathParts[1];
    }
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

  if (!token) {
    return '';
  }

  if (token.startsWith('dz_')) {
    return token.replace(/\s+/g, '');
  }

  const compact = token.replace(/[^a-z0-9-]/g, '');

  if (compact.startsWith(SHARE_TOKEN_PREFIX)) {
    const body = compact.slice(SHARE_TOKEN_PREFIX.length).replace(/-/g, '');
    if (!body) {
      return '';
    }

    return body.length === SHARE_TOKEN_BODY_LENGTH
      ? `${SHARE_TOKEN_PREFIX}${groupTokenBody(body)}`
      : `${SHARE_TOKEN_PREFIX}${body}`;
  }

  if (compact.startsWith('dz')) {
    const body = compact.slice(2).replace(/-/g, '');
    if (!body) {
      return '';
    }

    return body.length === SHARE_TOKEN_BODY_LENGTH
      ? `${SHARE_TOKEN_PREFIX}${groupTokenBody(body)}`
      : `${SHARE_TOKEN_PREFIX}${body}`;
  }

  if (/^[a-z0-9]+$/.test(compact) && compact.length === SHARE_TOKEN_BODY_LENGTH) {
    return `${SHARE_TOKEN_PREFIX}${groupTokenBody(compact)}`;
  }

  return compact;
}
