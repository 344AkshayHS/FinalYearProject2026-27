// Calls Google's Gemini API. Returns the reply text, or null when Gemini can't be used
// (no GEMINI_API_KEY, wrong key, daily limit reached, server error). Network errors and timeouts throw.

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

async function askGemini(instructions, message) {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    console.error('Gemini failed with status ' + response.status);
    return null;
  }
  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? '').join('').trim() || null;
}

module.exports = { askGemini };
