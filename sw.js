/* 어디야? service worker: opens offline, always tries the newest version first */
const SHELL = 'eodiya-shell-v1';
const RUNTIME = 'eodiya-runtime-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app page: network first (so updates show up right away), cached copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Live data (Firestore, login) must never come from a cache.
  if (/firestore\.googleapis\.com|identitytoolkit|securetoken|firebaseapp\.com|firebaseinstallations/.test(url.host)) return;

  // Our own files, Firebase SDK, fonts, OCR library: use the cached copy, refresh it in the background.
  const cacheable = url.origin === location.origin || /(^|\.)gstatic\.com$|fonts\.googleapis\.com$|cdn\.jsdelivr\.net$/.test(url.host);
  if (!cacheable) return;
  e.respondWith(caches.open(RUNTIME).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
