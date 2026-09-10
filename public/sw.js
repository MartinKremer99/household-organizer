const CACHE = "household-shell-v1";

function isBypass(url) {
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) {
    return true;
  }
  if (
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    (url.port === "54321" || url.port === "54322")
  ) {
    return true;
  }
  return (
    url.pathname.includes("/auth/v1") ||
    url.pathname.includes("/rest/v1") ||
    url.pathname.includes("/functions/v1")
  );
}

function isRsc(request, url) {
  return Boolean(
    request.headers.get("RSC") ||
      url.searchParams.has("_rsc") ||
      request.headers.get("Next-Router-State-Tree") ||
      request.headers.get("Next-Url"),
  );
}

function isStaticShell(url) {
  return url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"));
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    void fetch(request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
      })
      .catch(() => undefined);
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigate(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (isBypass(url) || isRsc(request, url)) {
    return;
  }
  if (isStaticShell(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigate(request));
  }
});
