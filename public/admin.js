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

async function loadSession() {
  const payload = await fetchJson('/api/session');
  sessionSummary.textContent = `${payload.user.name} (${payload.user.email})`;
}

function renderTokens(tokens) {
  tokensList.innerHTML = '';

  if (tokens.length === 0) {
    tokensStatus.textContent = 'Noch keine Share-Links vorhanden.';
    return;
  }

  tokensStatus.textContent = `${tokens.length} Token(s) aktiv.`;

  for (const token of tokens) {
    const item = document.createElement('li');
    item.className = 'token-card';
    item.innerHTML = `
      <div>
        <strong>${token.name}</strong>
        <p class="token-meta">${token.displayToken}</p>
        <p class="token-meta">Erstellt: ${new Date(token.createdAt).toLocaleString('de-DE')}</p>
        <p class="token-meta">Ablauf: ${token.expiresAt ? new Date(token.expiresAt).toLocaleString('de-DE') : 'Kein Ablauf'}</p>
      </div>
      <button type="button" class="ghost-btn" data-key-id="${token.id}">Widerrufen</button>
    `;
    tokensList.appendChild(item);
  }
}

async function loadTokens() {
  tokensStatus.textContent = 'Lade Tokens…';
  const payload = await fetchJson('/api/admin/tokens');
  renderTokens(payload.tokens);
}

async function copyText(value) {
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

  window.location.href = '/login';
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
        expiresInDays: tokenExpiryInput.value
      })
    });

    newTokenName.textContent = payload.token.name;
    shareUrlOutput.value = payload.shareUrl;
    rawTokenOutput.value = payload.rawToken;
    newTokenResult.hidden = false;
    tokenForm.reset();
    tokenExpiryInput.value = '30';
    await loadTokens();
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
    await loadTokens();
  } catch (error) {
    showLoadError(error);
  }
});

copyShareUrlBtn.addEventListener('click', () => copyText(shareUrlOutput.value));
copyRawTokenBtn.addEventListener('click', () => copyText(rawTokenOutput.value));
refreshTokensBtn.addEventListener('click', () => loadTokens().catch(showLoadError));
logoutBtn.addEventListener('click', logout);

function showLoadError(error) {
  tokensStatus.textContent = error.message;
}

Promise.all([loadSession(), loadTokens()]).catch((error) => {
  if (error.status === 401) {
    window.location.href = '/login?returnTo=/admin';
    return;
  }

  showLoadError(error);
});
