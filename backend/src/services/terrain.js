const pool = require('../db');
const { giveUpAfter } = require('./timeout');

// Gets the height above sea level and the steepness of a GPS point, through the ML service
// (Open-Meteo elevation map - the same numbers the model was trained on).
// The land does not change, so if we already made a recommendation within about 1 km we reuse
// the values saved with it.
async function getTerrain(lat, lng) {
  const saved = await pool.query(
    `SELECT r.elevation_m, r.slope_degrees
     FROM recommendations r
     JOIN locations l ON l.id = r.location_id
     WHERE r.elevation_m IS NOT NULL
       AND abs(l.latitude - $1) < 0.009 AND abs(l.longitude - $2) < 0.009
     LIMIT 1`,
    [lat, lng]
  );
  if (saved.rows.length > 0) {
    return { Elevation: Number(saved.rows[0].elevation_m), Slope: Number(saved.rows[0].slope_degrees) };
  }

  const response = await fetch(`${process.env.ML_SERVICE_URL}/terrain?lat=${lat}&lng=${lng}`, {
    signal: giveUpAfter('terrain'),
  });
  if (!response.ok) {
    throw new Error('Terrain lookup failed with status ' + response.status);
  }
  return response.json();
}

module.exports = { getTerrain };
