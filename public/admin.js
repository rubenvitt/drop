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
const pageStatus = document.getElementById('pageStatus');
const storageWarning = document.getElementById('storageWarning');
const tokenForm = document.getElementById('tokenForm');
const tokenNameInput = document.getElementById('tokenName');
const tokenExpiryInput = document.getElementById('tokenExpiry');
const composerStatus = document.getElementById('composerStatus');
const shareKit = document.getElementById('shareKit');
const shareKitStatus = document.getElementById('shareKitStatus');
const shareKitQrStatus = document.getElementById('shareKitQrStatus');
const newTokenName = document.getElementById('newTokenName');
const shareUrlOutput = document.getElementById('shareUrlOutput');
const rawTokenOutput = document.getElementById('rawTokenOutput');
const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');
const copyRawTokenBtn = document.getElementById('copyRawTokenBtn');
const downloadShareKitQrBtn = document.getElementById('downloadShareKitQrBtn');
const shareKitQrPreview = document.getElementById('shareKitQrPreview');
const refreshTokensBtn = document.getElementById('refreshTokensBtn');
const tokensStatus = document.getElementById('tokensStatus');
const actionStatus = document.getElementById('actionStatus');
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
let latestCreatedTokenId = '';
let shareKitTokenId = '';
let actionStatusTimer = 0;

showStorageWarning();

Sentry?.setTag('surface', 'admin');

function setBanner(element, message, tone = 'info') {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.tone = tone;
  element.hidden = !message;
}

function clearBanner(element) {
  if (!element) {
    return;
  }

  element.textContent = '';
  element.hidden = true;
  delete element.dataset.tone;
}

function announceLiveStatus(message) {
  if (adminLiveStatus) {
    adminLiveStatus.textContent = message;
  }
}

function flashActionStatus(message, tone = 'success') {
  window.clearTimeout(actionStatusTimer);
  setBanner(actionStatus, message, tone);
  announceLiveStatus(message);
  actionStatusTimer = window.setTimeout(() => {
    clearBanner(actionStatus);
  }, 4500);
}

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
      message = 'Zu viele Anfragen in kurzer Zeit. Bitte warten Sie einen Moment und versuchen Sie es erneut.';
    } else if (response.status >= 500) {
      message = 'Der Server ist derzeit nicht erreichbar. Bitte versuchen Sie es erneut.';
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
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

function showStorageWarning() {
  if (!storageWarning) {
    return;
  }

  if (localShareTokenStorageAvailable) {
    storageWarning.textContent =
      'Fuer lokal erzeugte Freigaben stehen Link, Code und QR-Code in diesem Browser direkt bereit. Bei aelteren, hier nicht erzeugten Freigaben bleibt die Arbeitsliste sichtbar, aber Link und QR koennen nicht rekonstruiert werden.';
    return;
  }

  storageWarning.textContent =
    'Dieser Browser blockiert lokalen Speicher. Neue Freigaben funktionieren weiterhin, Link- und QR-Vorschau stehen nach einem Reload jedoch nicht mehr direkt zur Verfuegung.';
}

function getLocallyKnownTokenMap() {
  return new Map(
    getGeneratedShareLinkOptions(activeTokens, localShareTokens).map((token) => [token.id, token])
  );
}

function formatDateTime(value) {
  if (!value) {
    return 'Ohne Ablauf';
  }

  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function formatRelativeExpiry(value) {
  if (!value) {
    return 'Aktiv ohne Ablauf';
  }

  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) {
    return 'Bereits abgelaufen';
  }

  const minutes = Math.round(diff / 60000);
  if (minutes < 60) {
    return `Laeuft in ${minutes} Min. ab`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `Laeuft in ${hours} Std. ab`;
  }

  const days = Math.round(hours / 24);
  return `Laeuft in ${days} Tagen ab`;
}

function getStateBadge(token) {
  if (!token.expiresAt) {
    return {
      label: 'Aktiv',
      tone: 'success'
    };
  }

  const diff = new Date(token.expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return {
      label: 'Abgelaufen',
      tone: 'error'
    };
  }

  if (diff <= 6 * 60 * 60 * 1000) {
    return {
      label: 'Laeuft bald ab',
      tone: 'warning'
    };
  }

  return {
    label: 'Aktiv',
    tone: 'success'
  };
}

function activeCountLabel(count) {
  return count === 1 ? '1 aktiver Upload-Zugang.' : `${count} aktive Upload-Zugaenge.`;
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

async function copyText(value, successMessage) {
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);
  flashActionStatus(successMessage, 'success');
}

async function ensureQrCodeForToken(tokenId) {
  const localToken = getLocallyKnownTokenMap().get(tokenId) ?? null;
  if (!localToken) {
    throw new Error('Link und QR-Code sind nur fuer Freigaben verfuegbar, die in diesem Browser erstellt wurden.');
  }

  if (generatedQrCodeCache.has(tokenId)) {
    return generatedQrCodeCache.get(tokenId);
  }

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
  return payload.dataUrl;
}

function renderQrPreview(container, tokenName, dataUrl) {
  container.replaceChildren();

  if (!dataUrl) {
    return;
  }

  const image = document.createElement('img');
  image.src = dataUrl;
  image.alt = `QR-Code fuer ${tokenName}`;
  container.appendChild(image);
}

async function populateShareKitQr(tokenId, tokenName) {
  shareKitQrStatus.textContent = 'QR-Code wird erzeugt...';
  downloadShareKitQrBtn.disabled = true;
  renderQrPreview(shareKitQrPreview, tokenName, '');

  try {
    const dataUrl = await ensureQrCodeForToken(tokenId);
    renderQrPreview(shareKitQrPreview, tokenName, dataUrl);
    shareKitQrStatus.textContent = 'QR-Code bereit zum Teilen oder Herunterladen.';
    downloadShareKitQrBtn.disabled = false;
  } catch (error) {
    shareKitQrStatus.textContent = error.message;
    downloadShareKitQrBtn.disabled = true;
  }
}

function renderShareKit(token, rawToken) {
  shareKit.hidden = false;
  shareKitTokenId = token.id;
  newTokenName.textContent = token.name;
  shareUrlOutput.value = createLocalShareUrl(window.location.origin, rawToken);
  rawTokenOutput.value = rawToken;
  clearBanner(shareKitStatus);
  populateShareKitQr(token.id, token.name).catch((error) => {
    shareKitQrStatus.textContent = error.message;
  });
}

function createTokenBadge(text, tone = 'accent') {
  const badge = document.createElement('span');
  badge.className = 'token-badge';
  badge.dataset.tone = tone;
  badge.textContent = text;
  return badge;
}

function createActionButton(action, keyId, label, disabled = false, title = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = action === 'revoke' ? 'secondary-btn' : 'ghost-btn';
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
  if (!localToken || selectedQrTokenId !== token.id) {
    return null;
  }

  const preview = document.createElement('div');
  preview.className = 'token-preview';

  const field = document.createElement('label');
  field.className = 'field';
  const fieldLabel = document.createElement('span');
  fieldLabel.className = 'field-label';
  fieldLabel.textContent = 'Freigabelink';
  const fieldInput = document.createElement('input');
  fieldInput.type = 'text';
  fieldInput.readOnly = true;
  fieldInput.value = createLocalShareUrl(window.location.origin, localToken.rawToken);
  field.append(fieldLabel, fieldInput);
  preview.appendChild(field);

  if (qrLoadingTokenId === token.id) {
    const loading = document.createElement('p');
    loading.className = 'support-text';
    loading.textContent = 'QR-Code wird geladen...';
    preview.appendChild(loading);
  }

  if (qrErrorTokenId === token.id && qrErrorMessage) {
    const error = document.createElement('p');
    error.className = 'support-text';
    error.textContent = qrErrorMessage;
    preview.appendChild(error);
  }

  const qrPreview = document.createElement('div');
  qrPreview.className = 'qr-preview';
  renderQrPreview(qrPreview, token.name, generatedQrCodeCache.get(token.id) ?? '');
  preview.appendChild(qrPreview);

  const actions = document.createElement('div');
  actions.className = 'token-preview-actions';
  actions.append(
    createActionButton('copy-link', token.id, 'Link kopieren'),
    createActionButton('copy-code', token.id, 'Code kopieren'),
    createActionButton('download-qr', token.id, 'QR herunterladen', !generatedQrCodeCache.has(token.id))
  );
  preview.appendChild(actions);
  return preview;
}

function renderTokens(tokens) {
  tokensList.replaceChildren();

  if (tokens.length === 0) {
    tokensStatus.textContent = 'Derzeit sind keine aktiven Upload-Zugaenge vorhanden.';

    const emptyState = document.createElement('li');
    emptyState.className = 'empty-state';
    emptyState.textContent =
      'Aktuell gibt es keine aktiven Freigaben. Erstellen Sie oben einen neuen Upload-Zugang, um ihn direkt zu teilen.';
    tokensList.appendChild(emptyState);
    return;
  }

  tokensStatus.textContent = activeCountLabel(tokens.length);
  const knownTokens = getLocallyKnownTokenMap();
  const fragment = document.createDocumentFragment();

  for (const token of tokens) {
    const localToken = knownTokens.get(token.id) ?? null;
    const item = document.createElement('li');
    item.className = 'token-item';

    const top = document.createElement('div');
    top.className = 'token-top';

    const main = document.createElement('div');
    main.className = 'token-main';

    const titleRow = document.createElement('div');
    titleRow.className = 'token-title-row';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'token-title-wrap';

    const title = document.createElement('div');
    title.className = 'token-title';
    const titleStrong = document.createElement('strong');
    titleStrong.textContent = token.name;
    const code = document.createElement('span');
    code.className = 'token-code';
    code.textContent = `Zugangscode: ${token.displayToken}`;
    title.append(titleStrong, code);

    const badges = document.createElement('div');
    badges.className = 'token-badges';
    const stateBadge = getStateBadge(token);
    badges.appendChild(createTokenBadge(stateBadge.label, stateBadge.tone === 'warning' ? 'warning' : 'accent'));
    badges.appendChild(createTokenBadge(localToken ? 'In diesem Browser teilbar' : 'Nur Grunddaten vorhanden', localToken ? 'accent' : 'muted'));
    if (token.id === latestCreatedTokenId) {
      badges.appendChild(createTokenBadge('Neu erstellt', 'warning'));
    }

    titleWrap.append(title, badges);
    titleRow.appendChild(titleWrap);
    main.appendChild(titleRow);

    const metaRow = document.createElement('div');
    metaRow.className = 'token-meta-row';
    const created = document.createElement('span');
    created.className = 'token-meta';
    created.textContent = `Erstellt: ${formatDateTime(token.createdAt)}`;
    const expires = document.createElement('span');
    expires.className = 'token-meta';
    expires.textContent = `Ablauf: ${formatDateTime(token.expiresAt)}`;
    const relative = document.createElement('span');
    relative.className = 'token-meta';
    relative.textContent = formatRelativeExpiry(token.expiresAt);
    metaRow.append(created, expires, relative);
    main.appendChild(metaRow);

    if (!localToken) {
      const note = document.createElement('p');
      note.className = 'token-note';
      note.textContent =
        'Link und QR-Code sind nur dann direkt verfuegbar, wenn dieser Zugang in diesem Browser erstellt wurde.';
      main.appendChild(note);
    }

    const actions = document.createElement('div');
    actions.className = 'token-actions';
    actions.append(
      createActionButton(
        'copy-link',
        token.id,
        'Link kopieren',
        !localToken,
        localToken ? '' : 'Nur fuer in diesem Browser erzeugte Freigaben verfuegbar'
      ),
      createActionButton(
        'copy-code',
        token.id,
        'Code kopieren',
        !localToken,
        localToken ? '' : 'Der volle Zugangscode ist nur lokal bekannt'
      ),
      createActionButton(
        'toggle-qr',
        token.id,
        selectedQrTokenId === token.id ? 'QR ausblenden' : 'QR anzeigen',
        !localToken,
        localToken ? '' : 'Nur fuer in diesem Browser erzeugte Freigaben verfuegbar'
      ),
      createActionButton('revoke', token.id, 'Zugang sperren')
    );

    top.append(main, actions);
    item.appendChild(top);

    const preview = createTokenPreview(token, localToken);
    if (preview) {
      item.appendChild(preview);
    }

    fragment.appendChild(item);
  }

  tokensList.appendChild(fragment);
}

async function ensureSelectedQrPreview(tokenId) {
  const localToken = getLocallyKnownTokenMap().get(tokenId) ?? null;
  if (!localToken) {
    qrLoadingTokenId = '';
    qrErrorTokenId = tokenId;
    qrErrorMessage = 'Link und QR-Code sind nur fuer lokal bekannte Freigaben verfuegbar.';
    renderTokens(activeTokens);
    return;
  }

  qrLoadingTokenId = tokenId;
  qrErrorTokenId = '';
  qrErrorMessage = '';
  renderTokens(activeTokens);

  try {
    await ensureQrCodeForToken(tokenId);
    qrLoadingTokenId = '';
    renderTokens(activeTokens);
  } catch (error) {
    qrLoadingTokenId = '';
    qrErrorTokenId = tokenId;
    qrErrorMessage = error.message;
    renderTokens(activeTokens);
  }
}

async function toggleQrPreview(tokenId) {
  if (selectedQrTokenId === tokenId) {
    selectedQrTokenId = '';
    qrLoadingTokenId = '';
    qrErrorTokenId = '';
    qrErrorMessage = '';
    renderTokens(activeTokens);
    return;
  }

  selectedQrTokenId = tokenId;
  await ensureSelectedQrPreview(tokenId);
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

async function loadTokens(preferredQrTokenId = '') {
  tokensStatus.textContent = 'Upload-Zugaenge werden geladen...';
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
  clearBanner(pageStatus);

  const submitButton = tokenForm.querySelector('button[type="submit"]');
  if (!(submitButton instanceof HTMLButtonElement)) {
    return;
  }

  setButtonBusy(submitButton, true, 'Wird erstellt...', 'Upload-Zugang erstellen');
  setBanner(composerStatus, 'Neuer Upload-Zugang wird erstellt...', 'info');

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
    persistLocalShareTokens();

    latestCreatedTokenId = payload.token.id;
    generatedQrCodeCache.delete(payload.token.id);
    renderShareKit(payload.token, payload.rawToken);

    tokenForm.reset();
    tokenExpiryInput.value = '12';
    setBanner(composerStatus, 'Upload-Zugang erfolgreich erstellt. Sie koennen ihn jetzt direkt teilen.', 'success');
    await loadTokens(payload.token.id);
  } catch (error) {
    setBanner(composerStatus, error.message, 'error');
  } finally {
    setButtonBusy(submitButton, false, 'Wird erstellt...', 'Upload-Zugang erstellen');
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

  const localToken = getLocallyKnownTokenMap().get(keyId) ?? null;
  const token = activeTokens.find((entry) => entry.id === keyId) ?? null;

  try {
    if (action === 'copy-link') {
      if (!localToken) {
        flashActionStatus('Dieser Link ist nur fuer in diesem Browser erzeugte Freigaben direkt verfuegbar.', 'warning');
        return;
      }

      await copyText(
        createLocalShareUrl(window.location.origin, localToken.rawToken),
        `Freigabelink fuer "${localToken.name}" kopiert.`
      );
      return;
    }

    if (action === 'copy-code') {
      if (!localToken) {
        flashActionStatus('Der volle Zugangscode ist fuer diese Freigabe in diesem Browser nicht mehr verfuegbar.', 'warning');
        return;
      }

      await copyText(localToken.rawToken, `Zugangscode fuer "${localToken.name}" kopiert.`);
      return;
    }

    if (action === 'toggle-qr') {
      await toggleQrPreview(keyId);
      return;
    }

    if (action === 'download-qr') {
      if (!token) {
        return;
      }

      const dataUrl = generatedQrCodeCache.get(keyId) ?? '';
      if (!dataUrl) {
        flashActionStatus('Bitte oeffnen Sie zuerst die QR-Vorschau oder erstellen Sie die Freigabe neu.', 'warning');
        return;
      }

      triggerQrDownload(token, dataUrl);
      flashActionStatus(`QR-Code fuer "${token.name}" heruntergeladen.`, 'success');
      return;
    }

    if (action === 'revoke') {
      const revokeLabel = token?.name ? `"${token.name}"` : 'diesen Upload-Zugang';
      const confirmed = window.confirm(`Moechten Sie ${revokeLabel} wirklich sperren?`);
      if (!confirmed) {
        return;
      }

      button.disabled = true;
      flashActionStatus(`Upload-Zugang ${revokeLabel} wird gesperrt...`, 'warning');

      await fetchJson(`/api/admin/tokens/${keyId}`, {
        method: 'DELETE'
      });

      localShareTokens = localShareTokens.filter((entry) => entry.id !== keyId);
      persistLocalShareTokens();
      generatedQrCodeCache.delete(keyId);

      if (selectedQrTokenId === keyId) {
        selectedQrTokenId = '';
      }

      await loadTokens();
      flashActionStatus(`Upload-Zugang ${revokeLabel} wurde gesperrt.`, 'success');
    }
  } catch (error) {
    flashActionStatus(error.message, 'error');
  }
});

copyShareUrlBtn.addEventListener('click', () => {
  copyText(shareUrlOutput.value, 'Freigabelink kopiert.').catch((error) => {
    setBanner(shareKitStatus, error.message, 'error');
  });
});

copyRawTokenBtn.addEventListener('click', () => {
  copyText(rawTokenOutput.value, 'Zugangscode kopiert.').catch((error) => {
    setBanner(shareKitStatus, error.message, 'error');
  });
});

downloadShareKitQrBtn.addEventListener('click', () => {
  if (!shareKitTokenId) {
    return;
  }

  const token = activeTokens.find((entry) => entry.id === shareKitTokenId);
  const dataUrl = generatedQrCodeCache.get(shareKitTokenId) ?? '';
  if (!token || !dataUrl) {
    return;
  }

  triggerQrDownload(token, dataUrl);
  setBanner(shareKitStatus, `QR-Code fuer "${token.name}" heruntergeladen.`, 'success');
});

refreshTokensBtn.addEventListener('click', async () => {
  setButtonBusy(refreshTokensBtn, true, 'Laedt...', 'Aktualisieren');

  try {
    await loadTokens();
  } catch (error) {
    setBanner(pageStatus, error.message, 'error');
  } finally {
    setButtonBusy(refreshTokensBtn, false, 'Laedt...', 'Aktualisieren');
  }
});

logoutBtn.addEventListener('click', logout);

Promise.all([loadSession(), loadTokens()]).catch((error) => {
  if (error.status === 401 || error.status === 403) {
    window.location.href = '/?returnTo=/admin';
    return;
  }

  setBanner(pageStatus, error.message, 'error');
});
