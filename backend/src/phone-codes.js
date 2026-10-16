// One-time codes sent by SMS, so only the owner of a mobile number can make an account with it ('register') or
// set a new password for it ('reset'). The code is made here and checked here; 2Factor only delivers the SMS
// (services/sms.js).
//
// A code is 6 digits and works for 10 minutes, once. After 5 wrong tries it stops working and a new one is needed.
//
// Each SMS costs money, so every number has a token bucket (one per purpose): it holds 3 codes, so 3 can be sent
// one after another. Then one code is added back every 30 seconds, but only 5 times: at most 8 codes. After that
// the number gets no more codes until 24 hours after its first code, when the bucket is full again.
// (server.js also limits how many codes one address may ask for.)

const crypto = require('crypto');
const pool = require('./db');
const { sendCodeSms } = require('./services/sms');

const CODE_MINUTES = 10;
const MAX_TRIES = 5;

const CAPACITY = 3; // codes the bucket holds
const REFILL_SECONDS = 30; // one code added back every 30 seconds...
const MAX_REFILLS = 5; // ...but only 5 times
const WINDOW_HOURS = 24; // then, 24 hours after the first code, the bucket starts full again

const REFILL_MS = REFILL_SECONDS * 1000;
const WINDOW_MS = WINDOW_HOURS * 3600 * 1000;

function newCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Only this hash is saved. The number and purpose are part of it, so a code only fits where it was sent.
function hashCode(phone, purpose, code) {
  return crypto.createHash('sha256').update(`${purpose}:${phone}:${code}`).digest('hex');
}

// The bucket at the time `now` (all times in milliseconds). `saved` is { tokens, refills, refilledAt, windowStart }
// as stored, or null for a number that never got a code.
function bucketAt(saved, now) {
  if (!saved || now - saved.windowStart >= WINDOW_MS) {
    return { tokens: CAPACITY, refills: 0, refilledAt: now, windowStart: now };
  }
  let { tokens, refills, refilledAt } = saved;
  const added = Math.min(Math.floor((now - refilledAt) / REFILL_MS), CAPACITY - tokens, MAX_REFILLS - refills);
  if (added > 0) {
    tokens += added;
    refills += added;
    refilledAt += added * REFILL_MS;
  }
  // A full bucket (or one that gets no more refills) does not save up time: the 30 seconds start when a code is used
  if (tokens >= CAPACITY || refills >= MAX_REFILLS) {
    refilledAt = now;
  }
  return { tokens, refills, refilledAt, windowStart: saved.windowStart };
}

// Seconds until the next code may be sent: 0 when the bucket still has one (or will never get one again)
function secondsUntilNextCode(bucket, now) {
  if (bucket.tokens > 0 || bucket.refills >= MAX_REFILLS) {
    return 0;
  }
  return Math.max(1, Math.ceil((bucket.refilledAt + REFILL_MS - now) / 1000));
}

// Sends a new code to the number, replacing any earlier one. Answers { resendAfter: seconds } when it was sent, or
// { error: 'code_wait', retryAfter: seconds } (the bucket is empty for now), { error: 'code_limit' } (no more codes
// for this number until the 24 hours are over), or { error: 'sms_failed' }.
async function sendCode(phone, purpose) {
  const code = newCode();
  const client = await pool.connect();
  let bucket;
  let now;
  try {
    // One request at a time per number: the row is locked until COMMIT, so quick taps cannot share a code from the
    // bucket. A number's first request makes the row first (it is not a usable code yet: it has already run out).
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO phone_codes (phone, purpose, code_hash, expires_at) VALUES ($1, $2, '', now())
       ON CONFLICT (phone, purpose) DO NOTHING`,
      [phone, purpose]
    );
    const row = (
      await client.query(
        'SELECT tokens, refills, refilled_at, first_sent_at FROM phone_codes WHERE phone = $1 AND purpose = $2 FOR UPDATE',
        [phone, purpose]
      )
    ).rows[0];
    now = Date.now();
    const saved = { tokens: row.tokens, refills: row.refills, refilledAt: row.refilled_at.getTime(), windowStart: row.first_sent_at.getTime() };
    bucket = bucketAt(saved, now);

    if (bucket.tokens <= 0) {
      await client.query('ROLLBACK');
      return bucket.refills >= MAX_REFILLS ? { error: 'code_limit' } : { error: 'code_wait', retryAfter: secondsUntilNextCode(bucket, now) };
    }

    bucket.tokens -= 1;
    await client.query(
      `UPDATE phone_codes SET
         code_hash = $3, expires_at = now() + make_interval(mins => $4), tries = 0,
         tokens = $5, refills = $6, refilled_at = $7, first_sent_at = $8, last_sent_at = now()
       WHERE phone = $1 AND purpose = $2`,
      [phone, purpose, hashCode(phone, purpose, code), CODE_MINUTES, bucket.tokens, bucket.refills, new Date(bucket.refilledAt), new Date(bucket.windowStart)]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // The SMS is sent after COMMIT, so the number is not locked while 2Factor answers
  try {
    await sendCodeSms(phone, code);
  } catch (err) {
    console.error(err.message);
    return { error: 'sms_failed' };
  }
  return { resendAfter: secondsUntilNextCode(bucket, now) };
}

// Is this the number's current code? Answers null when it is (the code is then used up), or the reason it is not:
// 'code_invalid' (not 6 digits), 'code_wrong', 'code_tries' (5 wrong tries: ask for a new one) or 'code_expired'
// (older than 10 minutes, already used, or never sent).
async function checkCode(phone, purpose, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return 'code_invalid';
  }

  // Each try is counted before the code is compared, in one statement, so many tries sent at once still count
  const tried = await pool.query(
    `UPDATE phone_codes SET tries = tries + 1
     WHERE phone = $1 AND purpose = $2 AND expires_at > now() AND tries < $3
     RETURNING code_hash, tries`,
    [phone, purpose, MAX_TRIES]
  );
  const row = tried.rows[0];
  if (!row) {
    const live = await pool.query('SELECT 1 FROM phone_codes WHERE phone = $1 AND purpose = $2 AND expires_at > now()', [phone, purpose]);
    return live.rows.length > 0 ? 'code_tries' : 'code_expired';
  }

  const typed = Buffer.from(hashCode(phone, purpose, code), 'hex');
  const saved = Buffer.from(row.code_hash, 'hex');
  if (saved.length !== typed.length || !crypto.timingSafeEqual(saved, typed)) {
    return row.tries >= MAX_TRIES ? 'code_tries' : 'code_wrong';
  }

  // Used up, in one statement that only one request can win: two requests with the same right code at the same
  // moment cannot both go on. The row stays, so the bucket still counts the codes this number got.
  const used = await pool.query(
    `UPDATE phone_codes SET expires_at = now()
     WHERE phone = $1 AND purpose = $2 AND code_hash = $3 AND expires_at > now()
     RETURNING 1`,
    [phone, purpose, row.code_hash]
  );
  return used.rows.length > 0 ? null : 'code_expired';
}

// Rows whose 24 hours are over (and whose code has run out) are no longer needed. At start-up and every hour.
async function deleteOldCodes() {
  await pool.query(
    `DELETE FROM phone_codes WHERE first_sent_at < now() - make_interval(hours => $1) AND expires_at < now()`,
    [WINDOW_HOURS]
  );
}

module.exports = { sendCode, checkCode, deleteOldCodes, newCode, hashCode, bucketAt, secondsUntilNextCode, CAPACITY, REFILL_SECONDS, MAX_REFILLS, WINDOW_HOURS };
