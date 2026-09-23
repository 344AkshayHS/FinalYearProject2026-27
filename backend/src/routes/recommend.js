const express = require('express');
const pool = require('../db');
const { getClimate } = require('../services/climate');
const { getSoil } = require('../services/soil');
const { getTerrain } = require('../services/terrain');
const { predictCrops } = require('../services/ml');
const { normaliseDistrict } = require('../districts');
const { readSoilTest, rateSoilTest, toTotalCarbon } = require('../soil-test');
const DISTRICT_POINTS = require('../../data/district_points.json');

const router = express.Router();

// Straight-line distance in metres, rounded to 10 m (small distances, so flat-earth maths is fine)
function metresBetween(lat1, lng1, lat2, lng2) {
  const north = (lat2 - lat1) * 111_320;
  const east = (lng2 - lng1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.round(Math.hypot(north, east) / 10) * 10;
}

function cleanText(value, maxLength) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

// Works out which point to check:
//  - GPS given (anywhere in India) -> that exact point; state and district are only saved for reference
//  - only a Karnataka district picked by hand -> a sample farm point in that district
function readLocation(body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const hasGps = body.lat !== undefined && body.lng !== undefined && !isNaN(lat) && !isNaN(lng);
  const state = cleanText(body.state, 60);

  if (hasGps && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    const district = !state || state === 'Karnataka' ? normaliseDistrict(body.district) : cleanText(body.district, 80);
    return { lat, lng, state, district };
  }

  const district = normaliseDistrict(body.district);
  if (!hasGps && district) {
    return { ...DISTRICT_POINTS[district], state: 'Karnataka', district };
  }
  return null;
}

// POST /recommend
// Body: { "lat": 12.76, "lng": 75.20, "state": "Karnataka", "district": "DAKSHIN KANNAD" }
//   or just a Karnataka district: { "district": "MYSORE" }
// Optional, the farmer's own soil test: "soil_test": { "ph": 6.5, "organic_carbon_pct": 0.6, "n": 250, "p": 12, "k": 180 }
router.post('/', async (req, res) => {
  const place = readLocation(req.body);
  if (!place) {
    return res.status(400).json({ error: 'location_invalid' });
  }
  const soilTest = readSoilTest(req.body.soil_test);
  if (soilTest === 'invalid') {
    return res.status(400).json({ error: 'soil_test_invalid' });
  }
  const { lat, lng, state, district } = place;

  try {
    // 1 + 2. Long-term climate (NASA POWER, 20-year average), soil for this exact point (SoilGrids)
    // and the shape of the land (Open-Meteo elevation map). Three different servers, so all at once.
    const [climate, soil, terrain] = await Promise.all([getClimate(lat, lng), getSoil(lat, lng), getTerrain(lat, lng)]);
    if (!soil) {
      return res.status(404).json({ error: 'no_soil_data' });
    }

    // 3. The features the model needs. The farmer's own pH and organic carbon win over the soil map
    const features = {
      pH: soilTest?.ph ?? Number(soil.ph),
      Nitrogen: Number(soil.nitrogen),
      Organic_Carbon:
        soilTest?.organic_carbon_pct !== undefined ? toTotalCarbon(soilTest.organic_carbon_pct) : Number(soil.organic_carbon),
      Clay: Number(soil.clay),
      Sand: Number(soil.sand),
      CEC: Number(soil.cec),
      ...climate,
      ...terrain,
    };

    // 4. Ask the ML service for crop predictions
    const prediction = await predictCrops(features);

    // 5. Save everything so we can look at it later
    // user is null when nobody is logged in
    const userId = req.user ? req.user.id : null;

    const location = await pool.query(
      `INSERT INTO locations (user_id, latitude, longitude, state, district)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, lat, lng, state, district]
    );

    const recommendation = await pool.query(
      `INSERT INTO recommendations
         (user_id, location_id, soil_profile_id, ph, nitrogen, organic_carbon, clay, sand, cec,
          temperature_c, winter_temperature_c, humidity_pct, rainfall_mm, monsoon_rain_share,
          post_monsoon_rain_share, dry_months, max_temperature_c, solar_radiation,
          elevation_m, slope_degrees,
          climate_source, model_version, farmer_soil)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22, $23) RETURNING id`,
      [
        userId, location.rows[0].id, soil.id,
        features.pH, features.Nitrogen, features.Organic_Carbon, features.Clay, features.Sand, features.CEC,
        features.Temperature, features.Winter_Temperature, features.Humidity, features.Rainfall,
        features.Monsoon_Rain_Share, features.Post_Monsoon_Rain_Share, features.Dry_Months,
        features.Max_Temperature, features.Solar_Radiation, features.Elevation, features.Slope,
        'NASA POWER 2001-2020 climatology', prediction.model_version, soilTest,
      ]
    );
    const recommendationId = recommendation.rows[0].id;

    for (let i = 0; i < prediction.recommendations.length; i++) {
      const item = prediction.recommendations[i];
      await pool.query(
        `INSERT INTO recommendation_items
           (recommendation_id, rank, crop, probability, score, confident, shap_values, lime_weights)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [recommendationId, i + 1, item.crop, item.probability, item.score, item.confident, item.shap, item.lime]
      );
    }

    // 6. Send the result back to the app
    res.json({
      recommendation_id: recommendationId,
      location: { lat, lng, state, district },
      features,
      model_version: prediction.model_version,
      recommendations: prediction.recommendations,
      top_crop_reliability: prediction.top_crop_reliability,
      soil_test: soilTest,
      soil_ratings: soilTest ? rateSoilTest(soilTest) : null,
      // How far away the soil values were read, when the exact spot is a road, roof or water
      soil_read_metres_away: metresBetween(lat, lng, Number(soil.latitude), Number(soil.longitude)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
