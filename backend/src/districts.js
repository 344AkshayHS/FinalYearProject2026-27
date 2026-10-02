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

// The all-India boundary file is older than three changes, so some places carry a state that no longer exists:
//   2014: Telangana was made out of ten districts of Andhra Pradesh
//   2019: Ladakh (Leh and Kargil) was made a union territory apart from Jammu and Kashmir
//   2020: Dadra and Nagar Haveli and Daman and Diu were joined into one union territory
// India has 28 states and 8 union territories today. This gives the current name of a place in that file.
const TELANGANA_DISTRICTS = ['Adilabad', 'Hyderabad', 'Karimnagar', 'Khammam', 'Mahbubnagar', 'Medak', 'Nalgonda', 'Nizamabad', 'Rangareddi', 'Warangal'];
const LADAKH_DISTRICTS = ['Kargil', 'Ladakh (Leh)'];
const MERGED_UNION_TERRITORY = 'Dadra and Nagar Haveli and Daman and Diu';

function currentState(state, district) {
  if (state === 'Andhra Pradesh' && TELANGANA_DISTRICTS.includes(district)) {
    return 'Telangana';
  }
  if (state === 'Jammu and Kashmir' && LADAKH_DISTRICTS.includes(district)) {
    return 'Ladakh';
  }
  if (state === 'Dadra and Nagar Haveli' || state === 'Daman and Diu') {
    return MERGED_UNION_TERRITORY;
  }
  if (state === 'Andaman and Nicobar') {
    return 'Andaman and Nicobar Islands';
  }
  return state;
}

module.exports = { DISTRICTS, normaliseDistrict, normaliseState, currentState };
