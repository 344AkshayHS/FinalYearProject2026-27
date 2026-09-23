const pool = require('../db');
const { giveUpAfter } = require('./timeout');

// Gets the long-term climate of a GPS point (NASA POWER 20-year climatology, 2001-2020 -
// the same numbers the model was trained on).
// These averages never change, so if we already made a recommendation within about 1 km
// we reuse the climate saved with it. Otherwise we ask the ML service, which asks NASA POWER.
async function getClimate(lat, lng) {
  const saved = await pool.query(
    `SELECT r.temperature_c, r.winter_temperature_c, r.humidity_pct, r.rainfall_mm, r.monsoon_rain_share,
            r.post_monsoon_rain_share, r.dry_months, r.max_temperature_c, r.solar_radiation
     FROM recommendations r
     JOIN locations l ON l.id = r.location_id
     WHERE r.post_monsoon_rain_share IS NOT NULL
       AND abs(l.latitude - $1) < 0.009 AND abs(l.longitude - $2) < 0.009
     LIMIT 1`,
    [lat, lng]
  );
  if (saved.rows.length > 0) {
    const row = saved.rows[0];
    return {
      Temperature: Number(row.temperature_c),
      Winter_Temperature: Number(row.winter_temperature_c),
      Humidity: Number(row.humidity_pct),
      Rainfall: Number(row.rainfall_mm),
      Monsoon_Rain_Share: Number(row.monsoon_rain_share),
      Post_Monsoon_Rain_Share: Number(row.post_monsoon_rain_share),
      Dry_Months: Number(row.dry_months),
      Max_Temperature: Number(row.max_temperature_c),
      Solar_Radiation: Number(row.solar_radiation),
    };
  }

  const response = await fetch(`${process.env.ML_SERVICE_URL}/climate?lat=${lat}&lng=${lng}`, {
    signal: giveUpAfter('climate'),
  });
  if (!response.ok) {
    throw new Error('Climate lookup failed with status ' + response.status);
  }
  return response.json();
}

module.exports = { getClimate };
