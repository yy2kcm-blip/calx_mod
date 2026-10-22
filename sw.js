// sw.js — CalcX 离线版：预缓存全部静态资源，断网后照常使用。
// 快取名由內容雜湊決定：內容一改，這個檔案的位元組就會變，瀏覽器會自動更新。
const CACHE = 'calcx-offline-467f2b5dbe';
const ASSETS = [
  "./",
  "./LICENSE",
  "./NOTICE.txt",
  "./_diagnose.html",
  "./app.js",
  "./assets/fx-50fh-ii-generated-transparent.png",
  "./faceplate.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./index.html",
  "./js/consts.js",
  "./js/expr.js",
  "./js/font.js",
  "./js/format.js",
  "./js/formulas.js",
  "./js/keymap.js",
  "./js/lcd.js",
  "./js/machine.js",
  "./js/numeric-backend.js",
  "./js/program-catalog.generated.js",
  "./js/program-codec.js",
  "./js/program.js",
  "./js/stats.js",
  "./js/studio.js",
  "./js/teach.js",
  "./js/token-byte-costs.js",
  "./js/tokens.js",
  "./manifest.webmanifest",
  "./program-library-catalog.js",
  "./program-library.js",
  "./studio-ui.js",
  "./style.css",
  "./teach.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：离线时回落到 index.html（单页应用）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // 静态资源：缓存优先
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html', { ignoreSearch: true }));
    })
  );
});
