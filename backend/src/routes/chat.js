const express = require('express');
const { requireUser } = require('../auth');
const { LIMITS, limitRequests } = require('../rate-limit');
const { askGemini } = require('../services/gemini');
const { askGroq } = require('../services/groq');

// The AIs the chat may ask, in order, when the app's own checked answers cannot answer. Kannada questions go to
// Gemini first: Groq's Kannada was often wrong (it called neem "lemon oil"), Gemini's reads as spoken Kannada.
const AI_HELPERS = {
  en: [
    ['Groq', askGroq],
    ['Gemini', askGemini],
  ],
  kn: [
    ['Gemini', askGemini],
    ['Groq', askGroq],
  ],
};

// When the first AI has not given a usable answer after this long, the next one is asked as well and the first
// usable answer is sent: the farmer does not wait for a slow AI (Gemini sometimes stalls for 9 s) before the other
// is even asked. A normal answer takes under 1 s (Groq) or 2-3 s (Gemini), so the second is rarely needed.
const HEDGE_MS = 3500;

// Asks the AIs in order (see HEDGE_MS) and resolves with the first usable result, or null when none gave one.
// attempt(name, ask) resolves with a usable result or null and never throws.
function firstUsable(helpers, attempt) {
  return new Promise((resolve) => {
    let started = 0;
    let failed = 0;
    let done = false;
    function next() {
      if (done || started >= helpers.length) {
        return;
      }
      const [name, ask] = helpers[started++];
      const slow = setTimeout(next, HEDGE_MS);
      attempt(name, ask).then((result) => {
        clearTimeout(slow);
        if (done) {
          return;
        }
        if (result) {
          done = true;
          return resolve(result);
        }
        failed++;
        if (failed === helpers.length) {
          done = true;
          return resolve(null);
        }
        next(); // this one could not: the next one at once
      });
    }
    next();
  });
}

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
    '1. Answer every farming question: any crop (also crops not in CROPS, like apple or grapes), vegetables, fruits,',
    '   herbs, spices, soil, water, plantation crops, seeds, sowing, fertiliser, manure, pests, diseases, harvest,',
    '   storage, prices, schemes, animals on the farm. A crop with no CROP FACTS is still a farming question: answer',
    '   it from usual practice (rule 3), never with the sentence below. Reply warmly to greetings and thanks. Only a',
    `   question that is not about farming at all (films, cricket, politics, maths) gets exactly: "${notAvailable}"`,
    '2. Read spelling mistakes and Kannada or Hindi typed in English letters (gobbara / khad = fertiliser, neeru /',
    '   pani = water, bittane = sowing, kataavu = harvest, yavaga / kab = when, eshtu / kitna = how much). Put the',
    '   crop from CROPS in "crop", or null.',
    '3. Use CROP FACTS and FARM when they have the answer, with "source" "facts": then every number must appear',
    '   in them. Otherwise answer from usual Karnataka farming practice with "source" "general", say "usually" or',
    '   "about", give practical steps in words rather than exact figures ("water every 3 to 4 days"), and suggest',
    '   confirming with the Raitha Samparka Kendra. A general answer has no amounts with a unit at all (no kg,',
    '   grams, litres, mm, tonnes, quintals): say "a little", "enough to keep the soil moist", "as the officer',
    '   advises". Never reuse a number for another thing.',
    '4. "What should I grow?" or "Can I grow X here?": use FARM and say its season; crops that stand all year',
    "   (arecanut, coffee, coconut) are not sown each season. Say when a crop needs irrigation on rain-only land.",
    '   If FARM is missing, ask them to tap "Find crops for my land" first. Never promise a crop will succeed.',
    '5. Pests and diseases: give the likely cause and safe steps (remove sick plants, neem-based or approved',
    '   sprays), never a brand name or dose; say to confirm the product and dose at the Raitha Samparka Kendra or',
    '   Kisan Call Centre. Prices: you have no live prices, so never say one; tell them to check the nearest APMC',
    '   market or call the Kisan Call Centre from HELP CONTACTS.',
    '6. ' +
      (language === 'kn'
        ? 'Reply in simple spoken village Kannada (Kannada script), numbers as digits 0-9, no English words mixed in.'
        : 'Reply in very simple English for a farmer who reads little English.') +
      ' Answer first, at most 6 short sentences. Plain text; for steps put each step on its own line starting with',
    '   "- ", and you may make one or two key words **bold**. Say "only rain", "borewell or canal water",',
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

// An AI sometimes writes a line break as the two letters \n inside its JSON: made a real line break again, so the
// farmer never sees "\n" in an answer
function lineBreaks(text) {
  return text.replace(/\\n/g, '\n');
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
  const answer = typeof parsed?.answer === 'string' ? lineBreaks(parsed.answer).trim() : '';
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

// The last few messages. A long one (a list of crops) is cut to its start rather than refused: refusing it would
// stop the AI answering for the rest of the chat.
function readHistory(history) {
  if (!Array.isArray(history) || history.length > 10) {
    return null;
  }
  const valid = history.every((m) => m && (m.from === 'user' || m.from === 'bot') && isShortText(m.text, 20000));
  return valid ? history.map((m) => ({ from: m.from, text: m.text.slice(0, 2000) })) : null;
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
router.post('/', requireUser, limitRequests(LIMITS.chatPerHour, 60, (req) => req.user.id), async (req, res) => {
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
    // One AI, then the other: the next one is asked when one cannot answer (no key, limit reached, error,
    // timeout), gives a reply the checks below throw away, or is slow (HEDGE_MS)
    const result = await firstUsable(AI_HELPERS[language], async (name, ask) => {
      try {
        const reply = await ask(instructions(language, notAvailable), message, REPLY_SCHEMA);
        const checked = checkReply(reply, shownFacts, facts.crops, farm, language);
        if (checked.problem) {
          // Logged so a rejected answer can be understood later
          console.log(`${name} reply not used:`, checked.problem);
          return null;
        }
        return checked;
      } catch (err) {
        console.error(`${name} request failed:`, err.message);
        return null;
      }
    });
    if (result) {
      return res.json({ answer: result.answer, crop: result.crop, source: result.source });
    }
    // No AI could answer: the app shows its own rule-based answer
    res.status(503).json({ error: 'llm_unavailable' });
  } catch (err) {
    console.error('Chat failed:', err.message);
    res.status(503).json({ error: 'llm_unavailable' });
  }
});

// "See in English" / "ಕನ್ನಡದಲ್ಲಿ ನೋಡಿ" under an answer: the same answer in the other language. Only a translation:
// the AI may not add or drop anything, and every number must stay the same (checked below), so a translated answer
// says exactly what the checked one said.
const TRANSLATE_SCHEMA = { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] };

function translateInstructions(to) {
  return [
    'Translate the farming answer you are given for a farmer in Karnataka, India.',
    to === 'kn'
      ? 'Write it in simple spoken village Kannada (Kannada script), numbers as digits 0-9, no English words mixed in.'
      : 'Write it in very simple English for a farmer who reads little English.',
    'Translate only: add nothing, leave nothing out. Write every number with digits exactly as in the original',
    '(never as words, so "2 months" is "2 ತಿಂಗಳು", not "ಎರಡು ತಿಂಗಳು"); keep every unit, crop and phone number as it is,',
    'keep the line breaks, the ** around words and the emoji; a line starts with "- " only if it does in the original.',
    'Reply as JSON: {"text": "<the translation>"}.',
  ].join('\n');
}

// The translation, or null when it changed a number or is not in the language asked for
function checkTranslation(reply, original, to) {
  let text = '';
  try {
    text = typeof JSON.parse(reply)?.text === 'string' ? lineBreaks(JSON.parse(reply).text).trim() : '';
  } catch {
    return null;
  }
  // A "- " the AI put in front of a line of a text with no such lines is taken off again
  if (!/^\s*[-*•]\s/m.test(original)) {
    text = text.replace(/^\s*[-*•]\s+/gm, '');
  }
  const same = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
  if (!text || !same(numbersIn(text), numbersIn(original))) {
    return null;
  }
  // In the language asked for = more letters of that script (an English text may keep a Kannada crop name)
  const kannada = (text.match(/[ಀ-೿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return (to === 'kn') === kannada > latin ? text : null;
}

// POST /chat/translate   Body: { "text": "...", "to": "kn" | "en" } -> { "text": "..." }; 503 when no AI could
router.post('/translate', requireUser, limitRequests(LIMITS.chatPerHour, 60, (req) => req.user.id), async (req, res) => {
  const { text, to } = req.body ?? {};
  if (!isShortText(text, 4000) || !text.trim() || (to !== 'en' && to !== 'kn')) {
    return res.status(400).json({ error: 'chat_invalid' });
  }
  const translated = await firstUsable(AI_HELPERS[to], async (name, ask) => {
    try {
      const checked = checkTranslation(await ask(translateInstructions(to), text.trim(), TRANSLATE_SCHEMA), text, to);
      if (!checked) {
        console.log(`${name} translation not used`);
      }
      return checked;
    } catch (err) {
      console.error(`${name} translation failed:`, err.message);
      return null;
    }
  });
  if (translated) {
    return res.json({ text: translated });
  }
  res.status(503).json({ error: 'llm_unavailable' });
});

module.exports = router;
// For the tests (test/chat.test.js): the checks every AI reply must pass
module.exports.checkReply = checkReply;
module.exports.checkTranslation = checkTranslation;
module.exports.firstUsable = firstUsable;
