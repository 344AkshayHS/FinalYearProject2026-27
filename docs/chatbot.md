# The crop helper chat

The chat (`frontend/src/lib/crop-info.ts`) answers only from checked figures; where a source had no number,
it says so instead of guessing. Sources: TNAU Agritech Portal (water requirement table, crop pages),
TNAU/eagri lecture notes on crop water requirement, FAO Irrigation Water Management Training Manual 3
(Tables 6 and 14), ICRISAT pigeonpea maturity groups. Water figures are for the whole crop; the daily figure is
that total divided by the crop's duration, so real daily need is lower early and higher at flowering.

**Optional AI (Groq, then Gemini).** The app's own rule-based answer comes first. Only when the checked
facts do not cover a question, or the question could not be read, does the backend's `/chat` route ask an AI:
Groq first (`GROQ_API_KEY`, model `openai/gpt-oss-120b`), and Gemini (`GEMINI_API_KEY`) only if Groq fails
(no key, limit reached, error, timeout, or a reply the checks throw away). The AI answers farming questions only
(any crop, soil, water, fertiliser, pests and diseases, harvest, storage); anything else is politely declined.
To stay small (about 1,600 tokens a question, inside Groq's free 8,000 tokens a minute), it gets short rules,
the list of crops, the full checked facts only of the crops in the question, the farm result, help contacts and
the app's own plain-English reading of the question ("ragi ge gobbara yavaga" becomes "ragi fertilizer when").
It marks each reply `facts` or `general`, and the backend checks every reply: a `facts` reply with a number
that is not in the facts is thrown away, a `general` reply with an amount (litres, mm, kg) that is not in the
facts is thrown away, any reply with a spray dose is thrown away, and a `general` reply is shown with a note
that it is general advice. Pests and diseases get the likely cause and safe first steps, never a brand or
dose; prices are never given (no AI knows today's price), the farmer is sent to the APMC market or the Kisan
Call Centre. If neither AI answers, the app quietly uses its rule-based answer.

**Weather questions** ("today's weather?", "will it rain tomorrow?", "ಇಂದು ಮಳೆ ಬರುತ್ತಾ?") are answered by the app itself
from the same Open-Meteo forecast as the weather card on Home, for the same place. The AI is never asked about the
weather: it has no weather data. Without a place (no location and no district picked) the chat asks the farmer to
give one on Home. The rules are in `frontend/src/lib/chatbot.ts` (`isWeatherQuestion`) and the answer in
`frontend/src/lib/weather.ts` (`weatherAnswer`).

**Suggested questions.** Under each answer the chat offers up to 3 questions to tap (`followUpQuestions` in
`chatbot.ts`): about the crop being talked about (water, growing time, sowing), "which crop for my land?" once the land
is checked, and today's weather. It never offers what was just asked, and only what the checked facts can answer: a
test asks every suggestion for every crop in both languages and checks the app answers it without the AI.

**Kannada answers** are all Kannada: sowing details have a Kannada text next to the English one (`kn` in
`crop-info.ts`), other names are the Kannada ones, and sources are named in Kannada ("ತಮಿಳುನಾಡು ಕೃಷಿ ವಿಶ್ವವಿದ್ಯಾಲಯ (TNAU)").
Only the crop's English name, its scientific name, short source names and N : P2O5 : K2O stay in English letters.
