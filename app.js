// "Heat it right" — main screen logic. Reads/writes plain state, reuses the
// ocr/mw-parse.js + ocr/ocr.js engine for scanning, and renders straight to
// the DOM (no framework, matching the rest of this app).
(function () {
    const STORAGE_KEY = 'mw.state.v2';
    const OVEN_PRESETS = [600, 700, 800, 900, 1000, 1100];

    // --- Internationalisation -------------------------------------------------
    // Language options: 'default' (follow the browser, falling back to English
    // when no supported language matches), 'en', 'zh-Hant', and 'ja'. The choice
    // is persisted alongside the rest of the state so it survives reloads.
    //
    // English is bundled inline below as the always-available fallback; the
    // other locales live in i18n/<code>.js and are injected on demand the first
    // time they're needed (see loadLang). Locale files register themselves onto
    // the shared MW_I18N table, which is just this I18N object.
    const SUPPORTED_LANGS = ['en', 'zh-Hant', 'ja'];
    const LANG_OPTIONS = ['default', 'en', 'zh-Hant', 'ja'];

    const I18N = {
        en: {
            title: 'Heat it right — Microwave Time Converter',
            appTitle: 'Heat it right',
            yourOven: 'your oven',
            scanAlt: 'Scan a package with your camera',
            cookFor: 'Cook for',
            cookForEstimate: 'Cook for · estimate',
            emptyTitle: 'How long in your microwave?',
            emptySubtitle: 'Scan the package or enter it below',
            estimateWarning: "Couldn't read the package power, so I assumed 700 W — typical for a home meal. Change it below if yours is different.",
            lastCooks: 'Last 2 cooks',
            fromPackage: 'From the package',
            typeOrScan: 'type or scan',
            power: 'Power',
            powerAssumed: 'Power · assumed',
            cookTime: 'Cook time',
            sec: 'sec',
            scanPackage: 'Scan the package',
            chooseFromLibrary: 'or choose a photo from your library',
            readingLabel: 'Reading the label…',
            recognising: 'Recognising text — right here on your phone',
            settings: 'Settings',
            ovenPower: "Your microwave's power",
            ovenPowerDesc: "Most home microwaves are 600–800 W — it's printed inside the door or on the back.",
            custom: 'Custom',
            language: 'Interface language',
            languageDesc: '“Default” follows your browser; if it isn’t supported, English is used.',
            langDefault: 'Default',
            langEn: 'English',
            langZhHant: '繁體中文',
            langJa: '日本語',
            save: 'Save',
            about: '<a href="https://github.com/bobchao/microwavetool" target="_blank" rel="noopener">GitHub project page</a>',
            reuse: 'Reuse',
            doubleCheck: 'double-check the package power below',
            exactly: t => `exactly ${t} · rounded to the nearest 10s`,
            recentLine: (pw, time, oven) => `${pw} W · ${time} → your ${oven} W`
        }
    };

    // The shared registry that on-demand locale files (i18n/*.js) attach to.
    window.MW_I18N = I18N;
    const LANG_SRC = { 'zh-Hant': 'i18n/zh-Hant.js', 'ja': 'i18n/ja.js' };
    const langLoads = {}; // code -> Promise, so each locale is fetched at most once

    // Inject a locale's <script> the first time it's needed. Resolves once the
    // table is registered on I18N; 'en' and already-loaded locales resolve
    // immediately. An unknown code resolves too — activeLang() then falls back
    // to English rather than reading an undefined table.
    function loadLang(code) {
        if (I18N[code]) return Promise.resolve();
        const src = LANG_SRC[code];
        if (!src) return Promise.resolve();
        if (!langLoads[code]) {
            langLoads[code] = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        return langLoads[code];
    }

    // The resolved language if its table is loaded, otherwise English. Guards
    // every synchronous I18N read against a locale that hasn't arrived yet.
    function activeLang() {
        const r = resolveLang(state.lang);
        return I18N[r] ? r : 'en';
    }

    // Map a stored language preference to an actual translation table key.
    // 'default' inspects the browser's preferred languages and picks Traditional
    // Chinese for any zh preference, Japanese for any ja preference, otherwise
    // English.
    function resolveLang(pref) {
        if (SUPPORTED_LANGS.indexOf(pref) !== -1) return pref;
        const prefs = navigator.languages && navigator.languages.length
            ? navigator.languages
            : [navigator.language || 'en'];
        for (const l of prefs) {
            const lc = l && l.toLowerCase();
            if (lc && lc.indexOf('zh') === 0) return 'zh-Hant';
            if (lc && lc.indexOf('ja') === 0) return 'ja';
        }
        return 'en';
    }

    function t(key) {
        return I18N[activeLang()][key];
    }

    function applyStaticI18n() {
        const dict = I18N[activeLang()];
        document.documentElement.lang = activeLang();
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const val = dict[el.getAttribute('data-i18n')];
            if (typeof val === 'string') el.textContent = val;
        });
        document.querySelectorAll('[data-i18n-alt]').forEach(el => {
            const val = dict[el.getAttribute('data-i18n-alt')];
            if (typeof val === 'string') el.setAttribute('alt', val);
        });
        // Strings that carry markup (e.g. the About line's link) are set as
        // HTML rather than text. The source is our own I18N table, not user
        // input, so this is safe.
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const val = dict[el.getAttribute('data-i18n-html')];
            if (typeof val === 'string') el.innerHTML = val;
        });
    }

    const els = {
        ovenChipValue: document.getElementById('oven-chip-value'),
        resultCard: document.getElementById('result-card'),
        resultLabel: document.getElementById('result-label'),
        resultTime: document.getElementById('result-time'),
        resultCaption: document.getElementById('result-caption'),
        emptyState: document.getElementById('empty-state'),
        estimateWarning: document.getElementById('estimate-warning'),
        recentsSection: document.getElementById('recents-section'),
        recentsList: document.getElementById('recents-list'),
        powerRowLabel: document.getElementById('power-row-label'),
        pkgWatt: document.getElementById('pkg-watt'),
        pkgMin: document.getElementById('pkg-min'),
        pkgSec: document.getElementById('pkg-sec'),
        scanBtn: document.getElementById('scan-btn'),
        pickBtn: document.getElementById('pick-btn'),
        cameraInput: document.getElementById('ocr-camera-input'),
        fileInput: document.getElementById('ocr-file'),
        scanningOverlay: document.getElementById('scanning-overlay'),
        scanningSubtitle: document.getElementById('scanning-subtitle'),
        ovenChip: document.getElementById('oven-chip'),
        ovenScrim: document.getElementById('oven-scrim'),
        ovenSheet: document.getElementById('oven-sheet'),
        ovenChips: document.getElementById('oven-chips'),
        ovenCustomInput: document.getElementById('oven-custom-input'),
        ovenSaveBtn: document.getElementById('oven-save-btn'),
        langSelect: document.getElementById('lang-select')
    };

    function loadState() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                return {
                    oven: parsed.oven || '700',
                    lang: LANG_OPTIONS.indexOf(parsed.lang) !== -1 ? parsed.lang : 'default',
                    pkgWatt: parsed.pkgWatt || '',
                    min: parsed.min || '',
                    sec: parsed.sec || '',
                    recents: Array.isArray(parsed.recents) ? parsed.recents : []
                };
            } catch (e) { /* fall through to defaults/migration below */ }
        }
        // Migrate the flat keys from the previous single-oven-field design.
        const legacyOven = localStorage.getItem('homeWatt');
        const legacyWatt = localStorage.getItem('packageWatt');
        const legacySeconds = parseInt(localStorage.getItem('packageTime')) || 0;
        return {
            oven: legacyOven || '700',
            lang: 'default',
            pkgWatt: legacyWatt || '',
            min: legacySeconds ? String(Math.floor(legacySeconds / 60)) : '',
            sec: legacySeconds ? String(legacySeconds % 60) : '',
            recents: []
        };
    }

    const state = loadState();
    state.isEstimate = false;

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            oven: state.oven, lang: state.lang, pkgWatt: state.pkgWatt, min: state.min, sec: state.sec, recents: state.recents
        }));
    }

    function calc(pkgWatt, min, sec, oven) {
        const pw = parseInt(pkgWatt) || 0;
        const mm = parseInt(min) || 0;
        const ss = parseInt(sec) || 0;
        const ov = parseInt(oven) || 0;
        const totalIn = mm * 60 + ss;
        const can = pw > 0 && totalIn > 0 && ov > 0;
        let friendly = 0, exact = 0;
        if (can) {
            const converted = (pw * totalIn) / ov;
            exact = Math.round(converted);
            // Rounded to the nearest 10s (min 10s) for a friendly headline value.
            friendly = Math.max(10, Math.round(converted / 10) * 10);
        }
        return { can, friendly, exact };
    }

    function fmt(totalSeconds) {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return m + ':' + String(s).padStart(2, '0');
    }

    function render() {
        const c = calc(state.pkgWatt, state.min, state.sec, state.oven);

        els.ovenChipValue.textContent = (parseInt(state.oven) || 0) + ' W';

        els.resultCard.classList.toggle('hidden', !c.can);
        els.emptyState.classList.toggle('hidden', c.can);
        if (c.can) {
            els.resultLabel.textContent = state.isEstimate ? t('cookForEstimate') : t('cookFor');
            els.resultTime.textContent = fmt(c.friendly);
            els.resultCaption.textContent = state.isEstimate
                ? t('doubleCheck')
                : t('exactly')(fmt(c.exact));
        }

        els.estimateWarning.classList.toggle('hidden', !state.isEstimate);
        els.powerRowLabel.textContent = state.isEstimate ? t('powerAssumed') : t('power');

        // Skip re-writing the field the user is actively typing in, so the
        // cursor doesn't jump around.
        if (document.activeElement !== els.pkgWatt) els.pkgWatt.value = state.pkgWatt;
        if (document.activeElement !== els.pkgMin) els.pkgMin.value = state.min;
        if (document.activeElement !== els.pkgSec) els.pkgSec.value = state.sec;

        renderRecents();
    }

    function renderRecents() {
        els.recentsSection.classList.toggle('hidden', state.recents.length === 0);
        els.recentsList.innerHTML = '';
        state.recents.forEach((r, i) => {
            const rc = calc(r.pw, r.mm, r.ss, r.oven);
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'w-full bg-white border-[1.5px] border-[#e6dac6] rounded-[14px] px-[14px] py-[11px] flex items-center justify-between mb-[9px]';
            const line = t('recentLine')(r.pw, r.mm + ':' + String(r.ss).padStart(2, '0'), r.oven);
            row.innerHTML =
                '<div class="text-left">' +
                    '<div class="font-semibold text-[11.5px] text-[#8a7d6c] mb-0.5"></div>' +
                    '<div class="font-black text-[19px] text-[#2e2620]">' + (rc.can ? fmt(rc.friendly) : '—') + '</div>' +
                '</div>' +
                '<span class="font-extrabold text-xs text-white bg-[#d97a2b] rounded-xl px-[13px] py-2"></span>';
            row.querySelector('.text-left > div:first-child').textContent = line;
            row.querySelector('span').textContent = t('reuse');
            row.addEventListener('click', () => reuse(i));
            els.recentsList.appendChild(row);
        });
    }

    function renderOvenSheet() {
        const current = parseInt(state.oven) || 0;
        els.ovenChips.innerHTML = '';
        OVEN_PRESETS.forEach(v => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = v + ' W';
            btn.className = 'rounded-[20px] px-[15px] py-[9px] font-extrabold text-[12.5px] border-[1.5px] ' + (
                current === v
                    ? 'text-white bg-[#d97a2b] border-[#d97a2b]'
                    : 'text-[#c25a1e] bg-[#fbe9d3] border-[#fbe9d3]'
            );
            btn.addEventListener('click', () => {
                state.oven = String(v);
                saveState();
                render();
                renderOvenSheet();
            });
            els.ovenChips.appendChild(btn);
        });
        if (document.activeElement !== els.ovenCustomInput) els.ovenCustomInput.value = state.oven;
    }

    // A <select> rather than chips so the row stays one line however many
    // languages exist. Options are rebuilt each call so their labels re-render
    // in the newly chosen language; the change handler is bound once elsewhere.
    function renderLangSelect() {
        const labels = { 'default': 'langDefault', 'en': 'langEn', 'zh-Hant': 'langZhHant', 'ja': 'langJa' };
        els.langSelect.innerHTML = '';
        LANG_OPTIONS.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = t(labels[opt]);
            els.langSelect.appendChild(o);
        });
        els.langSelect.value = state.lang;
    }

    function openOvenSheet() {
        renderOvenSheet();
        renderLangSelect();
        els.ovenScrim.classList.remove('hidden');
        els.ovenSheet.classList.remove('hidden');
    }

    function closeOvenSheet() {
        els.ovenScrim.classList.add('hidden');
        els.ovenSheet.classList.add('hidden');
    }

    function addRecent() {
        const pw = parseInt(state.pkgWatt) || 0;
        const mm = parseInt(state.min) || 0;
        const ss = parseInt(state.sec) || 0;
        const oven = parseInt(state.oven) || 0;
        if (!(pw > 0 && (mm * 60 + ss) > 0 && oven > 0)) return;
        const exists = state.recents.some(r => r.pw === pw && r.mm === mm && r.ss === ss && r.oven === oven);
        if (exists) return;
        state.recents = [{ pw, mm, ss, oven }, ...state.recents].slice(0, 2);
        saveState();
        renderRecents();
    }

    function reuse(i) {
        const r = state.recents[i];
        state.pkgWatt = String(r.pw);
        state.min = String(r.mm);
        state.sec = String(r.ss);
        state.oven = String(r.oven);
        state.isEstimate = false;
        saveState();
        render();
    }

    // --- Oven chip / sheet ---
    els.ovenChip.addEventListener('click', openOvenSheet);
    els.ovenScrim.addEventListener('click', closeOvenSheet);
    els.ovenSaveBtn.addEventListener('click', () => { saveState(); closeOvenSheet(); });
    els.langSelect.addEventListener('change', e => {
        state.lang = e.target.value;
        saveState();
        // Load the chosen locale before re-rendering; English (always loaded)
        // covers the labels meanwhile so nothing shows as undefined.
        loadLang(resolveLang(state.lang)).catch(() => {}).finally(() => {
            applyStaticI18n();
            render();
            renderOvenSheet();
            renderLangSelect();
        });
    });
    els.ovenCustomInput.addEventListener('input', e => {
        state.oven = e.target.value;
        saveState();
        render();
        renderOvenSheet();
    });

    // --- Package fields (live calculation) ---
    els.pkgWatt.addEventListener('input', e => {
        state.pkgWatt = e.target.value;
        // Providing a real value resolves any prior scan assumption.
        state.isEstimate = false;
        saveState();
        render();
    });
    els.pkgMin.addEventListener('input', e => {
        state.min = e.target.value;
        saveState();
        render();
    });
    els.pkgSec.addEventListener('input', e => {
        state.sec = e.target.value;
        saveState();
        render();
    });

    // --- Scan ---
    // Two inputs, two buttons, no camera-detection heuristic: an earlier
    // version guessed camera availability via enumerateDevices() and routed
    // the single scan button to whichever input matched, but that call can
    // under-report (e.g. before the user has ever granted permission),
    // permanently misrouting the button to the file picker with no way back
    // to the camera. The capture input is only ever reachable through its
    // own button now, so it can't be locked out by a bad guess.
    els.scanBtn.addEventListener('click', () => els.cameraInput.click());
    els.pickBtn.addEventListener('click', () => els.fileInput.click());
    // Tapping the first-entry empty state does the same as "Scan the package".
    // It's only visible/clickable before a result exists (render() hides it).
    els.emptyState.addEventListener('click', () => els.cameraInput.click());
    [els.cameraInput, els.fileInput].forEach(input => {
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            input.value = ''; // allow re-selecting the same photo after a failed scan
            if (file) handleScan(file);
        });
    });

    function setScanning(active) {
        els.scanningOverlay.classList.toggle('hidden', !active);
        els.scanBtn.disabled = active;
        els.pickBtn.disabled = active;
        if (active) els.scanningSubtitle.textContent = t('recognising');
    }

    function handleScan(file) {
        setScanning(true);
        mwOcr.scan(file, { onProgress: text => { els.scanningSubtitle.textContent = text; } })
            .then(parsed => applyScanResult(parsed.best))
            .catch(err => {
                console.error('[OCR] failed:', err);
                applyScanResult(null);
            })
            .finally(() => setScanning(false));
    }

    function applyScanResult(best) {
        const watts = best && best.watts !== null ? best.watts : null;
        const seconds = best && best.seconds !== null ? best.seconds : null;

        if (watts !== null) {
            state.pkgWatt = String(watts);
            state.isEstimate = false;
        } else {
            // Couldn't read the power: assume a typical home-meal wattage and
            // flag it so the result reads as an estimate until corrected.
            state.pkgWatt = '700';
            state.isEstimate = true;
        }
        if (seconds !== null) {
            state.min = String(Math.floor(seconds / 60));
            state.sec = String(seconds % 60);
        }
        saveState();
        render();

        if (!state.isEstimate) addRecent();
    }

    // Load the resolved locale (if any) before the first paint. English is
    // inline, so the page shows its hardcoded English markup until a non-English
    // preference's table arrives (usually cached, near-instant), then swaps.
    loadLang(resolveLang(state.lang)).catch(() => {}).finally(() => {
        applyStaticI18n();
        render();
    });
})();
