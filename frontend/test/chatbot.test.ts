// Tests for the crop helper chat's own answers (src/lib/chatbot.ts): the questions farmers really type, in
// English, Kannada and Kannada in English letters. Run from the frontend folder:  npm test

import assert from 'node:assert';
import test from 'node:test';

import { answerQuestion, followUpQuestions, isWeatherQuestion, type FarmSummary } from '@/lib/chatbot';
import { CROP_INFO } from '@/lib/crop-info';
import { normaliseQuestion } from '@/lib/farmer-words';
import { cropName, translations } from '@/lib/translations';

const en = translations.en.chat;
const ask = (question: string, crop: string | null = null, language: 'en' | 'kn' = 'en') => answerQuestion(question, crop, language);

test('greetings get a greeting, without asking the AI', () => {
  for (const question of ['hi', 'Hello!', 'namaskara', 'ನಮಸ್ಕಾರ', 'thank you sir']) {
    const reply = ask(question);
    assert.strictEqual(reply.text, en.greeting, question);
    assert.strictEqual(reply.askLlm, false, question);
  }
});

test('weather questions are answered by the app from the forecast', () => {
  for (const question of [
    "What is today's weather?",
    'weather',
    'will it rain tomorrow',
    'is it hot today',
    'ಇಂದು ಮಳೆ ಬರುತ್ತಾ?',
    'ನಾಳೆ ಹವಾಮಾನ ಹೇಗಿದೆ',
    'indu male barutta',
  ]) {
    const reply = ask(question);
    assert.strictEqual(reply.weather, true, question);
    assert.strictEqual(reply.askLlm, false, question);
  }
});

test('questions about a crop\'s rain or temperature need are not weather questions', () => {
  for (const question of ['how much rain does ragi need', 'temperature for rice', 'rice water']) {
    assert.strictEqual(isWeatherQuestion(normaliseQuestion(question)), false, question);
  }
});

test('a water question about a crop is answered from the checked facts', () => {
  const reply = ask('how much water does ragi need');
  assert.strictEqual(reply.crop, 'ragi');
  assert.match(reply.text, /litres/);
  assert.strictEqual(reply.askLlm, false);
});

test('Kannada typed in English letters is understood', () => {
  const reply = ask('ragi ge eshtu neeru beku');
  assert.strictEqual(reply.crop, 'ragi');
  assert.match(reply.text, /litres/);
});

test('a question in Kannada gets a Kannada answer', () => {
  const reply = ask('ರಾಗಿ ನೀರು', null, 'kn');
  assert.strictEqual(reply.crop, 'ragi');
  assert.match(reply.text, /[ಀ-೿]/);
});

test('a follow-up question stays on the crop being talked about', () => {
  const reply = ask('how many days', 'groundnut');
  assert.strictEqual(reply.crop, 'groundnut');
  assert.match(reply.text, /days/);
});

test('prices and loans are sent to the Kisan Call Centre, never to the AI', () => {
  for (const question of ['price of rice', 'loan for farming', 'ragi market rate']) {
    const reply = ask(question);
    assert.strictEqual(reply.text, en.outsideTopics, question);
    assert.strictEqual(reply.askLlm, false, question);
  }
});

test('pests and diseases also go to the AI, for safe first steps', () => {
  const reply = ask('my coffee has a disease');
  assert.strictEqual(reply.askLlm, true);
});

test('"what should I grow?" without a result points to the home screen', () => {
  const reply = ask('what should i grow');
  assert.strictEqual(reply.text, en.growAdvice);
});

test('something the app cannot read goes to the AI, with a fallback text', () => {
  const reply = ask('xyz qwerty');
  assert.strictEqual(reply.text, en.notUnderstood);
  assert.strictEqual(reply.askLlm, true);
});

test('every crop of the chat is found by its English and its Kannada name', () => {
  for (const crop of Object.keys(CROP_INFO)) {
    assert.strictEqual(ask(cropName(crop, 'en')).crop, crop, cropName(crop, 'en'));
    assert.strictEqual(ask(cropName(crop, 'kn'), null, 'kn').crop, crop, cropName(crop, 'kn'));
  }
});

test('a very long or odd question does not break the chat', () => {
  assert.ok(ask('water '.repeat(500)).text);
  assert.ok(ask('???!!!...').text);
  assert.ok(ask('').text);
});

// Words in English letters a Kannada answer may keep: the English name of the crop and its scientific name (both
// named as such in the answer), the short names of the sources, the fertiliser formula N : P2O5 : K2O, pH (written
// so in Kannada too) and the tomato variety CO 3
const KEEP_IN_KANNADA = new Set(['TNAU', 'FAO', 'PAU', 'ICRISAT', 'ICAR', 'CAZRI', 'CRIJAF', 'N', 'P2O5', 'K2O', 'CO', 'pH']);

test('in both languages a sowing detail ends with one full stop, and no letter is lost', () => {
  assert.match(ask('ragi sowing').text, /June to July as a rainfed crop\. Seed needed: 10 kg per hectare\./);
  assert.match(ask('ರಾಗಿ ಬಿತ್ತನೆ', null, 'kn').text, /ಜೂನ್‌ನಿಂದ ಜುಲೈ\. ಬೇಕಾದ ಬೀಜ: ಹೆಕ್ಟೇರ್‌ಗೆ 10 ಕೆ\.ಜಿ\. ಅಂತರ/);
});

test('a Kannada answer about any crop has no English words left in it', () => {
  for (const crop of Object.keys(CROP_INFO)) {
    let text = ask(cropName(crop, 'kn'), null, 'kn').text;
    text = text.replace(cropName(crop, 'en'), ' ');
    for (const word of CROP_INFO[crop].scientific.split(/[\s(),]+/).filter(Boolean)) text = text.replaceAll(word, ' ');
    const english = (text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []).filter((word) => !KEEP_IN_KANNADA.has(word));
    assert.deepStrictEqual(english, [], `${crop}: ${english.join(', ')}`);
  }
});

test('every suggested follow-up question is one the app answers itself, for every crop, in both languages', () => {
  const farm = { place: 'Udupi', model_top_crops_for_this_land: [{ crop: 'rice' }] } as unknown as FarmSummary;
  for (const language of ['en', 'kn'] as const) {
    const notUnderstood = translations[language].chat.notUnderstood;
    for (const crop of [...Object.keys(CROP_INFO), null]) {
      for (const question of followUpQuestions('hi', crop, language, farm)) {
        const reply = answerQuestion(question, crop, language, farm);
        assert.notStrictEqual(reply.text, notUnderstood, `${language} ${crop}: "${question}" was not understood`);
        assert.strictEqual(reply.askLlm, false, `${language} ${crop}: "${question}" went to the AI`);
      }
    }
  }
});

test('suggestions leave out what was just asked, and offer at most 3', () => {
  const after = followUpQuestions('how much water does ragi need', 'ragi', 'en');
  assert.ok(after.length <= 3 && after.length > 0);
  assert.ok(!after.some((question) => /water/.test(question)), after.join(' | '));
  assert.ok(followUpQuestions("today's weather", 'ragi', 'en').every((question) => !/weather/i.test(question)));
  assert.ok(followUpQuestions('hi', null, 'en').includes(translations.en.chat.suggest.crops));
});
