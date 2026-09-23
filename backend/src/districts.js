// District and state name cleaning.
//
// Karnataka district names are spelled exactly as in our crop dataset
// (data.gov.in district-wise crop statistics, which uses the 30 districts of Census 2011).
// The list of other spellings lives in data/karnataka_district_names.json, which the ML
// training code also reads, so there is one place to edit. Add a spelling there if a lookup fails.
// Newer districts are listed under the district they were carved out of:
//   Vijayanagara (2021, from Ballari)      -> BELLARY
//   Bengaluru South (2025, was Ramanagara) -> RAMANAGARA

const DISTRICT_ALIASES = require('../data/karnataka_district_names.json');

// Turns any spelling ("Mysuru District", "Belagavi") into our dataset name ("MYSORE"), or null
function normaliseDistrict(name) {
  if (!name) {
    return null;
  }
  const cleaned = name.toLowerCase().replace(/\bdistrict\b/g, '').replace(/\s+/g, ' ').trim();
  for (const [district, aliases] of Object.entries(DISTRICT_ALIASES)) {
    if (aliases.includes(cleaned)) {
      return district;
    }
  }
  return null;
}

const DISTRICTS = Object.keys(DISTRICT_ALIASES);

// Old state names used in the all-India boundary file -> current names
const STATE_RENAMES = {
  'Orissa': 'Odisha',
  'Uttaranchal': 'Uttarakhand',
  'Pondicherry': 'Puducherry',
};

function normaliseState(name) {
  if (!name) {
    return null;
  }
  const trimmed = name.trim();
  return STATE_RENAMES[trimmed] || trimmed;
}

module.exports = { DISTRICTS, normaliseDistrict, normaliseState };
