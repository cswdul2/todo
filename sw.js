/* 일정 관리 앱 서비스 워커: 앱 셸 캐시 + 오프라인 대응 */
"use strict";

const CACHE_VERSION = "v2";
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

/** Firebase·Gemini 등 외부 요청과 비 GET 요청은 가로채지 않는다. */
function shouldHandle(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return true;
}

/**
 * 네트워크 우선 + 캐시 폴백.
 * 배포 직후에도 항상 최신 코드를 받고, 오프라인일 때만 캐시를 쓴다.
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
