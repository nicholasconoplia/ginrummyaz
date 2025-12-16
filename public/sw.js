// Service Worker for Gin Rummy
// Caches app assets for offline use

const CACHE_NAME = 'ginrummy-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/src/css/index.css',
  '/src/css/lobby.css',
  '/src/css/game.css',
  '/src/css/cards.css',
  '/src/css/animations.css',
  '/src/js/main.js',
  '/src/js/lobby.js',
  '/src/js/game.js',
  '/src/js/socket.js',
  '/src/js/cards.js',
  '/src/js/animations.js',
  '/src/js/counter.js',
  '/vite.svg',
  '/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Service Worker: Cache failed', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Don't cache Socket.IO connections
  if (event.request.url.includes('/socket.io/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
      .catch(() => {
        // If both fail, return offline page for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});

