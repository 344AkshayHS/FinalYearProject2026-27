// Tests for the crop pages and the compare table (src/lib/crops.ts). Run from the frontend folder:  npm test

import assert from 'node:assert';
import test from 'node:test';

import type { RecommendResponse } from '@/components/results';
import { cropRows, landRows, mainPhoto, orderedPhotos, suggestedCrops, type CropEntry, type LastResult } from '@/lib/crops';
import { translations } from '@/lib/translations';

const t = translations.en;
const photo = (slot: CropEntry['photos'][number]['slot']) => ({ slot, path: `crop-images/x/${slot}.jpg`, author: 'a', license: 'CC0', license_url: '', site: 's', source: 'https://x' });
const entry = (fields: Partial<CropEntry> = {}): CropEntry => ({
  crop: 'rice',
  scientific_name: 'Oryza sativa',
  photos: [],
  seasonal: true,
  fertility: 'high',
  needs: { ph: [5.5, 7], rain_mm: [1500, 2000], temperature_c: [20, 30] },
  ...fields,
});
const value = (rows: { label: string; value: string | null }[], label: string) => rows.find((row) => row.label === label)?.value;

test('the harvested crop is the first photo; without one, the field', () => {
  const photos = [photo('field'), photo('mature'), photo('seeds'), photo('close_up')];
  assert.deepStrictEqual(orderedPhotos(entry({ photos })).map((item) => item.slot), ['seeds', 'field', 'close_up', 'mature']);
  assert.strictEqual(mainPhoto(entry({ photos: [photo('mature'), photo('field')] }))?.slot, 'field');
  assert.strictEqual(mainPhoto(entry({ photos: [] })), null);
  assert.strictEqual(mainPhoto(undefined), null); // the list is not loaded yet
});

test('a crop\'s rows come from its sources', () => {
  const rows = cropRows('rice', entry(), t, 'en');
  assert.strictEqual(value(rows, t.cropRows.type), t.cropValues.seasonal);
  assert.strictEqual(value(rows, t.cropRows.rain), '1500–2000 mm in its season');
  assert.strictEqual(value(rows, t.cropRows.temperature), '20–30 °C');
  assert.strictEqual(value(rows, t.cropRows.ph), '5.5–7');
  assert.strictEqual(value(rows, t.cropRows.fertility), 'High');
  assert.match(value(rows, t.cropRows.duration) ?? '', /days/); // crop-info.ts
});

test('a figure no source has stays empty ("—" on screen), never guessed', () => {
  const rows = cropRows('tulsi', entry({ crop: 'tulsi', needs: null, fertility: null, seasonal: null }), t, 'en');
  assert.strictEqual(value(rows, t.cropRows.rain), null);
  assert.strictEqual(value(rows, t.cropRows.ph), null);
  assert.strictEqual(value(rows, t.cropRows.fertility), null);
  assert.strictEqual(value(rows, t.cropRows.duration), null); // tulsi is not in crop-info.ts
});

test('a range with one end missing says "from" or "up to"', () => {
  const rows = cropRows('rice', entry({ needs: { ph: [6, null], rain_mm: [null, 900], temperature_c: [null, null] } }), t, 'en');
  assert.strictEqual(value(rows, t.cropRows.ph), 'from 6');
  assert.strictEqual(value(rows, t.cropRows.rain), 'up to 900 mm in its season');
  assert.strictEqual(value(rows, t.cropRows.temperature), null);
});

test('a tree is "stands all year" even before the crop list has loaded', () => {
  assert.strictEqual(value(cropRows('coconut', undefined, t, 'en'), t.cropRows.type), t.cropValues.yearRound);
  assert.match(value(cropRows('coconut', undefined, t, 'en'), t.cropRows.duration) ?? '', /years/);
});

const result = {
  season: 'Rabi',
  location: { lat: 12.9, lng: 74.8, state: 'Karnataka', district: 'DAKSHIN KANNAD', taluk: null },
  recommendations: [{ crop: 'rice' }, { crop: 'arecanut' }],
  season_best: { crop: 'black gram' },
  all_crops: [{ crop: 'rice', probability: 0.42 }, { crop: 'ragi', probability: 0.02 }],
  other_crops: [{ crop: 'tulsi' }],
  crop_facts: { level: 'taluk', name: 'Mangalore', crops: [{ crop: 'rice', share: 0.28 }], irrigated: { rice: 0.22 } },
} as unknown as RecommendResponse;
const last: LastResult = { data: result, waterSource: 'rain' };

test('without a result there are no land rows', () => {
  assert.deepStrictEqual(landRows('rice', null, t), []);
});

test('land rows: the model\'s share, the census share and the irrigated share', () => {
  const rows = landRows('rice', last, t);
  assert.strictEqual(value(rows, t.cropRows.match), 'about 4 in 10 acres');
  assert.strictEqual(value(rows, t.cropRows.grownHere), '28%');
  assert.strictEqual(value(rows, t.cropRows.irrigatedHere), '22%');
});

test('land rows for rare crops, herbs and crops the land does not suit', () => {
  assert.strictEqual(value(landRows('ragi', last, t), t.cropRows.match), t.shareRare);
  assert.strictEqual(value(landRows('ragi', last, t), t.cropRows.grownHere), 'Not in the top 1 crops here');
  assert.strictEqual(value(landRows('tulsi', last, t), t.cropRows.match), t.cropValues.suitsNeeds);
  assert.strictEqual(value(landRows('mint', last, t), t.cropRows.match), t.cropValues.notSuited);
  assert.strictEqual(value(landRows('ragi', last, t), t.cropRows.irrigatedHere), null);
});

test('the compare list offers the result\'s crops first, then saved ones, each once', () => {
  assert.deepStrictEqual(suggestedCrops(last, ['rice', 'ragi']), { fromResult: ['black gram', 'rice', 'arecanut'], saved: ['ragi'] });
  assert.deepStrictEqual(suggestedCrops(null, ['ragi']), { fromResult: [], saved: ['ragi'] });
});
