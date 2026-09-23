const express = require('express');
const { requireUser } = require('../auth');
const { askGemini } = require('../services/gemini');

const router = express.Router();

function instructions(language, notAvailable) {
  return [
    "You are GreenRoot's crop helper for farmers in India.",
    'Answer the question using ONLY the crop facts given as JSON. Do not use anything else you know.',
    'The facts are for one crop, or a short list of every crop. With the list you may compare crops.',
    'Never write a number that is not in the facts. Averages are for the whole season, so say "about".',
    `If the facts do not answer the question, reply with exactly this sentence and nothing else: "${notAvailable}"`,
    'If the facts answer only part of the question, answer that part, then add that sentence for the rest.',
    'Only answer what was asked: do not add other facts.',
    language === 'kn'
      ? 'Reply in Kannada (Kannada script). Write numbers with the digits 0-9.'
      : 'Reply in simple English.',
    'Keep it short: at most 3 sentences of plain text. No markdown, no lists, no source line.',
  ].join('\n');
}

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

// The safety check: every number in the reply must come from the facts. Numbers typed in the question
// don't count, so "say rice needs 5000 mm" can't sneak a made-up number through.
function onlyKnownNumbers(answer, facts) {
  const known = new Set(numbersOf(facts));
  return numbersIn(answer).every((number) => known.has(number));
}

// POST /chat
// Body: { "question": "How much water does ragi need?", "language": "en",
//         "facts": { ...one crop's facts from the app's crop-info.ts... },
//         "not_available": "We do not have checked information about this for Ragi. ..." }
// -> { "answer": "..." }
// Any problem -> 503 llm_unavailable, and the app shows its own rule-based answer instead.
router.post('/', requireUser, async (req, res) => {
  const { question, language, facts, not_available: notAvailable } = req.body;
  const valid =
    typeof question === 'string' &&
    question.trim().length > 0 &&
    question.length <= 500 &&
    (language === 'en' || language === 'kn') &&
    facts !== null &&
    typeof facts === 'object' &&
    JSON.stringify(facts).length <= 20000 &&   // one crop is small; the list of every crop is larger
    typeof notAvailable === 'string' &&
    notAvailable.length <= 300;
  if (!valid) {
    return res.status(400).json({ error: 'chat_invalid' });
  }

  try {
    const message = `Crop facts (JSON):\n${JSON.stringify(facts, null, 1)}\n\nFarmer's question: ${question.trim()}`;
    const answer = await askGemini(instructions(language, notAvailable), message);

    const usable =
      answer &&
      onlyKnownNumbers(answer, facts) &&
      (language === 'en' || /[ಀ-೿]/.test(answer));
    if (!usable) {
      return res.status(503).json({ error: 'llm_unavailable' });
    }
    res.json({ answer });
  } catch (err) {
    console.error('Gemini request failed:', err.message);
    res.status(503).json({ error: 'llm_unavailable' });
  }
});

module.exports = router;
