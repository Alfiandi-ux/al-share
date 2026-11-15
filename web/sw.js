/**
 * Al-share Service Worker
 * ---------------------------------------------------------------
 * Membuat Al-share dapat dipasang (installable), membuka layar penuh
 * ala aplikasi native, dan tetap bisa dibuka saat server sedang
 * tidak terjangkau (app shell offline).
 *
 * Catatan: service worker hanya aktif pada origin aman (HTTPS atau
 * localhost). Saat diakses lewat http://192.168.x.x, browser tidak
 * mengizinkannya dan UI tetap berjalan normal tanpa cache offline.
 */

const VERSION = 'v1.1.0';
const CACHE_PREFIX = 'alshare-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${VERSION}`;

const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/style.css',
    '/app.js',
    '/manifest.webmanifest',
    '/icons/icon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
    '/icons/apple-touch-icon.png',
    '/icons/favicon-32.png'
];

const NEVER_CACHE = /^\/(api|download)\//;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        // Cache one by one so a single failure does not abort the install.
        await Promise.allSettled(
            SHELL_ASSETS.map((asset) =>
                cache.add(new Request(asset, { cache: 'reload' })).catch(() => null)
            )
        );
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
                .map((key) => caches.delete(key))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // API & file transfers always go straight to the LAN server.
    if (url.origin === self.location.origin && NEVER_CACHE.test(url.pathname)) {
        return;
    }

    // Cross-origin (Google Fonts) runtime cache: cache-first.
    if (url.origin !== self.location.origin) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // App navigation: network-first, fall back to the cached app shell.
    if (request.mode === 'navigate') {
        event.respondWith(navigationHandler(request));
        return;
    }

    // Local static assets: stale-while-revalidate.
    event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return new Response('', { status: 504, statusText: 'Offline' });
    }
}

async function navigationHandler(request) {
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put('/index.html', response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match('/index.html');
        if (cached) return cached;
        const offline = await caches.match('/offline.html');
        if (offline) return offline;
        return new Response(
            '<h1>Al-share sedang offline</h1><p>Pastikan server Al-share berjalan dan perangkat berada di WiFi yang sama.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);

    const network = fetch(request)
        .then((response) => {
            if (response && response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    if (cached) return cached;

    const response = await network;
    if (response) return response;

    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    return new Response('', { status: 504, statusText: 'Offline' });
}
