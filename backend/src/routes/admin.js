const express = require('express');
const pool = require('../db');
const { checkPassword, createAdminSession, requireAdmin } = require('../auth');
const { lockedOut, wrongPassword, rightPassword } = require('../rate-limit');
const { giveUpAfter } = require('../services/timeout');

const router = express.Router();

// POST /admin/login   { "username": "...", "password": "..." } -> { "token": "..." }
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'admin_login_failed' });
  }
  if (lockedOut(req, username)) {
    return res.status(429).json({ error: 'too_many_tries' });
  }
  try {
    const result = await pool.query('SELECT id, password_hash FROM admins WHERE username = $1', [username.trim()]);
    const admin = result.rows[0];
    if (!admin || !checkPassword(password, admin.password_hash)) {
      wrongPassword(req, username);
      return res.status(401).json({ error: 'admin_login_failed' });
    }
    rightPassword(req, username);
    res.json({ token: await createAdminSession(admin.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/logout', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM admin_sessions WHERE token = $1', [req.adminToken]);
  res.json({ ok: true });
});

// Is each part of the system working right now? Checked live on every call.
async function serviceStatus() {
  const status = {};

  try {
    await pool.query('SELECT 1');
    status.database = { ok: true, detail: 'PostgreSQL connected' };
  } catch (err) {
    status.database = { ok: false, detail: err.message };
  }

  try {
    const response = await fetch(process.env.ML_SERVICE_URL + '/', { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    status.ml_service = { ok: response.ok, detail: `${data.status} (model ${data.model})` };
  } catch (err) {
    status.ml_service = { ok: false, detail: 'Not reachable at ' + process.env.ML_SERVICE_URL };
  }

  // Only checks the key is set; calling Gemini here would use up the free daily limit
  status.gemini = process.env.GEMINI_API_KEY
    ? { ok: true, detail: `Key set, model ${process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'}` }
    : { ok: false, detail: 'No GEMINI_API_KEY: the chat uses rule-based answers only' };

  return status;
}

// What the app has done: counts and the latest results, straight from the database
async function activity() {
  const count = async (table) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
  const topCrops = await pool.query(
    `SELECT crop, count(*)::int AS times FROM recommendation_items WHERE rank = 1
     GROUP BY crop ORDER BY times DESC LIMIT 10`
  );
  const feedback = await pool.query('SELECT outcome, count(*)::int AS times FROM crop_feedback GROUP BY outcome');
  const recent = await pool.query(
    `SELECT r.id, r.created_at, r.model_version, l.state, l.district, i.crop, i.probability,
            r.farmer_soil IS NOT NULL AS used_soil_test
     FROM recommendations r
     JOIN locations l ON l.id = r.location_id
     LEFT JOIN recommendation_items i ON i.recommendation_id = r.id AND i.rank = 1
     ORDER BY r.created_at DESC LIMIT 20`
  );
  return {
    users: await count('users'),
    recommendations: await count('recommendations'),
    feedback: await count('crop_feedback'),
    soil_places_cached: await count('soil_profiles'),
    top_crops: topCrops.rows,
    feedback_by_outcome: feedback.rows,
    recent: recent.rows,
  };
}

// GET /admin/overview -> { services, activity, report }
router.get('/overview', requireAdmin, async (req, res) => {
  try {
    const services = await serviceStatus();
    let report = null;
    if (services.ml_service.ok) {
      const response = await fetch(process.env.ML_SERVICE_URL + '/report', { signal: giveUpAfter('report') });
      report = response.ok ? await response.json() : null;
    }
    res.json({ admin: req.admin.username, services, activity: await activity(), report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /admin/recommendations/12 -> every step of one recommendation: where, soil, climate, model output
router.get('/recommendations/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'recommendation_not_found' });
  }
  try {
    const found = await pool.query(
      `SELECT r.*, l.latitude, l.longitude, l.state, l.district,
              s.ph AS map_ph, s.organic_carbon AS map_organic_carbon, s.source AS soil_source
       FROM recommendations r
       JOIN locations l ON l.id = r.location_id
       LEFT JOIN soil_profiles s ON s.id = r.soil_profile_id
       WHERE r.id = $1`,
      [id]
    );
    if (found.rows.length === 0) {
      return res.status(404).json({ error: 'recommendation_not_found' });
    }
    const items = await pool.query(
      `SELECT rank, crop, probability, confident, shap_values, lime_weights
       FROM recommendation_items WHERE recommendation_id = $1 ORDER BY rank`,
      [id]
    );
    const feedback = await pool.query('SELECT crop, outcome, note, created_at FROM crop_feedback WHERE recommendation_id = $1', [id]);
    res.json({ recommendation: found.rows[0], items: items.rows, feedback: feedback.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
