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
const generatedTokenSelect = document.getElementById('generatedTokenSelect');
const generatedShareUrlOutput = document.getElementById('generatedShareUrlOutput');
const generatedQrCodePreview = document.getElementById('generatedQrCodePreview');
const generatedQrCodeImage = document.getElementById('generatedQrCodeImage');
const generatedShareUrlStatus = document.getElementById('generatedShareUrlStatus');
const copyGeneratedShareUrlBtn = document.getElementById('copyGeneratedShareUrlBtn');
const downloadGeneratedQrBtn = document.getElementById('downloadGeneratedQrBtn');
const refreshTokensBtn = document.getElementById('refreshTokensBtn');
const tokensStatus = document.getElementById('tokensStatus');
const tokensList = document.getElementById('tokensList');
let activeTokens = [];
let generatedShareLinkOptions = [];
let localShareTokenStorageAvailable = true;
let localShareTokens = loadLocalShareTokens();
let generatedQrCodeCache = new Map();
let generatedQrCodeRequestId = 0;

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

function renderTokens(tokens) {
  tokensList.innerHTML = '';

  if (tokens.length === 0) {
    setStatusMessage(tokensStatus, 'Derzeit sind keine aktiven Freigaben vorhanden.');
    return;
  }

  setStatusMessage(tokensStatus, activeCountLabel(tokens.length));

  for (const token of tokens) {
    const item = document.createElement('li');
    item.className = 'token-card';
    item.innerHTML = `
      <div>
        <strong>${token.name}</strong>
        <p class="token-meta">${token.displayToken}</p>
        <p class="token-meta">Erstellt am: ${new Date(token.createdAt).toLocaleString('de-DE')}</p>
        <p class="token-meta">Gültig bis: ${token.expiresAt ? new Date(token.expiresAt).toLocaleString('de-DE') : 'Ohne Ablauf'}</p>
      </div>
      <button type="button" class="ghost-btn" data-key-id="${token.id}">Widerrufen</button>
    `;
    tokensList.appendChild(item);
  }
}

function buildGeneratedLinkOptionLabel(token) {
  const expiryLabel = token.expiresAt
    ? `bis ${new Date(token.expiresAt).toLocaleString('de-DE')}`
    : 'ohne Ablauf';
  return `${token.name} (${expiryLabel})`;
}

function getSelectedGeneratedToken(selectedId = generatedTokenSelect.value) {
  return generatedShareLinkOptions.find((token) => token.id === selectedId) ?? null;
}

function buildQrDownloadName(token) {
  const baseName = String(token?.name ?? 'freigabe')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${baseName || 'freigabe'}-qr.png`;
}

function resetGeneratedQrCode() {
  generatedQrCodeImage.removeAttribute('src');
  generatedQrCodePreview.hidden = true;
  downloadGeneratedQrBtn.disabled = true;
}

function showGeneratedQrCode(dataUrl) {
  generatedQrCodeImage.src = dataUrl;
  generatedQrCodePreview.hidden = false;
  downloadGeneratedQrBtn.disabled = false;
}

function updateGeneratedShareUrl(selectedId = generatedTokenSelect.value) {
  const selectedToken = getSelectedGeneratedToken(selectedId);

  if (selectedToken) {
    generatedTokenSelect.value = selectedToken.id;
  } else {
    generatedTokenSelect.value = '';
  }

  generatedShareUrlOutput.value = selectedToken
    ? createLocalShareUrl(window.location.origin, selectedToken.rawToken)
    : '';
  copyGeneratedShareUrlBtn.disabled = !selectedToken;
  if (!selectedToken) {
    resetGeneratedQrCode();
  }

  return selectedToken;
}

async function loadGeneratedQrCode(selectedId = generatedTokenSelect.value) {
  const selectedToken = updateGeneratedShareUrl(selectedId);
  if (!selectedToken) {
    const message =
      activeTokens.length === 0
        ? 'Erstellen Sie zuerst eine Freigabe.'
        : 'Wählen Sie eine lokal bekannte Freigabe aus.';
    setStatusMessage(generatedShareUrlStatus, message);
    return;
  }

  const cachedDataUrl = generatedQrCodeCache.get(selectedToken.id);
  if (cachedDataUrl) {
    showGeneratedQrCode(cachedDataUrl);
    setStatusMessage(generatedShareUrlStatus, 'QR-Code ist bereit.', 'success');
    return;
  }

  resetGeneratedQrCode();
  setStatusMessage(generatedShareUrlStatus, 'QR-Code wird erzeugt…');
  const requestId = ++generatedQrCodeRequestId;

  try {
    const payload = await fetchJson('/api/admin/qrcode', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        data: createLocalShareUrl(window.location.origin, selectedToken.rawToken)
      })
    });

    if (requestId !== generatedQrCodeRequestId || generatedTokenSelect.value !== selectedToken.id) {
      return;
    }

    generatedQrCodeCache.set(selectedToken.id, payload.dataUrl);
    showGeneratedQrCode(payload.dataUrl);
    setStatusMessage(generatedShareUrlStatus, 'QR-Code ist bereit.', 'success');
  } catch (error) {
    if (requestId !== generatedQrCodeRequestId) {
      return;
    }

    resetGeneratedQrCode();
    setStatusMessage(generatedShareUrlStatus, error.message, 'error');
  }
}

function renderGeneratedShareLinks(preferredId = '') {
  generatedShareLinkOptions = getGeneratedShareLinkOptions(activeTokens, localShareTokens);
  const selectedId =
    preferredId && generatedShareLinkOptions.some((token) => token.id === preferredId)
      ? preferredId
      : generatedShareLinkOptions.some((token) => token.id === generatedTokenSelect.value)
        ? generatedTokenSelect.value
        : (generatedShareLinkOptions[0]?.id ?? '');

  generatedTokenSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent =
    generatedShareLinkOptions.length > 0 ? 'Freigabe auswählen' : 'Keine lokal bekannten Freigaben';
  generatedTokenSelect.appendChild(placeholder);

  for (const token of generatedShareLinkOptions) {
    const option = document.createElement('option');
    option.value = token.id;
    option.textContent = buildGeneratedLinkOptionLabel(token);
    generatedTokenSelect.appendChild(option);
  }

  generatedTokenSelect.disabled = generatedShareLinkOptions.length === 0;
  if (generatedShareLinkOptions.length === 0) {
    updateGeneratedShareUrl('');
  } else {
    void loadGeneratedQrCode(selectedId);
  }

  if (!localShareTokenStorageAvailable) {
    setStatusMessage(
      generatedShareUrlStatus,
      'Lokale Speicherung ist in diesem Browser nicht verfügbar. Neue Tokens sind nur bis zum Neuladen auswählbar.',
      'error'
    );
    return;
  }

  if (generatedShareLinkOptions.length === 0) {
    const message =
      activeTokens.length === 0
        ? 'Erstellen Sie zuerst eine Freigabe.'
        : 'Nur in diesem Browser erzeugte Freigaben stehen hier als vollständiger Link zur Verfügung.';
    setStatusMessage(generatedShareUrlStatus, message);
    return;
  }

}

async function loadTokens(preferredGeneratedTokenId = '') {
  setStatusMessage(tokensStatus, 'Freigaben werden geladen…');
  const payload = await fetchJson('/api/admin/tokens');
  activeTokens = payload.tokens;
  localShareTokens = reconcileStoredShareTokens(localShareTokens, activeTokens);
  persistLocalShareTokens();
  renderTokens(activeTokens);
  renderGeneratedShareLinks(preferredGeneratedTokenId);
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
  const button = event.target.closest('button[data-key-id]');
  if (!button) {
    return;
  }

  try {
    await fetchJson(`/api/admin/tokens/${button.dataset.keyId}`, {
      method: 'DELETE'
    });
    localShareTokens = localShareTokens.filter((token) => token.id !== button.dataset.keyId);
    generatedQrCodeCache.delete(button.dataset.keyId);
    persistLocalShareTokens();
    await loadTokens();
  } catch (error) {
    showLoadError(error);
  }
});

copyShareUrlBtn.addEventListener('click', () => copyText(shareUrlOutput.value));
copyRawTokenBtn.addEventListener('click', () => copyText(rawTokenOutput.value));
generatedTokenSelect.addEventListener('change', () => {
  void loadGeneratedQrCode();
});
copyGeneratedShareUrlBtn.addEventListener('click', () => copyText(generatedShareUrlOutput.value));
downloadGeneratedQrBtn.addEventListener('click', () => {
  const selectedToken = getSelectedGeneratedToken();
  const dataUrl = selectedToken ? generatedQrCodeCache.get(selectedToken.id) : '';
  if (!selectedToken || !dataUrl) {
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = buildQrDownloadName(selectedToken);
  link.click();
});
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
