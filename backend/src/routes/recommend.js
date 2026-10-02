const express = require('express');
const pool = require('../db');
const { getClimate, getSeasonRain } = require('../services/climate');
const { getSoil } = require('../services/soil');
const { getTerrain } = require('../services/terrain');
const { predictCrops, predictForArea } = require('../services/ml');
const { cropFacts, seasonSowing } = require('../services/crop-facts');
const { findTaluk, talukByKey } = require('../services/taluk');
const { districtMiddle, isUntestedPlace } = require('../services/district');
const { normaliseDistrict } = require('../districts');
const { readSoilTest, rateSoilTest, toTotalCarbon } = require('../soil-test');
const { requireUser } = require('../auth');
const { limitRequests } = require('../rate-limit');

const router = express.Router();

// The season the farmer is planning for; without one the ML service uses the season of today's date
const SEASONS = ['Kharif', 'Rabi', 'Summer'];

// Straight-line distance in metres, rounded to 10 m (small distances, so flat-earth maths is fine)
function metresBetween(lat1, lng1, lat2, lng2) {
  const north = (lat2 - lat1) * 111_320;
  const east = (lng2 - lng1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.round(Math.hypot(north, east) / 10) * 10;
}

function cleanText(value, maxLength) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

// Works out what to check:
//  - GPS given (anywhere in India) -> that exact point ("point"). In Karnataka its taluk is looked up
//    too, for the "what farmers grow here" card; state and district are saved for reference.
//  - a Karnataka district picked by hand, and maybe one of its taluks -> that whole area ("taluk" or
//    "district"): the model averaged over all its sample farm points.
//  - a district of another state picked by hand -> the point in the middle of that district ("point" with
//    inMiddle: true). We have sample farms only for Karnataka, so this is one spot, not the whole district.
// Returns null when the location is not valid (also for a taluk that is not in the district).
function readLocation(body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const hasGps = body.lat !== undefined && body.lng !== undefined && !isNaN(lat) && !isNaN(lng);
  const state = cleanText(body.state, 60);

  if (hasGps && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    const district = !state || state === 'Karnataka' ? normaliseDistrict(body.district) : cleanText(body.district, 80);
    const taluk = state === 'Karnataka' ? findTaluk(lat, lng, district) : null;
    return { area: 'point', lat, lng, state, district, taluk };
  }

  if (!hasGps && state && state !== 'Karnataka') {
    const middle = districtMiddle(state, cleanText(body.district, 80));
    return middle && { area: 'point', ...middle, state, district: cleanText(body.district, 80), taluk: null, inMiddle: true };
  }

  const district = normaliseDistrict(body.district);
  if (hasGps || !district) {
    return null;
  }
  if (!body.taluk) {
    return { area: 'district', state: 'Karnataka', district, taluk: null };
  }
  const taluk = talukByKey(String(body.taluk));
  return taluk && taluk.district === district ? { area: 'taluk', state: 'Karnataka', district, taluk } : null;
}

// GPS: soil, climate and terrain of that exact point, then the model.
// Returns null when the soil map has nothing there (water, city centre).
// taluk: the farm's Karnataka taluk key (or undefined): the ML service orders the season's crops by what it grows
async function predictForPoint(lat, lng, soilTest, season, taluk) {
  // Long-term climate (NASA POWER, 20-year average), soil for this exact point (SoilGrids) and the
  // shape of the land (Open-Meteo elevation map). Three different servers, so all at once.
  const [climate, soil, terrain] = await Promise.all([getClimate(lat, lng), getSoil(lat, lng), getTerrain(lat, lng)]);
  if (!soil) {
    return null;
  }
  // The features the model needs. The farmer's own pH and organic carbon win over the soil map
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
  return {
    lat,
    lng,
    features,
    // own_ph: the pH is the farmer's own soil test, so crops that cannot grow at that pH go down the list
    prediction: await predictCrops({ ...features, season, lat, lng, taluk, own_ph: soilTest?.ph !== undefined }),
    soilProfileId: soil.id,
    source: 'NASA POWER 2001-2020 climatology',
    // How far away the soil values were read, when the exact spot is a road, roof or water
    soilMetresAway: metresBetween(lat, lng, Number(soil.latitude), Number(soil.longitude)),
  };
}

// District or taluk picked by hand: the model over all the area's sample points (ML service). The
// features shown and saved are the area's typical values - the median of those points - and the
// location saved is the sample point nearest the area's middle.
async function predictForPickedArea(district, taluk, soilTest, season) {
  const ownSoil = {};
  if (soilTest?.ph !== undefined) {
    ownSoil.pH = soilTest.ph;
  }
  if (soilTest?.organic_carbon_pct !== undefined) {
    ownSoil.Organic_Carbon = toTotalCarbon(soilTest.organic_carbon_pct);
  }
  const prediction = await predictForArea(district, taluk?.key, ownSoil, season);
  return {
    ...prediction.centre,
    features: prediction.typical_features,
    prediction,
    soilProfileId: null,
    source: `Median of ${prediction.sample_points} sample farms in the ${taluk ? 'taluk' : 'district'} (SoilGrids, NASA POWER 2001-2020)`,
    soilMetresAway: null,
  };
}

// POST /recommend
// Body: { "lat": 12.76, "lng": 75.20, "state": "Karnataka", "district": "DAKSHIN KANNAD" }
//   or a Karnataka district picked by hand: { "district": "MYSORE" }, optionally with a taluk key: "taluk": "26:3"
//   or a district of another state picked by hand: { "state": "Kerala", "district": "Wayanad" }
// Optional, the farmer's own soil test: "soil_test": { "ph": 6.5, "organic_carbon_pct": 0.6, "n": 250, "p": 12, "k": 180 }
// Optional, the season to sow in: "season": "Kharif" | "Rabi" | "Summer" (default: the season of today's date)
// A recommendation asks three outside services and the model, so it needs a login and is limited per farmer
router.post('/', requireUser, limitRequests(30, 60, (req) => req.user.id), async (req, res) => {
  const place = readLocation(req.body);
  if (!place) {
    return res.status(400).json({ error: 'location_invalid' });
  }
  const soilTest = readSoilTest(req.body.soil_test);
  if (soilTest === 'invalid') {
    return res.status(400).json({ error: 'soil_test_invalid' });
  }
  const season = req.body.season ?? undefined;
  if (season !== undefined && !SEASONS.includes(season)) {
    return res.status(400).json({ error: 'season_invalid' });
  }
  const { area, state, district, taluk, inMiddle } = place;

  try {
    // 1-4. Features and the model's answer, for the exact point or for the picked area
    const result =
      area === 'point'
        ? await predictForPoint(place.lat, place.lng, soilTest, season, taluk?.key)
        : await predictForPickedArea(district, taluk, soilTest, season);
    if (!result) {
      return res.status(404).json({ error: 'no_soil_data' });
    }
    const { lat, lng, features, prediction } = result;
    // This season's rain, asked for now so it arrives while the result is being saved
    const seasonRain = getSeasonRain(lat, lng);

    // 5. Save everything so we can look at it later
    const userId = req.user.id;

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
          climate_source, model_version, farmer_soil, season)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22, $23, $24) RETURNING id`,
      [
        userId, location.rows[0].id, result.soilProfileId,
        features.pH, features.Nitrogen, features.Organic_Carbon, features.Clay, features.Sand, features.CEC,
        features.Temperature, features.Winter_Temperature, features.Humidity, features.Rainfall,
        features.Monsoon_Rain_Share, features.Post_Monsoon_Rain_Share, features.Dry_Months,
        features.Max_Temperature, features.Solar_Radiation, features.Elevation, features.Slope,
        result.source, prediction.model_version, soilTest, prediction.season,
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
      // area: 'point' (GPS), 'taluk' or 'district' (picked by hand)
      area,
      // true when there are no crop statistics for this district: the answer comes from the soil and climate
      // alone and could not be checked against what farmers grow there
      untested_place: area === 'point' && isUntestedPlace(lat, lng),
      // true when the farmer picked a district outside Karnataka: the answer is for one spot in its middle
      district_middle: inMiddle === true,
      location: { lat, lng, state, district, taluk: taluk?.name ?? null },
      features,
      model_version: prediction.model_version,
      // The season the crops are for: Kharif, Rabi or Summer
      season: prediction.season,
      // Share of the district's field crops sown in that season (government statistics); small in summer
      // almost everywhere, so the app can say that little is sown then. null when unknown.
      season_sown_share: prediction.season_sown_share ?? null,
      recommendations: prediction.recommendations,
      // The season's top field crops, apart from plantation crops and fruit trees that stand all year
      sow_this_season: prediction.sow_this_season ?? [],
      // When the top crop stands all year, the season's best crop to sow (the app's headline), with its own SHAP
      season_best: prediction.season_best ?? null,
      // Every crop the model knows, in order, each with how the land suits it (FAO EcoCrop needs)
      all_crops: prediction.all_crops ?? [],
      // Herbs, spices and plantation crops the model does not know that suit the land by their needs
      other_crops: prediction.other_crops ?? [],
      rain_checked_mm: prediction.rain_checked_mm ?? null,
      rain_source: prediction.rain_source ?? null,
      top_crop_reliability: prediction.top_crop_reliability,
      soil_test: soilTest,
      soil_ratings: soilTest ? rateSoilTest(soilTest) : null,
      soil_read_metres_away: result.soilMetresAway,
      // Picked area: how many sample farms the answer is averaged over (null for GPS)
      sample_points: area === 'point' ? null : prediction.sample_points,
      // Picked taluk: how much its own farms counted, 0-1; the rest is its district (null otherwise).
      // 0 when the taluk has no census figures: the answer is then the district's.
      taluk_weight: area === 'taluk' ? prediction.taluk_weight : null,
      // What farmers really grow most in this taluk (GPS, or picked) or district, from government data
      crop_facts: cropFacts({ state, district, talukKey: taluk?.key ?? null }),
      // What the district sowed most in this season (Karnataka crop survey), to compare with the model
      season_sowing: seasonSowing({ state, district, season: prediction.season }),
      // This monsoon's rain so far against normal (null outside June-November), for the app's water check
      season_rain: await seasonRain,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
