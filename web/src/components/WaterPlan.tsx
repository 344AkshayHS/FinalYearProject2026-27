import { useEffect, useState } from 'react';

import { Card, Chip, Note, Spinner, TextField } from '~/components/ui';
import { api } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import { sourceLine, waterFacts } from '@/lib/chatbot';
import { hasCropFactor, pastHarvest, waterToday, type Weather } from '@/lib/crop-water';
import { cropName } from '@/lib/translations';

// "How much water today?" for one of the recommended crops, from today's forecast (FAO method)
export function WaterPlan({ crops, lat, lng }: { crops: string[]; lat: number; lng: number }) {
  const { t, language } = useApp();
  const [crop, setCrop] = useState(crops[0]);
  const [days, setDays] = useState('');
  const [rainedWell, setRainedWell] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Weather>(`/weather/today?lat=${lat}&lng=${lng}`)
      .then(setWeather)
      .catch(() => setWeather(null))
      .finally(() => setLoading(false));
  }, [lat, lng]);

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
      <h2>💧 {t.water.title}</h2>

      <p className="bold">{t.water.whichCrop}</p>
      <div className="chips">
        {crops.map((name) => (
          <Chip key={name} label={cropName(name, language)} selected={name === crop} onClick={() => setCrop(name)} />
        ))}
      </div>

      {hasCropFactor(crop) && (
        <>
          <TextField label={t.water.days} hint={t.water.daysHint} value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" maxLength={4} />
          <p className="bold">{t.water.weather}</p>
          <div className="chips">
            <Chip label={t.water.useForecast} selected={!rainedWell} onClick={() => setRainedWell(false)} />
            <Chip label={t.water.rainedWell} selected={rainedWell} onClick={() => setRainedWell(true)} />
          </div>
        </>
      )}

      {text && (
        <div className="callout">
          {loading && hasCropFactor(crop) && !rainedWell && <Spinner />}
          <p className="big-text keep-lines">{text}</p>
        </div>
      )}

      {crop === 'rice' && <Note>{t.water.riceNote}</Note>}
      <Note>{hasCropFactor(crop) ? t.water.method : sourceLine(crop, language)}</Note>
    </Card>
  );
}
