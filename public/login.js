const loginButton = document.getElementById('pocketIdLoginBtn');
const loginMessage = document.getElementById('loginMessage');

const params = new URLSearchParams(window.location.search);
const returnTo = params.get('returnTo') || '/';
const error = params.get('error');

if (error === 'oidc_failed') {
  loginMessage.textContent = 'Pocket-ID-Login fehlgeschlagen. Bitte erneut versuchen.';
}

loginButton.addEventListener('click', () => {
  window.location.href = `/login/pocketid?returnTo=${encodeURIComponent(returnTo)}`;
});
