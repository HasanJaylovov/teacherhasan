const CACHE = "teacherhasan-puddle-v3";
const FILES = [
    "./", "./index.html", "./styles.css", "./app.js", "./manifest.json", "./icon.svg",
    "./reading.html", "./listening.html", "./english-practice.html",
    "./cefr-assessment.html", "./video-lessons.html", "./voice.html"
];
const APP_PATHS = new Set(FILES.map(file => new URL(file, self.registration.scope).pathname));

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(FILES);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    // Never cache API responses, authenticated/profile pages, or query-specific lessons.
    if (url.origin !== location.origin || url.pathname.startsWith("/api/") ||
        url.search || !APP_PATHS.has(url.pathname)) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok && response.type === "basic") {
                    const copy = response.clone();
                    caches.open(CACHE).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request).then(cached =>
                cached || new Response("Offline", { status: 503 })
            ))
    );
});
