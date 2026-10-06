// "Weather now" on the home page: the weather right now and the next three days (Open-Meteo forecast).
// Same card as frontend/src/components/weather-card.tsx on the phone; the codes and pictures are in frontend/src/lib/weather.ts.

import { useEffect, useState } from 'react';

import { Card, Note, Spinner } from '~/components/ui';
import { apiWithRetry } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import { rainLikelySoon, weatherIcon, weatherKind, type WeatherNow } from '@/lib/weather';

// Where to show the weather of: the browser's position, or a district picked by hand (the server takes its middle)
export type WeatherPlace = { lat: number; lng: number } | { state: string; district: string };

type Props = { place: WeatherPlace; districtLabel: string };

export function WeatherCard({ place, districtLabel }: Props) {
  const { t, language, setForecastPlace } = useApp();

  const query =
    'lat' in place
      ? `lat=${place.lat}&lng=${place.lng}`
      : `state=${encodeURIComponent(place.state)}&district=${encodeURIComponent(place.district)}`;

  // The server's answer and the place it is for (weather null = it failed)
  const [answer, setAnswer] = useState<{ query: string; weather: WeatherNow | null } | null>(null);

  // Ask again whenever the place changes. An answer that comes late for a place no longer chosen is ignored.
  useEffect(() => {
    let stale = false;
    apiWithRetry<WeatherNow>(`/weather/now?${query}`)
      .then((weather) => !stale && setAnswer({ query, weather }))
      .catch(() => !stale && setAnswer({ query, weather: null }))
      // the chat answers "today's weather?" for this same place
      .finally(() => !stale && setForecastPlace({ query, label: districtLabel }));
    return () => {
      stale = true;
    };
  }, [query, districtLabel, setForecastPlace]);

  const current = answer?.query === query ? answer : null; // null while the new place is loading
  const weather = current?.weather ?? null;
  const failed = current !== null && current.weather === null;

  // Today, tomorrow, then the day's short name ("Tue")
  function dayName(date: string, index: number) {
    if (index === 0) {
      return t.weatherNow.today;
    }
    if (index === 1) {
      return t.weatherNow.tomorrow;
    }
    return new Date(date + 'T12:00').toLocaleDateString(language === 'kn' ? 'kn-IN' : 'en-IN', { weekday: 'short' });
  }

  return (
    <Card>
      <h2>{t.weatherNow.title}</h2>

      {!weather && !failed && (
        <p className="row note">
          <Spinner /> {t.weatherNow.loading}
        </p>
      )}
      {failed && <p className="error-text">{t.weatherNow.failed}</p>}

      {weather && (
        <>
          {/* Right now */}
          <div className="row">
            <span className="weather-icon-big" aria-hidden="true">
              {weatherIcon(weather.now.code, weather.now.is_day)}
            </span>
            <div className="stack-tiny">
              <span className="weather-temperature number">{Math.round(weather.now.temperature_c)}°C</span>
              <span className="bold">{t.weatherNow.kinds[weatherKind(weather.now.code)]}</span>
              <span className="note">
                {t.weatherNow.feelsLike.replace('{n}', String(Math.round(weather.now.feels_like_c)))} · {t.weatherNow.humidity}{' '}
                {weather.now.humidity_pct}% · {t.weatherNow.wind} {Math.round(weather.now.wind_kmh)} km/h
              </span>
            </div>
          </div>

          {/* The next three days */}
          <div className="weather-days">
            {weather.days.map((day, index) => (
              <div key={day.date} className="weather-day">
                <span className="bold dark-text">{dayName(day.date, index)}</span>
                <span className="weather-icon" aria-hidden="true">
                  {weatherIcon(day.code)}
                </span>
                <span className="bold number">
                  {Math.round(day.max_c)}° / {Math.round(day.min_c)}°
                </span>
                <span className="note">{t.weatherNow.rain.replace('{mm}', String(day.rain_mm))}</span>
                {day.rain_chance_pct !== null && (
                  <span className="note">{t.weatherNow.rainChance.replace('{n}', String(day.rain_chance_pct))}</span>
                )}
              </div>
            ))}
          </div>

          {rainLikelySoon(weather.days) && (
            <p className="callout callout-warning warning-text">🌧️ {t.weatherNow.rainSoon}</p>
          )}

          <Note>
            {weather.in_middle ? t.weatherNow.middleNote.replace('{district}', districtLabel) + ' ' : ''}
            {t.weatherNow.source.replace('{time}', weather.now.time.slice(11, 16))}
          </Note>
        </>
      )}
    </Card>
  );
}
