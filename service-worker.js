const CACHE_NAME = 'microwave-time-converter-v7';

// The app shell — everything needed to boot and run offline. Cached atomically
// (addAll) so the app is either fully bootable or the install fails and retries;
// it's small and quick, which keeps the "installed, then went offline a second
// later" window tiny.
const shellAssets = [
    './',
    './index.html',
    './app.js',
    './vendor/tailwind.js',
    './fonts/nunito-latin.woff2',
    './fonts/nunito-latin-ext.woff2',
    './manifest.json',
    './ocr/mw-parse.js',
    './ocr/ocr.js'
];

// Nice-to-have assets (2.3 MB illustration + icons). Cached best-effort and
// non-blocking: a slow illustration must NOT abort the shell precache (addAll
// is atomic — one laggard would drop everything, so an install-then-offline
// user could end up with nothing cached and a blank app). The network-first
// runtime handler picks these up on the first online view regardless.
const extraAssets = [
    './empty-state-illustration.png',
    './fav64.png',
    './mw512.png',
    './mw192.png'
];

// Served for any navigation that can't be fetched or matched exactly (e.g. the
// PWA launching start_url './' before that precise URL is cached). This is what
// makes a cold offline launch actually open instead of the browser's dino page.
const APP_SHELL = './index.html';

// The OCR engine (~13 MB). Deliberately kept out of the install precache so
// plain web visitors don't pay for it up front. Warmed on demand only when the
// app runs as an installed PWA (page posts { type: 'WARM_OCR' }), so installed
// users — who expect offline to just work — have it ready. Both wasm cores are
// listed because which one Tesseract picks (SIMD vs not) is decided at runtime.
const ocrAssets = [
    './ocr/vendor/tesseract.min.js',
    './ocr/vendor/worker.min.js',
    './ocr/vendor/tesseract-core-simd-lstm.wasm.js',
    './ocr/vendor/tesseract-core-lstm.wasm.js',
    './ocr/vendor/lang/eng.traineddata.gz',
    './ocr/vendor/lang/chi_tra.traineddata.gz'
];

// 安裝 Service Worker:先原子性快取 app shell(缺一不可),再盡力補快取次要資源
// (單張失敗也不影響 shell),最後 skipWaiting 讓新版立即接手。
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(shellAssets).then(() => {
                // best-effort、不 await:不讓 2.3MB 插圖拖住或拖垮 shell 快取
                extraAssets.forEach(url => cache.add(url).catch(() => {}));
            })
        ).then(() => self.skipWaiting())
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

// 收到頁面的 WARM_OCR 訊息時,把 OCR 大檔補進快取(逐一檢查,缺的才抓,已快取
// 則幾乎零成本,可安全在每次啟動呼叫)。只有以 PWA 形態執行時頁面才會發此訊息。
self.addEventListener('message', event => {
    if (!event.data || event.data.type !== 'WARM_OCR') return;
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => Promise.all(
            ocrAssets.map(url => cache.match(url).then(hit => {
                if (hit) return;
                return fetch(url).then(res => res.ok && cache.put(url, res));
            }))
        ))
    );
});

// 快取策略:
// - ocr/vendor/ 底下的大檔(~13MB)採快取優先。網頁訪客第一次啟用拍照辨識、實際
//   下載時才寫入;安裝成 PWA 者則由上面的 WARM_OCR 預先備妥。兩種情況之後都離線可用。
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
        }).catch(() => caches.match(event.request).then(cached => {
            // Navigations that miss (offline cold launch of a start_url we
            // didn't cache under that exact key) fall back to the app shell so
            // the app still opens; other misses just fail as before.
            if (cached) return cached;
            if (event.request.mode === 'navigate') return caches.match(APP_SHELL);
            return undefined;
        }))
    );
});
