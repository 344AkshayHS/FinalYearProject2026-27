// Tests for the farmer's own soil test values (soil-test.js). Run from the backend folder:  npm test

const test = require('node:test');
const assert = require('node:assert');
const { readSoilTest, rateSoilTest, toTotalCarbon } = require('../src/soil-test');

test('no soil test, or an empty one, is null', () => {
  assert.strictEqual(readSoilTest(undefined), null);
  assert.strictEqual(readSoilTest('6.5'), null);
  assert.strictEqual(readSoilTest({}), null);
  assert.strictEqual(readSoilTest({ ph: '', n: null }), null);
});

test('values typed as text are read as numbers', () => {
  assert.deepStrictEqual(readSoilTest({ ph: '6.5', n: '250' }), { ph: 6.5, n: 250 });
});

test('a typo outside the possible range is refused', () => {
  assert.strictEqual(readSoilTest({ ph: 65 }), 'invalid'); // 6.5 typed without the dot
  assert.strictEqual(readSoilTest({ ph: 2 }), 'invalid');
  assert.strictEqual(readSoilTest({ organic_carbon_pct: 7 }), 'invalid');
  assert.strictEqual(readSoilTest({ k: -1 }), 'invalid');
  assert.strictEqual(readSoilTest({ ph: 'abc' }), 'invalid');
});

test('the edges of each range are accepted', () => {
  assert.deepStrictEqual(readSoilTest({ ph: 3, organic_carbon_pct: 5 }), { ph: 3, organic_carbon_pct: 5 });
});

test('N, P, K and organic carbon get the TNAU Low / Medium / High rating', () => {
  assert.deepStrictEqual(rateSoilTest({ n: 200, p: 15, k: 300, organic_carbon_pct: 0.6 }), {
    n: 'low',
    p: 'medium',
    k: 'high',
    organic_carbon_pct: 'medium',
  });
  assert.deepStrictEqual(rateSoilTest({ ph: 6.5 }), {}); // pH has no rating
});

test('organic carbon on the card (Walkley-Black %) becomes total carbon in g/kg', () => {
  assert.strictEqual(toTotalCarbon(0.5), 6.6);
  assert.strictEqual(toTotalCarbon(0), 0);
});
