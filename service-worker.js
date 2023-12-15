
const CACHE_NAME = 'microwave-time-converter-v1';
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './fav64.png',
    './mw512.png',
    './mw192.png',
    './manifest.json'
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

// 獲取請求並回傳緩存的資料或從網路獲取
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request);
            }
        )
    );
});
