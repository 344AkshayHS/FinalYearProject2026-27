// The farmer's own soil test values (e.g. from their Soil Health Card). Every value is optional.
//
// - pH and organic carbon replace the soil-map values that go into the model.
// - N, P and K are not model inputs (no soil map covering all of India has them, so the model could not
//   be trained on them). They only get a Low / Medium / High rating.

// Accepted ranges, so a typo like pH 65 is caught
const LIMITS = {
  ph: [3, 10],
  organic_carbon_pct: [0, 5], // %
  n: [0, 2000], // available nitrogen, kg/ha
  p: [0, 500], // available phosphorus, kg/ha
  k: [0, 3000], // available potassium, kg/ha
};

// Low below the first number, High above the second.
// Source: TNAU Agritech Portal, "Rating Chart for Soil Test Data" (agri_soil_soilratingchart.html)
const RATINGS = {
  organic_carbon_pct: [0.5, 0.75],
  n: [240, 480],
  p: [11, 22],
  k: [110, 280],
};

// Returns the values given, null if none were given, or 'invalid'
function readSoilTest(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const test = {};
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (value[key] === undefined || value[key] === null || value[key] === '') {
      continue;
    }
    const number = Number(value[key]);
    if (isNaN(number) || number < min || number > max) {
      return 'invalid';
    }
    test[key] = number;
  }
  return Object.keys(test).length > 0 ? test : null;
}

// { n: 'low', k: 'medium', ... } for the values the farmer gave
function rateSoilTest(test) {
  const ratings = {};
  for (const [key, [low, high]] of Object.entries(RATINGS)) {
    if (test[key] !== undefined) {
      ratings[key] = test[key] < low ? 'low' : test[key] > high ? 'high' : 'medium';
    }
  }
  return ratings;
}

// Soil test cards measure organic carbon with the Walkley-Black method, which finds only about 76% of it;
// the soil map (and so the model) uses total organic carbon in g/kg. The usual correction is x 1.32.
// e.g. 0.5% on the card -> 0.5 x 10 x 1.32 = 6.6 g/kg
function toTotalCarbon(organicCarbonPct) {
  return Math.round(organicCarbonPct * 10 * 1.32 * 100) / 100;
}

module.exports = { readSoilTest, rateSoilTest, toTotalCarbon };
