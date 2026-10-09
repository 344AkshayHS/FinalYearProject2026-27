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
const { lockedOut, wrongPassword, rightPassword } = require('../rate-limit');
const { KNOWN_CROPS } = require('../services/crop-photos');

const router = express.Router();

// The password is hashed with scrypt, which takes real time, so a huge password would be a cheap way to slow the server
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

// POST /users/register
// Body: { "full_name": "Ravi", "phone": "9876543210", "password": "secret123", "language": "kn" }
// The phone app gets { token, user }; the website (header "X-Client: web") gets { user } and a cookie.
router.post('/register', async (req, res) => {
  const { full_name, phone, password } = req.body;
  const language = req.body.language === 'kn' ? 'kn' : 'en';

  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 80) {
    return res.status(400).json({ error: 'name_required' });
  }
  if (typeof phone !== 'string' || !/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: 'phone_invalid' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: 'password_short' });
  }
  if (password.length > MAX_PASSWORD) {
    return res.status(400).json({ error: 'password_long' });
  }

  const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'phone_taken' });
  }

  const result = await pool.query(
    `INSERT INTO users (full_name, phone, password_hash, preferred_language)
     VALUES ($1, $2, $3, $4)
     RETURNING id, full_name, phone, preferred_language, created_at, photo_updated_at`,
    [full_name.trim(), phone, await hashPassword(password), language]
  );
  const user = result.rows[0];
  sendSession(req, res, USER_COOKIE, await createSession(user.id), { user }, 201);
});

// POST /users/login
// Body: { "phone": "9876543210", "password": "secret123" }
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
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
    if (typeof new_password !== 'string' || new_password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: 'password_short' });
    }
    if (new_password.length > MAX_PASSWORD) {
      return res.status(400).json({ error: 'password_long' });
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

// GET /users/me/recommendations  -> { recommendations: the user's last 20 results, newest first, total: how many in all }
// Each result has the place it was asked for (state and district as saved) and its crops, best first.
router.get('/me/recommendations', requireUser, async (req, res) => {
  const result = await pool.query(
    `SELECT r.id, r.created_at, r.season, l.latitude, l.longitude, l.state, l.district,
            (SELECT json_agg(json_build_object('crop', i.crop, 'score', i.score) ORDER BY i.rank)
             FROM recommendation_items i WHERE i.recommendation_id = r.id) AS crops
     FROM recommendations r JOIN locations l ON l.id = r.location_id
     WHERE r.user_id = $1 AND r.hidden_at IS NULL
     ORDER BY r.created_at DESC
     LIMIT 20`,
    [req.user.id]
  );
  const total = await pool.query('SELECT count(*)::int AS n FROM recommendations WHERE user_id = $1 AND hidden_at IS NULL', [
    req.user.id,
  ]);
  res.json({ recommendations: result.rows, total: total.rows[0].n });
});

// DELETE /users/me/recommendations   Body: { "ids": ["12", "15"] } -> { deleted: how many }
// Takes the farmer's own results out of their history. They are only hidden: the admin dashboard, feedback and
// model training keep every result.
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
