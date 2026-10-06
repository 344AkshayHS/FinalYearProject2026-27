// Tests for the crop photos (crop-images/): every crop of the app has photos, and every photo the app is told
// about is really there, is a JPEG and is small enough for a phone. They need no database and no internet.
// Run from the backend folder:  npm test

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { FOLDER, KNOWN_CROPS, PHOTOS } = require('../src/services/crop-photos');

// The crops of the app: the first column of the ML service's crop table
const CROP_TABLE = path.join(__dirname, '../../ml-service/artifacts/crop_requirements.csv');
const APP_CROPS = fs
  .readFileSync(CROP_TABLE, 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.split(',')[0]);

const SLOTS = ['field', 'close_up', 'pods', 'seeds', 'mature'];
const MAX_PHOTO_BYTES = 400 * 1024;

test('every crop of the app has photos, and there are no photos of crops the app does not know', () => {
  assert.deepStrictEqual([...KNOWN_CROPS].sort(), [...APP_CROPS].sort());
  for (const crop of APP_CROPS) {
    assert.ok(PHOTOS[crop].photos.length >= 2, `${crop} has ${PHOTOS[crop].photos.length} photos`);
  }
});

test('every listed photo is on disk, is a JPEG and is small enough', () => {
  const list = JSON.parse(fs.readFileSync(path.join(FOLDER, 'crops.json'), 'utf8'));
  for (const [crop, item] of Object.entries(list)) {
    for (const image of item.images.filter((image) => image.file)) {
      const file = path.join(FOLDER, image.file);
      assert.ok(fs.existsSync(file), `${crop}: ${image.file} is missing`);
      const bytes = fs.readFileSync(file);
      assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8, `${image.file} is not a JPEG`);
      assert.ok(bytes.length <= MAX_PHOTO_BYTES, `${image.file} is ${Math.round(bytes.length / 1024)} KB`);
    }
  }
});

test('every photo has its slot, its credit and its licence', () => {
  for (const [crop, item] of Object.entries(PHOTOS)) {
    for (const photo of item.photos) {
      assert.ok(SLOTS.includes(photo.slot), `${crop}: unknown slot ${photo.slot}`);
      assert.ok(photo.path.startsWith('crop-images/') && photo.path.endsWith('.jpg'), photo.path);
      assert.ok(photo.author && photo.license && photo.site && photo.source.startsWith('https://'), `${crop}: ${photo.path} lacks its credit`);
      assert.match(photo.license, /^(CC0|CC BY|CC BY-SA|Public domain)/i, `${crop}: ${photo.path} has licence ${photo.license}`);
    }
  }
});
