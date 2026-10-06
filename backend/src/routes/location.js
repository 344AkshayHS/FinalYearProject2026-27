const express = require('express');
const { findDistrict, listDistricts, listStates } = require('../services/district');
const { findTaluk, taluksOf } = require('../services/taluk');
const { normaliseDistrict } = require('../districts');
const { LIMITS, limitRequests } = require('../rate-limit');

const router = express.Router();

// GET /location/district?lat=12.87&lon=74.88
// -> { district: "DAKSHIN KANNAD", state: "Karnataka", taluk: "MANGALORE", taluk_key: "24:1", source: "boundary" }
// Taluks are Karnataka only: they come from our taluk map (the taluks our crop figures and model use).
// Outside Karnataka we have no taluk data, so taluk is null there.
// (It can ask Nominatim, a free outside service, so each address may ask at most 60 times a minute.)
router.get('/district', limitRequests(LIMITS.districtLookupsPerMinute, 1), async (req, res) => {
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
    const taluk = result.state === 'Karnataka' ? findTaluk(lat, lon, result.district) : null;
    res.json({ ...result, taluk: taluk?.name ?? null, taluk_key: taluk?.key ?? null });
  } catch (err) {
    // Offline lookup found nothing and Nominatim could not be reached
    console.error(err);
    res.status(502).json({ error: 'district_lookup_failed' });
  }
});

// GET /location/states -> ["Andhra Pradesh", ..., "Karnataka", ...]  (today's states and union territories)
router.get('/states', (req, res) => {
  res.json(listStates());
});

// GET /location/districts?state=Kerala -> ["Alappuzha", "Ernakulam", ...]
// (Karnataka's come as our crop-data names, e.g. "DAKSHIN KANNAD"; the app writes them nicely.)
router.get('/districts', (req, res) => {
  const districts = listDistricts(req.query.state);
  if (districts.length === 0) {
    return res.status(400).json({ error: 'state_invalid' });
  }
  res.json(districts);
});

// GET /location/taluks?district=MYSORE -> [{ key: "26:1", name: "H.D. KOTE" }, ...]
// The taluks a farmer can pick after choosing a Karnataka district by hand.
router.get('/taluks', (req, res) => {
  const district = normaliseDistrict(req.query.district);
  if (!district) {
    return res.status(400).json({ error: 'district_invalid' });
  }
  res.json(taluksOf(district));
});

module.exports = router;
