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
const storageWarning = document.getElementById('storageWarning');
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
const adminLiveStatus = document.getElementById('adminLiveStatus');
const tokensList = document.getElementById('tokensList');

let activeTokens = [];
let localShareTokenStorageAvailable = true;
let localShareTokens = loadLocalShareTokens();
let generatedQrCodeCache = new Map();
let selectedQrTokenId = '';
let qrLoadingTokenId = '';
let qrErrorTokenId = '';
let qrErrorMessage = '';

showStorageWarning();

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
    let message = payload?.error || `Request failed (${response.status})`;
    if (response.status === 401 || response.status === 403) {
      message = 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.';
    } else if (response.status === 429) {
      message = 'Zu viele Anfragen. Bitte versuchen Sie es in wenigen Sekunden erneut.';
    } else if (response.status >= 500) {
      message = 'Der Server ist derzeit nicht erreichbar. Bitte versuchen Sie es erneut.';
    }

    const error = new Error(message);
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

function announceLiveStatus(message) {
  if (!adminLiveStatus) {
    return;
  }

  adminLiveStatus.textContent = message;
}

function showStorageWarning() {
  if (!storageWarning) {
    return;
  }

  if (localShareTokenStorageAvailable) {
    storageWarning.hidden = true;
    storageWarning.textContent = '';
    return;
  }

  storageWarning.hidden = false;
  storageWarning.textContent =
    'Lokaler Browser-Speicher ist deaktiviert. Link- und QR-Vorschau stehen nur eingeschränkt zur Verfügung.';
}

function setButtonBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
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

  showStorageWarning();
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

function createMetaLine(text) {
  const line = document.createElement('p');
  line.className = 'token-meta';
  line.textContent = text;
  return line;
}

function createActionButton(action, keyId, label, disabled = false, title = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-btn';
  button.dataset.action = action;
  button.dataset.keyId = keyId;
  button.textContent = label;
  button.disabled = disabled;
  if (title) {
    button.title = title;
  }
  return button;
}

function createTokenPreview(token, localToken) {
  if (selectedQrTokenId !== token.id || !localToken) {
    return null;
  }

  const preview = document.createElement('div');
  preview.className = 'token-preview';

  const field = document.createElement('label');
  field.className = 'result-field';
  const fieldLabel = document.createElement('span');
  fieldLabel.textContent = 'Freigabelink';
  const fieldInput = document.createElement('input');
  fieldInput.type = 'text';
  fieldInput.readOnly = true;
  fieldInput.value = createLocalShareUrl(window.location.origin, localToken.rawToken);
  field.append(fieldLabel, fieldInput);
  preview.appendChild(field);

  if (qrLoadingTokenId === token.id) {
    const loading = document.createElement('p');
    loading.className = 'status';
    loading.textContent = 'QR-Code wird erzeugt…';
    preview.appendChild(loading);
  }

  if (qrErrorTokenId === token.id && qrErrorMessage) {
    const error = document.createElement('p');
    error.className = 'status';
    error.dataset.tone = 'error';
    error.textContent = qrErrorMessage;
    preview.appendChild(error);
  }

  const qrDataUrl = generatedQrCodeCache.get(token.id) ?? '';
  if (qrDataUrl) {
    const qrPreview = document.createElement('div');
    qrPreview.className = 'qr-preview';
    const image = document.createElement('img');
    image.alt = `QR-Code für ${token.name}`;
    image.src = qrDataUrl;
    qrPreview.appendChild(image);
    preview.appendChild(qrPreview);
  }

  const actions = document.createElement('div');
  actions.className = 'action-row token-preview-actions';
  actions.append(
    createActionButton('copy-link', token.id, 'Link kopieren'),
    createActionButton('download-qr', token.id, 'QR herunterladen', !qrDataUrl)
  );

  preview.appendChild(actions);
  return preview;
}

function renderTokens(tokens) {
  const fragment = document.createDocumentFragment();

  if (tokens.length === 0) {
    tokensList.replaceChildren();
    setStatusMessage(tokensStatus, 'Derzeit sind keine aktiven Freigaben vorhanden.');
    return;
  }

  setStatusMessage(tokensStatus, activeCountLabel(tokens.length));
  const knownTokens = getLocallyKnownTokenMap();

  for (const token of tokens) {
    const localToken = knownTokens.get(token.id) ?? null;
    const item = document.createElement('li');
    item.className = 'token-card';

    const head = document.createElement('div');
    head.className = 'token-card-head';

    const main = document.createElement('div');
    main.className = 'token-main';

    const name = document.createElement('strong');
    name.textContent = token.name;

    main.append(
      name,
      createMetaLine(token.displayToken),
      createMetaLine(`Erstellt: ${new Date(token.createdAt).toLocaleString('de-DE')}`),
      createMetaLine(
        `Ablauf: ${token.expiresAt ? new Date(token.expiresAt).toLocaleString('de-DE') : 'Ohne Ablauf'}`
      )
    );

    const actions = document.createElement('div');
    actions.className = 'token-actions';
    actions.append(
      createActionButton(
        'toggle-qr',
        token.id,
        'QR',
        !localToken,
        localToken ? '' : 'Nur für lokal bekannte Tokens verfügbar'
      ),
      createActionButton('revoke', token.id, 'Widerrufen')
    );

    head.append(main, actions);
    item.appendChild(head);

    const preview = createTokenPreview(token, localToken);
    if (preview) {
      item.appendChild(preview);
    }

    fragment.appendChild(item);
  }

  tokensList.replaceChildren(fragment);
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

async function copyText(value, successMessage = 'In Zwischenablage kopiert.') {
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);
  setStatusMessage(tokensStatus, successMessage, 'success');
  announceLiveStatus(successMessage);
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
  const submitButton = tokenForm.querySelector('button[type="submit"]');
  if (!(submitButton instanceof HTMLButtonElement)) {
    return;
  }

  setButtonBusy(submitButton, true, 'Wird erstellt…', 'Freigabe erstellen');
  setStatusMessage(tokensStatus, 'Neue Freigabe wird erstellt…');

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
    setStatusMessage(tokensStatus, 'Freigabe erfolgreich erstellt.', 'success');
    announceLiveStatus('Freigabe erfolgreich erstellt.');
  } catch (error) {
    showLoadError(error);
  } finally {
    setButtonBusy(submitButton, false, 'Wird erstellt…', 'Freigabe erstellen');
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
        await copyText(
          createLocalShareUrl(window.location.origin, token.rawToken),
          `Freigabelink für "${token.name}" kopiert.`
        );
      }
      return;
    }

    if (action === 'download-qr') {
      const token = getLocallyKnownTokenMap().get(keyId);
      const dataUrl = generatedQrCodeCache.get(keyId) ?? '';
      if (token && dataUrl) {
        triggerQrDownload(token, dataUrl);
        setStatusMessage(tokensStatus, `QR-Code für "${token.name}" heruntergeladen.`, 'success');
        announceLiveStatus(`QR-Code für ${token.name} heruntergeladen.`);
      }
      return;
    }

    if (action === 'revoke') {
      const tokenToRevoke = activeTokens.find((token) => token.id === keyId);
      const revokeLabel = tokenToRevoke?.name ? `"${tokenToRevoke.name}"` : 'diese Freigabe';
      const confirmed = window.confirm(`Möchten Sie ${revokeLabel} wirklich widerrufen?`);
      if (!confirmed) {
        return;
      }

      button.disabled = true;
      setStatusMessage(tokensStatus, `Freigabe ${revokeLabel} wird widerrufen…`);

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
      setStatusMessage(tokensStatus, `Freigabe ${revokeLabel} wurde widerrufen.`, 'success');
      announceLiveStatus(`Freigabe ${revokeLabel} wurde widerrufen.`);
    }
  } catch (error) {
    showLoadError(error);
  }
});

copyShareUrlBtn.addEventListener('click', () =>
  copyText(shareUrlOutput.value, 'Freigabelink der neuen Freigabe kopiert.').catch(showLoadError)
);
copyRawTokenBtn.addEventListener('click', () =>
  copyText(rawTokenOutput.value, 'Zugangscode der neuen Freigabe kopiert.').catch(showLoadError)
);
refreshTokensBtn.addEventListener('click', async () => {
  setButtonBusy(refreshTokensBtn, true, 'Lädt…', 'Aktualisieren');
  try {
    await loadTokens();
  } catch (error) {
    showLoadError(error);
  } finally {
    setButtonBusy(refreshTokensBtn, false, 'Lädt…', 'Aktualisieren');
  }
});
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
