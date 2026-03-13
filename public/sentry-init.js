(function initDropzoneSentry() {
  const Sentry = window.Sentry;

  if (!Sentry || window.__DROPZONE_SENTRY_INITIALIZED__) {
    return;
  }

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const originPattern = new RegExp(`^${escapeRegExp(window.location.origin)}(?:/|$)`);

  window.__DROPZONE_SENTRY_INITIALIZED__ = true;

  Sentry.init({
    dsn: 'https://1677e53cbdada5a356fdd8636e60cc38@sentry.rubeen.dev/7',
    sendDefaultPii: true,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
    tracePropagationTargets: ['localhost', /^\//, originPattern],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0
  });

  Sentry.setTag('app', 'fuekw-dropzone');
  Sentry.setTag('runtime', 'browser');
  Sentry.setTag('route', window.location.pathname);
})();
