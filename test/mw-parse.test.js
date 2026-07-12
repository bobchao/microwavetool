// Run with: node test/mw-parse.test.js
const assert = require('assert');
const { parseMicrowaveText } = require('../ocr/mw-parse.js');

const cases = [
    // [name, OCR text, expected best {watts, seconds}]
    ['zh: watt + min/sec', '700W 加熱2分30秒', { watts: 700, seconds: 150 }],
    ['zh: 瓦 + seconds only', '微波 600 瓦 90 秒', { watts: 600, seconds: 90 }],
    ['en: parenthesised watt', 'Microwave on HIGH (1000W) for 1 min 30 sec', { watts: 1000, seconds: 90 }],
    ['en: minutes only, no watt', '2 minutes', { watts: null, seconds: 120 }],
    ['jp-style: watt + 分秒', '500W 2分30秒', { watts: 500, seconds: 150 }],
    ['jp-style: watt + 分秒 (b)', '600W 1分40秒', { watts: 600, seconds: 100 }],
    ['colon notation', '2:30', { watts: null, seconds: 150 }],
    ['zh: minutes only', '600瓦 加熱3分鐘', { watts: 600, seconds: 180 }],
    ['full-width digits and colon', '７００Ｗ ２：３０', { watts: 700, seconds: 150 }],
    ['watt only', '出力 800W', { watts: 800, seconds: null }],
    ['time before watt still pairs via fallback', '加熱2分30秒(700W)', { watts: 700, seconds: 150 }],
    ['multi-line label', 'RECOMMENDED\n1100 W\nHeat 1 minute 15 sec', { watts: 1100, seconds: 75 }],
    ['nothing usable', 'Best before 2026.07.12', null],
    ['watt out of range is a misread', '70000W 90秒', { watts: null, seconds: 90 }],
    ['time out of range is a misread', '700W 99999秒', { watts: 700, seconds: null }]
];

for (const [name, text, expected] of cases) {
    const result = parseMicrowaveText(text);
    assert.deepStrictEqual(result.best, expected, `${name}: got ${JSON.stringify(result.best)}`);
    console.log(`ok - ${name}`);
}

// Multiple wattage variants on one package: all groups extracted, first one wins.
{
    const result = parseMicrowaveText('500W:3分 / 600W:2分30秒');
    assert.deepStrictEqual(result.groups, [
        { watts: 500, seconds: 180 },
        { watts: 600, seconds: 150 }
    ], `multi-watt groups: got ${JSON.stringify(result.groups)}`);
    assert.deepStrictEqual(result.best, { watts: 500, seconds: 180 });
    console.log('ok - multi-watt: extracts every group, best = first');
}

// "2分30秒" must be consumed as one time, not re-counted as "30秒".
{
    const result = parseMicrowaveText('700W 2分30秒');
    assert.strictEqual(result.times.length, 1, `expected a single time match, got ${JSON.stringify(result.times)}`);
    console.log('ok - compound minute+second counted once');
}

console.log('\nAll mw-parse tests passed.');
