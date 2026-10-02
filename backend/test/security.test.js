// Tests for the login and request-limit helpers. They need no database.
// Run from the backend folder:  npm test

const test = require('node:test');
const assert = require('node:assert');
const { checkLogin, hashPassword, hashToken, readCookie, stopForgedRequests } = require('../src/auth');
const { limitRequests } = require('../src/rate-limit');

// The smallest request and answer that the middleware need
function fakeRequest(fields = {}) {
  return { method: 'GET', headers: {}, ip: '1.2.3.4', ...fields };
}

function fakeAnswer() {
  const answer = { headers: {} };
  answer.status = (code) => ((answer.code = code), answer);
  answer.json = (body) => ((answer.body = body), answer);
  answer.set = (name, value) => ((answer.headers[name] = value), answer);
  return answer;
}

// Runs a middleware and says whether it let the request through, and what it answered if not
function run(middleware, req) {
  const res = fakeAnswer();
  let passed = false;
  middleware(req, res, () => (passed = true));
  return { passed, code: res.code, body: res.body };
}

test('a token is saved as its SHA-256 hash, never as itself', () => {
  const hash = hashToken('abc');
  assert.strictEqual(hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notStrictEqual(hash, 'abc');
});

test('cookies are read by name', () => {
  const req = fakeRequest({ headers: { cookie: 'a=1; gr_session=token123; b=2' } });
  assert.strictEqual(readCookie(req, 'gr_session'), 'token123');
  assert.strictEqual(readCookie(req, 'missing'), null);
  assert.strictEqual(readCookie(fakeRequest(), 'gr_session'), null);
});

test('a right password passes, a wrong one and an unknown account fail', async () => {
  const stored = await hashPassword('secret123');
  assert.strictEqual(await checkLogin('secret123', stored), true);
  assert.strictEqual(await checkLogin('secret124', stored), false);
  assert.strictEqual(await checkLogin('secret123', undefined), false);
});

test('requests that use the login cookie and change data must come from our website', () => {
  const cookie = { cookie: 'gr_session=token123' };
  const ours = { 'x-client': 'web', origin: 'http://localhost:5173' };

  // reading is always fine
  assert.strictEqual(run(stopForgedRequests, fakeRequest({ headers: cookie })).passed, true);
  // a change with the cookie but no proof it came from our page: refused
  const forged = run(stopForgedRequests, fakeRequest({ method: 'POST', headers: cookie }));
  assert.deepStrictEqual([forged.passed, forged.code, forged.body], [false, 403, { error: 'csrf_blocked' }]);
  // right header, wrong website: refused
  const wrongSite = { ...cookie, 'x-client': 'web', origin: 'http://evil.example' };
  assert.strictEqual(run(stopForgedRequests, fakeRequest({ method: 'POST', headers: wrongSite })).passed, false);
  // our website: allowed
  assert.strictEqual(run(stopForgedRequests, fakeRequest({ method: 'POST', headers: { ...cookie, ...ours } })).passed, true);
  // the phone app (Bearer token, no cookie): allowed without either header
  const phone = { authorization: 'Bearer token123' };
  assert.strictEqual(run(stopForgedRequests, fakeRequest({ method: 'POST', headers: phone })).passed, true);
  // a web login (no cookie yet) is checked too
  assert.strictEqual(run(stopForgedRequests, fakeRequest({ method: 'POST', headers: { 'x-client': 'web' } })).passed, false);
});

test('an address is stopped after too many requests, and others are not', () => {
  const limit = limitRequests(3, 1);
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(run(limit, fakeRequest()).passed, true);
  }
  const fourth = run(limit, fakeRequest());
  assert.deepStrictEqual([fourth.passed, fourth.code, fourth.body], [false, 429, { error: 'rate_limited' }]);
  assert.strictEqual(run(limit, fakeRequest({ ip: '5.6.7.8' })).passed, true);
});

test('the limit can count per user instead of per address', () => {
  const limit = limitRequests(1, 1, (req) => req.user.id);
  assert.strictEqual(run(limit, fakeRequest({ user: { id: 1 } })).passed, true);
  assert.strictEqual(run(limit, fakeRequest({ user: { id: 1 } })).passed, false);
  assert.strictEqual(run(limit, fakeRequest({ user: { id: 2 } })).passed, true);
});
