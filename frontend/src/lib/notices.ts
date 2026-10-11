// The bell's messages (components/bell-button.tsx and app/notifications.tsx). Each one comes from data the app
// already has, nothing is made up:
//  - rain: the weather card's forecast (Open-Meteo) for the farmer's place, today or tomorrow;
//  - season: the sowing calendar of lib/season.ts (a season has just started, or starts soon);
//  - feedback: a past result a month old that the farmer has not yet said anything about.

import { placeOf, type PastResult } from '@/lib/past-results';
import { SEASON_START_MONTH, SEASONS, seasonNow } from '@/lib/season';
import { translations, type Language } from '@/lib/translations';
import { RAINY_DAY_MM, type WeatherNow } from '@/lib/weather';

export type Notice = {
  id: string; // the same message keeps the same id, so the bell knows which ones the farmer has already seen
  icon: string;
  title: string;
  text: string;
  opens: { home: true } | { feedback: string }; // a tap opens Home (to find crops) or the feedback page of a result
};

// How long after a result the bell asks how the crops are doing: a crop sown then has grown for about a month.
// Results older than a year are not asked about any more.
export const FEEDBACK_AFTER_DAYS = 30;
export const FEEDBACK_UNTIL_DAYS = 365;
// A season "has started" for its first 30 days; it "starts soon" in the 14 days before it
export const SEASON_STARTED_DAYS = 30;
export const SEASON_SOON_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

function fill(text: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((out, [key, value]) => out.replace('{' + key + '}', String(value)), text);
}

type Input = {
  now: Date;
  language: Language;
  forecast: { label: string; weather: WeatherNow } | null;
  results: PastResult[] | null;
};

export function buildNotices({ now, language, forecast, results }: Input): Notice[] {
  const t = translations[language];
  const locale = language === 'kn' ? 'kn-IN' : 'en-IN';
  const notices: Notice[] = [];

  // Rain today or tomorrow (the same rule as the weather card's "rain soon" line)
  const days = forecast?.weather.days.slice(0, 2) ?? [];
  const rainyIndex = days.findIndex((day) => day.rain_mm >= RAINY_DAY_MM);
  if (forecast && rainyIndex !== -1) {
    const day = days[rainyIndex];
    notices.push({
      id: `rain:${day.date}`,
      icon: '🌧️',
      title: rainyIndex === 0 ? t.notices.rainTodayTitle : t.notices.rainTomorrowTitle,
      text: fill(t.notices.rainText, { mm: day.rain_mm, place: forecast.label }),
      opens: { home: true },
    });
  }

  // The season that is on now, if it started in the last 30 days
  const season = seasonNow(now);
  const startMonth = SEASON_START_MONTH[season];
  // Rabi runs from October into January: in January it started last year
  const startYear = now.getMonth() + 1 < startMonth ? now.getFullYear() - 1 : now.getFullYear();
  const started = new Date(startYear, startMonth - 1, 1);
  if ((now.getTime() - started.getTime()) / DAY_MS < SEASON_STARTED_DAYS) {
    notices.push({
      id: `season:${season}:${startYear}`,
      icon: '🌱',
      title: fill(t.notices.seasonStartedTitle, { season: t.seasonNames[season] }),
      text: fill(t.notices.seasonStartedText, { season: t.seasons[season] }),
      opens: { home: true },
    });
  }

  // The next season, if it starts in the next 14 days
  const next = SEASONS[(SEASONS.indexOf(season) + 1) % SEASONS.length];
  let nextStart = new Date(now.getFullYear(), SEASON_START_MONTH[next] - 1, 1);
  if (nextStart <= now) {
    nextStart = new Date(now.getFullYear() + 1, SEASON_START_MONTH[next] - 1, 1);
  }
  if ((nextStart.getTime() - now.getTime()) / DAY_MS <= SEASON_SOON_DAYS) {
    notices.push({
      id: `season-soon:${next}:${nextStart.getFullYear()}`,
      icon: '📅',
      title: fill(t.notices.seasonSoonTitle, {
        season: t.seasonNames[next],
        date: nextStart.toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
      }),
      text: fill(t.notices.seasonSoonText, { season: t.seasonNames[next] }),
      opens: { home: true },
    });
  }

  // The newest result from 1 to 12 months ago without feedback (results are newest first). Only one at a time:
  // when the farmer answers it, the next one comes.
  const due = (results ?? []).find((result) => {
    const age = (now.getTime() - new Date(result.created_at).getTime()) / DAY_MS;
    return result.feedback_given === false && age >= FEEDBACK_AFTER_DAYS && age <= FEEDBACK_UNTIL_DAYS;
  });
  if (due) {
    notices.push({
      id: `feedback:${due.id}`,
      icon: '🌾',
      title: t.notices.feedbackTitle,
      text: fill(t.notices.feedbackText, {
        date: new Date(due.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
        place: placeOf(due, language),
      }),
      opens: { feedback: due.id },
    });
  }

  return notices;
}
