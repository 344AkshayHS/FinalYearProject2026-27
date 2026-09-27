// Karnataka taluks: which taluk a GPS point is in, and the taluks of a district for the app's list.
//
// data/karnataka_taluks.geojson is made by ml-service/training/make_taluk_map.py: Census 2011 taluk shapes
// labelled with Agriculture Census codes, the same taluks our crop figures and the model use.
// A taluk is identified by its key, "district code:taluk codes" (e.g. "19:8" for Kolar), because one
// shape can hold two census taluks (Afzalpur + Aland). Indi has no shape: a point in its district
// (Vijayapura) that is in no drawn taluk belongs to it.

const fs = require('fs');
const path = require('path');
const { insidePolygon } = require('./district');

const TALUK_MAP = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/karnataka_taluks.geojson'), 'utf8'));

function talukKey(taluk) {
  return `${taluk.district_code}:${taluk.taluk_codes.join('+')}`;
}

const shapes = TALUK_MAP.features.map((feature) => {
  const polygons = feature.geometry.coordinates;
  const corners = polygons.flatMap((polygon) => polygon[0]);
  return {
    key: talukKey(feature.properties),
    name: feature.properties.taluk,
    district: feature.properties.district,
    polygons,
    box: {
      west: Math.min(...corners.map((c) => c[0])),
      east: Math.max(...corners.map((c) => c[0])),
      south: Math.min(...corners.map((c) => c[1])),
      north: Math.max(...corners.map((c) => c[1])),
    },
  };
});
const withoutShape = TALUK_MAP.missing_taluks.map((t) => ({ key: talukKey(t), name: t.taluk, district: t.district }));
const allTaluks = [...shapes, ...withoutShape];

// { key, name, district } of the taluk at this point, or null. district: the point's district, for Indi.
function findTaluk(lat, lng, district) {
  const match = shapes.find(
    ({ box, polygons }) =>
      lng >= box.west && lng <= box.east && lat >= box.south && lat <= box.north &&
      polygons.some((polygon) => insidePolygon(lng, lat, polygon))
  );
  const taluk = match ?? withoutShape.find((t) => t.district === district);
  return taluk ? { key: taluk.key, name: taluk.name, district: taluk.district } : null;
}

// [{ key, name }] for a district, by name
function taluksOf(district) {
  return allTaluks
    .filter((t) => t.district === district)
    .map(({ key, name }) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function talukByKey(key) {
  const taluk = allTaluks.find((t) => t.key === key);
  return taluk ? { key: taluk.key, name: taluk.name, district: taluk.district } : null;
}

module.exports = { findTaluk, taluksOf, talukByKey };
