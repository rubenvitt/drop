import { normalizeShareTokenInput } from './ui-utils.js';

const Sentry = window.Sentry;
const loginButton = document.getElementById('pocketIdLoginBtn');
const loginMessage = document.getElementById('welcomeMessage');
const tokenForm = document.getElementById('tokenAccessForm');
const shareTokenInput = document.getElementById('shareTokenInput');

const params = new URLSearchParams(window.location.search);
const returnTo = params.get('returnTo') || '/admin';
const error = params.get('error');
const presetToken = normalizeShareTokenInput(params.get('token') || '');

Sentry?.setTag('surface', 'welcome');
Sentry?.setContext('login', {
  returnTo,
  hasPresetToken: Boolean(presetToken),
  error: error ?? null
});

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
  setMessage('Die Anmeldung mit Ihrer I&K ID konnte nicht gestartet werden. Bitte versuchen Sie es erneut.', 'error');
}

if (error === 'invalid_token') {
  setMessage(
    'Dieser Zugangscode ist ungültig oder bereits abgelaufen. Bitte prüfen Sie den Code oder fordern Sie einen neuen Freigabelink an.',
    'error'
  );
}

loginButton.addEventListener('click', () => {
  loginButton.disabled = true;
  loginButton.textContent = 'Anmeldung wird vorbereitet...';
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

  const submitButton = tokenForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Upload-Bereich wird geöffnet...';
  }

  window.location.href = `/u/${encodeURIComponent(normalizedToken)}`;
});
