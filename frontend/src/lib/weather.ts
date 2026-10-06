// The weather card on the home screen and the chatbot's weather answer: what the server's GET /weather/now sends
// back, and how a weather code is turned into a picture and words. The website uses this same file.

import { translations, type Language } from '@/lib/translations';

export type WeatherDay = {
  date: string; // "2026-10-05", the place's own date
  code: number;
  max_c: number;
  min_c: number;
  rain_mm: number;
  rain_chance_pct: number | null;
};

export type WeatherNow = {
  in_middle: boolean; // true when it is the weather of the middle of a district picked by hand
  now: {
    time: string; // "2026-10-04T18:45", the place's own time
    temperature_c: number;
    feels_like_c: number;
    humidity_pct: number;
    wind_kmh: number;
    rain_mm: number;
    code: number;
    is_day: boolean;
  };
  days: WeatherDay[]; // today and the next two days
};

// Where a forecast is for: the query for GET /weather/now ("lat=..&lng=.." or "state=..&district=..") and the
// place's name as the farmer sees it
export type ForecastPlace = { query: string; label: string };

export type WeatherKind =
  | 'clear' | 'mostlyClear' | 'partlyCloudy' | 'cloudy' | 'fog' | 'drizzle'
  | 'rain' | 'heavyRain' | 'showers' | 'thunder' | 'snow';

// The forecast gives the weather as a WMO code (World Meteorological Organization).
// Each kind: its codes, the picture by day and the picture at night.
const KINDS: { kind: WeatherKind; codes: number[]; day: string; night: string }[] = [
  { kind: 'clear', codes: [0], day: '☀️', night: '🌙' },
  { kind: 'mostlyClear', codes: [1], day: '🌤️', night: '🌙' },
  { kind: 'partlyCloudy', codes: [2], day: '⛅', night: '☁️' },
  { kind: 'cloudy', codes: [3], day: '☁️', night: '☁️' },
  { kind: 'fog', codes: [45, 48], day: '🌫️', night: '🌫️' },
  { kind: 'drizzle', codes: [51, 53, 55, 56, 57], day: '🌦️', night: '🌧️' },
  { kind: 'rain', codes: [61, 63, 66], day: '🌧️', night: '🌧️' },
  { kind: 'heavyRain', codes: [65, 67], day: '🌧️', night: '🌧️' },
  { kind: 'showers', codes: [80, 81, 82], day: '🌦️', night: '🌧️' },
  { kind: 'snow', codes: [71, 73, 75, 77, 85, 86], day: '❄️', night: '❄️' },
  { kind: 'thunder', codes: [95, 96, 99], day: '⛈️', night: '⛈️' },
];

function find(code: number) {
  return KINDS.find((item) => item.codes.includes(code)) ?? KINDS[3]; // an unknown code is shown as cloudy
}

export function weatherKind(code: number): WeatherKind {
  return find(code).kind;
}

export function weatherIcon(code: number, isDay = true): string {
  return isDay ? find(code).day : find(code).night;
}

// IMD counts a day with 2.5 mm of rain or more as a rainy day
export const RAINY_DAY_MM = 2.5;

// Is a rainy day forecast for today or tomorrow? Then the card says to check before watering or spraying.
export function rainLikelySoon(days: WeatherDay[]): boolean {
  return days.slice(0, 2).some((day) => day.rain_mm >= RAINY_DAY_MM);
}

// The chatbot's answer to "today's weather?" / "will it rain tomorrow?": the weather now, the next three days,
// and the same rain tip as the card. place: where it is for, as the card names it.
export function weatherAnswer(weather: WeatherNow, place: string, language: Language) {
  const t = translations[language].weatherNow;
  const fill = (text: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((out, [key, value]) => out.replace('{' + key + '}', String(value)), text);
  const now = weather.now;
  const lines = [
    fill(t.chatNow, {
      place,
      temp: Math.round(now.temperature_c),
      kind: t.kinds[weatherKind(now.code)],
      feels: Math.round(now.feels_like_c),
      humidity: now.humidity_pct,
      wind: Math.round(now.wind_kmh),
    }),
    ...weather.days.map((day, index) => {
      const name =
        index === 0 ? t.today : index === 1 ? t.tomorrow : new Date(day.date + 'T12:00').toLocaleDateString(language === 'kn' ? 'kn-IN' : 'en-IN', { weekday: 'long' });
      const line = fill(t.chatDay, { day: name, max: Math.round(day.max_c), min: Math.round(day.min_c), kind: t.kinds[weatherKind(day.code)], rain: day.rain_mm });
      return day.rain_chance_pct === null ? line : `${line} (${fill(t.rainChance, { n: day.rain_chance_pct })})`;
    }),
  ];
  if (rainLikelySoon(weather.days)) {
    lines.push(t.rainSoon);
  }
  lines.push(fill(t.source, { time: now.time.slice(11, 16) }));
  return lines.join('\n');
}
