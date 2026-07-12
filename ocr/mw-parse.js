// Parses microwave heating instructions (watts + time) out of free-form OCR text.
// Runs in the browser as `window.mwParse` and in Node (for unit tests) via module.exports.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.mwParse = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    // Wattage printed on packages is realistically 100–2000 W; anything else is
    // treated as an OCR misread and dropped (issue #1).
    const MIN_WATTS = 100;
    const MAX_WATTS = 2000;
    const MIN_SECONDS = 5;
    const MAX_SECONDS = 3600;

    // Matches: "700W", "700 w", "600 瓦", "600瓦特", "1000 watts", "500ワット"
    const WATT_RE = /(\d{2,4})\s*(?:watts?\b|w\b|瓦特?|ワット)/gi;

    // One regex with alternatives so "2分30秒" is consumed whole and never
    // double-counted as a separate "30秒":
    //   1. minutes with optional trailing seconds: "2分30秒", "1 min 30 sec", "3分鐘", "2 minutes"
    //   2. seconds only: "90秒", "45 sec"
    //   3. colon notation: "2:30" (mm:ss)
    const TIME_RE = new RegExp(
        '(\\d{1,3})\\s*(?:分鐘|分钟|分|min(?:ute)?s?\\b\\.?)(?:\\s*(\\d{1,2})\\s*(?:秒鐘?|秒钟?|sec(?:ond)?s?\\b\\.?))?' +
        '|(\\d{1,4})\\s*(?:秒鐘?|秒钟?|sec(?:ond)?s?\\b\\.?)' +
        '|(\\d{1,2})\\s*:\\s*([0-5][0-9])(?!\\d)',
        'gi'
    );

    // OCR output frequently keeps full-width digits/letters/colons from CJK
    // packaging; fold them to ASCII before matching.
    function normalize(text) {
        return String(text || '')
            .replace(/[０-９Ａ-Ｚａ-ｚ]/g,
                ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
            .replace(/[：﹕]/g, ':');
    }

    function extractWatts(text) {
        const accepted = [];
        const rejected = [];
        let m;
        WATT_RE.lastIndex = 0;
        while ((m = WATT_RE.exec(text)) !== null) {
            const watts = parseInt(m[1], 10);
            const entry = { watts, index: m.index, raw: m[0] };
            (watts >= MIN_WATTS && watts <= MAX_WATTS ? accepted : rejected).push(entry);
        }
        return { accepted, rejected };
    }

    function extractTimes(text) {
        const accepted = [];
        const rejected = [];
        let m;
        TIME_RE.lastIndex = 0;
        while ((m = TIME_RE.exec(text)) !== null) {
            let seconds;
            if (m[1] !== undefined) {
                seconds = parseInt(m[1], 10) * 60 + (m[2] !== undefined ? parseInt(m[2], 10) : 0);
            } else if (m[3] !== undefined) {
                seconds = parseInt(m[3], 10);
            } else {
                seconds = parseInt(m[4], 10) * 60 + parseInt(m[5], 10);
            }
            const entry = { seconds, index: m.index, raw: m[0] };
            (seconds >= MIN_SECONDS && seconds <= MAX_SECONDS ? accepted : rejected).push(entry);
        }
        return { accepted, rejected };
    }

    // Parses OCR text and returns every wattage/time found, the paired groups
    // (a time is paired with the closest preceding wattage, e.g.
    // "500W:3分 / 600W:2分30秒" -> two groups), and `best` — the values the UI
    // should fill in: the first complete group, falling back to the first
    // wattage and/or first time when no complete pair exists.
    function parseMicrowaveText(rawText) {
        const text = normalize(rawText);
        const watts = extractWatts(text);
        const times = extractTimes(text);

        const groups = [];
        watts.accepted.forEach((w, i) => {
            const nextWattIndex = i + 1 < watts.accepted.length ? watts.accepted[i + 1].index : Infinity;
            const t = times.accepted.find(t => t.index > w.index && t.index < nextWattIndex);
            if (t) {
                groups.push({ watts: w.watts, seconds: t.seconds });
            }
        });

        let best = null;
        if (groups.length > 0) {
            best = { watts: groups[0].watts, seconds: groups[0].seconds };
        } else if (watts.accepted.length > 0 || times.accepted.length > 0) {
            best = {
                watts: watts.accepted.length > 0 ? watts.accepted[0].watts : null,
                seconds: times.accepted.length > 0 ? times.accepted[0].seconds : null
            };
        }

        return {
            text,
            watts: watts.accepted,
            times: times.accepted,
            rejectedWatts: watts.rejected,
            rejectedTimes: times.rejected,
            groups,
            best
        };
    }

    return { parseMicrowaveText, normalize };
}));
