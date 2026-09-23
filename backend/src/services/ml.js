// Sends the model's features (soil, climate and terrain) to the Python ML service
// and returns its prediction.
//
// Expected response from the ML service:
// {
//   "model_version": "rf-india-1.2",
//   "recommendations": [
//     { "crop": "rice", "probability": 0.62, "score": 62, "confident": true, "shap": {...}, "lime": {...} },
//     ...
//   ]
// }

const { giveUpAfter } = require('./timeout');

async function predictCrops(features) {
  const response = await fetch(process.env.ML_SERVICE_URL + '/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(features),
    signal: giveUpAfter('predict'),
  });

  if (!response.ok) {
    throw new Error('ML service failed with status ' + response.status);
  }
  return response.json();
}

module.exports = { predictCrops };
