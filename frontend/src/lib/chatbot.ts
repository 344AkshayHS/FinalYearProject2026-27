// The crop helper: finds which crop and which topic (name, water, growing time) a question is about,
// in English or Kannada, and answers from the checked facts in crop-info.ts.
// It never makes up an answer: anything it doesn't know, it says so.
// The chat screen first asks the backend's LLM (see backend/src/routes/chat.js) with the facts and the
// farm summary built here; the rule-based answer below is what it falls back to.

import type { RecommendResponse, WaterSource } from '@/components/results';
import { CROP_INFO, type CropInfo } from '@/lib/crop-info';
import { CROP_SPELLINGS, normaliseQuestion, typedInLocalWords } from '@/lib/farmer-words';
import { mostlyIrrigatedShare } from '@/lib/crop-water';
import { YEAR_ROUND_CROPS, type Season } from '@/lib/season';
import { cropName, districtName, talukName, translations, type Language } from '@/lib/translations';

type Topic = 'name' | 'water' | 'time' | 'grow';

const ACRE_SQUARE_METRES = 4047; // 1 mm of water on 1 m² = 1 litre

// Questions that are not about one crop's facts: "what should I grow?" and "show me other crops"
const ADVICE_WORDS =
  /what (should|can|do) i (grow|plant|sow)|can i (grow|plant|sow)|which crop should|best crop for|suggest|recommend|ಯಾವ ಬೆಳೆ|ಬೆಳೆಯಬಹುದೇ|ಬೆಳೆಯಬೇಕು|ಶಿಫಾರಸು/;
const GREETING_WORDS =
  /^\s*(hi+|hello+|helo|hey+|hai|namaste|namaskara|namaskar|namskara|good (morning|afternoon|evening)|thanks?|thank you|thanku|thanx|dhanyavada|dhanyavadagalu|ok(ay)?|ನಮಸ್ಕಾರ|ಹಾಯ್|ಧನ್ಯವಾದ)\b(\s+(sir|madam|anna|akka|ji|bro|guru|swamy))?[\s!.]*$/;
// Pests, diseases, prices, loans: nothing checked in the app, so the farmer is sent to people who know
const OUTSIDE_WORDS =
  /pest|insect|disease|infect|fung|virus|rot\b|wilt|blight|spray|pesticide|price|(?<!seed )rate\b|market|loan|subsidy|insurance|ಕೀಟ|ರೋಗ|ಬೆಲೆ|ಸಾಲ|ಸಬ್ಸಿಡಿ/;
// Of those, pests and diseases also go to the AI, for the likely cause and safe first steps (never a dose);
// prices and loans do not: no AI knows today's price, so the app's own answer sends the farmer to the market
const PEST_WORDS = /pest|insect|disease|infect|fung|virus|rot\b|wilt|blight|spray|pesticide|ಕೀಟ|ರೋಗ/;
const MONEY_WORDS = /price|(?<!seed )rate\b|market|loan|subsidy|insurance|ಬೆಲೆ|ಸಾಲ|ಸಬ್ಸಿಡಿ/;

// Official help the LLM may point to (the only phone number it is allowed to write)
export const HELP_CONTACTS = {
  kisan_call_centre: 'Kisan Call Centre, free call 1800-180-1551 (Government of India), answers in Kannada',
  raitha_samparka_kendra: 'Raitha Samparka Kendra: the Karnataka agriculture department office in every hobli',
  krishi_vigyan_kendra: 'Krishi Vigyan Kendra (KVK): the farm science centre of the district',
};
const LIST_WORDS = /\b(other|another|all|different|more|list of|list)\b[^.]*\bcrops?\b|\bcrops?\b[^.]*\b(list|names)\b|ಇತರ ಬೆಳೆ|ಬೇರೆ ಬೆಳೆ|ಎಲ್ಲ ಬೆಳೆ|ಬೆಳೆಗಳ ಪಟ್ಟಿ/;

// Also the ways farmers type on a phone: common misspellings ("watr", "sowin", "harvst") and Kannada in
// English letters ("neeru" water, "bittane" sowing, "gobbara" manure, "dina" days, "kataavu" harvest)
const TOPIC_WORDS: Record<Topic, RegExp> = {
  name: /\bnames?\b|\bcalled\b|\bscientific\b|\bknown as\b|ಹೆಸರು|ಹೆಸರೇನು|ಕರೆಯ/,
  water: /water|wat[ae]?r\b|wter|irrigat|irigat|\blit(re|er)s?\b|\bneeru\b|\bniru\b|\bneer\b|ನೀರ/,
  grow: /\bsow\b|sowing|\bsowin\b|\bsoing\b|\bplant\b|planting|plantin|season|seed rate|\bseeds?\b|spacing|fertili[sz]er|fertlizer|manure|urea|dose|bittane|bitthane|\bbittu\b|\bbeeja\b|\bbija\b|gobbara|ಬಿತ್ತ|ಅಂತರ|ಗೊಬ್ಬರ|ಬೀಜ/,
  time: /\bmonths?\b|\bdays?\b|\bweeks?\b|\byears?\b|how long|\btime\b|harvest|harvst|havest|duration|matur|\bdina\b|thingalu|tingalu|kataavu|katavu|ತಿಂಗಳ|ದಿನ|ಸಮಯ|ಕಟಾವು|ವರ್ಷ|ಕಾಲ/,
};

// Words that ask for nothing in particular: "tell me about ragi" is still just "ragi"
const FILLER_WORDS = new Set([
  'what', 'how', 'the', 'for', 'about', 'tell', 'crop', 'crops', 'details', 'detail', 'information', 'info',
  'all', 'show', 'give', 'know', 'want', 'please', 'this', 'that', 'and', 'with', 'you', 'your', 'can', 'need',
  'much', 'many', 'some', 'any', 'more', 'explain', 'describe', 'full',
]);

// Words the typing-mistake match must never turn into a crop
const EVERYDAY_WORDS = new Set([
  'what', 'when', 'where', 'which', 'much', 'many', 'need', 'needs', 'does', 'have', 'this', 'that', 'with',
  'from', 'grow', 'crop', 'crops', 'time', 'long', 'days', 'plant', 'seed', 'soil', 'land', 'rain', 'best',
  'good', 'here', 'there', 'will', 'shall', 'should', 'could', 'would', 'about', 'give', 'tell', 'more',
  'less', 'price', 'rate', 'field', 'farm', 'water', 'month', 'months', 'year', 'years', 'wheat', 'rice',
]);


// Every word that points to a crop, longest first, so "green gram" wins over "gram"
// and "ಮೆಕ್ಕೆಜೋಳ" wins over "ಜೋಳ"
const CROP_WORDS = Object.entries(CROP_INFO)
  .flatMap(([crop, info]) =>
    [crop, ...info.otherNames, ...info.kannadaNames, ...(CROP_SPELLINGS[crop] ?? [])].map((word) => ({ word, crop })))
  .sort((a, b) => b.word.length - a.word.length);

function isLatin(word: string) {
  return /^[a-z ()-]+$/.test(word);
}

// True when two words differ by one letter at most (added, missing or changed): "coffe" ~ "coffee"
function oneLetterApart(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const restA = a.slice(i);
  const restB = b.slice(i);
  return restA.slice(1) === restB.slice(1) || restA === restB.slice(1) || restA.slice(1) === restB;
}

function findCrop(text: string) {
  for (const { word, crop } of CROP_WORDS) {
    // English words must match whole words ("rice" is not in "price", "tur" is not in "turmeric")
    const found = isLatin(word)
      ? new RegExp(`\\b${word.replace(/[()]/g, '\\$&')}\\b`).test(text)
      : text.includes(word);
    if (found) {
      return { crop, word };
    }
  }
  // A typing mistake in a single-word English name of 5 letters or more ("coffe", "tomatto"), but never an
  // everyday word that happens to be one letter away ("what" ~ "wheat")
  for (const typed of text.split(/[\s?.,!]+/).filter((w) => w.length >= 4 && !EVERYDAY_WORDS.has(w))) {
    const near = CROP_WORDS.find(({ word }) => isLatin(word) && !word.includes(' ') && word.length >= 5 && oneLetterApart(typed, word));
    if (near) {
      return { crop: near.crop, word: typed };
    }
  }
  return null;
}

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
}

// [95, 95] -> "95", [120, 150] -> "120–150"
function range([min, max]: [number, number]) {
  return min === max ? String(min) : `${min}–${max}`;
}

// Half-month steps, e.g. 105 days -> 3.5
function months(days: number) {
  return Math.round((days / 30) * 2) / 2;
}

// Average daily water over the season: total water / number of days
function dailyWater(info: CropInfo) {
  if (!info.waterMm || !info.days) {
    return null;
  }
  const averageMm = (info.waterMm[0] + info.waterMm[1]) / 2;
  const averageDays = (info.days[0] + info.days[1]) / 2;
  const mm = Math.round((averageMm / averageDays) * 10) / 10;
  const litresPerAcre = Math.round((mm * ACRE_SQUARE_METRES) / 1000) * 1000;
  return { mm, litresPerAcre };
}

// Answer in the language the question was typed in; tapped chips are already in the app language
export function replyLanguage(question: string, appLanguage: Language): Language {
  if (/[ಀ-೿]/.test(question)) {
    return 'kn';
  }
  // Kannada typed in English letters ("togari ge eshtu neeru"): reply in the app's language
  if (typedInLocalWords(question)) {
    return appLanguage;
  }
  return /[a-zA-Z]/.test(question) ? 'en' : appLanguage;
}

function nameAnswer(crop: string, info: CropInfo, language: Language) {
  const t = translations[language].chat;
  let answer = fill(t.nameAnswer, {
    crop: cropName(crop, 'en'),
    kn: cropName(crop, 'kn'),
    scientific: info.scientific,
  });
  // Skip names already in the title, e.g. "tur" in "Pigeonpea (tur)"
  const others = info.otherNames.filter((name) => !crop.includes(name));
  if (others.length > 0) {
    answer += ' ' + fill(t.otherNames, { names: others.join(', ') });
  }
  return answer;
}

function timeAnswer(crop: string, info: CropInfo, language: Language) {
  const t = translations[language].chat;
  const name = cropName(crop, language);
  if (info.bearingYears) {
    return fill(t.treeTime, { crop: name, years: range(info.bearingYears) });
  }
  if (!info.days) {
    return fill(t.noTime, { crop: name });
  }
  return fill(t.seasonTime, {
    crop: name,
    months: range([months(info.days[0]), months(info.days[1])]),
    days: range(info.days),
  });
}

function waterAnswer(crop: string, info: CropInfo, language: Language) {
  const t = translations[language].chat;
  const name = cropName(crop, language);
  const parts: string[] = [];

  const daily = dailyWater(info);
  if (info.waterMm && daily) {
    parts.push(
      fill(t.seasonWater, {
        crop: name,
        mm: range(info.waterMm),
        daily: daily.mm.toFixed(1),
        litres: daily.litresPerAcre.toLocaleString('en-IN'),
      })
    );
  }
  if (info.litresPerPlant) {
    parts.push(fill(t.treeWater, { crop: name, litres: range(info.litresPerPlant) }));
  }
  if (info.waterNote) {
    parts.push(info.waterNote[language]);
  }
  if (parts.length === 0) {
    parts.push(fill(t.noWater, { crop: name }));
  }
  return parts.join(' ');
}

function growAnswer(crop: string, info: CropInfo, language: Language) {
  const t = translations[language].chat;
  const name = cropName(crop, language);
  const parts = [
    info.season && fill(t.growSeason, { crop: name, season: info.season }),
    info.seedRate && fill(t.growSeed, { seed: info.seedRate }),
    info.spacing && fill(t.growSpacing, { spacing: info.spacing }),
    info.fertiliser && fill(t.growFertiliser, { fertiliser: info.fertiliser }),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : fill(t.noGrow, { crop: name });
}

// The water facts we have for a crop, as one text (also used by the daily water card).
// The model can recommend a crop we have no checked facts for, so say that instead of showing nothing.
export function waterFacts(crop: string, language: Language) {
  const info = CROP_INFO[crop];
  return info ? waterAnswer(crop, info, language) : notAvailable(crop, language);
}

export function sourceLine(crop: string, language: Language) {
  const info = CROP_INFO[crop];
  return info ? `${translations[language].chat.source}: ${info.source}` : '';
}

// What the LLM may use for one crop: the checked facts plus the same averages the rule-based answer
// shows. Missing facts are simply left out, so the LLM has nothing to guess from.
export function cropFacts(crop: string) {
  const info = CROP_INFO[crop];
  const daily = dailyWater(info);
  return {
    crop_english: cropName(crop, 'en'),
    crop_kannada: cropName(crop, 'kn'),
    scientific_name: info.scientific,
    other_names: info.otherNames,
    kannada_names: info.kannadaNames,
    days_sowing_to_harvest: info.days,
    months_sowing_to_harvest: info.days && [months(info.days[0]), months(info.days[1])],
    years_from_planting_to_first_harvest: info.bearingYears,
    total_water_mm_whole_crop: info.waterMm,
    average_water_mm_per_day: daily?.mm,
    average_water_litres_per_acre_per_day: daily?.litresPerAcre,
    drip_water_litres_per_plant_per_day: info.litresPerPlant,
    water_advice_english: info.waterNote?.en,
    water_advice_kannada: info.waterNote?.kn,
    sowing_season: info.season,
    seed_rate: info.seedRate,
    spacing: info.spacing,
    fertiliser_without_soil_test: info.fertiliser,
  };
}

// Every crop's checked facts, keyed by our crop name, so the LLM can find the crop itself - with
// spelling mistakes, in Kannada, or from the conversation - and compare crops
export function allCropFacts() {
  return Object.fromEntries(Object.keys(CROP_INFO).map((crop) => [crop, cropFacts(crop)]));
}

// What the app knows about the farmer's land from their last "Find crops" result, for questions like
// "can I grow rice here?". Only the app's own numbers: the model's crops and the government figures.
export type FarmSummary = {
  place: string;
  checked_as: string;
  water_for_this_land: string;
  season_the_crops_are_for: string;
  field_crops_to_sow_this_season: { crop: string; percent_of_similar_land_growing_it: number }[];
  best_crop_to_sow_this_season: string | null; // set when the model's top crop stands all year
  herbs_spices_plantation_suited_by_fao_needs: { crop: string; group: string }[];
  district_sowed_most_this_season: { source: string; crops: { crop: string; hectares: number; percent_of_field_crops: number }[] } | null;
  percent_of_district_field_crops_sown_in_this_season: number | null;
  model_top_crops_for_this_land: {
    crop: string;
    percent_of_similar_land_growing_it: number;
    stands_in_the_field_all_year: boolean;
    needs_irrigation_on_this_land: boolean;
    percent_of_its_land_irrigated_here?: number;
  }[];
  what_farmers_really_grow_here: { area: string; crops: { crop: string; percent_of_all_cropped_land: number }[] } | null;
  this_season_rain: { since: string; rain_mm: number; normal_mm: number; percent_from_normal: number; imd_category: string } | null;
};

const SEASON_TEXT: Record<Season, string> = {
  Kharif: 'Kharif (sown with the monsoon, June to September)',
  Rabi: 'Rabi (sown after the monsoon, October to January)',
  Summer: 'Summer (sown February to May)',
};

export function farmSummary(result: RecommendResponse, waterSource: WaterSource): FarmSummary {
  const { location, area, crop_facts: grown, season_rain: season } = result;
  const place = [location.taluk && `${talukName(location.taluk)} taluk`, location.district && districtName(location.district, 'en'), location.state]
    .filter(Boolean)
    .join(', ');
  return {
    place,
    checked_as:
      area === 'point'
        ? 'the exact GPS point of the farm'
        : `the whole ${area} (the model averaged over ${result.sample_points} sample farms)`,
    water_for_this_land:
      waterSource === 'rain' ? 'rain only (rain-fed)' : 'irrigated (borewell, canal or tank)',
    season_the_crops_are_for: SEASON_TEXT[result.season],
    // not ranked by the model: chosen by FAO EcoCrop needs against the land's pH, temperature and rain
    herbs_spices_plantation_suited_by_fao_needs: result.other_crops.map((item) => ({ crop: item.crop, group: item.group })),
    district_sowed_most_this_season: result.season_sowing
      ? {
          source: result.season_sowing.source,
          crops: result.season_sowing.crops.map((item) => ({
            crop: item.crop,
            hectares: item.area_ha,
            percent_of_field_crops: Math.round(item.share * 100),
          })),
        }
      : null,
    best_crop_to_sow_this_season: result.season_best?.crop ?? null,
    field_crops_to_sow_this_season: result.sow_this_season.map((item) => ({
      crop: item.crop,
      percent_of_similar_land_growing_it: Math.round(item.probability * 100),
    })),
    percent_of_district_field_crops_sown_in_this_season:
      result.season_sown_share === null ? null : Math.round(result.season_sown_share * 100),
    model_top_crops_for_this_land: result.recommendations.map((item) => {
      // most farmers here irrigate it (census, Karnataka only) - so on rain-fed land it needs irrigation
      const irrigated = mostlyIrrigatedShare(grown?.irrigated, item.crop);
      return {
        crop: item.crop,
        percent_of_similar_land_growing_it: Math.round(item.probability * 100),
        stands_in_the_field_all_year: YEAR_ROUND_CROPS.includes(item.crop),
        needs_irrigation_on_this_land: waterSource === 'rain' && irrigated !== null,
        ...(irrigated !== null && { percent_of_its_land_irrigated_here: Math.round(irrigated * 100) }),
      };
    }),
    this_season_rain: season
      ? { since: season.from, rain_mm: season.rain_mm, normal_mm: season.normal_mm, percent_from_normal: season.percent_from_normal, imd_category: season.imd_category }
      : null,
    what_farmers_really_grow_here: grown
      ? {
          area: `${grown.level === 'taluk' ? talukName(grown.name) + ' taluk' : districtName(grown.name, 'en') + ' district'} (${grown.level === 'taluk' ? 'Agriculture Census and Karnataka DES' : 'district crop statistics'}, all seasons of the year together)`,
          crops: grown.crops.map((item) => ({ crop: item.crop, percent_of_all_cropped_land: Math.round(item.share * 100) })),
        }
      : null,
  };
}

// The exact sentence for "we don't have that", in the reply language
export function notAvailable(crop: string, language: Language) {
  return fill(translations[language].chat.noData, { crop: cropName(crop, language) });
}

// `askLlm` is false for answers only this app can give (which screen to use, the crop list),
// so the chat screen does not send those to the LLM.
export type BotReply = { text: string; crop: string | null; askLlm: boolean };

// `currentCrop` is the crop being talked about, so "how much water?" works without naming it again.
// `farm` is the farmer's last result, if any, for "what should I grow here?".
export function answerQuestion(question: string, currentCrop: string | null, language: Language, farm?: FarmSummary | null): BotReply {
  const t = translations[language].chat;
  // In the plain words the checks below look for: "togari ge eshtu neeru beku" -> "togari how much water need"
  let text = normaliseQuestion(question);

  // `askLlm`: the app answers by itself whatever its checked facts cover; the AI (Groq, then Gemini) is asked only
  // when they do not - a detail or crop they lack, a question the app cannot read
  if (GREETING_WORDS.test(question.toLowerCase())) {
    return { text: t.greeting, crop: currentCrop, askLlm: false };
  }

  const match = findCrop(text);
  if (match) {
    // so "ಹೆಸರು ಕಾಳು" (green gram) is not read as "ಹೆಸರು" (name); English names as whole words only, so "rice"
    // does not cut "price" in "price of rice"
    text = isLatin(match.word)
      ? text.replace(new RegExp(`\\b${match.word.replace(/[()]/g, '\\$&')}\\b`), ' ')
      : text.replace(match.word, ' ');
  }
  // A question that names no crop is about the crop being talked about - unless it names a crop we
  // do not know, which the LLM can tell; here the old crop is kept
  const crop = match?.crop ?? currentCrop;
  const topics = (Object.keys(TOPIC_WORDS) as Topic[]).filter((topic) => TOPIC_WORDS[topic].test(text));

  // Pests, diseases, prices, loans: not in our checked facts
  if (OUTSIDE_WORDS.test(text)) {
    return { text: t.outsideTopics, crop, askLlm: PEST_WORDS.test(text) && !MONEY_WORDS.test(text) };
  }
  // "What should I grow?" / "Can I grow rice here?": the answer is the farmer's own result
  if (ADVICE_WORDS.test(text)) {
    const top = farm?.model_top_crops_for_this_land.slice(0, 3).map((item) => cropName(item.crop, language));
    // "Can I grow rice here?" names a crop: the LLM says whether it is among the land's crops
    return { text: top ? fill(t.adviceFromResult, { place: farm!.place, crops: top.join(', ') }) : t.growAdvice, crop, askLlm: Boolean(top && match) };
  }
  // "Show me other crops": the farmer wants to know which crops can be asked about
  if (LIST_WORDS.test(text)) {
    const names = Object.keys(CROP_INFO).map((name) => cropName(name, language)).join(', ');
    return { text: fill(t.cropList, { crops: names }), crop, askLlm: false };
  }

  if (!crop) {
    // No crop named yet: the LLM may still answer from the short facts of all crops
    return { text: topics.length > 0 ? t.whichCrop : t.notUnderstood, crop: null, askLlm: true };
  }
  if (!match && topics.length === 0) {
    return { text: t.notUnderstood, crop, askLlm: true };
  }

  // Only a crop name was typed: tell everything we know about it
  const info = CROP_INFO[crop];
  // A topic the checked facts do not cover for this crop is passed on to the LLM
  const covered: Record<Topic, boolean> = {
    name: true,
    time: Boolean(info.days || info.bearingYears),
    water: Boolean(info.waterMm || info.litresPerPlant),
    grow: Boolean(info.season || info.seedRate || info.spacing || info.fertiliser),
  };
  const answers = (topics.length > 0 ? topics : (['name', 'time', 'water', 'grow'] as Topic[])).map((topic) => {
    if (topic === 'name') return nameAnswer(crop, info, language);
    if (topic === 'time') return timeAnswer(crop, info, language);
    if (topic === 'grow') return growAnswer(crop, info, language);
    return waterAnswer(crop, info, language);
  });
  answers.push(sourceLine(crop, language));
  // A crop named with other words the app cannot read ("how to prepare land for ragi") is a question about
  // something else: the LLM answers it, and the crop's overview above is only the fallback
  const otherWords = text.split(' ').filter((word) => word.length > 2 && !FILLER_WORDS.has(word));
  const unread = topics.length === 0 && otherWords.length > 0;
  return { text: answers.join('\n\n'), crop, askLlm: unread || topics.some((topic) => !covered[topic]) };
}
