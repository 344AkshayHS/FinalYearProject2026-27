// Calls Groq (groq.com), which serves open models such as OpenAI's gpt-oss very fast. The crop helper chat
// asks it first and Gemini (./gemini.js) only if it fails. Same contract as askGemini: returns the reply
// text, or null when Groq can't be used (no GROQ_API_KEY, wrong key, limit reached, server error).
// Network errors and timeouts throw. With a `schema`, Groq must reply with a JSON object; the shape itself
// is set out in the instructions.
//
// Groq's free tier allows about 8,000 tokens a minute and a chat question uses about 1,600, so a busy minute
// can reach the limit (status 429); the chat then asks Gemini.

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const ATTEMPT_MS = 9000; // a normal reply takes under 2 s

async function askGroq(instructions, message, schema) {
  if (!process.env.GROQ_API_KEY) {
    return null;
  }

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: message },
    ],
    temperature: 0.2,
    max_tokens: 600, // 4 short sentences and a little thinking
  };
  if (schema) {
    body.response_format = { type: 'json_object' };
  }
  if (MODEL.startsWith('openai/gpt-oss')) {
    body.reasoning_effort = 'low'; // short replies: little thinking first, so they come back fast
  }
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ATTEMPT_MS),
  });

  if (!response.ok) {
    console.error('Groq failed with status ' + response.status);
    return null;
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

module.exports = { askGroq };
