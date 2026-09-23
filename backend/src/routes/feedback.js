const express = require('express');
const pool = require('../db');
const { requireUser } = require('../auth');

const router = express.Router();

const OUTCOMES = ['good', 'average', 'poor'];

// POST /feedback
// Body: { "recommendation_id": 12, "crop": "ragi", "outcome": "good", "note": "..." }
// "I grew this crop on the land I checked, and it went good / average / poor".
// Sending feedback again for the same crop and result replaces the old one.
router.post('/', requireUser, async (req, res) => {
  const { recommendation_id: recommendationId, crop, outcome, note } = req.body;
  const valid =
    Number.isInteger(recommendationId) &&
    typeof crop === 'string' &&
    /^[a-z ()]{2,40}$/.test(crop) &&
    OUTCOMES.includes(outcome) &&
    (note === undefined || note === null || (typeof note === 'string' && note.length <= 500));
  if (!valid) {
    return res.status(400).json({ error: 'feedback_invalid' });
  }

  try {
    // Only for the farmer's own results
    const owned = await pool.query('SELECT 1 FROM recommendations WHERE id = $1 AND user_id = $2', [
      recommendationId,
      req.user.id,
    ]);
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'recommendation_not_found' });
    }

    await pool.query(
      `INSERT INTO crop_feedback (user_id, recommendation_id, crop, outcome, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (recommendation_id, crop) DO UPDATE SET outcome = $4, note = $5, created_at = now()`,
      [req.user.id, recommendationId, crop, outcome, note?.trim() || null]
    );
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
