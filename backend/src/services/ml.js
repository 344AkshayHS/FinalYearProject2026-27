// Sends the model's features (soil, climate and terrain) to the Python ML service
// and returns its prediction.
//
// Expected response from the ML service:
// {
//   "model_version": "rf-india-2.1",
//   "season": "Kharif",
//   "recommendations": [
//     { "crop": "rice", "probability": 0.62, "score": 62, "confident": true, "shap": {...}, "lime": {...} },
//     ...
//   ]
// }
//
// For a Karnataka district (or one of its taluks) picked by hand, predictForArea asks /predict_district
// instead: the model averaged over all the area's sample points. Its response also has
// "typical_features" (the median of those points, which the explanation is for), "sample_points" and
// "centre" (the sample point nearest the area's middle).

const { giveUpAfter } = require('./timeout');

async function askMlService(path, body) {
  const response = await fetch(process.env.ML_SERVICE_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: giveUpAfter('predict'),
  });

  if (!response.ok) {
    throw new Error('ML service failed with status ' + response.status);
  }
  return response.json();
}

function predictCrops(features) {
  return askMlService('/predict', features);
}

// taluk: a taluk key (see ./taluk.js) or undefined for the whole district
// ownSoil: the farmer's soil test values that replace the soil map, { pH, Organic_Carbon } (either may be missing)
// season: 'Kharif', 'Rabi' or 'Summer', or undefined for the season of today's date
function predictForArea(district, taluk, ownSoil, season) {
  return askMlService('/predict_district', { district, taluk, season, ...ownSoil });
}

module.exports = { predictCrops, predictForArea };
