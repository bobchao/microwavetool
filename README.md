# Microwave Time Converter

## Overview
The Microwave Time Converter is a simple yet powerful web application designed to help you adjust microwave cooking times based on different wattages. This tool is especially useful when the wattage of your microwave oven differs from the wattage recommended on food packaging. 

This app originated from [Make Real](https://makereal.tldraw.com/), was then iterated on with [ChatGPT](https://chat.openai.com/), and later had its UI and OCR feature refined with Claude Design and Claude Code.

## Features
- **Time Conversion**: Enter the package's power + cook time and your own microwave's wattage to get the adjusted cooking time, rounded to a friendly value (nearest 10s) with the exact value shown alongside.
- **Scan Package Photo (OCR)**: Tap "Scan the package" to shoot the package's microwave instructions (on devices without a camera it falls back to a file picker) and have the power and time filled in automatically. When the photo doesn't clearly show a wattage, a typical 700 W is assumed and flagged as an estimate until you correct it. Recognition runs entirely in your browser with [Tesseract.js](https://github.com/naptha/tesseract.js) — the photo is never uploaded anywhere. The OCR engine and language data (English + Traditional Chinese, which also covers the 分/秒 glyphs on Japanese packaging, ~8 MB) are served with the app and downloaded only on first use, then cached for offline use.
- **Your Oven's Wattage**: A remembered default (700 W out of the box) shown as a chip in the header — tap it to change via presets or a custom value.
- **Last 2 Cooks**: Recent scans are kept for one-tap reuse.
- **Save Preferences**: Your oven wattage, last package fields, and recent cooks are saved for quick reference on your next visit.
- **Progressive Web App (PWA)**: Install this app on your home screen and use it offline. The PWA technology ensures a smooth and native-like experience.

## Installation
This web application can be used directly from a web browser without any installation. However, for an enhanced experience, you can install it as a Progressive Web App on your device.

### Steps to Install as a PWA:
1. Visit [Microwave Time Converter](https://bobchao.github.io/microwavetool/) on your web browser.
2. Add to home screen via your browser's settings menu.
3. The app will now be available as an icon on your home screen.

## Usage
1. **Set Your Microwave's Power**: Tap the "your oven" chip in the header once to set your microwave's wattage (defaults to 700 W).
2. **Get the Package's Power + Cook Time**: Tap "Scan the package" to shoot a photo of the label, or type the power and cook time in directly — both are always available.
3. **Result**: The adjusted cook time appears immediately, rounded to a friendly value with the exact seconds shown underneath. Your last 2 cooks are kept below for one-tap reuse.

## Development
- `app.js` holds the main-screen state (oven wattage, package fields, recents) and rendering; no framework/build step — plain DOM.
- `ocr/mw-parse.js` extracts wattage/time pairs from OCR text and is unit-tested: run `node test/mw-parse.test.js`.
- `ocr/ocr.js` exposes `window.mwOcr.scan(file, { onProgress })`, a UI-agnostic wrapper around Tesseract.js (lazy-loaded on first use). Raw OCR text and every extracted value are written to the browser console for debugging.
- `ocr/vendor/` contains the self-hosted Tesseract.js v5.1.1 assets (`tesseract.min.js`, `worker.min.js`, LSTM wasm cores, and `4.0.0_best_int` traineddata for `eng` + `chi_tra`).

## Contributing
Feel free to fork this repository and submit pull requests to contribute to this project. For major changes, please open an issue first to discuss what you would like to change.

## License
MIT License