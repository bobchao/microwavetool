const CACHE_NAME = 'microwave-time-converter-v2';
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
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// 清掉舊版快取
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        ))
    );
});

// 獲取請求並回傳緩存的資料或從網路獲取。
// OCR 資產(~13MB)不預先快取,而是在使用者第一次啟用拍照辨識、實際下載時
// 才寫入快取,之後離線也能使用,且不拖慢一般使用者的首次載入。
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request).then(networkResponse => {
                    const url = new URL(event.request.url);
                    if (event.request.method === 'GET' &&
                        url.origin === self.location.origin &&
                        url.pathname.includes('/ocr/vendor/') &&
                        networkResponse.ok) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    }
                    return networkResponse;
                });
            }
        )
    );
});
