// Tests for the seasons, the weather words, the daily water and the English/Kannada texts.
// Run from the frontend folder:  npm test

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { toBase64 } from '@/lib/base64';
import { mostlyIrrigatedShare, pastHarvest, waterToday } from '@/lib/crop-water';
import { seasonNow } from '@/lib/season';
import { cropName, translations } from '@/lib/translations';
import { waterChoiceLines, type WaterFacts } from '@/lib/water-choice';
import { rainLikelySoon, weatherAnswer, weatherIcon, weatherKind, type WeatherNow } from '@/lib/weather';

test('the season of a date: kharif June-September, rabi October-January, summer February-May', () => {
  const on = (date: string) => seasonNow(new Date(date + 'T12:00'));
  assert.strictEqual(on('2026-06-01'), 'Kharif');
  assert.strictEqual(on('2026-09-30'), 'Kharif');
  assert.strictEqual(on('2026-10-01'), 'Rabi');
  assert.strictEqual(on('2027-01-31'), 'Rabi');
  assert.strictEqual(on('2027-02-01'), 'Summer');
  assert.strictEqual(on('2027-05-31'), 'Summer');
});

test('weather codes become words and pictures; an unknown code shows as cloudy', () => {
  assert.strictEqual(weatherKind(0), 'clear');
  assert.strictEqual(weatherKind(63), 'rain');
  assert.strictEqual(weatherKind(95), 'thunder');
  assert.strictEqual(weatherKind(12345), 'cloudy');
  assert.strictEqual(weatherIcon(0, false), '🌙');
});

const day = (date: string, rain: number) => ({ date, code: rain > 0 ? 61 : 1, max_c: 31.6, min_c: 24.2, rain_mm: rain, rain_chance_pct: 60 });
const weather = (rains: number[]): WeatherNow => ({
  in_middle: false,
  now: { time: '2026-10-06T15:30', temperature_c: 30.6, feels_like_c: 35.2, humidity_pct: 68, wind_kmh: 6.4, rain_mm: 0, code: 2, is_day: true },
  days: rains.map((rain, i) => day(`2026-10-0${6 + i}`, rain)),
});

test('a rainy day (2.5 mm or more, as IMD counts it) today or tomorrow gives the rain tip', () => {
  assert.strictEqual(rainLikelySoon(weather([0, 2.5, 0]).days), true);
  assert.strictEqual(rainLikelySoon(weather([2.4, 0, 9]).days), false); // the third day does not count
});

test('the chat\'s weather answer has every figure filled in, in English and Kannada', () => {
  for (const language of ['en', 'kn'] as const) {
    const text = weatherAnswer(weather([0, 4.3, 0]), 'Udupi', language);
    assert.doesNotMatch(text, /\{[a-z]+\}/, language); // no "{temp}" left
    assert.match(text, /31°/);
    assert.ok(text.includes(translations[language].weatherNow.rainSoon), language);
    assert.ok(text.includes(translations[language].weatherNow.tomorrow), language);
  }
});

test('daily water: crop factor x evaporation - rain, never below zero', () => {
  const dry = waterToday('ragi', 30, { et0_mm: 5, rain_mm: 0, humidity_pct: 50 });
  assert.ok(dry && dry.irrigateMm > 0 && dry.irrigateLitresPerAcre > 0);
  const wet = waterToday('ragi', 30, { et0_mm: 5, rain_mm: 40, humidity_pct: 90 });
  assert.strictEqual(wet?.irrigateMm, 0);
  assert.strictEqual(waterToday('tulsi', 30, { et0_mm: 5, rain_mm: 0, humidity_pct: 50 }), null); // no FAO factor
  assert.strictEqual(pastHarvest('ragi', 400), true);
});

test('"needs irrigation" only when at least half of the crop\'s land here is irrigated', () => {
  assert.strictEqual(mostlyIrrigatedShare({ rice: 0.93 }, 'rice'), 0.93);
  assert.strictEqual(mostlyIrrigatedShare({ ragi: 0.08 }, 'ragi'), null);
  assert.strictEqual(mostlyIrrigatedShare(undefined, 'rice'), null); // outside Karnataka
});

// Every text, as "path.to.key" -> text
function texts(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, inner]) => texts(inner, path ? `${path}.${key}` : key));
  return [];
}
const placeholders = (text: string) => [...text.matchAll(/\{[a-z]+\}/gi)].map((match) => match[0]).sort().join(' ');

test('Rain only / Irrigated says what changes, with the real figures and no blanks left', () => {
  // Rice in a Rabi season with less rain than it needs, 2 crops irrigated by most farmers here, 3 herbs left out
  const facts: WaterFacts = { crop: 'rice', need: [1000, 2000], rain: 820, rainIsSeason: true, marked: 2, leftOut: 3 };
  const rain = waterChoiceLines(facts, 'rain', 'en');
  assert.match(rain[0], /1000–2000 mm/);
  assert.match(rain[0], /820 mm/);
  assert.match(rain[1], /180 mm less/); // 1000 - 820
  assert.ok(rain.some((line) => line.includes('2 crops')));
  assert.ok(rain.some((line) => line.includes('3 herbs')));
  const irrigated = waterChoiceLines(facts, 'irrigated', 'en');
  assert.match(irrigated[1], /at least 180 mm more/);
  assert.ok(irrigated.some((line) => line.includes('all crops that suit')));
  assert.notDeepStrictEqual(rain, irrigated); // a tap always changes what the farmer reads

  // Enough rain; no census figures (outside Karnataka); no FAO need known
  assert.match(waterChoiceLines({ ...facts, rain: 1500 }, 'rain', 'en')[1], /enough/);
  assert.ok(!waterChoiceLines({ ...facts, marked: null }, 'rain', 'en').some((line) => line.includes('marked')));
  assert.ok(!waterChoiceLines({ ...facts, need: [null, null] }, 'rain', 'en').some((line) => line.includes('mm of water')));

  for (const language of ['en', 'kn'] as const) {
    for (const source of ['rain', 'irrigated'] as const) {
      for (const line of waterChoiceLines(facts, source, language)) {
        assert.ok(!/[{}]/.test(line), line);
      }
    }
  }
  assert.ok(waterChoiceLines(facts, 'rain', 'kn').every((line) => !/[a-z]{3,}/.test(line.replace('mm', ''))), 'no English in Kannada');
});

test('every English text has a Kannada text with the same {placeholders}', () => {
  const kn = new Map(texts(translations.kn));
  for (const [key, english] of texts(translations.en)) {
    const kannada = kn.get(key);
    assert.ok(kannada !== undefined && kannada.trim() !== '', `no Kannada text for ${key}`);
    assert.strictEqual(placeholders(kannada), placeholders(english), `placeholders differ in ${key}`);
  }
});

test('every crop of the app has a Kannada name', () => {
  const crops = Object.keys(JSON.parse(readFileSync(new URL('../../crop-images/crops.json', import.meta.url), 'utf8')));
  assert.strictEqual(crops.length, 93);
  for (const crop of crops) {
    assert.notStrictEqual(cropName(crop, 'kn'), cropName(crop, 'en'), `${crop} has no Kannada name`);
  }
});

test('Kannada numerals: numbers change, names with digits do not', async () => {
  const { toKannadaDigits, toWesternDigits } = await import('@/lib/digits');
  assert.strictEqual(toKannadaDigits('13,000 ಲೀಟರ್, 3.3 ಮಿ.ಮೀ., 31°C'), '೧೩,೦೦೦ ಲೀಟರ್, ೩.೩ ಮಿ.ಮೀ., ೩೧°C');
  assert.strictEqual(toKannadaDigits('60 : 30 : 30 (N : P2O5 : K2O)'), '೬೦ : ೩೦ : ೩೦ (N : P2O5 : K2O)');
  assert.strictEqual(toWesternDigits(toKannadaDigits('22.5 × 10, 15:30')), '22.5 × 10, 15:30');
});

test('photo bytes become the same base64 text as Node makes, for every length of the last group', () => {
  const photo = readFileSync(new URL('../assets/images/chatbot.png', import.meta.url));
  for (const bytes of [photo, photo.subarray(0, 1), photo.subarray(0, 2), photo.subarray(0, 3), new Uint8Array(0)]) {
    assert.strictEqual(toBase64(new Uint8Array(bytes)), Buffer.from(bytes).toString('base64'));
  }
});

test('the bell: rain today or tomorrow from the forecast, from 2.5 mm, with the place', async () => {
  const { buildNotices } = await import('@/lib/notices');
  const forecast = (rain: number[]) => ({
    label: 'Mysuru',
    weather: {
      in_middle: false,
      now: { time: '2026-11-15T09:00', temperature_c: 25, feels_like_c: 26, humidity_pct: 70, wind_kmh: 8, rain_mm: 0, code: 3, is_day: true },
      days: rain.map((mm, i) => ({ date: `2026-11-${15 + i}`, code: 61, max_c: 28, min_c: 19, rain_mm: mm, rain_chance_pct: 80 })),
    },
  });
  const now = new Date('2026-11-15T09:00'); // no season message on this day
  const rain = (rainMm: number[]) => buildNotices({ now, language: 'en', forecast: forecast(rainMm), results: null });

  const tomorrow = rain([0, 12, 30]);
  assert.strictEqual(tomorrow.length, 1);
  assert.strictEqual(tomorrow[0].id, 'rain:2026-11-16');
  assert.strictEqual(tomorrow[0].title, 'Rain expected tomorrow');
  assert.match(tomorrow[0].text, /12 mm of rain in Mysuru/);
  assert.strictEqual(rain([3, 0, 0])[0].title, 'Rain expected today');
  assert.deepStrictEqual(rain([2.4, 0, 40]), []); // under 2.5 mm, and the day after tomorrow does not count
  assert.deepStrictEqual(buildNotices({ now, language: 'en', forecast: null, results: null }), []);
});

test('the bell: a season has started (first 30 days) or starts in the next 14 days', async () => {
  const { buildNotices } = await import('@/lib/notices');
  const ids = (date: string) => buildNotices({ now: new Date(date + 'T10:00'), language: 'en', forecast: null, results: null }).map((n) => n.id);
  assert.deepStrictEqual(ids('2026-10-09'), ['season:Rabi:2026']);
  assert.deepStrictEqual(ids('2026-06-01'), ['season:Kharif:2026']);
  assert.deepStrictEqual(ids('2026-11-15'), []);
  assert.deepStrictEqual(ids('2026-05-20'), ['season-soon:Kharif:2026']);
  assert.deepStrictEqual(ids('2026-09-25'), ['season-soon:Rabi:2026']);
  assert.deepStrictEqual(ids('2027-01-25'), ['season-soon:Summer:2027']); // rabi started in October 2026, long ago
  assert.deepStrictEqual(ids('2027-01-10'), []);
  assert.deepStrictEqual(ids('2027-02-10'), ['season:Summer:2027']);
});

test('the bell: asks about the newest result 1-12 months old that has no feedback yet', async () => {
  const { buildNotices } = await import('@/lib/notices');
  const now = new Date('2026-11-15T10:00');
  const result = (id: string, daysAgo: number, feedback_given?: boolean) => ({
    id,
    created_at: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    season: 'Rabi' as const,
    latitude: '12.3',
    longitude: '76.6',
    state: 'Karnataka',
    district: 'MYSORE',
    crops: [{ crop: 'ragi', score: '0.4' }],
    feedback_given,
  });
  const notices = (results: ReturnType<typeof result>[], language: 'en' | 'kn' = 'en') =>
    buildNotices({ now, language, forecast: null, results });

  const asked = notices([result('1', 10, false), result('2', 40, true), result('3', 50, false), result('4', 400, false)]);
  assert.deepStrictEqual(asked.map((n) => n.id), ['feedback:3']);
  assert.deepStrictEqual(asked[0].opens, { feedback: '3' });
  assert.match(asked[0].text, /Mysuru/);
  assert.deepStrictEqual(notices([result('5', 50)]), []); // an older server sends no feedback_given: no question
  const kannada = notices([result('3', 50, false)], 'kn')[0];
  assert.ok(!/[{}]/.test(kannada.title + kannada.text), 'every blank is filled');
});

test('dark and light themes have the same colour names and readable text', async () => {
  const { THEME_COLORS } = await import('@/theme');
  const luminance = (hex: string) => {
    const [r, g, b] = (hex.match(/\w\w/g) ?? []).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };
  const { light, dark } = THEME_COLORS;
  assert.deepStrictEqual(Object.keys(dark), Object.keys(light));
  assert.notStrictEqual(dark.background, light.background);
  for (const theme of [light, dark]) {
    for (const [text, on] of [
      ['text', 'background'], ['text', 'card'], ['muted', 'card'], ['primaryDark', 'card'], ['warningText', 'accentSoft'],
      ['primary', 'background'], ['primary', 'card'], ['onPrimary', 'primary'], ['onPrimary', 'danger'],
      ['heroText', 'hero'], ['heroSubtext', 'hero'], ['muted', 'primarySoft'], ['danger', 'card'],
    ] as const) {
      assert.ok(contrast(theme[text], theme[on]) >= 4.5, `${text} on ${on}: ${contrast(theme[text], theme[on]).toFixed(2)}`);
    }
  }
});
