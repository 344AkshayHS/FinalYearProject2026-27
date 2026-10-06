// The request limits can be set in backend/.env (rate-limit.js). Run from the backend folder:  npm test

const test = require('node:test');
const assert = require('node:assert');

// Set before rate-limit.js is loaded, as .env is when the server starts (each test file runs on its own)
process.env.LIMIT_CHAT_PER_HOUR = '7';
process.env.LIMIT_API_PER_MINUTE = 'lots'; // not a number: the default is kept
process.env.LIMIT_WEATHER_PER_HOUR = '-5'; // not a sensible limit: the default is kept
const { LIMITS } = require('../src/rate-limit');

test('a limit set in .env is used', () => {
  assert.strictEqual(LIMITS.chatPerHour, 7);
});

test('a limit that is not a whole number above 0 keeps its default', () => {
  assert.strictEqual(LIMITS.apiPerMinute, 600);
  assert.strictEqual(LIMITS.weatherPerHour, 200);
});

test('the defaults leave room for a team testing the app together', () => {
  assert.ok(LIMITS.recommendationsPerHour >= 100);
  assert.ok(LIMITS.loginsPer15Minutes >= 50);
});
