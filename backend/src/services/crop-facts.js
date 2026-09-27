// What farmers really grow most around a location, from government statistics - shown beside the
// model's recommendation so the farmer can compare. data/karnataka_crop_facts.json is made by
// ml-service/training/build_dataset.py:
//   - a taluk (GPS point in Karnataka, or a taluk picked by hand) -> Agriculture Census 2010-11 / 2015-16
//   - a district picked by hand without a taluk -> district crop statistics
// Every share is of ALL the place's cropped land, not only the crops the model knows.

const FACTS = require('../../data/karnataka_crop_facts.json');

// talukKey: the taluk (see ./taluk.js), or null for a whole district
// Returns { level: 'taluk' | 'district', name, district, cropped_area_ha, crops: [{ crop, area_ha, share }] }
// or null when there are no figures (outside Karnataka, or a taluk without census data).
function cropFacts({ state, district, talukKey }) {
  if (state !== 'Karnataka') {
    return null;
  }
  if (talukKey) {
    const facts = FACTS.taluks[talukKey];
    return facts ? { level: 'taluk', name: facts.taluk, ...facts } : null;
  }
  const facts = FACTS.districts[district];
  return facts ? { level: 'district', name: district, district, ...facts } : null;
}

// What the district sowed most in this season, from Karnataka's crop survey (DES Fully Revised Estimates):
// { district, season, source, crops: [{ crop, area_ha, share }] } - share of that season's field crops there.
// Null outside Karnataka or when the district sowed nothing counted in that season.
function seasonSowing({ state, district, season }) {
  const crops = state === 'Karnataka' ? FACTS.districts[district]?.seasons?.[season] : null;
  return crops?.length ? { district, season, source: FACTS.sources.seasons, crops } : null;
}

module.exports = { cropFacts, seasonSowing };
