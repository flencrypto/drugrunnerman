/* ============================================================
   DrugRunnerMan — Service Worker
   Strategy:
     - Static assets  → Cache-first (serve from cache, update in background)
     - API requests   → Network-first (try network, fall back to cache)
     - Offline page   → Served when all else fails
   ============================================================ */

const CACHE_NAME = 'drm-v1';
const OFFLINE_URL = '/';

/** Assets to pre-cache on install */
const PRECACHE_URLS = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

/* ── Install ── */
self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
	self.skipWaiting();
});

/* ── Activate ── */
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
	);
	self.clients.claim();
});

/* ── Fetch ── */
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Only handle same-origin requests
	if (url.origin !== self.location.origin) return;

	// API requests: network-first, cache fallback
	if (url.pathname.startsWith('/v1/') || url.pathname === '/healthz') {
		event.respondWith(networkFirst(request));
		return;
	}

	// Static assets: cache-first, network fallback
	event.respondWith(cacheFirst(request));
});

/**
 * Network-first strategy.
 * Tries the network; on failure serves the cached response if available.
 */
async function networkFirst(request) {
	const cache = await caches.open(CACHE_NAME);
	try {
		const networkResponse = await fetch(request);
		if (networkResponse.ok) {
			cache.put(request, networkResponse.clone());
		}
		return networkResponse;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		// API offline fallback
		return new Response(JSON.stringify({ error: 'You are offline. Please reconnect to continue playing.' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

/**
 * Cache-first strategy.
 * Serves from cache instantly; falls back to network and updates cache.
 */
async function cacheFirst(request) {
	const cache = await caches.open(CACHE_NAME);
	const cached = await cache.match(request);
	if (cached) {
		// Update cache in background
		fetch(request)
			.then((res) => {
				if (res.ok) cache.put(request, res);
			})
			.catch(() => {
				/* ignore */
			});
		return cached;
	}
	try {
		const networkResponse = await fetch(request);
		if (networkResponse.ok) {
			cache.put(request, networkResponse.clone());
		}
		return networkResponse;
	} catch {
		// Serve offline page for navigation requests
		if (request.mode === 'navigate') {
			const offlinePage = await cache.match(OFFLINE_URL);
			if (offlinePage) return offlinePage;
		}
		return new Response('Offline — content not available', { status: 503 });
	}
}

/* ── Push Notifications (future use) ── */
self.addEventListener('push', (event) => {
	if (!event.data) return;
	const data = event.data.json();
	event.waitUntil(
		self.registration.showNotification(data.title || 'DrugRunnerMan', {
			body: data.body || 'Something is happening on the streets…',
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			tag: 'drm-notification',
		}),
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		self.clients.matchAll({ type: 'window' }).then((clients) => {
			if (clients.length > 0) return clients[0].focus();
			return self.clients.openWindow('/');
		}),
	);
});

/* ── Background Sync (future use) ── */
self.addEventListener('sync', (event) => {
	if (event.tag === 'sync-game-state') {
		event.waitUntil(syncGameState());
	}
});

async function syncGameState() {
	// Placeholder for background sync logic (e.g., persist score to server)
}
