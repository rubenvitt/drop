import {
  LOCAL_SHARE_TOKEN_STORAGE_KEY,
  createLocalShareUrl,
  getGeneratedShareLinkOptions,
  parseStoredShareTokens,
  reconcileStoredShareTokens,
  upsertStoredShareToken
} from './admin-token-utils.js';

const Sentry = window.Sentry;
const logoutBtn = document.getElementById('logoutBtn');
const sessionSummary = document.getElementById('sessionSummary');
const tokenForm = document.getElementById('tokenForm');
const tokenNameInput = document.getElementById('tokenName');
const tokenExpiryInput = document.getElementById('tokenExpiry');
const newTokenResult = document.getElementById('newTokenResult');
const newTokenName = document.getElementById('newTokenName');
const shareUrlOutput = document.getElementById('shareUrlOutput');
const rawTokenOutput = document.getElementById('rawTokenOutput');
const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');
const copyRawTokenBtn = document.getElementById('copyRawTokenBtn');
const refreshTokensBtn = document.getElementById('refreshTokensBtn');
const tokensStatus = document.getElementById('tokensStatus');
const tokensList = document.getElementById('tokensList');

let activeTokens = [];
let localShareTokenStorageAvailable = true;
let localShareTokens = loadLocalShareTokens();
let generatedQrCodeCache = new Map();
let selectedQrTokenId = '';
let qrLoadingTokenId = '';
let qrErrorTokenId = '';
let qrErrorMessage = '';

Sentry?.setTag('surface', 'admin');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function setStatusMessage(element, message, tone = '') {
  element.textContent = message;

  if (tone) {
    element.dataset.tone = tone;
    return;
  }

  delete element.dataset.tone;
}

function loadLocalShareTokens() {
  try {
    return parseStoredShareTokens(window.localStorage.getItem(LOCAL_SHARE_TOKEN_STORAGE_KEY));
  } catch {
    localShareTokenStorageAvailable = false;
    return [];
  }
}

function persistLocalShareTokens() {
  try {
    window.localStorage.setItem(LOCAL_SHARE_TOKEN_STORAGE_KEY, JSON.stringify(localShareTokens));
    localShareTokenStorageAvailable = true;
  } catch (error) {
    localShareTokenStorageAvailable = false;
    Sentry?.captureException?.(error);
  }
}

async function loadSession() {
  const payload = await fetchJson('/api/session');
  Sentry?.setUser({
    id: payload.user.id,
    email: payload.user.email,
    username: payload.user.name
  });
  Sentry?.setContext('session', {
    id: payload.session.id,
    expiresAt: payload.session.expiresAt
  });
  sessionSummary.textContent = `${payload.user.name} (${payload.user.email})`;
}

function activeCountLabel(count) {
  return count === 1 ? '1 aktive Freigabe.' : `${count} aktive Freigaben.`;
}

function getLocallyKnownTokenMap() {
  return new Map(
    getGeneratedShareLinkOptions(activeTokens, localShareTokens).map((token) => [token.id, token])
  );
}

function buildQrDownloadName(token) {
  const baseName = String(token?.name ?? 'freigabe')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${baseName || 'freigabe'}-qr.png`;
}

function triggerQrDownload(token, dataUrl) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = buildQrDownloadName(token);
  link.click();
}

function buildTokenPreview(token, localToken) {
  if (selectedQrTokenId !== token.id || !localToken) {
    return '';
  }

  const shareUrl = createLocalShareUrl(window.location.origin, localToken.rawToken);
  const qrDataUrl = generatedQrCodeCache.get(token.id) ?? '';
  const isLoading = qrLoadingTokenId === token.id;
  const errorMessage = qrErrorTokenId === token.id ? qrErrorMessage : '';

  return `
    <div class="token-preview">
      <label class="result-field">
        <span>Freigabelink</span>
        <input type="text" readonly value="${shareUrl}" />
      </label>
      ${isLoading ? '<p class="status">QR-Code wird erzeugt…</p>' : ''}
      ${errorMessage ? `<p class="status" data-tone="error">${errorMessage}</p>` : ''}
      ${qrDataUrl ? `<div class="qr-preview"><img alt="QR-Code" src="${qrDataUrl}" /></div>` : ''}
      <div class="action-row token-preview-actions">
        <button type="button" class="ghost-btn" data-action="copy-link" data-key-id="${token.id}">
          Link kopieren
        </button>
        <button
          type="button"
          class="ghost-btn"
          data-action="download-qr"
          data-key-id="${token.id}"
          ${qrDataUrl ? '' : 'disabled'}
        >
          QR herunterladen
        </button>
      </div>
    </div>
  `;
}

function renderTokens(tokens) {
  tokensList.innerHTML = '';

  if (tokens.length === 0) {
    setStatusMessage(tokensStatus, 'Derzeit sind keine aktiven Freigaben vorhanden.');
    return;
  }

  setStatusMessage(tokensStatus, activeCountLabel(tokens.length));
  const knownTokens = getLocallyKnownTokenMap();

  for (const token of tokens) {
    const localToken = knownTokens.get(token.id) ?? null;
    const item = document.createElement('li');
    item.className = 'token-card';
    item.innerHTML = `
      <div class="token-card-head">
        <div class="token-main">
          <strong>${token.name}</strong>
          <p class="token-meta">${token.displayToken}</p>
          <p class="token-meta">Erstellt: ${new Date(token.createdAt).toLocaleString('de-DE')}</p>
          <p class="token-meta">Ablauf: ${token.expiresAt ? new Date(token.expiresAt).toLocaleString('de-DE') : 'Ohne Ablauf'}</p>
        </div>
        <div class="token-actions">
          <button
            type="button"
            class="ghost-btn"
            data-action="toggle-qr"
            data-key-id="${token.id}"
            ${localToken ? '' : 'disabled title="Nur für lokal bekannte Tokens verfügbar"'}
          >
            QR
          </button>
          <button type="button" class="ghost-btn" data-action="revoke" data-key-id="${token.id}">
            Widerrufen
          </button>
        </div>
      </div>
      ${buildTokenPreview(token, localToken)}
    `;
    tokensList.appendChild(item);
  }
}

async function ensureQrCodeForToken(tokenId) {
  const localToken = getLocallyKnownTokenMap().get(tokenId) ?? null;
  if (!localToken || generatedQrCodeCache.has(tokenId)) {
    qrLoadingTokenId = '';
    qrErrorTokenId = '';
    qrErrorMessage = '';
    renderTokens(activeTokens);
    return;
  }

  qrLoadingTokenId = tokenId;
  qrErrorTokenId = '';
  qrErrorMessage = '';
  renderTokens(activeTokens);

  try {
    const payload = await fetchJson('/api/admin/qrcode', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        data: createLocalShareUrl(window.location.origin, localToken.rawToken)
      })
    });

    generatedQrCodeCache.set(tokenId, payload.dataUrl);
    if (selectedQrTokenId !== tokenId) {
      return;
    }

    qrLoadingTokenId = '';
    renderTokens(activeTokens);
  } catch (error) {
    if (selectedQrTokenId !== tokenId) {
      return;
    }

    qrLoadingTokenId = '';
    qrErrorTokenId = tokenId;
    qrErrorMessage = error.message;
    renderTokens(activeTokens);
  }
}

async function toggleQrPreview(tokenId) {
  const localToken = getLocallyKnownTokenMap().get(tokenId) ?? null;
  if (!localToken) {
    setStatusMessage(
      tokensStatus,
      'QR-Codes sind nur für Freigaben verfügbar, die in diesem Browser erstellt wurden.',
      'error'
    );
    return;
  }

  if (selectedQrTokenId === tokenId) {
    selectedQrTokenId = '';
    qrLoadingTokenId = '';
    qrErrorTokenId = '';
    qrErrorMessage = '';
    renderTokens(activeTokens);
    setStatusMessage(tokensStatus, activeCountLabel(activeTokens.length));
    return;
  }

  selectedQrTokenId = tokenId;
  qrErrorTokenId = '';
  qrErrorMessage = '';
  renderTokens(activeTokens);
  await ensureQrCodeForToken(tokenId);
}

async function loadTokens(preferredQrTokenId = '') {
  setStatusMessage(tokensStatus, 'Freigaben werden geladen…');
  const payload = await fetchJson('/api/admin/tokens');
  activeTokens = payload.tokens;
  localShareTokens = reconcileStoredShareTokens(localShareTokens, activeTokens);
  persistLocalShareTokens();

  if (preferredQrTokenId && activeTokens.some((token) => token.id === preferredQrTokenId)) {
    selectedQrTokenId = preferredQrTokenId;
  } else if (!activeTokens.some((token) => token.id === selectedQrTokenId)) {
    selectedQrTokenId = '';
  }

  renderTokens(activeTokens);

  if (selectedQrTokenId) {
    await ensureQrCodeForToken(selectedQrTokenId);
  }
}

async function copyText(value) {
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);
}

async function logout() {
  const response = await fetch('/logout', {
    method: 'POST',
    credentials: 'same-origin'
  });

  if (response.redirected) {
    window.location.href = response.url;
    return;
  }

  window.location.href = '/';
}

tokenForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const payload = await fetchJson('/api/admin/tokens', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: tokenNameInput.value.trim(),
        expiresInHours: tokenExpiryInput.value
      })
    });

    localShareTokens = upsertStoredShareToken(localShareTokens, {
      id: payload.token.id,
      name: payload.token.name,
      rawToken: payload.rawToken,
      createdAt: payload.token.createdAt,
      expiresAt: payload.token.expiresAt
    });
    generatedQrCodeCache.delete(payload.token.id);
    persistLocalShareTokens();

    newTokenName.textContent = payload.token.name;
    shareUrlOutput.value = createLocalShareUrl(window.location.origin, payload.rawToken);
    rawTokenOutput.value = payload.rawToken;
    newTokenResult.hidden = false;

    tokenForm.reset();
    tokenExpiryInput.value = '12';
    await loadTokens(payload.token.id);
  } catch (error) {
    showLoadError(error);
  }
});

tokensList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action][data-key-id]');
  if (!button) {
    return;
  }

  const { action, keyId } = button.dataset;
  if (!action || !keyId) {
    return;
  }

  try {
    if (action === 'toggle-qr') {
      await toggleQrPreview(keyId);
      return;
    }

    if (action === 'copy-link') {
      const token = getLocallyKnownTokenMap().get(keyId);
      if (token) {
        await copyText(createLocalShareUrl(window.location.origin, token.rawToken));
      }
      return;
    }

    if (action === 'download-qr') {
      const token = getLocallyKnownTokenMap().get(keyId);
      const dataUrl = generatedQrCodeCache.get(keyId) ?? '';
      if (token && dataUrl) {
        triggerQrDownload(token, dataUrl);
      }
      return;
    }

    if (action === 'revoke') {
      await fetchJson(`/api/admin/tokens/${keyId}`, {
        method: 'DELETE'
      });

      localShareTokens = localShareTokens.filter((token) => token.id !== keyId);
      generatedQrCodeCache.delete(keyId);
      persistLocalShareTokens();

      if (selectedQrTokenId === keyId) {
        selectedQrTokenId = '';
        qrLoadingTokenId = '';
        qrErrorTokenId = '';
        qrErrorMessage = '';
      }

      await loadTokens();
    }
  } catch (error) {
    showLoadError(error);
  }
});

copyShareUrlBtn.addEventListener('click', () => copyText(shareUrlOutput.value));
copyRawTokenBtn.addEventListener('click', () => copyText(rawTokenOutput.value));
refreshTokensBtn.addEventListener('click', () => loadTokens().catch(showLoadError));
logoutBtn.addEventListener('click', logout);

function showLoadError(error) {
  setStatusMessage(tokensStatus, error.message, 'error');
}

Promise.all([loadSession(), loadTokens()]).catch((error) => {
  if (error.status === 401) {
    window.location.href = '/?returnTo=/admin';
    return;
  }

  showLoadError(error);
});
