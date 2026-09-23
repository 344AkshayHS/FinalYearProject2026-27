// The crop helper: finds which crop and which topic (name, water, growing time) a question is about,
// in English or Kannada, and answers from the checked facts in crop-info.ts.
// It never makes up an answer: anything it doesn't know, it says so.
// The chat screen may first ask the backend's LLM (see backend/src/routes/chat.js); this file is
// what it falls back to, and it also builds the facts the LLM is allowed to use.

import { CROP_INFO, type CropInfo } from '@/lib/crop-info';
import { cropName, translations, type Language } from '@/lib/translations';

type Topic = 'name' | 'water' | 'time' | 'grow';

const ACRE_SQUARE_METRES = 4047; // 1 mm of water on 1 m² = 1 litre

// Questions that are not about one crop's facts: "what should I grow?" and "show me other crops"
const ADVICE_WORDS = /what (should|can|do) i (grow|plant|sow)|which crop should|best crop for|suggest|recommend|ಯಾವ ಬೆಳೆ|ಬೆಳೆಯಬೇಕು|ಶಿಫಾರಸು/;
const LIST_WORDS = /\b(other|another|all|different|more|list of|list)\b[^.]*\bcrops?\b|\bcrops?\b[^.]*\b(list|names)\b|ಇತರ ಬೆಳೆ|ಬೇರೆ ಬೆಳೆ|ಎಲ್ಲ ಬೆಳೆ|ಬೆಳೆಗಳ ಪಟ್ಟಿ/;

const TOPIC_WORDS: Record<Topic, RegExp> = {
  name: /\bnames?\b|\bcalled\b|\bscientific\b|\bknown as\b|ಹೆಸರು|ಹೆಸರೇನು|ಕರೆಯ/,
  water: /water|irrigat|\blit(re|er)s?\b|ನೀರ/,
  grow: /\bsow\b|sowing|\bplant\b|planting|season|seed rate|\bseed\b|spacing|fertili[sz]er|manure|urea|dose|ಬಿತ್ತ|ಅಂತರ|ಗೊಬ್ಬರ|ಬೀಜ/,
  time: /\bmonths?\b|\bdays?\b|\bweeks?\b|\byears?\b|how long|\btime\b|harvest|duration|matur|ತಿಂಗಳ|ದಿನ|ಸಮಯ|ಕಟಾವು|ವರ್ಷ|ಕಾಲ/,
};

// Every word that points to a crop, longest first, so "green gram" wins over "gram"
// and "ಮೆಕ್ಕೆಜೋಳ" wins over "ಜೋಳ"
const CROP_WORDS = Object.entries(CROP_INFO)
  .flatMap(([crop, info]) => [crop, ...info.otherNames, ...info.kannadaNames].map((word) => ({ word, crop })))
  .sort((a, b) => b.word.length - a.word.length);

function isLatin(word: string) {
  return /^[a-z ()-]+$/.test(word);
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

// A short line for every crop, for questions that compare crops ("which crop needs least water?").
// Same numbers as cropFacts, only fewer of them, so the whole list stays small.
export function allCropFacts() {
  return Object.keys(CROP_INFO).map((crop) => {
    const info = CROP_INFO[crop];
    return {
      crop: cropName(crop, 'en'),
      kannada: cropName(crop, 'kn'),
      days_sowing_to_harvest: info.days,
      years_from_planting_to_first_harvest: info.bearingYears,
      total_water_mm_whole_crop: info.waterMm,
      average_water_mm_per_day: dailyWater(info)?.mm,
      drip_water_litres_per_plant_per_day: info.litresPerPlant,
    };
  });
}

// The exact sentence for "we don't have that", in the reply language
export function notAvailable(crop: string, language: Language) {
  return fill(translations[language].chat.noData, { crop: cropName(crop, language) });
}

// `askLlm` is false for answers only this app can give (which screen to use, the crop list),
// so the chat screen does not send those to the LLM.
export type BotReply = { text: string; crop: string | null; askLlm: boolean };

// `currentCrop` is the crop being talked about, so "how much water?" works without naming it again
export function answerQuestion(question: string, currentCrop: string | null, language: Language): BotReply {
  const t = translations[language].chat;
  let text = question.toLowerCase().replace(/[?!.,’'"]/g, ' ');

  const match = findCrop(text);
  if (match) {
    text = text.replace(match.word, ' '); // so "ಹೆಸರು ಕಾಳು" (green gram) is not read as "ಹೆಸರು" (name)
  }
  const crop = match?.crop ?? currentCrop;
  const topics = (Object.keys(TOPIC_WORDS) as Topic[]).filter((topic) => TOPIC_WORDS[topic].test(text));

  // "What should I grow?" is the job of the home screen, not of this chat
  if (ADVICE_WORDS.test(text)) {
    return { text: t.growAdvice, crop, askLlm: false };
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
  const answers = (topics.length > 0 ? topics : (['name', 'time', 'water', 'grow'] as Topic[])).map((topic) => {
    if (topic === 'name') return nameAnswer(crop, info, language);
    if (topic === 'time') return timeAnswer(crop, info, language);
    if (topic === 'grow') return growAnswer(crop, info, language);
    return waterAnswer(crop, info, language);
  });
  answers.push(sourceLine(crop, language));
  return { text: answers.join('\n\n'), crop, askLlm: true };
}
