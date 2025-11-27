// Service Worker for BlockGame
// Provides advanced caching for tile textures

const CACHE_NAME = 'blockgame-tiles-v1';
const TILES_TO_CACHE = 106; // Total number of tiles

// Install event - cache critical tiles immediately
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching critical tile resources');

            // Cache first 20 critical tiles immediately
            const criticalTiles = [];
            for (let i = 0; i < 20; i++) {
                criticalTiles.push(`/tiles/tile-${i}.webp`);
            }

            return cache.addAll(criticalTiles);
        }).then(() => {
            // Skip waiting to activate immediately
            return self.skipWaiting();
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Take control of all clients immediately
            return self.clients.claim();
        }).then(() => {
            // Preload remaining tiles in background
            return preloadRemainingTiles();
        })
    );
});

// Fetch event - serve from cache first, then network
self.addEventListener('fetch', (event) => {
    // Only intercept tile requests
    if (event.request.url.includes('/tiles/tile-')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version
                    return cachedResponse;
                }

                // Not in cache, fetch from network and cache it
                return fetch(event.request).then((networkResponse) => {
                    // Clone the response before caching
                    const responseToCache = networkResponse.clone();

                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                });
            })
        );
    }
});

// Preload remaining tiles in background (after activation)
function preloadRemainingTiles() {
    return caches.open(CACHE_NAME).then((cache) => {
        console.log('[SW] Preloading remaining tiles in background...');

        const promises = [];

        // Start from tile 20 (first 20 already cached during install)
        for (let i = 20; i < TILES_TO_CACHE; i++) {
            const url = `/tiles/tile-${i}.webp`;

            // Check if already cached, if not, add it
            const promise = cache.match(url).then((response) => {
                if (!response) {
                    return cache.add(url).catch((error) => {
                        // Silently ignore errors for individual tiles
                        console.warn(`[SW] Failed to cache ${url}:`, error);
                    });
                }
            });

            promises.push(promise);
        }

        return Promise.all(promises).then(() => {
            console.log('[SW] All tiles preloaded successfully');
        });
    });
}

// Message handler for manual cache control
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                console.log('[SW] Cache cleared');
            })
        );
    }
});
