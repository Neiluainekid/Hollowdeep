/* Service worker: makes Hollowdeep installable and playable offline.

   Network first, cache as the fallback. Online you always get the newest
   build the moment it is pushed — no stale game after an update — and every
   successful fetch refreshes the offline copy. Offline, the last copy you
   loaded plays as normal. Saves live in localStorage and are untouched. */
'use strict';

const CACHE = 'hollowdeep-v2';
const SHELL = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/util.js', './js/spatial.js', './js/save.js', './js/maps.js', './js/items.js',
  './js/dungeon.js', './js/art.js', './js/shrines.js', './js/npcs.js', './js/summons.js',
  './js/weapons.js', './js/entities.js', './js/bosses.js', './js/platform.js', './js/touch.js',
  './js/audio.js', './js/game.js', './js/main.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
