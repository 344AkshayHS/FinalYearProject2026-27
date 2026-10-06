// Tests for the checks every AI chat reply must pass before a farmer sees it (routes/chat.js). They need no
// database, no internet and no AI key. Run from the backend folder:  npm test

const test = require('node:test');
const assert = require('node:assert');
const { checkReply } = require('../src/routes/chat');

const FACTS = { ragi: { days: [90, 100], waterMm: [300, 350] } };
const KNOWN = { ragi: true, rice: true };
const reply = (fields) => JSON.stringify(fields);

test('a reply that uses only the checked numbers passes', () => {
  const result = checkReply(reply({ answer: 'Ragi takes 90 to 100 days.', crop: 'ragi', source: 'facts' }), FACTS, KNOWN, null, 'en');
  assert.deepStrictEqual(result, { answer: 'Ragi takes 90 to 100 days.', crop: 'ragi', source: 'facts' });
});

test('a number that is not in the facts is refused', () => {
  const result = checkReply(reply({ answer: 'Ragi takes 120 days.', crop: 'ragi', source: 'facts' }), FACTS, KNOWN, null, 'en');
  assert.match(result.problem, /numbers not in the facts: 120/);
});

test('numbers written with commas or in Kannada digits are read correctly', () => {
  const farm = { area_ha: 46000 };
  assert.ok(checkReply(reply({ answer: 'About 46,000 hectares.', source: 'facts' }), FACTS, KNOWN, farm, 'en').answer);
  assert.ok(checkReply(reply({ answer: 'ರಾಗಿ ೯೦ ದಿನ', source: 'facts' }), FACTS, KNOWN, null, 'kn').answer);
});

test('a spray dose is never allowed, even when its number is in the facts', () => {
  const farm = { dry_months: 2 }; // so "2" itself is a known number
  const result = checkReply(reply({ answer: 'Spray 2 ml per litre of water.', source: 'facts' }), FACTS, KNOWN, farm, 'en');
  assert.strictEqual(result.problem, 'a chemical dose');
  const general = checkReply(reply({ answer: 'Mix 5 g/l and spray.', source: 'general' }), FACTS, KNOWN, null, 'en');
  assert.ok(general.problem, 'a general answer with a dose is refused too');
});

test('a general answer may not invent an amount', () => {
  const result = checkReply(reply({ answer: 'Give it 60 kg of urea.', source: 'general' }), FACTS, KNOWN, null, 'en');
  assert.match(result.problem, /amounts not in the facts/);
  const ok = checkReply(reply({ answer: 'Keep the field free of weeds.', source: 'general' }), FACTS, KNOWN, null, 'en');
  assert.strictEqual(ok.source, 'general');
});

test('a Kannada question must get a Kannada answer', () => {
  const result = checkReply(reply({ answer: 'Ragi needs little water.', source: 'facts' }), FACTS, KNOWN, null, 'kn');
  assert.strictEqual(result.problem, 'not in Kannada');
});

test('broken or empty AI replies are refused, and unknown crops are dropped', () => {
  assert.strictEqual(checkReply('not json', FACTS, KNOWN, null, 'en').problem, 'no answer');
  assert.strictEqual(checkReply(null, FACTS, KNOWN, null, 'en').problem, 'no answer');
  assert.strictEqual(checkReply(reply({ answer: '   ', source: 'facts' }), FACTS, KNOWN, null, 'en').problem, 'no answer');
  const result = checkReply(reply({ answer: 'Good choice.', crop: 'banana split', source: 'facts' }), FACTS, KNOWN, null, 'en');
  assert.strictEqual(result.crop, null);
});
