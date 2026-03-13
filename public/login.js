import { normalizeShareTokenInput } from './ui-utils.js';

const loginButton = document.getElementById('pocketIdLoginBtn');
const loginMessage = document.getElementById('welcomeMessage');
const tokenForm = document.getElementById('tokenAccessForm');
const shareTokenInput = document.getElementById('shareTokenInput');

const params = new URLSearchParams(window.location.search);
const returnTo = params.get('returnTo') || '/admin';
const error = params.get('error');
const presetToken = normalizeShareTokenInput(params.get('token') || '');

function setMessage(message, tone = 'info') {
  loginMessage.textContent = message;
  loginMessage.dataset.tone = tone;
}

if (presetToken) {
  shareTokenInput.value = presetToken;
}

if (error === 'oidc_failed') {
  setMessage('Pocket-ID-Login fehlgeschlagen. Bitte erneut versuchen.', 'error');
}

if (error === 'invalid_token') {
  setMessage('Der Zugangscode ist ungültig oder abgelaufen. Bitte Code oder Share-Link prüfen.', 'error');
}

loginButton.addEventListener('click', () => {
  window.location.href = `/login/pocketid?returnTo=${encodeURIComponent(returnTo)}`;
});

tokenForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const normalizedToken = normalizeShareTokenInput(shareTokenInput.value);
  if (!normalizedToken) {
    setMessage('Bitte einen Zugangscode oder kompletten Share-Link eingeben.', 'error');
    shareTokenInput.focus();
    return;
  }

  setMessage('');
  window.location.href = `/u/${encodeURIComponent(normalizedToken)}`;
});
