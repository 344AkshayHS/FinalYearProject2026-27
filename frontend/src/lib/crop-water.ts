// How much water to give a crop today, with the FAO method
// (FAO Irrigation Water Management Training Manual 3, chapter 3, https://www.fao.org/4/s2022e/s2022e07.htm):
//
//   crop water need today (mm) = Kc × ETo
//
// ETo  = today's reference evaporation from the weather forecast (backend /weather/today)
// Kc   = the crop factor for the crop's growth stage (FAO Tables 8, 10, 11 and 12b)
// Rain expected today is taken off. 1 mm of water on one acre is about 4047 litres.
// The Kc values are FAO's averages for medium humidity and wind.

import { CROP_INFO } from '@/lib/crop-info';

const ACRE_SQUARE_METRES = 4047;
const HUMID_PERCENT = 80; // FAO calls relative humidity above 80% "high"

type Stage = 'initial' | 'development' | 'mid' | 'late';
const STAGES: Stage[] = ['initial', 'development', 'mid', 'late'];

// Field crops: Kc per stage (FAO Table 8) and stage lengths in days (FAO Table 7, the crop's shortest
// listed growing period). The stage lengths are stretched to the local duration from crop-info.ts,
// the way the FAO manual's own example does it.
type FieldCrop = { kc: [number, number, number, number]; stageDays: [number, number, number, number] };

const WHEAT: FieldCrop = { kc: [0.35, 0.75, 1.15, 0.45], stageDays: [15, 25, 50, 30] };
const PULSES: FieldCrop = { kc: [0.45, 0.75, 1.1, 0.5], stageDays: [15, 25, 35, 20] }; // Kc "Lentil/Pulses", stages "Bean/dry"
const COTTON_FLAX: FieldCrop = { kc: [0.45, 0.75, 1.15, 0.75], stageDays: [30, 50, 55, 45] };
const MILLET: FieldCrop = { kc: [0.35, 0.7, 1.1, 0.65], stageDays: [15, 25, 40, 25] };

const FIELD_CROPS: Record<string, FieldCrop> = {
  wheat: WHEAT,
  barley: WHEAT,
  'black gram': PULSES,
  'green gram': PULSES,
  chickpea: PULSES,
  cowpea: PULSES,
  'horse gram': PULSES,
  khesari: PULSES,
  'moth bean': PULSES,
  'pigeonpea (tur)': PULSES,
  lentil: { kc: PULSES.kc, stageDays: [20, 30, 60, 40] },
  cotton: COTTON_FLAX,
  linseed: COTTON_FLAX,
  bajra: MILLET,
  ragi: MILLET,
  maize: { kc: [0.4, 0.8, 1.15, 0.7], stageDays: [20, 35, 40, 30] },
  jowar: { kc: [0.35, 0.75, 1.1, 0.65], stageDays: [20, 30, 40, 30] },
  onion: { kc: [0.5, 0.75, 1.05, 0.85], stageDays: [15, 25, 70, 40] },
  groundnut: { kc: [0.45, 0.75, 1.05, 0.7], stageDays: [25, 35, 45, 25] },
  chilli: { kc: [0.35, 0.7, 1.05, 0.9], stageDays: [25, 35, 40, 20] }, // "Pepper, fresh"
  potato: { kc: [0.45, 0.75, 1.15, 0.85], stageDays: [25, 30, 30, 20] },
  soybean: { kc: [0.35, 0.75, 1.1, 0.6], stageDays: [20, 30, 60, 25] },
  sunflower: { kc: [0.35, 0.75, 1.15, 0.55], stageDays: [20, 35, 45, 25] },
};

// Banana, FAO Table 10: Kc by month after planting; from month 7 on it stays 1.1
const BANANA_KC = [0.7, 0.75, 0.8, 0.75, 0.9, 1.0];

// Sugarcane, FAO Table 12b (12-month crop, little wind): [from month, to month, Kc dry, Kc humid]
const SUGARCANE_KC: [number, number, number, number][] = [
  [0, 1, 0.4, 0.5],
  [1, 2, 0.8, 0.8],
  [2, 4, 1.1, 1.0],
  [4, 10, 1.25, 1.05],
  [10, 11, 0.95, 0.8],
  [11, 12, 0.7, 0.6],
];

export type Weather = { et0_mm: number; rain_mm: number; humidity_pct: number };

// A stage key (translated on screen) or a month number for banana and sugarcane
export type CropStage = { stage: Stage } | { month: number };

export type WaterToday = {
  kc: number;
  cropStage: CropStage;
  needMm: number; // what the crop uses today
  rainMm: number;
  irrigateMm: number; // what to give: need - rain, never below 0
  irrigateLitresPerAcre: number;
};

function localDuration(crop: string) {
  const days = CROP_INFO[crop]?.days;
  return days ? (days[0] + days[1]) / 2 : null;
}

// Kc and growth stage for this crop, `day` days after sowing (or planting). null when FAO has no
// crop factor for it, or the crop should already be harvested.
function cropFactor(crop: string, day: number, humid: boolean): { kc: number; cropStage: CropStage } | null {
  if (crop === 'banana') {
    const month = Math.floor(day / 30) + 1;
    return { kc: BANANA_KC[month - 1] ?? 1.1, cropStage: { month } };
  }

  const duration = localDuration(crop);
  if (duration === null || day > duration) {
    return null;
  }

  if (crop === 'sugarcane') {
    const month = (day / duration) * 12;
    const row = SUGARCANE_KC.find(([from, to]) => month >= from && month < to) ?? SUGARCANE_KC[SUGARCANE_KC.length - 1];
    return { kc: humid ? row[3] : row[2], cropStage: { month: Math.floor(month) + 1 } };
  }

  if (crop === 'rice') {
    // FAO Table 11 (paddy, little wind): first 60 days 1.1, mid-season 1.2 dry / 1.05 humid, last 30 days 1.0
    if (day < 60) return { kc: 1.1, cropStage: { stage: 'initial' } };
    if (day >= duration - 30) return { kc: 1.0, cropStage: { stage: 'late' } };
    return { kc: humid ? 1.05 : 1.2, cropStage: { stage: 'mid' } };
  }

  const field = FIELD_CROPS[crop];
  if (!field) {
    return null;
  }
  const faoTotal = field.stageDays.reduce((sum, days) => sum + days, 0);
  let stageEnd = 0;
  for (let i = 0; i < 4; i++) {
    stageEnd += (field.stageDays[i] / faoTotal) * duration;
    if (day < stageEnd || i === 3) {
      return { kc: field.kc[i], cropStage: { stage: STAGES[i] } };
    }
  }
  return null;
}

export function hasCropFactor(crop: string) {
  return crop === 'banana' || crop === 'sugarcane' || crop === 'rice' || crop in FIELD_CROPS;
}

export function waterToday(crop: string, daysSinceSowing: number, weather: Weather): WaterToday | null {
  const factor = cropFactor(crop, daysSinceSowing, weather.humidity_pct > HUMID_PERCENT);
  if (!factor) {
    return null;
  }
  const needMm = Math.round(factor.kc * weather.et0_mm * 10) / 10;
  const irrigateMm = Math.max(0, Math.round((needMm - weather.rain_mm) * 10) / 10);
  return {
    kc: factor.kc,
    cropStage: factor.cropStage,
    needMm,
    rainMm: weather.rain_mm,
    irrigateMm,
    irrigateLitresPerAcre: Math.round((irrigateMm * ACRE_SQUARE_METRES) / 100) * 100,
  };
}

// Past the crop's usual duration (so no stage advice), for the message on screen
export function pastHarvest(crop: string, daysSinceSowing: number) {
  const duration = localDuration(crop);
  return crop !== 'banana' && duration !== null && daysSinceSowing > duration;
}

// This monsoon's rain so far against the 2001-2020 normal for the same days (backend season_rain,
// NASA POWER), with the India Meteorological Department's category
export type SeasonRain = {
  from: string;
  to: string;
  rain_mm: number;
  normal_mm: number;
  percent_from_normal: number;
  imd_category: 'excess' | 'normal' | 'deficient' | 'large_deficient';
};

// "Needs irrigation" on rain-fed land: in every recent Agriculture Census, at least half of this crop's
// land in the taluk (or district) was irrigated - most farmers there water it. `irrigated` is the lowest
// irrigated share per crop over the census years (backend crop_facts). Karnataka only; elsewhere there
// are no such figures and nothing is marked.
const MOSTLY_IRRIGATED = 0.5;

export function mostlyIrrigatedShare(irrigated: Record<string, number> | undefined, crop: string) {
  const share = irrigated?.[crop];
  return share !== undefined && share >= MOSTLY_IRRIGATED ? share : null;
}
