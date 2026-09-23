const express = require('express');
const { findDistrict } = require('../services/district');

const router = express.Router();

// GET /location/district?lat=12.87&lon=74.88
// -> { district: "DAKSHIN KANNAD", state: "Karnataka", taluk: "Mangaluru", source: "boundary" }
router.get('/district', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (req.query.lat === undefined || req.query.lon === undefined || isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'location_invalid' });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'location_invalid' });
  }

  try {
    const result = await findDistrict(lat, lon);
    if (result.error) {
      return res.status(404).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    // Offline lookup found nothing and Nominatim could not be reached
    console.error(err);
    res.status(502).json({ error: 'district_lookup_failed' });
  }
});

module.exports = router;
