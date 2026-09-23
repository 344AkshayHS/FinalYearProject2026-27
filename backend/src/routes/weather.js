const express = require('express');
const { requireUser } = require('../auth');

const router = express.Router();

// GET /weather/today?lat=13.34&lng=74.75
// Today's forecast for the daily water advice, from Open-Meteo (free, no key):
// -> { "date": "2026-09-18", "et0_mm": 4.6, "rain_mm": 1.0, "humidity_pct": 84 }
// et0_mm is the FAO reference evaporation: how much water a short green crop would use today.
router.get('/today', requireUser, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (req.query.lat === undefined || req.query.lng === undefined || isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'location_invalid' });
  }

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lng}&forecast_days=1&timezone=auto` +
    '&daily=et0_fao_evapotranspiration,precipitation_sum,relative_humidity_2m_mean';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      throw new Error('Open-Meteo failed with status ' + response.status);
    }
    const { daily } = await response.json();
    res.json({
      date: daily.time[0],
      et0_mm: daily.et0_fao_evapotranspiration[0],
      rain_mm: daily.precipitation_sum[0],
      humidity_pct: daily.relative_humidity_2m_mean[0],
    });
  } catch (err) {
    console.error('Weather forecast failed:', err.message);
    res.status(502).json({ error: 'weather_unavailable' });
  }
});

module.exports = router;
