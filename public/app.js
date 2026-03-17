import {
  formatFileSize,
  isShareLinkPath,
  resolveUploadContextPath,
  resolveUploadPath,
  summarizeMimeTypes
} from './ui-utils.js';

const Sentry = window.Sentry;

const CATEGORY_LABELS = {
  bilder: 'Bilder',
  dokumente: 'Dokumente',
  sonstiges: 'Sonstiges',
  berichte: 'Berichte'
};

const fileInput = document.getElementById('files');
const selectFilesBtn = document.getElementById('selectFilesBtn');
const uploadBtn = document.getElementById('uploadBtn');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const resetUploadBtn = document.getElementById('resetUploadBtn');
const dropzone = document.getElementById('dropzone');
const queueSection = document.getElementById('queueSection');
const queue = document.getElementById('queue');
const queueSummary = document.getElementById('queueSummary');
const pageStatus = document.getElementById('pageStatus');
const hintInput = document.getElementById('hint');
const categoryInput = document.getElementById('category');
const categoryHint = document.getElementById('categoryHint');
const progressPanel = document.getElementById('progressPanel');
const overallProgress = document.getElementById('overallProgress');
const overallProgressLabel = document.getElementById('overallProgressLabel');
const uploadRunSummary = document.getElementById('uploadRunSummary');
const successPanel = document.getElementById('successPanel');
const successTitle = document.getElementById('successTitle');
const successSummary = document.getElementById('successSummary');
const sessionNav = document.getElementById('sessionNav');
const sessionLabel = document.getElementById('sessionLabel');
const logoutBtn = document.getElementById('logoutBtn');
const uploadModeLabel = document.getElementById('uploadModeLabel');
const uploadHeroTitle = document.getElementById('uploadHeroTitle');
const uploadHeroLead = document.getElementById('uploadHeroLead');
const uploadContextTag = document.getElementById('uploadContextTag');
const uploadContextTitle = document.getElementById('uploadContextTitle');
const uploadContextHint = document.getElementById('uploadContextHint');
const allowedMimeSummary = document.getElementById('allowedMimeSummary');
const maxFileSizeSummary = document.getElementById('maxFileSizeSummary');
const metaSummary = document.getElementById('metaSummary');
const dropzoneHelp = document.getElementById('dropzoneHelp');
const contextAudience = document.getElementById('contextAudience');
const contextRestrictions = document.getElementById('contextRestrictions');
const contextAfterUpload = document.getElementById('contextAfterUpload');

const shareMode = isShareLinkPath(window.location.pathname);
const uploadPath = resolveUploadPath(window.location.pathname);
const uploadContextPath = resolveUploadContextPath(window.location.pathname);

let uploadContext = createFallbackContext();
let queueItems = [];
let isUploading = false;
let uploadRun = null;
let actionSequence = 0;

Sentry?.setTag('surface', shareMode ? 'share-upload' : 'upload-app');
Sentry?.setContext('upload', {
  mode: shareMode ? 'share-link' : 'session',
  path: uploadPath
});

function createFallbackContext() {
  return {
    mode: shareMode ? 'share-link' : 'session',
    maxFileSizeMb: null,
    maxFileSizeBytes: 0,
    allowedMimeTypes: [],
    categories: ['bilder', 'dokumente', 'sonstiges'],
    hintMaxLength: 500
  };
}

function setSentrySession(payload) {
  Sentry?.setUser({
    id: payload.user.id,
    email: payload.user.email,
    username: payload.user.name
  });
  Sentry?.setContext('session', {
    id: payload.session.id,
    expiresAt: payload.session.expiresAt
  });
}

function parseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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

function normalizeCategories(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return ['bilder', 'dokumente', 'sonstiges'];
  }

  return values
    .map((value) => {
      if (typeof value === 'string') {
        return { value, label: CATEGORY_LABELS[value] ?? value };
      }

      if (value && typeof value === 'object' && typeof value.value === 'string') {
        return {
          value: value.value,
          label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : CATEGORY_LABELS[value.value] ?? value.value
        };
      }

      return null;
    })
    .filter(Boolean);
}

function configureCategoryOptions(categories) {
  const entries = normalizeCategories(categories);
  const fragment = document.createDocumentFragment();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Keine Kategorie auswählen';
  fragment.appendChild(placeholder);

  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    fragment.appendChild(option);
  }

  categoryInput.replaceChildren(fragment);
  categoryHint.textContent =
    entries.length > 0
      ? 'Optional. Hilft bei der Zuordnung im Zielordner.'
      : 'Derzeit stehen keine festen Kategorien zur Auswahl bereit.';
}

function applyModeCopy() {
  if (shareMode) {
    uploadModeLabel.textContent = 'Externer Upload-Zugang';
    uploadHeroTitle.textContent = 'Dateien senden';
    uploadHeroLead.textContent = 'Freigabelink aktiv. Dateien auswählen und senden.';
    uploadContextTag.textContent = 'Freigabelink';
    uploadContextTitle.textContent = 'Übermittlung';
    uploadContextHint.textContent = 'Dateien hinzufügen, optional ergänzen, dann senden.';
    contextAudience.textContent = 'Zeitlich begrenzter externer Upload-Zugang.';
    contextRestrictions.textContent = 'Format und Größe werden geprüft.';
    contextAfterUpload.textContent = 'Weitere Dateien sind möglich, solange der Link gültig bleibt.';
    return;
  }

  uploadModeLabel.textContent = 'Interner Upload';
  uploadHeroTitle.textContent = 'Dateien senden';
  uploadHeroLead.textContent = 'Sitzung aktiv. Dateien auswählen und senden.';
  uploadContextTag.textContent = 'Sitzung';
  uploadContextTitle.textContent = 'Übermittlung';
  uploadContextHint.textContent = 'Dateien hinzufügen, optional ergänzen, dann senden.';
  contextAudience.textContent = 'Interner Upload mit aktiver Sitzung.';
  contextRestrictions.textContent = 'Format und Größe werden geprüft.';
  contextAfterUpload.textContent = 'Nach dem Senden können weitere Dateien ergänzt werden.';
}

function applyUploadContext(payload) {
  uploadContext = {
    ...createFallbackContext(),
    ...payload,
    mode: payload?.mode ?? (shareMode ? 'share-link' : 'session')
  };

  const allowedTypes = Array.isArray(uploadContext.allowedMimeTypes) ? uploadContext.allowedMimeTypes : [];

  allowedMimeSummary.textContent = summarizeMimeTypes(allowedTypes);
  maxFileSizeSummary.textContent = uploadContext.maxFileSizeBytes
    ? formatFileSize(uploadContext.maxFileSizeBytes)
    : uploadContext.maxFileSizeMb
      ? `${uploadContext.maxFileSizeMb} MB`
      : 'Wird serverseitig geprüft';
  metaSummary.textContent = normalizeCategories(uploadContext.categories).length
    ? 'Hinweis und Kategorie optional'
    : 'Nur Hinweis optional';
  dropzoneHelp.textContent = uploadContext.maxFileSizeBytes
    ? `${summarizeMimeTypes(allowedTypes)}. Maximal ${formatFileSize(uploadContext.maxFileSizeBytes)} je Datei.`
    : summarizeMimeTypes(allowedTypes);

  if (uploadContext.hintMaxLength && Number.isFinite(uploadContext.hintMaxLength)) {
    hintInput.maxLength = uploadContext.hintMaxLength;
  }

  fileInput.accept = allowedTypes.join(',');
  configureCategoryOptions(uploadContext.categories);
  revalidateQueue();
}

function buildQueueItem(file) {
  const validationError = validateFile(file);

  return {
    id: `file-${actionSequence++}`,
    file,
    status: validationError ? 'invalid' : 'ready',
    progress: 0,
    error: validationError,
    responseMessage: '',
    uploadedName: ''
  };
}

function validateFile(file) {
  if (uploadContext.maxFileSizeBytes && file.size > uploadContext.maxFileSizeBytes) {
    return `Die Datei ist größer als ${formatFileSize(uploadContext.maxFileSizeBytes)}.`;
  }

  const allowedTypes = Array.isArray(uploadContext.allowedMimeTypes) ? uploadContext.allowedMimeTypes : [];
  if (allowedTypes.length > 0 && file.type && !allowedTypes.includes(file.type)) {
    return `Der Dateityp ${file.type} ist für diesen Upload-Zugang nicht freigegeben.`;
  }

  return '';
}

function revalidateQueue() {
  queueItems = queueItems.map((item) => {
    if (item.status === 'uploaded') {
      return item;
    }

    const validationError = validateFile(item.file);
    if (validationError) {
      return {
        ...item,
        status: 'invalid',
        error: validationError,
        progress: 0
      };
    }

    return {
      ...item,
      status: item.status === 'invalid' ? 'ready' : item.status,
      error: item.status === 'invalid' ? '' : item.error
    };
  });

  renderQueue();
}

function formatQueueSummary() {
  if (queueItems.length === 0) {
    return 'Noch keine Dateien ausgewählt.';
  }

  const totalBytes = queueItems.reduce((sum, item) => sum + item.file.size, 0);
  const readyCount = queueItems.filter((item) => item.status === 'ready' || item.status === 'failed').length;
  const invalidCount = queueItems.filter((item) => item.status === 'invalid').length;

  if (invalidCount > 0) {
    return `${queueItems.length} Datei(en), ${formatFileSize(totalBytes)} insgesamt. ${invalidCount} Datei(en) müssen vor dem Senden korrigiert oder entfernt werden.`;
  }

  return `${queueItems.length} Datei(en), ${formatFileSize(totalBytes)} insgesamt. ${readyCount} Datei(en) bereit zum Senden.`;
}

function createStatusChip(text, tone) {
  const chip = document.createElement('span');
  chip.className = 'status-chip';
  chip.textContent = text;

  if (tone) {
    chip.dataset.tone = tone;
  }

  return chip;
}

function renderQueue() {
  queueSection.hidden = queueItems.length === 0;
  queueSummary.textContent = formatQueueSummary();
  queue.replaceChildren();

  for (const item of queueItems) {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.dataset.fileId = item.id;

    const head = document.createElement('div');
    head.className = 'file-item-head';

    const title = document.createElement('div');
    title.className = 'file-title';

    const strong = document.createElement('strong');
    strong.textContent = item.file.name;

    const meta = document.createElement('span');
    meta.className = 'file-meta';
    meta.textContent = `${formatFileSize(item.file.size)}${item.file.type ? ` | ${item.file.type}` : ''}`;

    title.append(strong, meta);

    const statusText =
      item.status === 'uploaded'
        ? 'Gesendet'
        : item.status === 'uploading'
          ? `${item.progress}%`
          : item.status === 'failed'
            ? 'Fehlgeschlagen'
            : item.status === 'invalid'
              ? 'Prüfung erforderlich'
              : 'Bereit';
    const statusTone =
      item.status === 'uploaded'
        ? 'success'
        : item.status === 'failed' || item.status === 'invalid'
          ? 'error'
          : item.status === 'uploading'
            ? 'warning'
            : '';

    head.append(title, createStatusChip(statusText, statusTone));
    li.appendChild(head);

    const progress = document.createElement('progress');
    progress.className = 'file-progress';
    progress.max = 100;
    progress.value = item.status === 'uploaded' ? 100 : item.progress;
    li.appendChild(progress);

    if (item.error || item.responseMessage) {
      const message = document.createElement('p');
      message.className = 'support-text';
      message.textContent = item.error || item.responseMessage;
      li.appendChild(message);
    }

    const foot = document.createElement('div');
    foot.className = 'file-item-foot';

    const detail = document.createElement('span');
    detail.className = 'file-meta';
    if (item.status === 'uploaded') {
      detail.textContent = item.uploadedName
        ? `Gespeichert als ${item.uploadedName}.`
        : 'Erfolgreich übermittelt.';
    } else if (item.status === 'uploading') {
      detail.textContent = 'Datei wird derzeit übertragen.';
    } else if (item.status === 'failed') {
      detail.textContent = 'Sie können die Datei erneut senden oder aus der Auswahl entfernen.';
    } else if (item.status === 'invalid') {
      detail.textContent = 'Diese Datei wird erst gesendet, wenn die Auswahl angepasst wurde.';
    } else {
      detail.textContent = 'Wird beim nächsten Upload-Lauf übermittelt.';
    }

    foot.appendChild(detail);

    if (!isUploading) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'ghost-btn';
      removeButton.dataset.action = 'remove-file';
      removeButton.dataset.fileId = item.id;
      removeButton.textContent = 'Entfernen';
      foot.appendChild(removeButton);
    }

    li.appendChild(foot);
    queue.appendChild(li);
  }

  const pendingItems = queueItems.filter((item) => item.status === 'ready' || item.status === 'failed');
  const hasBlockingItems = queueItems.some((item) => item.status === 'invalid');

  uploadBtn.disabled = isUploading || pendingItems.length === 0 || hasBlockingItems;
  uploadBtn.textContent =
    pendingItems.some((item) => item.status === 'failed') && pendingItems.every((item) => item.status === 'failed')
      ? 'Erneut senden'
      : 'Jetzt senden';
  selectFilesBtn.disabled = isUploading;
  clearQueueBtn.disabled = isUploading || queueItems.length === 0;
  resetUploadBtn.disabled = isUploading;
}

function openFilePicker() {
  fileInput.click();
}

function addFiles(fileList) {
  const files = [...fileList];
  if (files.length === 0) {
    return;
  }

  clearBanner(pageStatus);
  successPanel.hidden = true;

  const newItems = files.map(buildQueueItem);
  queueItems = [...queueItems, ...newItems];
  renderQueue();

  const invalidCount = newItems.filter((item) => item.status === 'invalid').length;
  if (invalidCount > 0) {
    setBanner(
      pageStatus,
      `${invalidCount} Datei(en) sind noch nicht sendbar. Bitte prüfen Sie Typ oder Größe.`,
      'warning'
    );
  }
}

function removeFile(fileId) {
  queueItems = queueItems.filter((item) => item.id !== fileId);
  renderQueue();

  if (queueItems.length === 0) {
    clearBanner(pageStatus);
    successPanel.hidden = true;
  }
}

function resetComposer() {
  queueItems = [];
  uploadRun = null;
  isUploading = false;
  hintInput.value = '';
  categoryInput.value = '';
  fileInput.value = '';
  clearBanner(pageStatus);
  successPanel.hidden = true;
  progressPanel.hidden = true;
  overallProgress.value = 0;
  overallProgressLabel.textContent = '0%';
  renderQueue();
}

function getUploadErrorMessage(status, payload) {
  const rawError = String(payload?.error ?? '');

  if (status === 401 || status === 403) {
    return 'Der Upload-Zugang ist nicht mehr gültig. Bitte prüfen Sie Anmeldung oder Freigabelink.';
  }

  if (status === 413) {
    return 'Die Datei ist größer als für diesen Upload-Zugang erlaubt.';
  }

  if (status === 415) {
    return 'Der Dateityp ist für diesen Upload-Zugang nicht freigegeben.';
  }

  if (status === 429) {
    return 'Zu viele Upload-Versuche in kurzer Zeit. Bitte warten Sie einen Moment und versuchen Sie es erneut.';
  }

  if (rawError.includes('EACCES') || rawError.includes('/uploads')) {
    return 'Der Server kann die Datei derzeit nicht speichern. Bitte informieren Sie das Team.';
  }

  if (status >= 500) {
    return 'Die Übermittlung konnte serverseitig nicht abgeschlossen werden. Bitte versuchen Sie es erneut.';
  }

  return `Die Übermittlung wurde mit Status ${status} abgelehnt.`;
}

function updateOverallProgress(currentFileId = '', currentLoaded = 0) {
  if (!uploadRun || uploadRun.totalBytes <= 0) {
    overallProgress.value = 0;
    overallProgressLabel.textContent = '0%';
    return;
  }

  let completedBytes = 0;

  for (const itemId of uploadRun.ids) {
    const item = queueItems.find((candidate) => candidate.id === itemId);
    if (!item) {
      continue;
    }

    if (item.id === currentFileId) {
      completedBytes += Math.min(currentLoaded, item.file.size);
      continue;
    }

    if (item.status === 'uploaded') {
      completedBytes += item.file.size;
    }
  }

  const percent = Math.round((completedBytes / uploadRun.totalBytes) * 100);
  overallProgress.value = percent;
  overallProgressLabel.textContent = `${percent}%`;
}

function uploadFile(item) {
  item.status = 'uploading';
  item.progress = 0;
  item.error = '';
  item.responseMessage = '';
  renderQueue();

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();

    form.append('hint', hintInput.value.trim());
    form.append('category', categoryInput.value);
    form.append('files', item.file, item.file.name);

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const percent = Math.round((event.loaded / event.total) * 100);
      if (percent === item.progress) {
        return;
      }

      item.progress = percent;
      updateOverallProgress(item.id, event.loaded);
      renderQueue();
    });

    xhr.addEventListener('load', () => {
      const payload = parseJson(xhr.responseText);
      const success = xhr.status >= 200 && xhr.status < 300 && Array.isArray(payload?.uploaded) && payload.uploaded.length > 0;

      if (success) {
        item.status = 'uploaded';
        item.progress = 100;
        item.uploadedName = payload.uploaded[0]?.filename ?? item.file.name;
        item.responseMessage = 'Datei erfolgreich übermittelt.';
        updateOverallProgress(item.id, item.file.size);
        renderQueue();
        resolve(true);
        return;
      }

      item.status = 'failed';
      item.progress = 0;
      item.error = getUploadErrorMessage(xhr.status, payload);
      renderQueue();
      resolve(false);
    });

    xhr.addEventListener('error', () => {
      item.status = 'failed';
      item.progress = 0;
      item.error = 'Netzwerkfehler während der Übertragung. Bitte versuchen Sie es erneut.';
      renderQueue();
      resolve(false);
    });

    xhr.open('POST', uploadPath);
    xhr.send(form);
  });
}

async function startUpload() {
  if (isUploading) {
    return;
  }

  const sendableItems = queueItems.filter((item) => item.status === 'ready' || item.status === 'failed');
  if (sendableItems.length === 0) {
    setBanner(pageStatus, 'Bitte wählen Sie mindestens eine sendbare Datei aus.', 'warning');
    return;
  }

  if (queueItems.some((item) => item.status === 'invalid')) {
    setBanner(pageStatus, 'Einige Dateien müssen vor dem Senden korrigiert oder entfernt werden.', 'warning');
    return;
  }

  isUploading = true;
  successPanel.hidden = true;
  uploadRun = {
    ids: sendableItems.map((item) => item.id),
    totalBytes: sendableItems.reduce((sum, item) => sum + item.file.size, 0)
  };

  progressPanel.hidden = false;
  overallProgress.value = 0;
  overallProgressLabel.textContent = '0%';
  uploadRunSummary.textContent = `${sendableItems.length} Datei(en) werden nacheinander übertragen.`;
  setBanner(pageStatus, 'Die Übermittlung wurde gestartet.', 'info');
  renderQueue();

  let successCount = 0;

  for (const item of sendableItems) {
    // Sequential uploads keep browser and backend limits aligned.
    // eslint-disable-next-line no-await-in-loop
    const success = await uploadFile(item);
    if (success) {
      successCount += 1;
    }
  }

  const failedCount = sendableItems.length - successCount;

  isUploading = false;
  progressPanel.hidden = true;
  renderQueue();

  if (successCount === sendableItems.length) {
    setBanner(pageStatus, `${successCount} Datei(en) wurden erfolgreich übermittelt.`, 'success');
    successTitle.textContent = 'Übermittlung abgeschlossen';
    successSummary.textContent = 'Alle ausgewählten Dateien wurden erfolgreich gesendet.';
  } else if (successCount > 0) {
    setBanner(
      pageStatus,
      `${successCount} Datei(en) wurden übermittelt, ${failedCount} Datei(en) müssen erneut gesendet werden.`,
      'warning'
    );
    successTitle.textContent = 'Übermittlung teilweise abgeschlossen';
    successSummary.textContent = 'Fehlgeschlagene Dateien bleiben in der Liste und können erneut übermittelt werden.';
  } else {
    setBanner(pageStatus, 'Keine Datei konnte übermittelt werden. Bitte prüfen Sie die Meldungen in der Liste.', 'error');
    successTitle.textContent = 'Übermittlung fehlgeschlagen';
    successSummary.textContent = 'Bitte prüfen Sie die einzelnen Dateimeldungen.';
  }

  successPanel.hidden = false;
}

async function loadUploadContext() {
  const response = await fetch(uploadContextPath, {
    credentials: 'same-origin'
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw Object.assign(new Error('unauthorized'), { status: response.status });
    }

    setBanner(
      pageStatus,
      'Upload-Informationen konnten nicht geladen werden. Die serverseitige Prüfung bleibt aktiv, Hinweise sind derzeit eingeschränkt.',
      'warning'
    );
    applyUploadContext(createFallbackContext());
    return;
  }

  const payload = await response.json();
  applyUploadContext(payload);
}

async function loadSessionNavigation() {
  if (shareMode) {
    sessionNav.hidden = true;
    return;
  }

  const response = await fetch('/api/session', {
    credentials: 'same-origin'
  });

  if (!response.ok) {
    throw Object.assign(new Error('unauthorized'), { status: response.status });
  }

  const payload = await response.json();
  setSentrySession(payload);
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

applyModeCopy();
applyUploadContext(createFallbackContext());
renderQueue();

selectFilesBtn.addEventListener('click', openFilePicker);
uploadBtn.addEventListener('click', startUpload);
clearQueueBtn.addEventListener('click', () => {
  queueItems = [];
  successPanel.hidden = true;
  clearBanner(pageStatus);
  renderQueue();
});
resetUploadBtn.addEventListener('click', resetComposer);
fileInput.addEventListener('change', (event) => {
  addFiles(event.target.files);
  fileInput.value = '';
});
queue.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="remove-file"][data-file-id]');
  if (!button) {
    return;
  }

  removeFile(button.dataset.fileId);
});

logoutBtn?.addEventListener('click', logout);

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (isUploading) {
      return;
    }

    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (event) => {
  if (isUploading) {
    return;
  }

  const files = event.dataTransfer?.files;
  if (files) {
    addFiles(files);
  }
});

Promise.all([loadUploadContext(), loadSessionNavigation()]).catch((error) => {
  if (!shareMode && (error.status === 401 || error.message === 'unauthorized')) {
    window.location.href = `/?returnTo=${encodeURIComponent(window.location.pathname)}`;
    return;
  }

  if (shareMode && (error.status === 401 || error.status === 403 || error.message === 'unauthorized')) {
    window.location.href = '/?error=invalid_token';
    return;
  }

  setBanner(pageStatus, 'Die Seite konnte nicht vollständig initialisiert werden. Bitte laden Sie sie erneut.', 'error');
});
