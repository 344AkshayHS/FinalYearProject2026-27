// What "Rain only" or "Irrigated" means for the farmer's result, in a few short lines shown right under the two
// buttons, so the farmer sees what the choice changed. Every number comes from the result itself: the best crop's
// water need (FAO EcoCrop), the normal rain of the place (NASA POWER / IMD) and the irrigation figures of the
// Agriculture Census. Used by the phone app and the website.

import { cropName, translations, type Language } from '@/lib/translations';

export type WaterSource = 'rain' | 'irrigated';

export type WaterFacts = {
  crop: string; // the best crop to sow
  need: (number | null)[]; // its water need in mm, [lowest, highest] (FAO EcoCrop), or nulls when unknown
  rain: number | null; // the normal rain it is checked against, in mm
  rainIsSeason: boolean; // that rain is the season's (a seasonal crop), else the year's
  marked: number | null; // crops in the lists marked "Needs irrigation" on rain-fed land; null: no census figures here
  leftOut: number; // herbs, spices and plantation crops left out on rain-fed land for needing more rain
};

const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replaceAll('{' + key + '}', String(value)), text);

export function waterChoiceLines(facts: WaterFacts, source: WaterSource, language: Language): string[] {
  const t = translations[language];
  const w = t.waterChoice;
  const crop = cropName(facts.crop, language);
  const [low, high] = facts.need;
  const lines: string[] = [];

  // 1. The best crop: how much water it needs, against the normal rain here
  if (low !== null && facts.rain !== null) {
    const range = high !== null ? `${low}–${high}` : `${low}`;
    lines.push(fill(facts.rainIsSeason ? w.needSeason : w.needYear, { crop, range, rain: facts.rain }));
    const gap = low - facts.rain;
    if (gap > 0) {
      lines.push(fill(source === 'rain' ? w.shortRain : w.shortIrrigated, { crop, gap }));
    } else {
      lines.push(fill(source === 'rain' ? w.enoughRain : w.enoughIrrigated, { crop }));
    }
  }

  // 2. What the choice changed in the lists below
  if (source === 'rain') {
    if (facts.marked !== null) {
      lines.push(facts.marked > 0 ? fill(w.marked, { n: facts.marked, badge: t.needsIrrigation }) : w.noneMarked);
    }
    if (facts.leftOut > 0) {
      lines.push(fill(w.leftOut, { n: facts.leftOut }));
    }
  } else {
    lines.push(w.allShown);
  }

  // 3. Where to find today's amount
  lines.push(fill(w.today, { title: t.water.title }));
  return lines;
}
