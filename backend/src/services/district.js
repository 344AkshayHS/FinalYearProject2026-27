// Finds the district, state and taluk of a GPS point anywhere in India.
//
// 1. Offline: check which district boundary contains the point.
//    - data/karnataka_districts.geojson: Karnataka's 30 districts (Census 2011, same as our crop data)
//    - data/india_districts.geojson:     every other state
// 2. Fallback: ask OpenStreetMap Nominatim (max 1 request per second, answers are cached).
// Karnataka district names are returned exactly as spelled in our crop dataset (see ../districts.js).

const fs = require('fs');
const path = require('path');
const { currentState, normaliseDistrict, normaliseState } = require('../districts');

// --- Boundaries, loaded once when the server starts ----------------------------

function loadBoundaries(file, readNames) {
  const features = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data', file), 'utf8')).features;
  return features.map((feature) => {
    const { geometry } = feature;
    // Treat Polygon and MultiPolygon the same way: a list of polygons
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const corners = polygons.flatMap((polygon) => polygon[0]);
    return {
      ...readNames(feature.properties),
      polygons,
      box: {
        west: Math.min(...corners.map((c) => c[0])),
        east: Math.max(...corners.map((c) => c[0])),
        south: Math.min(...corners.map((c) => c[1])),
        north: Math.max(...corners.map((c) => c[1])),
      },
    };
  });
}

const karnataka = loadBoundaries('karnataka_districts.geojson', (p) => ({
  state: 'Karnataka',
  district: normaliseDistrict(p.district),
}));
const restOfIndia = loadBoundaries('india_districts.geojson', (p) => ({
  state: currentState(normaliseState(p.NAME_1), p.NAME_2), // today's state, not the one of the older map
  mapState: normaliseState(p.NAME_1), // the state as the older map (and our crop data) names it
  district: p.NAME_2,
})).filter((b) => b.state !== 'Karnataka');

const boundaries = [...karnataka, ...restOfIndia];

// Ray casting: is the point inside this ring of [lon, lat] corners?
function insideRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    const crosses = y1 > lat !== y2 > lat && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

// A polygon is an outer ring plus optional holes
function insidePolygon(lon, lat, [outer, ...holes]) {
  return insideRing(lon, lat, outer) && !holes.some((hole) => insideRing(lon, lat, hole));
}

function findInBoundaries(lat, lon) {
  return boundaries.find(
    ({ box, polygons }) =>
      lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north && // quick check first
      polygons.some((polygon) => insidePolygon(lon, lat, polygon))
  );
}

// --- Nominatim fallback -------------------------------------------------------

const cache = new Map();
let lastRequest = Promise.resolve();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Nominatim's rule is at most 1 request per second, so requests wait in a queue
function askNominatim(lat, lon) {
  const request = lastRequest.then(async () => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GreenRoot/1.0 (final-year project, MITE Mangaluru)' },
      signal: AbortSignal.timeout(10000), // a request that hangs would block the whole queue
    });
    await wait(1000);
    if (!response.ok) {
      throw new Error('Nominatim failed with status ' + response.status);
    }
    return response.json();
  });
  lastRequest = request.catch(() => {}); // one failure must not block the queue
  return request;
}

function cleanTaluk(name) {
  return name ? name.replace(/\s+(taluk|taluku|taluka|tehsil|tahsil)$/i, '') : null;
}

async function findWithNominatim(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`; // about 100 m
  if (cache.has(key)) {
    return cache.get(key);
  }

  const address = (await askNominatim(lat, lon)).address || {};
  const state = normaliseState(address.state);
  const rawDistrict = address.state_district || address.county || address.district || null;
  const result = {
    country: address.country_code,
    state,
    district: state === 'Karnataka' ? normaliseDistrict(rawDistrict) : rawDistrict?.replace(/ district$/i, ''),
    // OpenStreetMap keeps the taluk in "county", e.g. "Beltangadi taluk" or "Jagaluru taluku"
    taluk: address.state_district ? cleanTaluk(address.county) : null,
  };

  cache.set(key, result);
  return result;
}

// --- Main function ------------------------------------------------------------

// Returns { district, state, taluk, source } or { error } where error is
// 'outside_india' or 'district_not_found'.
// The district comes from our boundary files when possible (they match the crop data); the taluk
// always comes from OpenStreetMap and is null if it is not known or OpenStreetMap cannot be reached.
async function findDistrict(lat, lon) {
  const match = findInBoundaries(lat, lon);
  if (match) {
    const osm = await findWithNominatim(lat, lon).catch(() => null);
    // Our boundary files are simplified Census 2011 outlines, so a farm close to a district border
    // can fall on the wrong side (Moodabidri, for example, reads as Udupi instead of Dakshina
    // Kannada). OpenStreetMap follows the real border, so its district wins when both agree on the
    // state and the name is one we know. Without OpenStreetMap we keep the boundary answer.
    const fromOsm = osm && osm.state === match.state ? osm.district : null;
    return {
      district: fromOsm || match.district,
      state: match.state,
      taluk: osm?.taluk ?? null,
      source: fromOsm && fromOsm !== match.district ? 'openstreetmap' : 'boundary',
    };
  }

  const osm = await findWithNominatim(lat, lon);
  if (osm.country !== 'in') {
    return { error: 'outside_india' };
  }
  if (!osm.district || !osm.state) {
    return { error: 'district_not_found' };
  }
  return { district: osm.district, state: osm.state, taluk: osm.taluk, source: 'nominatim' };
}

// Districts where we have soil and climate but no crop statistics (data/untested_places.json, made by
// ml-service/training/list_untested_places.py). The model still answers there, but it could not be tested.
const untestedPlaces = new Set(
  JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/untested_places.json'), 'utf8')).map(
    (place) => `${normaliseState(place.state)}|${place.district}`
  )
);

// Is this GPS point in one of them? (Karnataka has crop statistics for all its districts.)
function isUntestedPlace(lat, lon) {
  const match = findInBoundaries(lat, lon);
  return Boolean(match && match.mapState && untestedPlaces.has(`${match.mapState}|${match.district}`));
}

// --- The pickers: state -> district -> (Karnataka only) taluk -----------------------

// Today's states and union territories, and the districts of each, from the boundary files.
// Karnataka's districts are named as in our crop data (the app shows them in English or Kannada).
const districtsByState = new Map();
for (const { state, district } of boundaries) {
  if (!districtsByState.has(state)) {
    districtsByState.set(state, new Set());
  }
  districtsByState.get(state).add(district);
}

function listStates() {
  return [...districtsByState.keys()].sort();
}

function listDistricts(state) {
  return [...(districtsByState.get(state) ?? [])].sort();
}

// The corners of the biggest piece of a district (islands make districts of several pieces)
function biggestPolygon(polygons) {
  const size = ([ring]) => {
    const lons = ring.map((c) => c[0]);
    const lats = ring.map((c) => c[1]);
    return (Math.max(...lons) - Math.min(...lons)) * (Math.max(...lats) - Math.min(...lats));
  };
  return polygons.reduce((best, polygon) => (size(polygon) > size(best) ? polygon : best));
}

// A point inside a picked district, for the soil and climate readings. Starts at the middle of the district's
// biggest piece and, if that falls outside (a curved district, a hole), takes the nearest point inside on a grid.
function districtMiddle(state, district) {
  const match = boundaries.find((b) => b.state === state && b.district === district && b.mapState);
  if (!match) {
    return null;
  }
  const polygon = biggestPolygon(match.polygons);
  const ring = polygon[0];
  const lon = ring.reduce((sum, c) => sum + c[0], 0) / ring.length;
  const lat = ring.reduce((sum, c) => sum + c[1], 0) / ring.length;
  if (insidePolygon(lon, lat, polygon)) {
    return { lat, lng: lon };
  }
  let best = null;
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = Math.min(...lons) + ((Math.max(...lons) - Math.min(...lons)) * i) / steps;
      const y = Math.min(...lats) + ((Math.max(...lats) - Math.min(...lats)) * j) / steps;
      const away = (x - lon) ** 2 + (y - lat) ** 2;
      if ((!best || away < best.away) && insidePolygon(x, y, polygon)) {
        best = { away, lat: y, lng: x };
      }
    }
  }
  return best && { lat: best.lat, lng: best.lng };
}

module.exports = { findDistrict, findInBoundaries, insidePolygon, isUntestedPlace, listStates, listDistricts, districtMiddle };
