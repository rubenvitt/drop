import { isShareLinkPath, resolveUploadPath } from './ui-utils.js';

const fileInput = document.getElementById('files');
const uploadBtn = document.getElementById('uploadBtn');
const dropzone = document.getElementById('dropzone');
const queue = document.getElementById('queue');
const statusEl = document.getElementById('status');
const hintInput = document.getElementById('hint');
const categoryInput = document.getElementById('category');
const sessionNav = document.getElementById('sessionNav');
const sessionLabel = document.getElementById('sessionLabel');
const logoutBtn = document.getElementById('logoutBtn');

const shareMode = isShareLinkPath(window.location.pathname);
const uploadPath = resolveUploadPath(window.location.pathname);

const parseJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const errorMessageFor = (status, payload) => {
  const rawError = String(payload?.error ?? '');

  if (status === 401 || status === 403) {
    return 'Upload nicht möglich. Bitte prüfen Sie Anmeldung oder Freigabelink.';
  }

  if (status === 413) {
    return 'Die Datei überschreitet die zulässige Größe. Bitte wählen Sie eine kleinere Datei.';
  }

  if (status === 415) {
    return 'Dieser Dateityp ist nicht freigegeben. Bitte wählen Sie einen zulässigen Dateityp.';
  }

  if (rawError.includes('EACCES') || rawError.includes('/uploads')) {
    return 'Der Server kann Dateien derzeit nicht speichern. Bitte prüfen Sie die Berechtigungen.';
  }

  if (status >= 500) {
    return 'Die Übermittlung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.';
  }

  return `Upload fehlgeschlagen (${status}).`;
};

const renderItem = (file) => {
  const li = document.createElement('li');
  li.innerHTML = `<strong>${file.name}</strong><br><progress class="progress" max="100" value="0"></progress><span class="meta">Bereit</span>`;
  queue.appendChild(li);
  return li;
};

const uploadFile = (file, li) =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const progressEl = li.querySelector('progress');
    const metaEl = li.querySelector('.meta');
    const form = new FormData();

    form.append('hint', hintInput.value.trim());
    form.append('category', categoryInput.value);
    form.append('files', file, file.name);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        progressEl.value = percent;
        metaEl.textContent = `${percent}%`;
      }
    });

    xhr.addEventListener('load', () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      const payload = parseJson(xhr.responseText);
      metaEl.textContent = ok ? 'Abgeschlossen' : errorMessageFor(xhr.status, payload);
      resolve(ok);
    });

    xhr.addEventListener('error', () => {
      metaEl.textContent = 'Netzwerkfehler bei der Übertragung';
      resolve(false);
    });

    xhr.open('POST', uploadPath);
    xhr.send(form);
  });

const handleFiles = async (fileList) => {
  const files = [...fileList];
  if (files.length === 0) return;

  statusEl.textContent = `Übertragung gestartet: ${files.length} Datei(en).`;
  queue.innerHTML = '';

  let successCount = 0;
  for (const file of files) {
    const li = renderItem(file);
    // Sequential uploads keep browser/network pressure aligned with backend limits.
    // eslint-disable-next-line no-await-in-loop
    const ok = await uploadFile(file, li);
    if (ok) successCount += 1;
  }

  statusEl.textContent = `${successCount} von ${files.length} Datei(en) erfolgreich übertragen.`;
};

async function loadSessionNavigation() {
  if (shareMode) {
    sessionNav.hidden = true;
    return;
  }

  const response = await fetch('/api/session', {
    credentials: 'same-origin'
  });

  if (!response.ok) {
    window.location.href = `/?returnTo=${encodeURIComponent(window.location.pathname)}`;
    return;
  }

  const payload = await response.json();
  sessionLabel.textContent = payload.user.name || payload.user.email;
  sessionNav.hidden = false;
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

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => handleFiles(event.target.files));
logoutBtn?.addEventListener('click', logout);

['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (event) => {
  const files = event.dataTransfer?.files;
  if (files) handleFiles(files);
});

loadSessionNavigation().catch(() => {
  if (!shareMode) {
    window.location.href = `/?returnTo=${encodeURIComponent(window.location.pathname)}`;
  }
});
