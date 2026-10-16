const express = require('express');
const pool = require('../db');
const {
  USER_COOKIE,
  hashPassword,
  checkLogin,
  hashToken,
  createSession,
  sendSession,
  clearSessionCookie,
  requireUser,
} = require('../auth');
const { checkCode, sendCode } = require('../phone-codes');
const { lockedOut, wrongPassword, rightPassword } = require('../rate-limit');
const { KNOWN_CROPS } = require('../services/crop-photos');

const router = express.Router();

// The password is hashed with scrypt, which takes real time, so a huge password would be a cheap way to slow the server
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

// Passwords that are guessed first, even though they have letters and numbers. The app has the same list
// (frontend/src/lib/password.ts), so it can say so before sending.
const COMMON_PASSWORDS = new Set([
  'password1', 'password12', 'password123', 'passw0rd', 'abc12345', 'abcd1234', 'abcd12345', 'qwerty123', 'qwerty12',
  '1234abcd', '12345abc', 'a1234567', '12345678a', '1q2w3e4r', '1qaz2wsx', 'iloveyou1', 'welcome1', 'welcome123',
  'admin123', 'test1234', 'india123', 'india1234', 'greenroot1', 'greenroot123', 'farmer123', 'krishna123',
]);

// The details of a new account: answers the error code of the first thing that is wrong, or null
function newAccountProblem({ full_name, phone, password }) {
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 80) {
    return 'name_required';
  }
  if (!isPhone(phone)) {
    return 'phone_invalid';
  }
  return passwordProblem(password, phone);
}

// The rules for every new password (sign-up, "Forgot password", "Change password"): at least 8 characters, letters
// and numbers (any script, so Kannada letters and digits count), not the account's mobile number, and not one of the
// passwords guessed first. Answers the error code of the first rule it breaks, or null. Old passwords still log in.
function passwordProblem(password, phone) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return 'password_short';
  }
  if (password.length > MAX_PASSWORD) {
    return 'password_long';
  }
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) {
    return 'password_weak';
  }
  if (password.includes(phone)) {
    return 'password_phone';
  }
  return COMMON_PASSWORDS.has(password.toLowerCase()) ? 'password_common' : null;
}

// An Indian mobile number: 10 digits, starting with 6, 7, 8 or 9
function isPhone(phone) {
  return typeof phone === 'string' && /^[6-9]\d{9}$/.test(phone);
}

async function findAccount(phone) {
  return (await pool.query('SELECT id FROM users WHERE phone = $1', [phone])).rows[0] ?? null;
}

// Sends the SMS code and answers the app: { sent: true, resend_after: seconds before "Send again" works (0: now) }.
// Too many codes for the number: 429 with "code_wait" (try again in retry_after seconds) or "code_limit" (no more
// codes for this number for now; see phone-codes.js).
async function sendCodeAndAnswer(res, phone, purpose) {
  const result = await sendCode(phone, purpose);
  if (result.error === 'code_wait') {
    res.set('Retry-After', String(result.retryAfter));
    return res.status(429).json({ error: 'code_wait', retry_after: result.retryAfter });
  }
  if (result.error) {
    return res.status(result.error === 'sms_failed' ? 503 : 429).json({ error: result.error });
  }
  res.json({ sent: true, resend_after: result.resendAfter });
}

// POST /users/register/code
// Body: the same as /users/register, without "code". Everything is checked first, so nobody gets an SMS for a form
// that would fail anyway; then the code goes to the number by SMS.
router.post('/register/code', async (req, res) => {
  const body = req.body ?? {}; // no body at all: every check below fails cleanly
  const problem = newAccountProblem(body);
  if (problem) {
    return res.status(400).json({ error: problem });
  }
  if (await findAccount(body.phone)) {
    return res.status(409).json({ error: 'phone_taken' });
  }
  await sendCodeAndAnswer(res, body.phone, 'register');
});

// POST /users/register
// Body: { "full_name": "Ravi", "phone": "9876543210", "password": "secret123", "language": "kn", "code": "123456" }
// "code" is the one sent by SMS to that number (POST /users/register/code), so only its owner can use the number.
// The phone app gets { token, user }; the website (header "X-Client: web") gets { user } and a cookie.
router.post('/register', async (req, res) => {
  const body = req.body ?? {};
  const { full_name, phone, password, code } = body;
  const language = body.language === 'kn' ? 'kn' : 'en';

  // There is no way around the code: the account is only made after checkCode says it is this number's code
  const problem = newAccountProblem(body);
  if (problem) {
    return res.status(400).json({ error: problem });
  }
  if (await findAccount(phone)) {
    return res.status(409).json({ error: 'phone_taken' });
  }
  const codeProblem = await checkCode(phone, 'register', code);
  if (codeProblem) {
    return res.status(400).json({ error: codeProblem });
  }

  let result;
  try {
    result = await pool.query(
      `INSERT INTO users (full_name, phone, password_hash, preferred_language)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, phone, preferred_language, created_at, photo_updated_at`,
      [full_name.trim(), phone, await hashPassword(password), language]
    );
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'phone_taken' }); // made a moment ago from another phone
    }
    throw err;
  }
  const user = result.rows[0];
  sendSession(req, res, USER_COOKIE, await createSession(user.id), { user }, 201);
});

// POST /users/forgot-password/code   Body: { "phone": "9876543210" }
// Sends a code by SMS to the number of an account, for a new password
router.post('/forgot-password/code', async (req, res) => {
  const { phone } = req.body ?? {};
  if (!isPhone(phone)) {
    return res.status(400).json({ error: 'phone_invalid' });
  }
  if (!(await findAccount(phone))) {
    return res.status(404).json({ error: 'no_account' });
  }
  await sendCodeAndAnswer(res, phone, 'reset');
});

// POST /users/forgot-password   Body: { "phone": "9876543210", "code": "123456", "new_password": "secret123" }
// The code from the SMS sets a new password. Every other login of the account ends (someone may know the old
// password), and the farmer is logged in here, with the same answer as /users/login.
router.post('/forgot-password', async (req, res) => {
  const { phone, code, new_password } = req.body ?? {};
  if (!isPhone(phone)) {
    return res.status(400).json({ error: 'phone_invalid' });
  }
  const problem = passwordProblem(new_password, phone);
  if (problem) {
    return res.status(400).json({ error: problem });
  }
  const account = await findAccount(phone);
  if (!account) {
    return res.status(404).json({ error: 'no_account' });
  }
  const codeProblem = await checkCode(phone, 'reset', code);
  if (codeProblem) {
    return res.status(400).json({ error: codeProblem });
  }

  const result = await pool.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2
     RETURNING id, full_name, phone, preferred_language, created_at, photo_updated_at`,
    [await hashPassword(new_password), account.id]
  );
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [account.id]);
  rightPassword(req, phone); // wrong passwords typed before no longer lock the number out
  sendSession(req, res, USER_COOKIE, await createSession(account.id), { user: result.rows[0] });
});

// POST /users/login
// Body: { "phone": "9876543210", "password": "secret123" }
router.post('/login', async (req, res) => {
  const { phone, password } = req.body ?? {};
  if (typeof phone !== 'string' || typeof password !== 'string' || password.length > MAX_PASSWORD) {
    return res.status(401).json({ error: 'login_failed' });
  }
  if (lockedOut(req, phone)) {
    return res.status(429).json({ error: 'too_many_tries' });
  }

  const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  const user = result.rows[0];

  if (!(await checkLogin(password, user?.password_hash))) {
    wrongPassword(req, phone);
    return res.status(401).json({ error: 'login_failed' });
  }

  rightPassword(req, phone);
  const body = {
    user: {
      id: user.id,
      full_name: user.full_name,
      phone: user.phone,
      preferred_language: user.preferred_language,
      created_at: user.created_at, // the profile shows it as "member since"
      photo_updated_at: user.photo_updated_at, // null: no profile photo
    },
  };
  sendSession(req, res, USER_COOKIE, await createSession(user.id), body);
});

// POST /users/logout
router.post('/logout', requireUser, async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(req.token)]);
  if (req.tokenViaCookie) {
    clearSessionCookie(res, USER_COOKIE);
  }
  res.json({ ok: true });
});

// GET /users/me
router.get('/me', requireUser, (req, res) => {
  res.json({ user: req.user });
});

// PATCH /users/me/language   Body: { "language": "kn" }
router.patch('/me/language', requireUser, async (req, res) => {
  const language = req.body.language === 'kn' ? 'kn' : 'en';
  await pool.query('UPDATE users SET preferred_language = $1 WHERE id = $2', [language, req.user.id]);
  res.json({ language });
});

// PATCH /users/me   Body: any of { "full_name", "new_password" }, and "current_password" with a new password.
// Answers { user }. The mobile number is the account's login ID, so it is never changed here.
// A new password logs the account out everywhere else (this phone or browser stays logged in).
router.patch('/me', requireUser, async (req, res) => {
  const { full_name, new_password, current_password } = req.body;
  let name = req.user.full_name;

  if (full_name !== undefined) {
    if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 80) {
      return res.status(400).json({ error: 'name_required' });
    }
    name = full_name.trim();
  }
  if (new_password !== undefined) {
    const problem = passwordProblem(new_password, req.user.phone);
    if (problem) {
      return res.status(400).json({ error: problem });
    }
  }

  // A new password needs the current one: someone holding an unlocked phone cannot take the account over
  if (new_password !== undefined) {
    const triesName = `user:${req.user.id}`;
    if (lockedOut(req, triesName)) {
      return res.status(429).json({ error: 'too_many_tries' });
    }
    const stored = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const right =
      typeof current_password === 'string' &&
      current_password.length <= MAX_PASSWORD &&
      (await checkLogin(current_password, stored.rows[0].password_hash));
    if (!right) {
      wrongPassword(req, triesName);
      return res.status(401).json({ error: 'password_wrong' });
    }
    rightPassword(req, triesName);
  }
  const result = await pool.query(
    `UPDATE users SET full_name = $1, password_hash = COALESCE($2, password_hash) WHERE id = $3
     RETURNING id, full_name, phone, preferred_language, created_at, photo_updated_at`,
    [name, new_password === undefined ? null : await hashPassword(new_password), req.user.id]
  );
  if (new_password !== undefined) {
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, hashToken(req.token)]);
  }
  res.json({ user: result.rows[0] });
});

// POST /users/me/delete   Body: { "password": "secret123", "confirm": true } -> { deleted: true }
// "Delete account permanently". The app asks twice and the farmer ticks that they understand ("confirm"); the
// password is asked too, so someone holding an unlocked phone cannot delete the account. Only a copy of the login
// details is kept (table deleted_accounts: number, name, password hash). Then the crop history (with its crops and
// feedback) and the account are deleted, and with the account, through the database's ON DELETE CASCADE: every
// login, place, feedback, saved crop and the profile photo. The number may make a new account later.
router.post('/me/delete', requireUser, async (req, res) => {
  const { password, confirm } = req.body ?? {};
  if (confirm !== true) {
    return res.status(400).json({ error: 'confirm_required' });
  }

  // The same lock as for a new password: 5 wrong passwords and it waits 15 minutes
  const triesName = `user:${req.user.id}`;
  if (lockedOut(req, triesName)) {
    return res.status(429).json({ error: 'too_many_tries' });
  }
  const stored = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const right =
    typeof password === 'string' && password.length <= MAX_PASSWORD && (await checkLogin(password, stored.rows[0]?.password_hash));
  if (!right) {
    wrongPassword(req, triesName);
    return res.status(401).json({ error: 'password_wrong' });
  }
  rightPassword(req, triesName);

  // Both steps or neither: the copy is never kept without the account being deleted, nor the other way round
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO deleted_accounts (user_id, full_name, phone, password_hash, account_created_at)
       SELECT id, full_name, phone, password_hash, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    // The crop history first (its crops and feedback go with it): results only point at the account loosely
    // (ON DELETE SET NULL), so they are deleted here by name rather than left without an owner
    await client.query('DELETE FROM recommendations WHERE user_id = $1', [req.user.id]);
    await client.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (req.tokenViaCookie) {
    clearSessionCookie(res, USER_COOKIE);
  }
  res.json({ deleted: true });
});

// Profile photo. The app shrinks it to a small square JPEG (about 30 KB) before sending. 150 KB as base64 still fits
// the 250 KB request limit in server.js.
const MAX_PHOTO_BYTES = 150 * 1024;
const isJpeg = (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

// GET /users/me/photo -> the JPEG, or 404 when there is none
router.get('/me/photo', requireUser, async (req, res) => {
  const result = await pool.query('SELECT photo FROM users WHERE id = $1', [req.user.id]);
  const photo = result.rows[0]?.photo;
  if (!photo) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.type('image/jpeg').send(photo);
});

// PUT /users/me/photo   Body: { "image": "<JPEG as base64>" } -> { photo_updated_at }
router.put('/me/photo', requireUser, async (req, res) => {
  const { image } = req.body;
  const bytes = typeof image === 'string' ? Buffer.from(image, 'base64') : Buffer.alloc(0);
  if (!isJpeg(bytes)) {
    return res.status(400).json({ error: 'photo_invalid' });
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    return res.status(413).json({ error: 'photo_too_large' });
  }
  const result = await pool.query('UPDATE users SET photo = $1, photo_updated_at = now() WHERE id = $2 RETURNING photo_updated_at', [
    bytes,
    req.user.id,
  ]);
  res.json({ photo_updated_at: result.rows[0].photo_updated_at });
});

// DELETE /users/me/photo
router.delete('/me/photo', requireUser, async (req, res) => {
  await pool.query('UPDATE users SET photo = NULL, photo_updated_at = NULL WHERE id = $1', [req.user.id]);
  res.json({ photo_updated_at: null });
});

// GET /users/me/recommendations  -> { recommendations: the user's last 20 results, newest first, total: how many in all,
//                                     last_gps: the place of the latest result made from GPS (or null) }
// Each result has the place it was asked for (state and district as saved), its crops, best first, best_to_sow: the
// crop Home showed as best to sow (null for older results), farmer_soil: the farmer's soil test (or null),
// chosen: the crops the farmer said they will grow ("I will grow this"), feedback_crops: the crops they said how it
// went for, and feedback_given: there is feedback, and for every chosen crop (the app then stops asking, see
// lib/notices.ts). The app asks how it went only on results with a chosen crop.
router.get('/me/recommendations', requireUser, async (req, res) => {
  const result = await pool.query(
    `SELECT r.id, r.created_at, r.season, r.best_to_sow, r.farmer_soil, l.latitude, l.longitude, l.state, l.district,
            (SELECT json_agg(json_build_object('crop', i.crop, 'score', i.score) ORDER BY i.rank)
             FROM recommendation_items i WHERE i.recommendation_id = r.id) AS crops,
            (SELECT coalesce(json_agg(c.crop ORDER BY c.created_at), '[]')
             FROM chosen_crops c WHERE c.recommendation_id = r.id) AS chosen,
            (SELECT coalesce(json_agg(f.crop), '[]') FROM crop_feedback f WHERE f.recommendation_id = r.id) AS feedback_crops,
            EXISTS (SELECT 1 FROM crop_feedback f WHERE f.recommendation_id = r.id)
              AND NOT EXISTS (SELECT 1 FROM chosen_crops c WHERE c.recommendation_id = r.id
                                AND NOT EXISTS (SELECT 1 FROM crop_feedback f
                                                WHERE f.recommendation_id = r.id AND f.crop = c.crop)) AS feedback_given
     FROM recommendations r JOIN locations l ON l.id = r.location_id
     WHERE r.user_id = $1 AND r.hidden_at IS NULL
     ORDER BY r.created_at DESC
     LIMIT 20`,
    [req.user.id]
  );
  const total = await pool.query('SELECT count(*)::int AS n FROM recommendations WHERE user_id = $1 AND hidden_at IS NULL', [
    req.user.id,
  ]);
  // Profile's "Last checked": only where the farmer stood with GPS, never a district picked by hand. It changes when
  // a GPS result is made somewhere else. Results deleted from the history are left out here too.
  const lastGps = await pool.query(
    `SELECT l.latitude, l.longitude, l.state, l.district
     FROM recommendations r JOIN locations l ON l.id = r.location_id
     WHERE r.user_id = $1 AND r.hidden_at IS NULL AND r.from_gps
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [req.user.id]
  );
  res.json({ recommendations: result.rows, total: total.rows[0].n, last_gps: lastGps.rows[0] ?? null });
});

// DELETE /users/me/recommendations   Body: { "ids": ["12", "15"] } -> { deleted: how many }
// Takes the farmer's own results out of their history. They are only hidden: the admin dashboard, feedback and
// model training keep them, until the farmer's 100 newest results push them out (see routes/recommend.js).
router.delete('/me/recommendations', requireUser, async (req, res) => {
  const ids = req.body.ids;
  const valid = Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && ids.every((id) => /^\d{1,18}$/.test(String(id)));
  if (!valid) {
    return res.status(400).json({ error: 'history_invalid' });
  }
  const result = await pool.query(
    'UPDATE recommendations SET hidden_at = now() WHERE user_id = $1 AND id = ANY($2::bigint[]) AND hidden_at IS NULL',
    [req.user.id, ids.map(String)]
  );
  res.json({ deleted: result.rowCount });
});

// PUT /users/me/recommendations/12/chosen/ragi     "I will grow this": ragi is chosen from result 12 (choosing it twice
//                                                  changes nothing; several crops can be chosen)
// DELETE /users/me/recommendations/12/chosen/ragi  takes the choice back
// Both answer { chosen: the result's chosen crops, first chosen first }. Only for the farmer's own results.
async function changeChosen(req, res, choose) {
  const { id, crop } = req.params;
  if (!/^\d{1,18}$/.test(id) || !KNOWN_CROPS.has(crop)) {
    return res.status(400).json({ error: 'crop_invalid' });
  }
  const owned = await pool.query('SELECT 1 FROM recommendations WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (owned.rows.length === 0) {
    return res.status(404).json({ error: 'recommendation_not_found' });
  }
  if (choose) {
    await pool.query('INSERT INTO chosen_crops (recommendation_id, crop) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, crop]);
  } else {
    await pool.query('DELETE FROM chosen_crops WHERE recommendation_id = $1 AND crop = $2', [id, crop]);
  }
  const chosen = await pool.query('SELECT crop FROM chosen_crops WHERE recommendation_id = $1 ORDER BY created_at', [id]);
  res.json({ chosen: chosen.rows.map((row) => row.crop) });
}
router.put('/me/recommendations/:id/chosen/:crop', requireUser, (req, res) => changeChosen(req, res, true));
router.delete('/me/recommendations/:id/chosen/:crop', requireUser, (req, res) => changeChosen(req, res, false));

// "Send a request": the farmer writes to the project team (e.g. to get back a deleted result). The team answers in
// pgAdmin by filling in help_requests.reply, and the app shows the answer under the request.
const REQUEST_TOPICS = ['history', 'account', 'app', 'other'];
const MAX_REQUEST = 1000; // letters
const REQUESTS_PER_DAY = 5;

// GET /users/me/requests -> { requests: [{ id, topic, message, reply, replied_at, created_at }] }, the last 20, newest first
router.get('/me/requests', requireUser, async (req, res) => {
  const result = await pool.query(
    `SELECT id, topic, message, reply, replied_at, created_at FROM help_requests
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [req.user.id]
  );
  res.json({ requests: result.rows });
});

// POST /users/me/requests   Body: { "topic": "history", "message": "Please bring back my rice result" } -> { request }
router.post('/me/requests', requireUser, async (req, res) => {
  const { topic, message } = req.body ?? {};
  const text = typeof message === 'string' ? message.trim() : '';
  if (!REQUEST_TOPICS.includes(topic) || !text || text.length > MAX_REQUEST) {
    return res.status(400).json({ error: 'request_invalid' });
  }
  // A few a day is plenty for a farmer; more is someone filling the table
  const today = await pool.query(
    `SELECT count(*)::int AS n FROM help_requests WHERE user_id = $1 AND created_at > now() - interval '1 day'`,
    [req.user.id]
  );
  if (today.rows[0].n >= REQUESTS_PER_DAY) {
    return res.status(429).json({ error: 'request_limit' });
  }
  const result = await pool.query(
    `INSERT INTO help_requests (user_id, topic, message) VALUES ($1, $2, $3)
     RETURNING id, topic, message, reply, replied_at, created_at`,
    [req.user.id, topic, text]
  );
  res.status(201).json({ request: result.rows[0] });
});

// GET /users/me/saved -> { saved: [{ crop, created_at }] }, the crops the farmer saved with the heart, latest first
router.get('/me/saved', requireUser, async (req, res) => {
  const result = await pool.query('SELECT crop, created_at FROM saved_crops WHERE user_id = $1 ORDER BY created_at DESC', [
    req.user.id,
  ]);
  res.json({ saved: result.rows });
});

// PUT /users/me/saved/rice     saves a crop (saving it twice changes nothing)
// DELETE /users/me/saved/rice  takes it off the list
router.put('/me/saved/:crop', requireUser, async (req, res) => {
  if (!KNOWN_CROPS.has(req.params.crop)) {
    return res.status(400).json({ error: 'crop_invalid' });
  }
  await pool.query('INSERT INTO saved_crops (user_id, crop) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, req.params.crop]);
  res.json({ ok: true });
});

router.delete('/me/saved/:crop', requireUser, async (req, res) => {
  await pool.query('DELETE FROM saved_crops WHERE user_id = $1 AND crop = $2', [req.user.id, req.params.crop]);
  res.json({ ok: true });
});

module.exports = router;
