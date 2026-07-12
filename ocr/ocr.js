// Camera/photo OCR for the "On the Package..." fields (issue #1).
// Everything runs locally in the browser via Tesseract.js — the photo never
// leaves the device. All OCR assets are self-hosted under ocr/vendor/ and only
// loaded on first use, so users who never tap the button pay no cost.
(function () {
    const VENDOR = 'ocr/vendor';
    const STATUS_HIDE_MS = 8000;

    const cameraButton = document.getElementById('ocr-camera-btn');
    const cameraInput = document.getElementById('ocr-camera-input');
    const fileInput = document.getElementById('ocr-file');
    const statusEl = document.getElementById('ocr-status');
    const wattField = document.getElementById('package-watt');
    const timeField = document.getElementById('package-time');

    let workerPromise = null;
    let statusTimer = null;

    // Camera-first with file-picker fallback: when the device reports no
    // camera (e.g. a desktop without a webcam) the button opens the file
    // picker instead. enumerateDevices needs no permission for this — device
    // kinds are listed even before any camera prompt. Checked up front so the
    // click handler stays synchronous and keeps its user-activation; while
    // still unknown we default to trying the camera.
    let hasCamera = null;
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices()
            .then(devices => { hasCamera = devices.some(d => d.kind === 'videoinput'); })
            .catch(() => {});
    }

    function setStatus(kind, message) {
        clearTimeout(statusTimer);
        statusEl.textContent = message;
        statusEl.className = 'text-sm mt-2 ' + (
            kind === 'busy' ? 'text-gray-600' :
            kind === 'ok' ? 'text-green-700' :
            'text-red-700'
        );
        statusEl.style.display = 'block';
        // Success and failure messages both show and dismiss on their own; the
        // user never has to press anything (issue #1).
        if (kind !== 'busy') {
            statusTimer = setTimeout(() => { statusEl.style.display = 'none'; }, STATUS_HIDE_MS);
        }
    }

    // Step-by-step progress in the status line. On phones there is no console
    // to look at, so this is the only way to see where a scan stalls (engine
    // download vs. recognition).
    const PROGRESS_LABELS = {
        'loading tesseract core': 'Loading OCR engine',
        'initializing tesseract': 'Starting OCR engine',
        'loading language traineddata': 'Downloading language data',
        'initializing api': 'Preparing recognition',
        'recognizing text': 'Reading text'
    };

    function reportProgress(m) {
        if (!m || !m.status) return;
        const label = PROGRESS_LABELS[m.status];
        if (!label) return;
        const pct = typeof m.progress === 'number' && m.progress > 0 && m.progress < 1
            ? ' ' + Math.round(m.progress * 100) + '%'
            : '';
        setStatus('busy', label + pct + '…');
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
                    await loadScript(VENDOR + '/tesseract.min.js');
                }
                // eng covers Latin labels; chi_tra also covers the 分/秒/瓦
                // glyphs used on Chinese and Japanese packaging.
                return Tesseract.createWorker(['eng', 'chi_tra'], 1, {
                    workerPath: VENDOR + '/worker.min.js',
                    corePath: VENDOR,
                    langPath: VENDOR + '/lang',
                    logger: reportProgress
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

    function describeSeconds(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins} min ${secs} sec (${seconds} sec)` : `${seconds} sec`;
    }

    function applyResult(best) {
        if (best.watts !== null) wattField.value = best.watts;
        if (best.seconds !== null) timeField.value = best.seconds;
        convert();

        if (best.watts !== null && best.seconds !== null) {
            setStatus('ok', `✓ Filled in ${best.watts} W, ${describeSeconds(best.seconds)}.`);
        } else if (best.watts !== null) {
            setStatus('ok', `✓ Filled in ${best.watts} W — couldn't read the time, please enter it manually.`);
        } else {
            setStatus('ok', `✓ Filled in ${describeSeconds(best.seconds)} — couldn't read the wattage, please enter it manually.`);
        }
    }

    function setBusy(busy) {
        cameraButton.disabled = busy;
    }

    async function scan(file) {
        setBusy(true);
        setStatus('busy', 'Photo received (' + Math.round(file.size / 1024) + ' KB) — starting OCR… first use downloads the engine (~8 MB).');
        try {
            const worker = await getWorker();
            const image = await toRecognizable(file);
            const { data } = await worker.recognize(image);

            const parsed = mwParse.parseMicrowaveText(data.text);
            // Full trace for later inspection/debugging (issue #1): raw OCR
            // text plus every extracted value, including all watt/time groups
            // and out-of-range rejects.
            console.log('[OCR] raw text:', data.text);
            console.log('[OCR] parsed:', parsed);

            if (parsed.best) {
                applyResult(parsed.best);
            } else {
                setStatus('error', '✗ No microwave instructions found in the photo. Try a closer, sharper shot, or enter the values manually.');
            }
        } catch (err) {
            console.error('[OCR] failed:', err);
            setStatus('error', '✗ Scanning failed — check your connection and try again, or enter the values manually.');
        } finally {
            setBusy(false);
        }
    }

    // Phones have no devtools console, so surface unexpected errors in the
    // status line where the user (and bug reports) can see them.
    window.addEventListener('error', e => {
        setStatus('error', '✗ Unexpected error: ' + e.message);
    });
    window.addEventListener('unhandledrejection', e => {
        const reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
        setStatus('error', '✗ Unexpected error: ' + reason);
    });

    cameraButton.addEventListener('click', () => {
        (hasCamera === false ? fileInput : cameraInput).click();
    });
    [cameraInput, fileInput].forEach(input => {
        input.addEventListener('change', () => {
            if (input.files && input.files[0]) {
                scan(input.files[0]);
            }
            // Allow re-selecting the same photo (e.g. after a failed scan).
            input.value = '';
        });
    });
})();
