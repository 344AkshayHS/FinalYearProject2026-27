// The shape of the backend's answer to POST /recommend (backend/src/routes/recommend.js).
// It is the same shape the phone app reads in frontend/src/components/results.tsx.
// The phone app's chat rules (frontend/src/lib/chatbot.ts) import RecommendResponse and WaterSource from that screen;
// tsconfig.json points that import here, because the screen itself is React Native and cannot be used on a website.

import type { SeasonRain } from '@/lib/crop-water';
import type { Season } from '@/lib/season';

export type WaterSource = 'rain' | 'irrigated';

// How the land suits a crop by its FAO EcoCrop needs: inside its optimal range, inside its absolute range, or not
export type Fit = 'good' | 'possible' | 'unsuited' | null;
export type Suits = {
  ph: Fit;
  temperature: Fit;
  rain: Fit;
  texture: Fit;
  fertility: 'low' | 'moderate' | 'high' | null; // how fertile a soil the crop needs
  rain_mm: number; // the normal rain it was checked against: the season's for seasonal crops, else the year's
  rain_is_season: boolean;
  needs: { ph: (number | null)[]; rain_mm: (number | null)[]; temperature_c: (number | null)[] };
};

export type Recommendation = {
  crop: string;
  probability: number;
  score: number;
  confident: boolean;
  shap: Record<string, number> | null;
  lime: Record<string, number> | null;
  suits: Suits | null;
};

export type Rating = 'low' | 'medium' | 'high';
export type RatedValue = 'organic_carbon_pct' | 'n' | 'p' | 'k';
export type CropGroup = 'vegetable' | 'herb' | 'spice' | 'plantation';

// What the district sowed most in the answered season, from Karnataka's crop survey (DES)
export type SeasonSowing = {
  district: string;
  season: Season;
  source: string;
  crops: { crop: string; area_ha: number; share: number }[];
};

// What farmers really grow most in the taluk (GPS) or district (picked by hand), from government data
export type CropFacts = {
  level: 'taluk' | 'district';
  name: string;
  crops: { crop: string; area_ha: number; share: number }[];
  // each crop's irrigated share of its land here, the lowest over the census years (Agriculture Census)
  irrigated?: Record<string, number>;
};

export type RecommendResponse = {
  recommendation_id: string;
  area: 'point' | 'taluk' | 'district'; // GPS point, or a taluk / district picked by hand
  district_middle?: boolean; // a district outside Karnataka picked by hand: the answer is for one spot in its middle
  untested_place?: boolean; // no crop statistics for this district: the answer could not be checked against them
  location: { lat: number; lng: number; state: string | null; district: string | null; taluk: string | null };
  features: Record<string, number>;
  model_version: string;
  season: Season; // the season the crops are for
  season_sown_share: number | null; // share of the district's field crops sown in that season (statistics)
  recommendations: Recommendation[];
  // top field crops, without year-round ones; district_share: the crop's share of the district's sowing;
  // taluk_share: the same in the taluk, when the taluk's own crops ordered the list
  sow_this_season: { crop: string; probability: number; district_share: number | null; taluk_share: number | null }[];
  season_sowing: SeasonSowing | null; // what the district sowed most this season (Karnataka crop survey)
  all_crops: { crop: string; probability: number; suits: Suits | null }[]; // every crop the model knows, in order
  // When the season's list starts with another crop than the top one (a year-round top crop like arecanut, or
  // the taluk's own crops put another first), the season's best crop to sow, explained on its own
  season_best: (Recommendation & { reliability: number }) | null;
  other_crops: { crop: string; group: CropGroup; suits: Suits }[]; // not known to the model
  rain_checked_mm: number | null; // the normal yearly rain the crops' needs were checked against
  rain_source: string | null;
  top_crop_reliability: number; // how often a top crop with this probability was the area's main crop in testing
  soil_test: Partial<Record<'ph' | 'organic_carbon_pct' | 'n' | 'p' | 'k', number>> | null;
  soil_ratings: Partial<Record<RatedValue, Rating>> | null;
  soil_read_metres_away: number | null; // null when a whole taluk or district was checked
  sample_points: number | null; // taluk or district picked by hand: farms the answer is averaged over
  taluk_weight: number | null; // picked taluk: share of the answer from its own farms (the rest: its district)
  crop_facts: CropFacts | null;
  season_rain: SeasonRain | null; // this monsoon's rain so far against normal (null outside June-November)
};

// A district's taluk, as GET /location/taluks sends it
export type Taluk = { key: string; name: string };
