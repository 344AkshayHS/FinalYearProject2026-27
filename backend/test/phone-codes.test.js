// Tests for the SMS codes (src/phone-codes.js, src/services/sms.js). They need no database and send no SMS.
// Run from the backend folder:  npm test

const test = require('node:test');
const assert = require('node:assert');
const { checkCode, hashCode, newCode } = require('../src/phone-codes');
const { sendCodeSms } = require('../src/services/sms');

test('a code is always 6 digits, also when it starts with 0', () => {
  for (let i = 0; i < 2000; i++) {
    assert.match(newCode(), /^\d{6}$/);
  }
});

test('a code only fits the number and purpose it was sent for', () => {
  const sent = hashCode('9876543210', 'register', '123456');
  assert.strictEqual(hashCode('9876543210', 'register', '123456'), sent);
  assert.notStrictEqual(hashCode('9876543211', 'register', '123456'), sent);
  assert.notStrictEqual(hashCode('9876543210', 'reset', '123456'), sent);
  assert.notStrictEqual(hashCode('9876543210', 'register', '123457'), sent);
});

test('anything but 6 digits is refused before the database is asked', async () => {
  for (const code of [undefined, null, 123456, '', '12345', '1234567', 'abcdef', '12 345', '١٢٣٤٥٦']) {
    assert.strictEqual(await checkCode('9876543210', 'register', code), 'code_invalid');
  }
});

test('without TWOFACTOR_API_KEY the code is printed, not sent', async () => {
  const savedKey = process.env.TWOFACTOR_API_KEY;
  const savedFetch = global.fetch;
  const savedLog = console.log;
  const printed = [];
  delete process.env.TWOFACTOR_API_KEY;
  global.fetch = () => assert.fail('no SMS may be sent without a key');
  console.log = (line) => printed.push(line);
  try {
    await sendCodeSms('9876543210', '042137');
  } finally {
    console.log = savedLog;
    global.fetch = savedFetch;
    if (savedKey !== undefined) process.env.TWOFACTOR_API_KEY = savedKey;
  }
  assert.ok(printed.some((line) => line.includes('9876543210') && line.includes('042137')));
});

test('with a key the code goes to 2Factor for the number with 91 in front, and a refusal throws', async () => {
  const savedKey = process.env.TWOFACTOR_API_KEY;
  const savedFetch = global.fetch;
  process.env.TWOFACTOR_API_KEY = 'test-key';
  const asked = [];
  try {
    global.fetch = async (url) => (asked.push(url), { ok: true, json: async () => ({ Status: 'Success', Details: 'abc' }) });
    await sendCodeSms('9876543210', '042137');
    assert.deepStrictEqual(asked, ['https://2factor.in/API/V1/test-key/SMS/919876543210/042137']);

    global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ Status: 'Error', Details: 'Invalid API Key' }) });
    await assert.rejects(sendCodeSms('9876543210', '042137'), (err) => !err.message.includes('test-key'));
  } finally {
    global.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.TWOFACTOR_API_KEY;
    else process.env.TWOFACTOR_API_KEY = savedKey;
  }
});
