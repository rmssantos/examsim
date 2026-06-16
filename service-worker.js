// Internal PWA cache-bust counter, intentionally independent of the product version.
// Public release history is recorded in CHANGELOG.md. Bump the vX.Y below on any
// deploy that changes cached assets;
// tests/test_sprint1_readiness.py enforces the examsim-pwa-vX.Y format.
const CACHE_VERSION = 'examsim-pwa-v5.6';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const CORE_ASSETS = [
  './',
  './index.html',
  './exam.html',
  './labs.html',
  './roadmaps.html',
  './editor.html',
  './404.html',
  './privacy-and-storage.html',
  './PRIVACY-AND-STORAGE.md',
  './manifest.webmanifest',
  './assets/js/router.js',
  './assets/js/pwa.js',
  './assets/js/utils.js',
  './assets/js/analytics.js',
  './assets/js/exam-storage.js',
  './assets/js/secure-transfer.js',
  './assets/js/exam-loader.js',
  './assets/js/exam-manager.js',
  './assets/js/labs.js',
  './assets/js/roadmaps.js',
  './assets/js/homepage.js',
  './assets/js/script-multi-exam.js',
  './assets/js/exam-init.js',
  './assets/js/editor-init.js',
  './assets/js/editor.js',
  './assets/js/legal-page.js',
  './assets/js/image-loader.js',
  './assets/js/image-storage.js',
  './assets/js/study-scheduler.js',
  './assets/js/study-storage.js',
  './assets/vendor/jszip/jszip.min.js',
  './assets/vendor/fontawesome/css/all.min.css',
  './assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './assets/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  './assets/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  './assets/css/exam-v2.css',
  './assets/css/home-v2.css',
  './assets/css/analytics-privacy.css',
  './assets/css/app-footer.css',
  './assets/css/legal-page.css',
  './assets/css/editor-styles.css',
  './assets/css/exam-landing.css',
  './assets/css/labs.css',
  './assets/css/roadmaps.css',
  './user-content/roadmaps.json',
  './assets/media/favicon-64.png',
  './assets/media/apple-touch-icon.png',
  './assets/media/icon-192.png',
  './assets/media/icon-512.png'
];

const NETWORK_FIRST_PATHS = [
  '/manifest.webmanifest',
  '/user-content/exams/index.json',
  '/metadata.json',
  '/dump.json'
];

const APP_SHELL_NETWORK_FIRST_ASSETS = [
  './',
  './index.html',
  './exam.html',
  './labs.html',
  './roadmaps.html',
  './editor.html',
  './404.html',
  './privacy-and-storage.html',
  './PRIVACY-AND-STORAGE.md',
  './manifest.webmanifest',
  './assets/js/router.js',
  './assets/js/pwa.js',
  './assets/js/utils.js',
  './assets/js/analytics.js',
  './assets/js/exam-storage.js',
  './assets/js/secure-transfer.js',
  './assets/js/exam-loader.js',
  './assets/js/exam-manager.js',
  './assets/js/labs.js',
  './assets/js/roadmaps.js',
  './assets/js/homepage.js',
  './assets/js/script-multi-exam.js',
  './assets/js/exam-init.js',
  './assets/js/editor-init.js',
  './assets/js/editor.js',
  './assets/js/legal-page.js',
  './assets/js/image-loader.js',
  './assets/js/image-storage.js',
  './assets/js/study-scheduler.js',
  './assets/js/study-storage.js',
  './assets/css/exam-v2.css',
  './assets/css/home-v2.css',
  './assets/css/analytics-privacy.css',
  './assets/css/app-footer.css',
  './assets/css/legal-page.css',
  './assets/css/editor-styles.css',
  './assets/css/exam-landing.css',
  './assets/css/labs.css'
];

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAnalyticsRequest(url) {
  return /applicationinsights\.azure\.com$/i.test(url.hostname);
}

function isAppShellNetworkFirstAsset(url) {
  return APP_SHELL_NETWORK_FIRST_ASSETS.some(asset =>
    url.pathname === new URL(asset, self.location.href).pathname
  );
}

function cleanRouteShell(pathname) {
  const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  const lastSegment = normalized.split('/').filter(Boolean).pop() || '';
  if (lastSegment === 'editor') return './editor.html';
  if (lastSegment === 'exam' || lastSegment === 'study') return './exam.html';
  if (lastSegment === 'privacy-and-storage') return './privacy-and-storage.html';
  if (lastSegment === 'roadmaps') return './roadmaps.html';
  return './index.html';
}

function cleanRouteRedirect(url) {
  if (!url.pathname.endsWith('/')) return null;
  const normalized = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  const lastSegment = normalized.split('/').filter(Boolean).pop() || '';
  if (!['editor', 'exam', 'study', 'privacy-and-storage', 'roadmaps'].includes(lastSegment)) return null;
  return new URL(`${normalized}${url.search}`, url.origin).href;
}

async function putRuntimeCache(cache, request, response) {
  try {
    await cache.put(request, response.clone());
  } catch (_) {
    // Cache quota or unsupported response failures should not break the request.
  }
}

async function navigationFallback(pathname) {
  const routeShell = await caches.match(cleanRouteShell(pathname));
  if (routeShell) return routeShell;

  const homeShell = await caches.match('./index.html');
  if (homeShell) return homeShell;

  return new Response('<!doctype html><title>Examplar</title><p>Examplar is unavailable offline.</p>', {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    await putRuntimeCache(cache, request, response);
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) await putRuntimeCache(cache, request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('install', event => {
  // Activate updates immediately: without this, the previous worker keeps
  // serving stale cache-first assets (e.g. brand images) until every tab
  // closes or the user accepts the update toast.
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(CORE_ASSETS);
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!sameOrigin(url) || isAnalyticsRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const redirectUrl = cleanRouteRedirect(url);
      if (redirectUrl) return Response.redirect(redirectUrl, 302);

      try {
        const response = await fetch(request);
        if (response.ok) return response;
      } catch (_) {
        // Fall through to the route shell cache.
      }

      const cached = await caches.match(request);
      if (cached) return cached;

      return navigationFallback(url.pathname);
    })());
    return;
  }

  if (isAppShellNetworkFirstAsset(url) || NETWORK_FIRST_PATHS.some(path => url.pathname.endsWith(path))) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
