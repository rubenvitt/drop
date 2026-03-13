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
  loginMessage.hidden = !message;
  shareTokenInput.setAttribute('aria-invalid', tone === 'error' ? 'true' : 'false');
}

if (presetToken) {
  shareTokenInput.value = presetToken;
}

setMessage('');

if (error === 'oidc_failed') {
  setMessage('Die Anmeldung über Pocket ID konnte nicht gestartet werden. Bitte versuchen Sie es erneut.', 'error');
}

if (error === 'invalid_token') {
  setMessage('Der eingegebene Zugangscode ist ungültig oder bereits abgelaufen. Bitte prüfen Sie Ihre Angaben.', 'error');
}

loginButton.addEventListener('click', () => {
  window.location.href = `/login/pocketid?returnTo=${encodeURIComponent(returnTo)}`;
});

tokenForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const normalizedToken = normalizeShareTokenInput(shareTokenInput.value);
  if (!normalizedToken) {
    setMessage('Bitte geben Sie einen Zugangscode oder einen vollständigen Freigabelink ein.', 'error');
    shareTokenInput.focus();
    return;
  }

  setMessage('');
  window.location.href = `/u/${encodeURIComponent(normalizedToken)}`;
});
