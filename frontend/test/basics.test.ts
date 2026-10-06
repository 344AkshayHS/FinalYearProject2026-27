// Tests for the seasons, the weather words, the daily water and the English/Kannada texts.
// Run from the frontend folder:  npm test

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { mostlyIrrigatedShare, pastHarvest, waterToday } from '@/lib/crop-water';
import { seasonNow } from '@/lib/season';
import { cropName, translations } from '@/lib/translations';
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
