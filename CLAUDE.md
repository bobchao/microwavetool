# Heat it right — Microwave Time Converter

A no-build, no-framework PWA. Plain DOM (`app.js`), vanilla JS everywhere.
There is no `package.json`, no bundler, and nothing to `npm install`.

## Running & testing

- Unit tests: `node test/mw-parse.test.js` (plain `node`, no test runner needed).
- Local server: Claude Code on the web starts one automatically via
  `.claude/hooks/session-start.sh` at `$MW_DEV_SERVER_URL` (defaults to
  `http://127.0.0.1:8000`). Use it, not `file://` — `service-worker.js`
  only registers over http(s)/localhost, so opening `index.html` directly
  can't exercise offline caching, PWA install, or camera capture.

## Offline-first is a deliberate constraint

Fonts (`fonts/`), Tailwind (`vendor/tailwind.js`), and the OCR engine
(`ocr/vendor/`, Tesseract.js + `eng`/`chi_tra`/`jpn` language data) are all
vendored into the repo on purpose, not loaded from a CDN. The app must keep
working fully offline as an installed PWA. Don't reintroduce CDN links or a
build step to "modernize" this — check `service-worker.js` for how the app
shell vs. the large OCR assets are cached differently before changing
either.

## Code layout

- `app.js` — main-screen state (oven wattage, package fields, recents) and
  rendering.
- `ocr/mw-parse.js` — parses wattage/time pairs out of OCR text; the part
  covered by `test/mw-parse.test.js`.
- `ocr/ocr.js` — UI-agnostic wrapper around Tesseract.js, exposes
  `window.mwOcr.scan(file, { onProgress })`. Lazy-loaded on first scan.
- `i18n/*.js` — locale files (`en` is inline in `app.js`; `zh-Hant`/`ja` are
  injected on demand).
- `service-worker.js` — precaches the app shell atomically; OCR assets are
  cached separately/lazily so plain visitors don't pay for ~14 MB upfront.

## No secrets or external services

OCR runs entirely client-side (Tesseract.js in-browser); nothing is
uploaded anywhere. No API keys, backend, or environment variables are
needed to develop or test this app.
