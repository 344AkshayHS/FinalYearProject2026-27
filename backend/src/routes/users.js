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
     RETURNING id, full_name, phone, preferred_language`,
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
    user: { id: user.id, full_name: user.full_name, phone: user.phone, preferred_language: user.preferred_language },
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

// GET /users/me/recommendations  -> the user's last 20 results, newest first
router.get('/me/recommendations', requireUser, async (req, res) => {
  const result = await pool.query(
    `SELECT r.id, r.created_at, r.season, l.latitude, l.longitude,
            (SELECT json_agg(json_build_object('crop', i.crop, 'score', i.score) ORDER BY i.rank)
             FROM recommendation_items i WHERE i.recommendation_id = r.id) AS crops
     FROM recommendations r JOIN locations l ON l.id = r.location_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC
     LIMIT 20`,
    [req.user.id]
  );
  res.json({ recommendations: result.rows });
});

module.exports = router;
