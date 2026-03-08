const fileInput = document.getElementById('files');
const uploadBtn = document.getElementById('uploadBtn');
const dropzone = document.getElementById('dropzone');
const queue = document.getElementById('queue');
const statusEl = document.getElementById('status');
const hintInput = document.getElementById('hint');
const categoryInput = document.getElementById('category');

const pathParts = window.location.pathname.split('/').filter(Boolean);
const uploadPath = pathParts[0] === 'u' && pathParts[1] ? `/u/${pathParts[1]}/upload` : '/upload';

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
    return 'Upload nicht erlaubt. Bitte Login-Link, Zugangsdaten oder erlaubtes Netzwerk prüfen.';
  }

  if (status === 413) {
    return 'Datei zu groß. Bitte kleinere Datei wählen oder Serverlimit erhöhen.';
  }

  if (status === 415) {
    return 'Dateityp nicht erlaubt. Bitte einen unterstützten Dateityp wählen.';
  }

  if (rawError.includes('EACCES') || rawError.includes('/uploads')) {
    return 'Server kann nicht in den Upload-Ordner schreiben. Bitte Server-Berechtigungen prüfen.';
  }

  if (status >= 500) {
    return 'Upload fehlgeschlagen. Bitte später erneut versuchen oder Server-Logs prüfen.';
  }

  return `Upload fehlgeschlagen (${status}).`;
};

const renderItem = (file) => {
  const li = document.createElement('li');
  li.innerHTML = `<strong>${file.name}</strong><br><progress class="progress" max="100" value="0"></progress><span class="meta">Wartet…</span>`;
  queue.appendChild(li);
  return li;
};

const uploadFile = (file, li) =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const progressEl = li.querySelector('progress');
    const metaEl = li.querySelector('.meta');
    const form = new FormData();
    // Send metadata fields before the file so the backend can apply
    // hint/category while streaming the incoming file part.
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
      metaEl.textContent = ok ? 'Fertig' : errorMessageFor(xhr.status, payload);
      resolve(ok);
    });

    xhr.addEventListener('error', () => {
      metaEl.textContent = 'Netzwerkfehler';
      resolve(false);
    });

    xhr.open('POST', uploadPath);
    xhr.send(form);
  });

const handleFiles = async (fileList) => {
  const files = [...fileList];
  if (files.length === 0) return;

  statusEl.textContent = `Upload gestartet (${files.length} Datei(en))...`;
  queue.innerHTML = '';

  let successCount = 0;
  for (const file of files) {
    const li = renderItem(file);
    // sequential keeps browser memory/network load low
    // and aligns with backend parallel limits.
    // eslint-disable-next-line no-await-in-loop
    const ok = await uploadFile(file, li);
    if (ok) successCount += 1;
  }

  statusEl.textContent = `${successCount}/${files.length} Datei(en) erfolgreich hochgeladen.`;
};

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => handleFiles(event.target.files));

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
