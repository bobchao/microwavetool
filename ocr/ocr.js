// Camera/photo OCR engine, decoupled from any particular UI.
// Everything runs locally in the browser via Tesseract.js — the photo never
// leaves the device. All OCR assets are self-hosted under ocr/vendor/ and only
// loaded on first use, so users who never scan a package pay no cost.
//
// Exposes window.mwOcr.scan(file, { onProgress }) -> Promise<parsed>, where
// `parsed` is the object returned by mwParse.parseMicrowaveText. Callers own
// all UI (buttons, status text, overlays).
(function () {
    // Must be absolute: Tesseract spawns a Web Worker, and relative URLs
    // resolve against the worker's own script location, not the page's.
    const VENDOR = new URL('vendor/', document.currentScript.src).href;

    let workerPromise = null;
    let currentOnProgress = null;

    const PROGRESS_LABELS = {
        'loading tesseract core': 'Loading OCR engine',
        'initializing tesseract': 'Starting OCR engine',
        'loading language traineddata': 'Downloading language data',
        'initializing api': 'Preparing recognition',
        'recognizing text': 'Reading text'
    };

    // Bound once as the worker's logger so it survives across scans even
    // though the worker itself is created only once; the active scan's
    // callback is swapped in via currentOnProgress.
    function dispatchProgress(m) {
        if (!currentOnProgress || !m || !m.status) return;
        const label = PROGRESS_LABELS[m.status];
        if (!label) return;
        const pct = typeof m.progress === 'number' && m.progress > 0 && m.progress < 1
            ? ' ' + Math.round(m.progress * 100) + '%'
            : '';
        currentOnProgress(label + pct + '…');
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(script);
        });
    }

    function getWorker() {
        if (!workerPromise) {
            workerPromise = (async () => {
                if (!window.Tesseract) {
                    await loadScript(VENDOR + 'tesseract.min.js');
                }
                // eng covers Latin labels; chi_tra covers the 分/秒/瓦 kanji
                // shared with Japanese; jpn adds kana (e.g. the ワット reading
                // of watts) and Japanese-specific type styling.
                return Tesseract.createWorker(['eng', 'chi_tra', 'jpn'], 1, {
                    workerPath: VENDOR + 'worker.min.js',
                    corePath: VENDOR,
                    langPath: VENDOR + 'lang',
                    logger: dispatchProgress
                });
            })().catch(err => {
                workerPromise = null;
                throw err;
            });
        }
        return workerPromise;
    }

    // Phone photos are often 4000px+; OCR gets slower and *less* accurate on
    // them. Downscale to a sane size first. Falls back to the raw file where
    // createImageBitmap is unavailable.
    async function toRecognizable(file) {
        const MAX_DIMENSION = 1600;
        try {
            const bitmap = await createImageBitmap(file);
            const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();
            return canvas;
        } catch (err) {
            console.log('[OCR] downscale unavailable, using original file:', err);
            return file;
        }
    }

    async function scan(file, { onProgress } = {}) {
        currentOnProgress = onProgress || null;
        try {
            const worker = await getWorker();
            const image = await toRecognizable(file);
            const { data } = await worker.recognize(image);

            const parsed = mwParse.parseMicrowaveText(data.text);
            // Full trace for later inspection/debugging: raw OCR text plus
            // every extracted value, including all watt/time groups and
            // out-of-range rejects.
            console.log('[OCR] raw text:', data.text);
            console.log('[OCR] parsed:', parsed);
            return parsed;
        } finally {
            currentOnProgress = null;
        }
    }

    window.mwOcr = { scan };
})();
