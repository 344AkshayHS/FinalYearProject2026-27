import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { sourceLine, waterFacts } from '@/lib/chatbot';
import { hasCropFactor, pastHarvest, waterToday, type Weather } from '@/lib/crop-water';
import { cropName } from '@/lib/translations';
import { colors, radius } from '@/theme';

type Props = { crops: string[]; lat: number; lng: number };

// "How much water today?" for one of the recommended crops, from today's forecast (FAO method)
export function WaterPlan({ crops, lat, lng }: Props) {
  const { t, language, token } = useApp();
  const [crop, setCrop] = useState(crops[0]);
  const [days, setDays] = useState('');
  const [rainedWell, setRainedWell] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Weather>(`/weather/today?lat=${lat}&lng=${lng}`, { token })
      .then(setWeather)
      .catch(() => setWeather(null))
      .finally(() => setLoading(false));
  }, [lat, lng, token]);

  const day = days.trim() === '' ? null : Number(days);
  const dayValid = day !== null && Number.isInteger(day) && day >= 0 && day <= 1000;
  const today = weather && dayValid ? waterToday(crop, day, weather) : null;

  function answer() {
    if (!hasCropFactor(crop)) {
      return `${t.water.noFactor} ${waterFacts(crop, language)}`;
    }
    if (!dayValid) {
      return null;
    }
    if (rainedWell) {
      return t.water.rained;
    }
    if (pastHarvest(crop, day)) {
      return t.water.pastHarvest;
    }
    if (loading) {
      return t.water.loading;
    }
    if (!today) {
      return t.water.forecastFailed;
    }
    const stage = 'stage' in today.cropStage ? t.water[today.cropStage.stage] : t.water.month.replace('{month}', String(today.cropStage.month));
    const detail = t.water.detail
      .replace('{need}', String(today.needMm))
      .replace('{stage}', stage)
      .replace('{kc}', String(today.kc))
      .replace('{et0}', String(weather!.et0_mm))
      .replace('{rain}', String(today.rainMm));
    const main =
      today.irrigateMm > 0
        ? t.water.give.replace('{mm}', String(today.irrigateMm)).replace('{litres}', today.irrigateLitresPerAcre.toLocaleString('en-IN'))
        : t.water.noNeed;
    return `${main}\n\n${detail}`;
  }

  const text = answer();

  return (
    <Card>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>💧 {t.water.title}</Text>

      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{t.water.whichCrop}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {crops.map((name) => (
          <Chip key={name} label={cropName(name, language)} selected={name === crop} onPress={() => setCrop(name)} />
        ))}
      </ScrollView>

      {hasCropFactor(crop) && (
        <>
          <TextField
            label={t.water.days}
            hint={t.water.daysHint}
            value={days}
            onChangeText={setDays}
            keyboardType="number-pad"
          />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{t.water.weather}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label={t.water.useForecast} selected={!rainedWell} onPress={() => setRainedWell(false)} />
            <Chip label={t.water.rainedWell} selected={rainedWell} onPress={() => setRainedWell(true)} />
          </View>
        </>
      )}

      {text && (
        <View style={{ gap: 8, padding: 14, borderRadius: radius.medium, backgroundColor: colors.primarySoft }}>
          {loading && hasCropFactor(crop) && !rainedWell && <ActivityIndicator color={colors.primary} />}
          <Text selectable style={{ fontSize: 16, lineHeight: 23, color: colors.text }}>
            {text}
          </Text>
        </View>
      )}

      {crop === 'rice' && <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t.water.riceNote}</Text>}
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
        {hasCropFactor(crop) ? t.water.method : sourceLine(crop, language)}
      </Text>
    </Card>
  );
}
