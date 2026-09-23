const express = require('express');
const pool = require('../db');
const { hashPassword, checkPassword, createSession, requireUser } = require('../auth');
const { lockedOut, wrongPassword, rightPassword } = require('../rate-limit');

const router = express.Router();

// POST /users/register
// Body: { "full_name": "Ravi", "phone": "9876543210", "password": "secret12", "language": "kn" }
router.post('/register', async (req, res) => {
  const { full_name, phone, password } = req.body;
  const language = req.body.language === 'kn' ? 'kn' : 'en';

  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ error: 'name_required' });
  }
  if (!/^[6-9]\d{9}$/.test(phone || '')) {
    return res.status(400).json({ error: 'phone_invalid' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'password_short' });
  }

  const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'phone_taken' });
  }

  const result = await pool.query(
    `INSERT INTO users (full_name, phone, password_hash, preferred_language)
     VALUES ($1, $2, $3, $4)
     RETURNING id, full_name, phone, preferred_language`,
    [full_name.trim(), phone, hashPassword(password), language]
  );
  const user = result.rows[0];
  const token = await createSession(user.id);
  res.status(201).json({ token, user });
});

// POST /users/login
// Body: { "phone": "9876543210", "password": "secret12" }
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (lockedOut(req, phone || '')) {
    return res.status(429).json({ error: 'too_many_tries' });
  }

  const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone || '']);
  const user = result.rows[0];

  if (!user || !checkPassword(password || '', user.password_hash)) {
    wrongPassword(req, phone || '');
    return res.status(401).json({ error: 'login_failed' });
  }

  rightPassword(req, phone || '');
  const token = await createSession(user.id);
  res.json({
    token,
    user: { id: user.id, full_name: user.full_name, phone: user.phone, preferred_language: user.preferred_language },
  });
});

// POST /users/logout
router.post('/logout', requireUser, async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE token = $1', [req.token]);
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
    `SELECT r.id, r.created_at, l.latitude, l.longitude,
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
