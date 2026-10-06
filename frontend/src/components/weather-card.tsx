import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { rainLikelySoon, weatherIcon, weatherKind, type WeatherNow } from '@/lib/weather';
import { colors, radius } from '@/theme';

// Where to show the weather of: the farmer's GPS point, or a district picked by hand (the server takes its middle)
export type WeatherPlace = { lat: number; lng: number } | { state: string; district: string };

type Props = { place: WeatherPlace; districtLabel: string };

// "Weather now" on the home screen: the weather right now and the next three days (Open-Meteo forecast)
export function WeatherCard({ place, districtLabel }: Props) {
  const { t, language, token, setForecastPlace } = useApp();
  const query =
    'lat' in place
      ? `lat=${place.lat}&lng=${place.lng}`
      : `state=${encodeURIComponent(place.state)}&district=${encodeURIComponent(place.district)}`;

  // The server's answer and the place it is for (weather null = it failed)
  const [answer, setAnswer] = useState<{ query: string; weather: WeatherNow | null } | null>(null);

  // Ask again whenever the place changes. An answer that comes late for a place no longer chosen is ignored.
  useEffect(() => {
    let stale = false;
    api<WeatherNow>(`/weather/now?${query}`, { token })
      .then((weather) => !stale && setAnswer({ query, weather }))
      .catch(() => !stale && setAnswer({ query, weather: null }))
      // the chat answers "today's weather?" for this same place
      .finally(() => !stale && setForecastPlace({ query, label: districtLabel }));
    return () => {
      stale = true;
    };
  }, [query, token, districtLabel, setForecastPlace]);

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
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{t.weatherNow.title}</Text>

      {!weather && !failed && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ fontSize: 15, color: colors.muted }}>{t.weatherNow.loading}</Text>
        </View>
      )}
      {failed && <Text style={{ fontSize: 15, color: colors.danger }}>{t.weatherNow.failed}</Text>}

      {weather && (
        <>
          {/* Right now */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ fontSize: 46 }}>{weatherIcon(weather.now.code, weather.now.is_day)}</Text>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }}>
                {Math.round(weather.now.temperature_c)}°C
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                {t.weatherNow.kinds[weatherKind(weather.now.code)]}
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {t.weatherNow.feelsLike.replace('{n}', String(Math.round(weather.now.feels_like_c)))} ·{' '}
                {t.weatherNow.humidity} {weather.now.humidity_pct}% · {t.weatherNow.wind} {Math.round(weather.now.wind_kmh)} km/h
              </Text>
            </View>
          </View>

          {/* The next three days */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {weather.days.map((day, index) => (
              <View
                key={day.date}
                style={{ flex: 1, alignItems: 'center', gap: 2, padding: 10, borderRadius: radius.medium, backgroundColor: colors.primarySoft }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primaryDark }}>{dayName(day.date, index)}</Text>
                <Text style={{ fontSize: 26 }}>{weatherIcon(day.code)}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] }}>
                  {Math.round(day.max_c)}° / {Math.round(day.min_c)}°
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
                  {t.weatherNow.rain.replace('{mm}', String(day.rain_mm))}
                </Text>
                {day.rain_chance_pct !== null && (
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    {t.weatherNow.rainChance.replace('{n}', String(day.rain_chance_pct))}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {rainLikelySoon(weather.days) && (
            <Text style={{ fontSize: 15, lineHeight: 21, padding: 12, borderRadius: radius.medium, color: colors.warningText, backgroundColor: colors.accentSoft }}>
              🌧️ {t.weatherNow.rainSoon}
            </Text>
          )}

          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
            {weather.in_middle ? t.weatherNow.middleNote.replace('{district}', districtLabel) + ' ' : ''}
            {t.weatherNow.source.replace('{time}', weather.now.time.slice(11, 16))}
          </Text>
        </>
      )}
    </Card>
  );
}
