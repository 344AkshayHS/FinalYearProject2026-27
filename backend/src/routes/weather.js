const express = require('express');
const { requireUser } = require('../auth');
const { LIMITS, limitRequests } = require('../rate-limit');
const { districtMiddle } = require('../services/district');

const router = express.Router();

// Both answers come from Open-Meteo (free, no key). It does not need to know who asks: only the place is sent.
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

function readPoint(query) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (query.lat === undefined || query.lng === undefined || isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat, lng };
}

async function askOpenMeteo(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    throw new Error('Open-Meteo failed with status ' + response.status);
  }
  return response.json();
}

// GET /weather/today?lat=13.34&lng=74.75
// Today's forecast for the daily water advice:
// -> { "date": "2026-09-18", "et0_mm": 4.6, "rain_mm": 1.0, "humidity_pct": 84 }
// et0_mm is the FAO reference evaporation: how much water a short green crop would use today.
router.get('/today', requireUser, async (req, res) => {
  const point = readPoint(req.query);
  if (!point) {
    return res.status(400).json({ error: 'location_invalid' });
  }

  const url =
    OPEN_METEO +
    `?latitude=${point.lat}&longitude=${point.lng}&forecast_days=1&timezone=auto` +
    '&daily=et0_fao_evapotranspiration,precipitation_sum,relative_humidity_2m_mean';
  try {
    const { daily } = await askOpenMeteo(url);
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

// GET /weather/now?lat=12.87&lng=74.88            (the farmer's GPS point)
// GET /weather/now?state=Karnataka&district=MYSORE (a district picked by hand: the point in its middle)
// The weather card on the home screen: the weather right now and the next three days.
// -> { "in_middle": false,
//      "now": { "time": "2026-10-04T18:45", "temperature_c": 28.6, "feels_like_c": 34.2, "humidity_pct": 74,
//               "wind_kmh": 1, "rain_mm": 0, "code": 3, "is_day": false },
//      "days": [ { "date": "2026-10-04", "code": 51, "max_c": 32.4, "min_c": 25.4, "rain_mm": 0.7, "rain_chance_pct": 100 }, ... ] }
// "code" is the WMO weather code (0 = clear sky, 61 = rain, 95 = thunderstorm); the app turns it into words.
// rain_chance_pct can be null: the forecast does not have it for every place.
router.get('/now', requireUser, limitRequests(LIMITS.weatherPerHour, 60, (req) => req.user.id), async (req, res) => {
  let point = readPoint(req.query);
  const inMiddle = !point;
  if (!point && typeof req.query.state === 'string' && typeof req.query.district === 'string') {
    point = districtMiddle(req.query.state.slice(0, 60), req.query.district.slice(0, 80));
  }
  if (!point) {
    return res.status(400).json({ error: 'location_invalid' });
  }

  const url =
    OPEN_METEO +
    `?latitude=${point.lat}&longitude=${point.lng}&forecast_days=3&timezone=auto` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max';
  try {
    const { current, daily } = await askOpenMeteo(url);
    res.json({
      in_middle: inMiddle,
      now: {
        time: current.time,
        temperature_c: current.temperature_2m,
        feels_like_c: current.apparent_temperature,
        humidity_pct: current.relative_humidity_2m,
        wind_kmh: current.wind_speed_10m,
        rain_mm: current.precipitation,
        code: current.weather_code,
        is_day: current.is_day === 1,
      },
      days: daily.time.map((date, i) => ({
        date,
        code: daily.weather_code[i],
        max_c: daily.temperature_2m_max[i],
        min_c: daily.temperature_2m_min[i],
        rain_mm: daily.precipitation_sum[i],
        rain_chance_pct: daily.precipitation_probability_max[i] ?? null,
      })),
    });
  } catch (err) {
    console.error('Weather now failed:', err.message);
    res.status(502).json({ error: 'weather_unavailable' });
  }
});

module.exports = router;
