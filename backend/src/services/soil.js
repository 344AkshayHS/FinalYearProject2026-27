const pool = require('../db');
const { giveUpAfter } = require('./timeout');

// About 550 m in each direction: the soil map has no values over water, roads and built-up land,
// so if the farmer is standing on one of those we read the nearest farmland around them.
const STEP = 0.005;
const NEARBY = [
  [STEP, 0],
  [-STEP, 0],
  [0, STEP],
  [0, -STEP],
];

async function readFromMap(lat, lng) {
  const response = await fetch(`${process.env.ML_SERVICE_URL}/soil?lat=${lat}&lng=${lng}`, {
    signal: giveUpAfter('soil'),
  });
  if (response.status === 404) {
    return null; // no soil data at this point, e.g. sea, road or town
  }
  if (!response.ok) {
    throw new Error('Soil lookup failed with status ' + response.status);
  }
  return response.json();
}

// Gets the soil at a GPS point.
// First looks for a saved SoilGrids result within 1 km; if there is none, asks the ML service to
// read SoilGrids and saves the answer for next time. The row it returns carries the point the
// values really came from, so the app can say when they are from just beside the farmer.
async function getSoil(lat, lng) {
  const saved = await pool.query(
    `SELECT id, latitude, longitude, ph, nitrogen, organic_carbon, clay, sand, cec
     FROM soil_profiles
     WHERE abs(latitude - $1) < 0.009 AND abs(longitude - $2) < 0.009
     LIMIT 1`,
    [lat, lng]
  );
  if (saved.rows.length > 0) {
    return saved.rows[0];
  }

  let point = { lat, lng };
  let soil = await readFromMap(lat, lng);
  for (const [dlat, dlng] of NEARBY) {
    if (soil) {
      break;
    }
    point = { lat: Number((lat + dlat).toFixed(5)), lng: Number((lng + dlng).toFixed(5)) };
    soil = await readFromMap(point.lat, point.lng);
  }
  if (!soil) {
    return null; // nothing within about 550 m either: open water or the middle of a city
  }

  const inserted = await pool.query(
    `INSERT INTO soil_profiles (latitude, longitude, ph, nitrogen, organic_carbon, clay, sand, cec, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ISRIC SoilGrids v2.0')
     RETURNING id, latitude, longitude, ph, nitrogen, organic_carbon, clay, sand, cec`,
    [point.lat, point.lng, soil.pH, soil.Nitrogen, soil.Organic_Carbon, soil.Clay, soil.Sand, soil.CEC]
  );
  return inserted.rows[0];
}

module.exports = { getSoil };
