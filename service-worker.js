const CACHE_VERSION = 'examsim-pwa-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const CORE_ASSETS = [
  './',
  './index.html',
  './exam.html',
  './editor.html',
  './404.html',
  './manifest.webmanifest',
  './assets/js/router.js',
  './assets/js/pwa.js',
  './assets/js/utils.js',
  './assets/js/analytics.js',
  './assets/js/exam-loader.js',
  './assets/js/exam-manager.js',
  './assets/js/homepage.js',
  './assets/js/script-multi-exam.js',
  './assets/js/exam-init.js',
  './assets/js/editor.js',
  './assets/js/image-loader.js',
  './assets/js/image-storage.js',
  './assets/js/study-scheduler.js',
  './assets/js/study-storage.js',
  './assets/vendor/jszip/jszip.min.js',
  './assets/vendor/fontawesome/css/all.min.css',
  './assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './assets/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  './assets/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  './assets/css/style-new.css',
  './assets/css/multi-exam-styles.css',
  './assets/css/modern-enhancements.css',
  './assets/css/homepage-styles.css',
  './assets/css/exam-enhancements.css',
  './assets/css/analytics-privacy.css',
  './assets/css/index-inline.css',
  './assets/css/editor-styles.css',
  './assets/media/app-icon.svg'
];

const NETWORK_FIRST_PATHS = [
  '/user-content/exams/index.json'
];

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAnalyticsRequest(url) {
  return /applicationinsights\.azure\.com$/i.test(url.hostname);
}

function cleanRouteShell(pathname) {
  const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  const lastSegment = normalized.split('/').filter(Boolean).pop() || '';
  if (lastSegment === 'editor') return './editor.html';
  if (lastSegment === 'exam' || lastSegment === 'study') return './exam.html';
  return './index.html';
}

function cleanRouteRedirect(url) {
  if (!url.pathname.endsWith('/')) return null;
  const normalized = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  const lastSegment = normalized.split('/').filter(Boolean).pop() || '';
  if (!['editor', 'exam', 'study'].includes(lastSegment)) return null;
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

  return new Response('<!doctype html><title>Exam Simulator</title><p>Exam Simulator is unavailable offline.</p>', {
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
    const response = await fetch(request);
    if (response.ok) await putRuntimeCache(cache, request, response);
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
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

      return navigationFallback(url.pathname);
    })());
    return;
  }

  if (NETWORK_FIRST_PATHS.some(path => url.pathname.endsWith(path))) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
