/* ?¼ì • ê´€ë¦????œë¹„???Œì»¤: ????ìºì‹œ + ?¤í”„?¼ì¸ ?€??*/
"use strict";

const CACHE_VERSION = "v12";
const CACHE_NAME = `calendar-app-shell-${CACHE_VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./app-icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** FirebaseÂ·Gemini ???¸ë? ?”ì²­ê³?ë¹?GET ?”ì²­?€ ê°€ë¡œì±„ì§€ ?ŠëŠ”?? */
function shouldHandle(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return true;
}

/**
 * ?¤íŠ¸?Œí¬ ?°ì„  + ìºì‹œ ?´ë°±.
 * ë°°í¬ ì§í›„?ë„ ??ƒ ìµœì‹  ì½”ë“œë¥?ë°›ê³ , ?¤í”„?¼ì¸???Œë§Œ ìºì‹œë¥??´ë‹¤.
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!shouldHandle(request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await cache.match("./index.html");
          if (shell) return shell;
        }
        return Response.error();
      }
    })()
  );
});
