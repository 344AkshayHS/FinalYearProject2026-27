// The smaller cards of a result. The main page of a result (which crop is the headline, the lists, the
// details) is in Results.tsx. Ported from frontend/src/components/results.tsx of the phone app.

import { Card, Note, ScoreBar } from '~/components/ui';
import { useApp } from '~/lib/app-context';
import type { CropFacts, CropGroup, RecommendResponse, SeasonSowing, Suits } from '~/lib/types';
import type { SeasonRain } from '@/lib/crop-water';
import { cropName, districtName, talukName } from '@/lib/translations';

export function fill(text: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((out, [key, value]) => out.replaceAll('{' + key + '}', String(value)), text);
}

// What the crop notes check against: the farmer's own pH if tested, the land's normal rain, low nitrogen
export type Land = { ownPh: number | undefined; mapPh: number; rainfed: boolean; rain: number | null; lowNitrogen: boolean };

// Short notes on how the land suits a crop (FAO EcoCrop needs). Shown only where they help: pH against the
// farmer's own soil test (or when even the soil map's pH is outside the crop's range), a season too hot or
// cold, too little rain on rain-fed land, a fertile soil needed where the test shows low nitrogen.
export function SuitNotes({ suits, land }: { suits: Suits | null; land: Land }) {
  const { t } = useApp();
  if (!suits) {
    return null;
  }
  const range = (pair: (number | null)[]) => pair.map((value) => (value === null ? '?' : String(value))).join('–');
  const notes: { text: string; bad: boolean }[] = [];
  if (land.ownPh !== undefined && suits.ph) {
    const text = { good: t.suit.phGood, possible: t.suit.phPossible, unsuited: t.suit.phBad }[suits.ph];
    notes.push({ text: fill(text, { ph: land.ownPh, range: range(suits.needs.ph) }), bad: suits.ph === 'unsuited' });
  } else if (suits.ph === 'unsuited') {
    notes.push({ text: fill(t.suit.phMapBad, { ph: land.mapPh.toFixed(1), range: range(suits.needs.ph) }), bad: true });
  }
  if (suits.temperature === 'unsuited') {
    notes.push({ text: fill(t.suit.tempBad, { range: range(suits.needs.temperature_c) }), bad: true });
  }
  const [rainLow] = suits.needs.rain_mm;
  if (land.rainfed && rainLow !== null && suits.rain !== 'good' && suits.rain_mm < rainLow) {
    const text = suits.rain_is_season ? t.suit.rainLowSeason : t.suit.rainLow;
    notes.push({ text: fill(text, { range: range(suits.needs.rain_mm), rain: suits.rain_mm }), bad: suits.rain === 'unsuited' });
  }
  if (suits.fertility === 'high' && land.lowNitrogen) {
    notes.push({ text: t.suit.fertile, bad: false });
  }
  if (suits.texture === 'unsuited') {
    notes.push({ text: t.suit.texture, bad: false });
  }
  return (
    <div className="stack-tiny">
      {notes.map((note) => (
        <p key={note.text} className={note.bad ? 'note error-text' : 'note'}>
          {note.text}
        </p>
      ))}
    </div>
  );
}

const GROUP_ORDER: CropGroup[] = ['vegetable', 'herb', 'spice', 'plantation'];
const PER_GROUP = 4; // crops listed per group in the card

// Herbs, spices and plantation crops the model does not know, that suit the land by their needs
export function OtherCropsCard({ data, land }: { data: RecommendResponse; land: Land }) {
  const { t, language } = useApp();
  // On rain-fed land, only those the normal rain can grow; with irrigation, all of them
  const crops = data.other_crops.filter((item) => !land.rainfed || item.suits.rain === 'good' || item.suits.rain === 'possible');
  if (crops.length === 0) {
    return null;
  }
  // Grouped (vegetables, herbs, spices, plantation crops), the best few of each
  const groups = GROUP_ORDER.map((group) => ({ group, items: crops.filter((item) => item.group === group).slice(0, PER_GROUP) })).filter(
    ({ items }) => items.length > 0,
  );
  return (
    <Card>
      <h2>🌿 {t.otherCropsTitle}</h2>
      {groups.map(({ group, items }) => (
        <div key={group} className="stack-small">
          <p className="bold primary-text">{t.cropGroups[group]}</p>
          {items.map((item) => (
            <div key={item.crop} className="stack-tiny">
              <p className="bold">{cropName(item.crop, language)}</p>
              <SuitNotes suits={item.suits} land={land} />
            </div>
          ))}
        </div>
      ))}
      <Note>{t.otherCropsNote.replace('{rain}', String(data.rain_checked_mm ?? '?'))}</Note>
    </Card>
  );
}

// What the district sowed most in the answered season (crop survey), to compare with the model
export function SeasonSowingCard({ sowing }: { sowing: SeasonSowing }) {
  const { t, language } = useApp();
  const biggest = Math.max(...sowing.crops.map((item) => item.share), 0.01);
  return (
    <Card>
      <h2>
        🌾 {t.seasonSowingTitle.replace('{district}', districtName(sowing.district, language)).replace('{season}', t.seasonNames[sowing.season])}
      </h2>
      {sowing.crops.map((item) => (
        <div key={item.crop} className="stack-tiny">
          <div className="row-between">
            <span className="bold">{cropName(item.crop, language)}</span>
            <span className="note number">
              {item.area_ha.toLocaleString('en-IN')} ha · {Math.max(Math.round(item.share * 100), 1)}%
            </span>
          </div>
          <ScoreBar score={(item.share / biggest) * 100} tone="accent" />
        </div>
      ))}
      <Note>{t.seasonSowingNote}</Note>
    </Card>
  );
}

// What is really grown here (Agriculture Census / crop statistics), to compare with the model
export function CropFactsCard({ facts }: { facts: CropFacts }) {
  const { t, language } = useApp();
  const place = facts.level === 'taluk' ? talukName(facts.name) : districtName(facts.name, language);
  const biggest = Math.max(...facts.crops.map((item) => item.share), 0.01);
  return (
    <Card>
      <h2>🌾 {(facts.level === 'taluk' ? t.factsTaluk : t.factsDistrict).replace('{name}', place)}</h2>
      {facts.crops.map((item) => (
        <div key={item.crop} className="stack-tiny">
          <div className="row-between">
            <span className="bold">{cropName(item.crop, language)}</span>
            <span className="note number">{Math.max(Math.round(item.share * 100), 1)}%</span>
          </div>
          <ScoreBar score={(item.share / biggest) * 100} tone="accent" />
        </div>
      ))}
      <Note>{t.factsNote.replace('{source}', facts.level === 'taluk' ? t.factsSourceTaluk : t.factsSourceDistrict)}</Note>
    </Card>
  );
}

// This monsoon's rain so far, against normal
export function SeasonRainCard({ season, rainfed }: { season: SeasonRain; rainfed: boolean }) {
  const { t } = useApp();
  const percent = season.percent_from_normal;
  const versusNormal =
    percent >= 5 ? t.rainAbove.replace('{n}', String(percent)) : percent <= -5 ? t.rainBelow.replace('{n}', String(-percent)) : t.rainNormal;
  const dry = season.imd_category === 'deficient' || season.imd_category === 'large_deficient';
  return (
    <Card accent={dry}>
      <h2>🌧️ {t.seasonRainTitle}</h2>
      <p className={dry ? 'big-text bold warning-text' : 'big-text bold dark-text'}>
        {versusNormal} · {t.rainCategory[season.imd_category]}
      </p>
      <p>{t.seasonRainAmount.replace('{rain}', String(season.rain_mm)).replace('{to}', season.to).replace('{normal}', String(season.normal_mm))}</p>
      {!rainfed && <p className="note">{t.irrigatedNote}</p>}
      <Note>{t.seasonRainSource}</Note>
    </Card>
  );
}
