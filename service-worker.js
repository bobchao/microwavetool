const CACHE_NAME = 'microwave-time-converter-v3';
const urlsToCache = [
    './',
    './index.html',
    './fav64.png',
    './mw512.png',
    './mw192.png',
    './manifest.json',
    './ocr/mw-parse.js',
    './ocr/ocr.js'
];

// 安裝 Service Worker 並緩存資源
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// 清掉舊版快取,並立即接管既有分頁
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

// 快取策略:
// - ocr/vendor/ 底下的大檔(~13MB)採快取優先,且不預先快取——使用者第一次
//   啟用拍照辨識、實際下載時才寫入,之後離線可用,也不拖慢一般人的首次載入。
// - 其他資源(HTML、JS 等)採網路優先、失敗才回快取。若採快取優先,部署新版後
//   舊訪客會永遠拿到快取裡的舊頁面。
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const cacheable = event.request.method === 'GET' && url.origin === self.location.origin;

    if (cacheable && url.pathname.includes('/ocr/vendor/')) {
        event.respondWith(
            caches.match(event.request).then(cached => cached || fetch(event.request).then(networkResponse => {
                if (networkResponse.ok) {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                }
                return networkResponse;
            }))
        );
        return;
    }

    event.respondWith(
        fetch(event.request).then(networkResponse => {
            if (cacheable && networkResponse.ok) {
                const copy = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
            }
            return networkResponse;
        }).catch(() => caches.match(event.request))
    );
});
