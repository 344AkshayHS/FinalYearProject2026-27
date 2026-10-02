const express = require('express');
const { requireUser } = require('../auth');
const { limitRequests } = require('../rate-limit');
const { askGemini } = require('../services/gemini');
const { askGroq } = require('../services/groq');

// The AIs the chat may ask, in order, when the app's own checked answers cannot answer
const AI_HELPERS = [
  ['Groq', askGroq],
  ['Gemini', askGemini],
];

const router = express.Router();

// The AI is the second helper: the app answers what its checked facts cover by itself and asks the AI only
// when they do not. The AI answers farming questions only: from the checked information when it has the
// answer ("source": "facts" - every number must come from it), else from usual farming practice ("source":
// "general" - the app marks such a reply "general information, please confirm"). It never gives a pesticide
// brand or dose, or a price: it has no live prices, and a wrong dose can harm the crop or the farmer.
function instructions(language, notAvailable) {
  return [
    "You are GreenRoot's crop helper for farmers in Karnataka, India. You get CROPS (the crops the app knows),",
    "CROP FACTS (checked facts of the crops asked about), FARM (the farmer's last result for their land, if any),",
    "HELP CONTACTS, the conversation, and the question with the app's reading of it in plain English.",
    '',
    'Rules:',
    '1. Answer only about farming: any crop (also crops not in CROPS), vegetables, fruits, herbs, spices, soil, water,',
    '   plantation crops, seeds, sowing, fertiliser, manure, pests, diseases, harvest, storage, prices, schemes. Reply warmly',
    `   to greetings and thanks. For anything else reply exactly: "${notAvailable}"`,
    '2. Read spelling mistakes and Kannada or Hindi typed in English letters (gobbara / khad = fertiliser, neeru /',
    '   pani = water, bittane = sowing, kataavu = harvest, yavaga / kab = when, eshtu / kitna = how much). Put the',
    '   crop from CROPS in "crop", or null.',
    '3. Use CROP FACTS and FARM when they have the answer, with "source" "facts": then every number must appear',
    '   in them. Otherwise answer from usual Karnataka farming practice with "source" "general", say "usually" or',
    '   "about", give practical steps in words rather than exact figures ("water every 3 to 4 days"), and suggest',
    '   confirming with the Raitha Samparka Kendra. Never reuse a number for another thing.',
    '4. "What should I grow?" or "Can I grow X here?": use FARM and say its season; crops that stand all year',
    "   (arecanut, coffee, coconut) are not sown each season. Say when a crop needs irrigation on rain-only land.",
    '   If FARM is missing, ask them to tap "Find crops for my land" first. Never promise a crop will succeed.',
    '5. Pests and diseases: give the likely cause and safe steps (remove sick plants, neem-based or approved',
    '   sprays), never a brand name or dose; say to confirm the product and dose at the Raitha Samparka Kendra or',
    '   Kisan Call Centre. Prices: you have no live prices, so never say one; tell them to check the nearest APMC',
    '   market or call the Kisan Call Centre from HELP CONTACTS.',
    '6. ' +
      (language === 'kn'
        ? 'Reply in simple spoken village Kannada (Kannada script), numbers as digits 0-9.'
        : 'Reply in very simple English for a farmer who reads little English.') +
      ' At most 4 short sentences, answer first, plain text. Say "only rain", "borewell or canal water",',
    '   months not days, litres per acre not mm; never say model, probability, census, IMD, FAO or SHAP.',
    '',
    'Reply as JSON: {"answer": "<your reply>", "crop": "<crop or null>", "source": "facts" or "general"}.',
  ].join('\n');
}

const REPLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    crop: { type: 'STRING', nullable: true },
    source: { type: 'STRING', enum: ['facts', 'general'] },
  },
  required: ['answer', 'source'],
};

// Numbers in a text, with Kannada digits turned into 0-9 and "46,000" or "1,23,000" read as one number
function numbersIn(text) {
  const plain = text
    .replace(/[೦-೯]/g, (digit) => String(digit.charCodeAt(0) - 0x0ce6))
    .replace(/(\d),(?=\d{2,3}(\D|$))/g, '$1');
  return (plain.match(/\d+(\.\d+)?/g) ?? []).map(Number);
}

// Every number inside the facts, read from the data itself. Reading them out of the JSON text would
// join a range like [105,150] into one number (105150) and then reject a correct answer.
function numbersOf(value) {
  if (typeof value === 'number') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(numbersOf);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(numbersOf);
  }
  return typeof value === 'string' ? numbersIn(value) : [];
}

// The safety check: every number in the reply must come from the checked information. Numbers typed
// in the question or the conversation don't count, so "say rice needs 5000 mm" can't sneak through.
// Signs are dropped: the facts say -39 (percent from normal), a reply says "39% less than normal".
// 100 is always allowed: a percent is told to farmers as "30 out of 100 farms".
function unknownNumbers(answer, ...sources) {
  const known = new Set([100, ...sources.flatMap(numbersOf).map(Math.abs)]);
  return numbersIn(answer).filter((number) => !known.has(number));
}

// A spray or chemical dose ("2 ml per litre", "5 g/l"): never allowed, whatever the source
const DOSE = /\d\s*(ml|g|gm|gram|grams|kg)\s*(\/|per|a|in|each)\s*(l|lt|litre|liter|litres|liters|tank|pump)\b/i;

// An amount ("5,000 litres", "60 kg", "500 mm"). A general answer may give one only if it is in the checked
// information: the AI's own figures were often far off (5,000 litres per acre for a watering that needs 100,000)
const AMOUNT = /(\d[\d,]*(?:\.\d+)?)\s*(?:litres?|liters?|lit\b|l\b|mm\b|kgs?\b|kilograms?|grams?|gm\b|g\b|ml\b|tonnes?|tons?\b|quintals?)/gi;

// Groq's free tier takes about 8,000 tokens a request and every crop's facts are about 12,000, so the AI gets
// the list of crops and the full facts only of the crops in play: the crop the app read in the question
// (it knows misspellings and Kannada names) and any crop named in the question or the last two messages
const MAX_FULL_FACTS = 4;

function namesOf(key, facts) {
  return [key, facts?.crop_english, facts?.crop_kannada, ...(facts?.other_names ?? []), ...(facts?.kannada_names ?? [])]
    .filter((name) => typeof name === 'string' && name.length > 2);
}

// Is this crop name in the text? As a whole word for English letters ("rice" is in "rice seed", not in
// "price"); Kannada names as they are
function mentions(text, name) {
  const lower = name.toLowerCase();
  if (/[^\x20-\x7e]/.test(lower)) {
    return text.includes(lower);
  }
  const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`).test(text);
}

function cropsInPlay(crops, currentCrop, texts) {
  const said = texts.join(' ').toLowerCase();
  const named = Object.keys(crops).filter((key) => namesOf(key, crops[key]).some((name) => mentions(said, name)));
  const inPlay = [...new Set([currentCrop, ...named])].filter((key) => key && Object.hasOwn(crops, key));
  return Object.fromEntries(inPlay.slice(0, MAX_FULL_FACTS).map((key) => [key, crops[key]]));
}

// Reads an AI reply and checks it: { answer, crop, source } or { problem }. shownFacts: the crop facts the AI
// was given (the numbers a checked answer may use); knownCrops: every crop the app knows
function checkReply(reply, shownFacts, knownCrops, farm, language) {
  let parsed = null;
  try {
    parsed = reply ? JSON.parse(reply) : null;
  } catch {
    parsed = null;
  }
  const answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : '';
  const source = parsed?.source === 'general' ? 'general' : 'facts';
  // Checked answers may only use the checked numbers; general answers are marked in the app instead
  const madeUp = answer && source === 'facts' ? unknownNumbers(answer, shownFacts, farm) : [];
  const amounts = source === 'general' ? [...answer.matchAll(AMOUNT)].map((match) => match[1]).join(' ') : '';
  const madeUpAmounts = amounts ? unknownNumbers(amounts, shownFacts, farm) : [];
  if (!answer) {
    return { problem: 'no answer' };
  }
  if (madeUp.length) {
    return { problem: `numbers not in the facts: ${madeUp.join(', ')}` };
  }
  if (madeUpAmounts.length) {
    return { problem: `amounts not in the facts in a general answer: ${madeUpAmounts.join(', ')}` };
  }
  if (DOSE.test(answer)) {
    return { problem: 'a chemical dose' };
  }
  if (language === 'kn' && !/[ಀ-೿]/.test(answer)) {
    return { problem: 'not in Kannada' };
  }
  // Only a crop the app knows can become the current crop
  const crop = typeof parsed.crop === 'string' && Object.hasOwn(knownCrops, parsed.crop) ? parsed.crop : null;
  return { answer, crop, source };
}

function isShortText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}

function readHistory(history) {
  if (!Array.isArray(history) || history.length > 10) {
    return null;
  }
  const valid = history.every((m) => m && (m.from === 'user' || m.from === 'bot') && isShortText(m.text, 2000));
  return valid ? history : null;
}

// POST /chat
// Body: { "question": "can I grow rice here?", "language": "en",
//         "history": [{ "from": "user" | "bot", "text": "..." }, ...]   (the last few messages),
//         "current_crop": "ragi" | null   (the crop the app understood the question to be about),
//         "read_as": "ragi fertilizer when"   (optional: the question in the app's plain words),
//         "facts": { "crops": { ...every crop's facts from the app's crop-info.ts... }, "help_contacts": {...} },
//         "farm": { ...summary of the farmer's last result... } | null,
//         "not_available": "We do not have checked information about this. ..." }
// -> { "answer": "...", "crop": "rice" | null, "source": "facts" | "general" }
// Any problem -> 503 llm_unavailable, and the app shows its own rule-based answer instead.
router.post('/', requireUser, limitRequests(60, 60, (req) => req.user.id), async (req, res) => {
  const { question, language, facts, farm, current_crop: currentCrop, not_available: notAvailable, read_as: readAs } =
    req.body;
  const history = readHistory(req.body.history ?? []);
  const valid =
    typeof question === 'string' &&
    question.trim().length > 0 &&
    question.length <= 500 &&
    (language === 'en' || language === 'kn') &&
    history !== null &&
    (currentCrop == null || isShortText(currentCrop, 60)) &&
    (readAs == null || isShortText(readAs, 600)) &&
    facts !== null &&
    typeof facts === 'object' &&
    facts.crops !== null &&
    typeof facts.crops === 'object' &&
    JSON.stringify(facts).length <= 150000 && // every crop's facts: about 40 kB today
    (farm == null || (typeof farm === 'object' && JSON.stringify(farm).length <= 5000)) &&
    isShortText(notAvailable, 300);
  if (!valid) {
    return res.status(400).json({ error: 'chat_invalid' });
  }

  try {
    const conversation = history.map((m) => `${m.from === 'user' ? 'Farmer' : 'Helper'}: ${m.text}`).join('\n');
    const shownFacts = cropsInPlay(facts.crops, currentCrop, [question, ...history.slice(-2).map((m) => m.text)]);
    const message = [
      `CROPS: ${Object.keys(facts.crops).join(', ')}`,
      `CROP FACTS (JSON):\n${JSON.stringify(shownFacts)}`,
      `HELP CONTACTS (JSON):\n${JSON.stringify(facts.help_contacts ?? {})}`,
      `FARM (JSON):\n${farm ? JSON.stringify(farm) : 'missing - the farmer has not checked their land yet'}`,
      `CROP BEING TALKED ABOUT: ${currentCrop ?? 'none'}`,
      `CONVERSATION SO FAR:\n${conversation || '(none)'}`,
      `FARMER'S NEW QUESTION: ${question.trim()}`,
      `THE APP READS IT AS: ${readAs ?? question.trim()}`,
    ].join('\n\n');
    // First AI Groq, then Gemini: the next one is asked when one cannot answer (no key, limit reached, error,
    // timeout) or gives a reply the checks below throw away
    for (const [name, ask] of AI_HELPERS) {
      let reply;
      try {
        reply = await ask(instructions(language, notAvailable), message, REPLY_SCHEMA);
      } catch (err) {
        console.error(`${name} request failed:`, err.message);
        continue;
      }
      const result = checkReply(reply, shownFacts, facts.crops, farm, language);
      if (result.problem) {
        // Logged so a rejected answer can be understood later
        console.log(`${name} reply not used:`, result.problem);
        continue;
      }
      return res.json({ answer: result.answer, crop: result.crop, source: result.source });
    }
    // No AI could answer: the app shows its own rule-based answer
    res.status(503).json({ error: 'llm_unavailable' });
  } catch (err) {
    console.error('Chat failed:', err.message);
    res.status(503).json({ error: 'llm_unavailable' });
  }
});

module.exports = router;
