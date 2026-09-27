// Writes all farmer feedback, with the soil and climate values of the land it is about, to
// ml-service/data/raw/farmer_feedback.csv - the input of ml-service/training/retrain_with_feedback.py.
//
// Run from the backend folder:  npm run export-feedback

const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

const OUTPUT = path.join(__dirname, '../../ml-service/data/raw/farmer_feedback.csv');

// Column name in the CSV (same names as the training data) -> column in the database
const COLUMNS = {
  State: 'l.state',
  District: 'l.district',
  Latitude: 'l.latitude',
  Longitude: 'l.longitude',
  pH: 'r.ph',
  Nitrogen: 'r.nitrogen',
  Organic_Carbon: 'r.organic_carbon',
  Clay: 'r.clay',
  Sand: 'r.sand',
  CEC: 'r.cec',
  Temperature: 'r.temperature_c',
  Winter_Temperature: 'r.winter_temperature_c',
  Humidity: 'r.humidity_pct',
  Rainfall: 'r.rainfall_mm',
  Monsoon_Rain_Share: 'r.monsoon_rain_share',
  Post_Monsoon_Rain_Share: 'r.post_monsoon_rain_share',
  Dry_Months: 'r.dry_months',
  Max_Temperature: 'r.max_temperature_c',
  Solar_Radiation: 'r.solar_radiation',
  Elevation: 'r.elevation_m',
  Slope: 'r.slope_degrees',
  Crop: 'f.crop',
  Outcome: 'f.outcome',
  Created: 'f.created_at',
  Season: 'r.season', // the season the crops were recommended for (empty for results made before seasons)
  Recommended: 'r.created_at', // for those older results the date gives the season
};

function csvValue(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const select = Object.entries(COLUMNS).map(([name, column]) => `${column} AS "${name}"`).join(', ');
  const result = await pool.query(
    `SELECT ${select}
     FROM crop_feedback f
     JOIN recommendations r ON r.id = f.recommendation_id
     JOIN locations l ON l.id = r.location_id
     WHERE r.elevation_m IS NOT NULL   -- older rows lack the values the current model needs
     ORDER BY f.created_at`
  );

  const lines = [Object.keys(COLUMNS).join(',')];
  for (const row of result.rows) {
    lines.push(Object.keys(COLUMNS).map((name) => csvValue(row[name])).join(','));
  }
  fs.writeFileSync(OUTPUT, lines.join('\n') + '\n');
  console.log(`Saved ${result.rows.length} feedback rows to ${OUTPUT}`);
  await pool.end();
}

main();
