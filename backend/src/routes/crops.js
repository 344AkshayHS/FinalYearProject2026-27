const express = require('express');
const { requireUser } = require('../auth');
const { PHOTOS } = require('../services/crop-photos');

const router = express.Router();

// Every crop's FAO EcoCrop needs, from the ML service (GET /crop_needs). They never change while it runs,
// so they are asked for once; if the ML service is not reachable they are asked for again next time.
let faoNeeds = null;
async function cropNeeds() {
  if (!faoNeeds) {
    const response = await fetch(process.env.ML_SERVICE_URL + '/crop_needs', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error('ML service /crop_needs failed with status ' + response.status);
    }
    faoNeeds = await response.json();
  }
  return faoNeeds;
}

// GET /crops -> { crops: [{ crop, scientific_name, photos: [...], seasonal, fertility, needs }] }
// For the crop pages and the compare table. needs: the crop's best pH, rain (for its season when seasonal,
// else for a year) and temperature; null when the ML service could not be asked (the photos still show).
router.get('/', requireUser, async (req, res) => {
  const fao = await cropNeeds().catch((err) => {
    console.error(err.message);
    return null;
  });
  const crops = Object.entries(PHOTOS).map(([crop, item]) => ({
    crop,
    ...item,
    seasonal: fao?.[crop]?.seasonal ?? null,
    fertility: fao?.[crop]?.fertility ?? null,
    needs: fao?.[crop]?.needs ?? null,
  }));
  res.json({ crops });
});

module.exports = router;
