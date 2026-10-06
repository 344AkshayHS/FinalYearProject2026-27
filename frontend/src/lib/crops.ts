// The crop pages, the compare table and the crop photos. Used by the phone app and the website.
//
// The list comes from the backend (GET /crops): every crop's photos (crop-images/, hand-checked, free licences)
// and its FAO EcoCrop needs (best pH, rain and temperature). The time to harvest and the water a crop needs
// come from crop-info.ts (TNAU, FAO). What a crop means for the farmer's own land comes from their last result.
// A figure none of these sources has is shown as "—", never guessed.

import type { RecommendResponse, WaterSource } from '@/components/results';
import { CROP_INFO } from '@/lib/crop-info';
import { YEAR_ROUND_CROPS } from '@/lib/season';
import { districtName, talukName, type Language, type translations } from '@/lib/translations';

export type PhotoSlot = 'field' | 'close_up' | 'pods' | 'seeds' | 'mature';

export type CropPhoto = {
  slot: PhotoSlot;
  path: string; // "crop-images/rice/4-seeds.jpg" on the backend
  author: string;
  license: string;
  license_url: string;
  site: string;
  source: string; // the page the photo came from
};

type Range = (number | null)[];

export type CropEntry = {
  crop: string;
  scientific_name: string;
  photos: CropPhoto[];
  seasonal: boolean | null; // sown and harvested within a season; null = the ML service could not be asked
  fertility: 'low' | 'moderate' | 'high' | null;
  needs: { ph: Range; rain_mm: Range; temperature_c: Range } | null;
};

// A crop the farmer saved with the heart (backend GET /users/me/saved)
export type SavedCrop = { crop: string; created_at: string };

// What the app keeps after login: every crop, and the farmer's saved ones
export type CropData = { list: CropEntry[]; saved: SavedCrop[] };

// The farmer's last "Find crops" result, with the water they said the land has
export type LastResult = { data: RecommendResponse; waterSource: WaterSource };

// The photos in the order they are shown: first the harvested crop as farmers see it at the market,
// then the plant from the field to harvest
const PHOTO_ORDER: PhotoSlot[] = ['seeds', 'field', 'close_up', 'pods', 'mature'];

export function orderedPhotos(entry: CropEntry | undefined) {
  return [...(entry?.photos ?? [])].sort((a, b) => PHOTO_ORDER.indexOf(a.slot) - PHOTO_ORDER.indexOf(b.slot));
}

// The photo shown for a crop in lists: the harvested crop, or the first one there is
export function mainPhoto(entry: CropEntry | undefined) {
  return orderedPhotos(entry)[0] ?? null;
}

export function findCrop(crops: CropData | null | 'failed', crop: string) {
  return crops && crops !== 'failed' ? crops.list.find((item) => item.crop === crop) : undefined;
}

// "Hunsur, Mysuru": where the last result was for
export function resultPlace(last: LastResult, language: Language) {
  const { taluk, district, state } = last.data.location;
  const names = [taluk && talukName(taluk, language), district && districtName(district, language)].filter(Boolean);
  return names.length > 0 ? names.join(', ') : (state ?? '');
}

// How many crops the compare table shows side by side (3 still fit on a phone)
export const MAX_COMPARE = 3;

type Texts = (typeof translations)['en'];

export type CropRow = { label: string; value: string | null };

// "6–7", "from 6", "up to 7", "6" - or null when the source has neither end
function range(pair: Range | undefined, t: Texts) {
  const [low, high] = pair ?? [null, null];
  if (low === null && high === null) {
    return null;
  }
  if (low === null) {
    return t.cropValues.upTo.replace('{n}', String(high));
  }
  if (high === null) {
    return t.cropValues.from.replace('{n}', String(low));
  }
  return low === high ? String(low) : `${low}–${high}`;
}

// What the crop is like (the same everywhere): how it is grown, time to harvest, water, and its best soil and climate
export function cropRows(crop: string, entry: CropEntry | undefined, t: Texts, language: Language): CropRow[] {
  const info = CROP_INFO[crop];
  const values = t.cropValues;
  const seasonal = entry?.seasonal ?? (YEAR_ROUND_CROPS.includes(crop) ? false : null);
  const days = info?.days && range(info.days, t);
  const years = info?.bearingYears && range(info.bearingYears, t);
  const waterMm = info?.waterMm && range(info.waterMm, t);
  const litres = info?.litresPerPlant && range(info.litresPerPlant, t);
  const rain = range(entry?.needs?.rain_mm, t);
  const temperature = range(entry?.needs?.temperature_c, t);
  return [
    { label: t.cropRows.type, value: seasonal === null ? null : seasonal ? values.seasonal : values.yearRound },
    {
      label: t.cropRows.duration,
      value: days ? values.days.replace('{range}', days) : years ? values.firstHarvest.replace('{range}', years) : null,
    },
    {
      label: t.cropRows.water,
      value: waterMm
        ? values.waterMm.replace('{range}', waterMm)
        : litres
          ? values.litres.replace('{range}', litres)
          : (info?.waterNote?.[language] ?? null),
    },
    {
      label: t.cropRows.rain,
      value: rain ? (seasonal ? values.rainSeason : values.rainYear).replace('{range}', rain) : null,
    },
    { label: t.cropRows.temperature, value: temperature ? `${temperature} °C` : null },
    { label: t.cropRows.ph, value: range(entry?.needs?.ph, t) },
    { label: t.cropRows.fertility, value: entry?.fertility ? values[entry.fertility] : null },
  ];
}

// What the crop means for the farmer's own land, from their last result. Empty without a result.
export function landRows(crop: string, last: LastResult | null, t: Texts): CropRow[] {
  if (!last) {
    return [];
  }
  const { data } = last;
  const values = t.cropValues;
  // The model's crops have a share of similar land growing them; herbs, spices and the like are only checked
  // against their FAO needs (they are listed when the land suits them)
  const modelCrop = data.all_crops.find((item) => item.crop === crop);
  const tenths = modelCrop ? Math.round(modelCrop.probability * 10) : 0;
  const match = modelCrop
    ? tenths >= 1
      ? t.shareShort.replace('{n}', String(tenths))
      : t.shareRare
    : data.other_crops.some((item) => item.crop === crop)
      ? values.suitsNeeds
      : values.notSuited;
  // What farmers here really grow (the place's 5 biggest crops), and how much of the crop's land here is
  // irrigated (Agriculture Census). Karnataka only; elsewhere there are no such figures.
  const facts = data.crop_facts;
  const grown = facts?.crops.find((item) => item.crop === crop);
  const irrigated = facts?.irrigated?.[crop];
  return [
    { label: t.cropRows.match, value: match },
    {
      label: t.cropRows.grownHere,
      value: grown
        ? values.percent.replace('{n}', String(Math.max(Math.round(grown.share * 100), 1)))
        : facts
          ? values.notTop.replace('{n}', String(facts.crops.length))
          : null,
    },
    { label: t.cropRows.irrigatedHere, value: irrigated !== undefined ? values.percent.replace('{n}', String(Math.round(irrigated * 100))) : null },
  ];
}

// The crops to offer first in the compare table's list: those of the last result (best first), then the saved ones
export function suggestedCrops(last: LastResult | null, saved: string[]) {
  const fromResult = last
    ? [last.data.season_best?.crop, ...last.data.recommendations.map((item) => item.crop)].filter((crop): crop is string => !!crop)
    : [];
  return { fromResult: [...new Set(fromResult)], saved: saved.filter((crop) => !fromResult.includes(crop)) };
}
