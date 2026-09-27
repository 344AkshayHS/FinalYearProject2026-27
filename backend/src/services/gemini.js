// Calls Google's Gemini API. Returns the reply text, or null when Gemini can't be used
// (no GEMINI_API_KEY, wrong key, daily limit reached, server error). Network errors and timeouts throw.
// With a `schema` (a JSON schema), Gemini must reply with JSON in that shape; the text is returned as is.

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const ATTEMPT_MS = 9000; // a normal reply takes 1-3 s

async function askGemini(instructions, message, schema) {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  // The chat's replies are at most 4 short sentences; a low cap also stops a reply that runs on and times out
  const generationConfig = { temperature: 0.2, maxOutputTokens: 600 };
  if (schema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = schema;
  }
  const request = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(ATTEMPT_MS),
    });
  // Gemini's free tier sometimes stalls on one request and answers the same one at once when asked again:
  // a stalled attempt is dropped after ATTEMPT_MS and tried once more
  let response;
  try {
    response = await request();
  } catch (err) {
    if (err.name !== 'TimeoutError') {
      throw err;
    }
    response = await request();
  }

  if (!response.ok) {
    console.error('Gemini failed with status ' + response.status);
    return null;
  }
  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? '').join('').trim() || null;
}

module.exports = { askGemini };
