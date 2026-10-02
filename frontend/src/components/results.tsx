import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { FeedbackForm } from '@/components/feedback-form';
import { WaterPlan } from '@/components/water-plan';
import { useApp } from '@/lib/app-context';
import { mostlyIrrigatedShare, type SeasonRain } from '@/lib/crop-water';
import { YEAR_ROUND_CROPS, type Season } from '@/lib/season';
import { cropName, districtName, talukName } from '@/lib/translations';
import { colors, radius } from '@/theme';

export type WaterSource = 'rain' | 'irrigated';

// How the land suits a crop by its FAO EcoCrop needs: inside its optimal range, inside its absolute range, or not
type Fit = 'good' | 'possible' | 'unsuited' | null;
export type Suits = {
  ph: Fit;
  temperature: Fit;
  rain: Fit;
  texture: Fit;
  fertility: 'low' | 'moderate' | 'high' | null; // how fertile a soil the crop needs
  rain_mm: number; // the normal rain it was checked against: the season's for seasonal crops, else the year's
  rain_is_season: boolean;
  needs: { ph: (number | null)[]; rain_mm: (number | null)[]; temperature_c: (number | null)[] };
};

export type Recommendation = {
  crop: string;
  probability: number;
  score: number;
  confident: boolean;
  shap: Record<string, number> | null;
  lime: Record<string, number> | null;
  suits: Suits | null;
};

type Rating = 'low' | 'medium' | 'high';
type RatedValue = 'organic_carbon_pct' | 'n' | 'p' | 'k';

// Soil test values that get a Low / Medium / High rating, in the order they are shown
const RATED_VALUES: RatedValue[] = ['organic_carbon_pct', 'n', 'p', 'k'];

export type RecommendResponse = {
  recommendation_id: string;
  area: 'point' | 'taluk' | 'district'; // GPS point, or a taluk / district picked by hand
  district_middle?: boolean; // a district outside Karnataka picked by hand: the answer is for one spot in its middle
  untested_place?: boolean; // no crop statistics for this district: the answer could not be checked against them
  location: { lat: number; lng: number; state: string | null; district: string | null; taluk: string | null };
  features: Record<string, number>;
  model_version: string;
  season: Season; // the season the crops are for
  season_sown_share: number | null; // share of the district's field crops sown in that season (statistics)
  recommendations: Recommendation[];
  // top field crops, without year-round ones; district_share: the crop's share of the district's sowing;
  // taluk_share: the same in the taluk, when the taluk's own crops ordered the list
  // in this season (Karnataka crop survey), null elsewhere
  sow_this_season: { crop: string; probability: number; district_share: number | null; taluk_share: number | null }[];
  season_sowing: SeasonSowing | null; // what the district sowed most this season (Karnataka crop survey)
  all_crops: { crop: string; probability: number; suits: Suits | null }[]; // every crop the model knows, in order
  // When the season's list starts with another crop than the top one (a year-round top crop like arecanut, or
  // the taluk's own crops put another first), the season's best crop to sow, explained on its own
  season_best: (Recommendation & { reliability: number }) | null;
  other_crops: { crop: string; group: CropGroup; suits: Suits }[]; // not known to the model
  rain_checked_mm: number | null; // the normal yearly rain the crops' needs were checked against
  rain_source: string | null;
  top_crop_reliability: number; // how often a top crop with this probability was the area's main crop in testing
  soil_test: Partial<Record<'ph' | 'organic_carbon_pct' | 'n' | 'p' | 'k', number>> | null;
  soil_ratings: Partial<Record<RatedValue, Rating>> | null;
  soil_read_metres_away: number | null; // null when a whole taluk or district was checked
  sample_points: number | null; // taluk or district picked by hand: farms the answer is averaged over
  taluk_weight: number | null; // picked taluk: share of the answer from its own farms (the rest: its district)
  crop_facts: CropFacts | null;
  season_rain: SeasonRain | null; // this monsoon's rain so far against normal (null outside June-November)
};

// What the district sowed most in the answered season, from Karnataka's crop survey (DES)
type SeasonSowing = { district: string; season: Season; source: string; crops: { crop: string; area_ha: number; share: number }[] };

// What farmers really grow most in the taluk (GPS) or district (picked by hand), from government data
type CropFacts = {
  level: 'taluk' | 'district';
  name: string;
  crops: { crop: string; area_ha: number; share: number }[];
  // each crop's irrigated share of its land here, the lowest over the census years (Agriculture Census)
  irrigated?: Record<string, number>;
};

// Model features that the farmer's own soil test replaces
const FROM_SOIL_TEST: Record<string, 'ph' | 'organic_carbon_pct'> = { pH: 'ph', Organic_Carbon: 'organic_carbon_pct' };
type CropGroup = 'vegetable' | 'herb' | 'spice' | 'plantation';
const GROUP_ORDER: CropGroup[] = ['vegetable', 'herb', 'spice', 'plantation'];
const PER_GROUP = 4; // crops listed per group in the card

// Short notes on how the land suits a crop (FAO EcoCrop needs). Shown only where they help: pH against the
// farmer's own soil test (or when even the soil map's pH is outside the crop's range), a season too hot or
// cold, too little rain on rain-fed land, a fertile soil needed where the test shows low nitrogen.
type Land = { ownPh: number | undefined; mapPh: number; rainfed: boolean; rain: number | null; lowNitrogen: boolean };

function fill(text: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((out, [key, value]) => out.replaceAll('{' + key + '}', String(value)), text);
}

function SuitNotes({ suits, land }: { suits: Suits | null; land: Land }) {
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
    <View style={{ gap: 2 }}>
      {notes.map((note) => (
        <Text key={note.text} style={{ fontSize: 13, lineHeight: 18, color: note.bad ? colors.danger : colors.muted }}>
          {note.text}
        </Text>
      ))}
    </View>
  );
}

// Year-round crops listed under the land's best one (4 in all)
const YEAR_ROUND_MORE = 3;

// How many crops "See top crops" lists in all, counting those already shown
const TOP_LIST = 10;

// Below this share of the district's field crops, a season "sows little" and the app says so
const LITTLE_SOWN = 0.1;
const RATING_COLORS: Record<Rating, string> = { low: colors.danger, medium: colors.accent, high: colors.primary };

const UNITS: Record<string, string> = {
  pH: '',
  Nitrogen: ' g/kg',
  Organic_Carbon: ' g/kg',
  Clay: '%',
  Sand: '%',
  CEC: ' cmol/kg',
  Temperature: ' °C',
  Winter_Temperature: ' °C',
  Humidity: '%',
  Rainfall: ' mm/yr',
  Monsoon_Rain_Share: '%',
  Post_Monsoon_Rain_Share: '%',
  Dry_Months: '',
  Max_Temperature: ' °C',
  Solar_Radiation: ' kWh/m²',
  Elevation: ' m',
  Slope: '°',
};
const SOIL = ['pH', 'Nitrogen', 'Organic_Carbon', 'Clay', 'Sand', 'CEC'];
const CLIMATE = [
  'Temperature', 'Winter_Temperature', 'Max_Temperature', 'Humidity', 'Rainfall',
  'Monsoon_Rain_Share', 'Post_Monsoon_Rain_Share', 'Dry_Months', 'Solar_Radiation', 'Elevation', 'Slope',
];

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(score, 3)}%`, height: '100%', borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

type Texts = ReturnType<typeof useApp>['t'];

// The model's probability is the share of land like this that grows the crop
// (checked on unseen districts in ml-service/training/calibration.py), so we say it that way.
function tenths(probability: number) {
  return Math.round(probability * 10);
}

function shareLabel(probability: number, t: Texts) {
  return tenths(probability) >= 1 ? t.shareShort.replace('{n}', String(tenths(probability))) : t.shareRare;
}

// Strength of the top crop, from how often such a score was right in testing
function strength(reliability: number, t: Texts) {
  if (reliability >= 0.75) return t.strong;
  if (reliability >= 0.5) return t.good;
  return t.possible;
}

// Monsoon share comes as 0-1, everything else as is
function showValue(key: string, value: number) {
  // shares are stored as 0-1 and shown as a percentage
  return key === 'Monsoon_Rain_Share' || key === 'Post_Monsoon_Rain_Share' ? Math.round(value * 100) : value;
}

// Small green tag for crops inside the model's 90% confidence set (Rule 3 of our paper)
function ConfidentBadge({ label }: { label: string }) {
  return (
    <Text
      style={{
        alignSelf: 'flex-start',
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 999,
        overflow: 'hidden',
        fontSize: 12,
        fontWeight: '700',
        color: colors.white,
        backgroundColor: colors.primary,
      }}>
      ✓ {label}
    </Text>
  );
}

function OtherCropsCard({ data, land }: { data: RecommendResponse; land: Land }) {
  const { t, language } = useApp();
  // On rain-fed land, only those the normal rain can grow; with irrigation, all of them
  const crops = data.other_crops.filter((item) => !land.rainfed || item.suits.rain === 'good' || item.suits.rain === 'possible');
  if (crops.length === 0) {
    return null;
  }
  // Grouped (vegetables, herbs, spices, plantation crops), the best few of each
  const groups = GROUP_ORDER.map((group) => ({ group, items: crops.filter((item) => item.group === group).slice(0, PER_GROUP) }))
    .filter(({ items }) => items.length > 0);
  return (
    <Card>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>🌿 {t.otherCropsTitle}</Text>
      {groups.map(({ group, items }) => (
        <View key={group} style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>{t.cropGroups[group]}</Text>
          {items.map((item) => (
            <View key={item.crop} style={{ gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{cropName(item.crop, language)}</Text>
              <SuitNotes suits={item.suits} land={land} />
            </View>
          ))}
        </View>
      ))}
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
        {t.otherCropsNote.replace('{rain}', String(data.rain_checked_mm ?? '?'))}
      </Text>
    </Card>
  );
}

function SeasonSowingCard({ sowing }: { sowing: SeasonSowing }) {
  const { t, language } = useApp();
  const biggest = Math.max(...sowing.crops.map((item) => item.share), 0.01);
  return (
    <Card>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>
        🌾 {t.seasonSowingTitle
          .replace('{district}', districtName(sowing.district, language))
          .replace('{season}', t.seasonNames[sowing.season])}
      </Text>
      {sowing.crops.map((item) => (
        <View key={item.crop} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{cropName(item.crop, language)}</Text>
            <Text style={{ fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] }}>
              {item.area_ha.toLocaleString('en-IN')} ha · {Math.max(Math.round(item.share * 100), 1)}%
            </Text>
          </View>
          <ScoreBar score={(item.share / biggest) * 100} color={colors.accent} />
        </View>
      ))}
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.seasonSowingNote}</Text>
    </Card>
  );
}

function CropFactsCard({ facts }: { facts: CropFacts }) {
  const { t, language } = useApp();
  const place = facts.level === 'taluk' ? talukName(facts.name) : districtName(facts.name, language);
  const biggest = Math.max(...facts.crops.map((item) => item.share), 0.01);
  return (
    <Card>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>
        🌾 {(facts.level === 'taluk' ? t.factsTaluk : t.factsDistrict).replace('{name}', place)}
      </Text>
      {facts.crops.map((item) => (
        <View key={item.crop} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{cropName(item.crop, language)}</Text>
            <Text style={{ fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] }}>
              {Math.max(Math.round(item.share * 100), 1)}%
            </Text>
          </View>
          <ScoreBar score={(item.share / biggest) * 100} color={colors.accent} />
        </View>
      ))}
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
        {t.factsNote.replace('{source}', facts.level === 'taluk' ? t.factsSourceTaluk : t.factsSourceDistrict)}
      </Text>
    </Card>
  );
}

// Amber tag for a crop that rain alone cannot grow here this year (rain-fed land only)
// A plantation crop, fruit tree or sugarcane: it stands in the field through every season
function YearRoundBadge({ label }: { label: string }) {
  return (
    <Text
      style={{
        alignSelf: 'flex-start',
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 999,
        overflow: 'hidden',
        fontSize: 12,
        fontWeight: '700',
        color: colors.primaryDark,
        backgroundColor: colors.primarySoft,
      }}>
      🌳 {label}
    </Text>
  );
}

function IrrigationBadge({ label }: { label: string }) {
  return (
    <Text
      style={{
        alignSelf: 'flex-start',
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 999,
        overflow: 'hidden',
        fontSize: 12,
        fontWeight: '700',
        color: '#8A6100',
        backgroundColor: colors.accentSoft,
      }}>
      💧 {label}
    </Text>
  );
}

function SeasonRainCard({ season, rainfed }: { season: SeasonRain; rainfed: boolean }) {
  const { t } = useApp();
  const percent = season.percent_from_normal;
  const versusNormal =
    percent >= 5
      ? t.rainAbove.replace('{n}', String(percent))
      : percent <= -5
        ? t.rainBelow.replace('{n}', String(-percent))
        : t.rainNormal;
  const dry = season.imd_category === 'deficient' || season.imd_category === 'large_deficient';
  return (
    <Card color={dry ? colors.accentSoft : undefined}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>🌧️ {t.seasonRainTitle}</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: dry ? '#8A6100' : colors.primaryDark }}>
        {versusNormal} · {t.rainCategory[season.imd_category]}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>
        {t.seasonRainAmount
          .replace('{rain}', String(season.rain_mm))
          .replace('{to}', season.to)
          .replace('{normal}', String(season.normal_mm))}
      </Text>
      {!rainfed && <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t.irrigatedNote}</Text>}
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.seasonRainSource}</Text>
    </Card>
  );
}

export function Results({ data, waterSource }: { data: RecommendResponse; waterSource: WaterSource }) {
  const { t, language } = useApp();
  // Two questions: what to sow this season (the headline) and what grows best on this land. They differ when
  // the model's top crop stands all year (it gets its own card below the headline) or when the crops the
  // place really sows put another crop first (it stays in the list below).
  const top = data.recommendations[0];
  const best = data.season_best ?? top;
  const yearRoundBest = data.season_best && YEAR_ROUND_CROPS.includes(top.crop) ? top : null;
  const bestReliability = data.season_best?.reliability ?? data.top_crop_reliability;
  // crops the tested soil pH or this season's temperature cannot grow are left out of the lists below, as in
  // the ML service
  const cannotGrow = (suits: Suits | null) =>
    suits !== null && (suits.temperature === 'unsuited' || (data.soil_test?.ph !== undefined && suits.ph === 'unsuited'));
  // The next best year-round crops for this land (coconut, cashew, banana...), shown in the year-round card
  const yearRoundMore = yearRoundBest
    ? data.all_crops
        .filter((item) => YEAR_ROUND_CROPS.includes(item.crop) && item.crop !== yearRoundBest.crop && !cannotGrow(item.suits) && item.probability >= 0.01)
        .slice(0, YEAR_ROUND_MORE)
    : [];
  const others = data.recommendations.filter(
    (item) => item.crop !== best.crop && item.crop !== yearRoundBest?.crop && !yearRoundMore.some((more) => more.crop === item.crop),
  );
  const [showAll, setShowAll] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const shown = new Set([best.crop, ...data.recommendations.map((item) => item.crop), ...yearRoundMore.map((item) => item.crop)]);
  const answered = [...shown]; // every crop named above, for the water plan and feedback
  // "See top 10": the next most likely crops, up to 10 in all; further down the list they are rare here
  const rest = data.all_crops
    .filter((item) => !shown.has(item.crop) && !cannotGrow(item.suits))
    .slice(0, Math.max(0, TOP_LIST - shown.size));

  // Rain-fed land: mark crops that most farmers here irrigate (census, Karnataka only)
  const rainfed = waterSource === 'rain';
  // What the crop notes check against: the farmer's own pH if tested, the land's normal rain, low nitrogen
  const land: Land = {
    ownPh: data.soil_test?.ph,
    mapPh: data.features.pH,
    rainfed,
    rain: data.rain_checked_mm,
    lowNitrogen: data.soil_ratings?.n === 'low',
  };
  const needOf = (crop: string) => (rainfed ? mostlyIrrigatedShare(data.crop_facts?.irrigated, crop) : null);
  const bestNeed = needOf(best.crop);
  const place =
    data.crop_facts?.level === 'taluk'
      ? talukName(data.crop_facts.name)
      : districtName(data.crop_facts?.name ?? '', language);
  const rainCanGrow = data.recommendations.filter((item) => needOf(item.crop) === null).map((item) => cropName(item.crop, language));

  // Shown when a year-round crop is in the top 3, so the crops sown this season are not hidden below it
  const showSowList =
    data.sow_this_season.length > 0 && data.recommendations.slice(0, 3).some((item) => YEAR_ROUND_CROPS.includes(item.crop));

  // The 3 features that moved the model most for the best crop (from SHAP)
  const reasons = Object.entries(best.shap ?? {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);
  const biggest = Math.max(...reasons.map(([, value]) => Math.abs(value)), 0.0001);

  // A picked taluk with little data leans on its district; say so above the answer
  const district = districtName(data.location.district ?? '', language);
  const talukNote =
    data.taluk_weight === 0
      ? t.talukUsesDistrict.replace('{district}', district)
      : data.taluk_weight !== null && data.taluk_weight < 1
        ? t.talukPartlyDistrict
            .replace('{n}', String(Math.round(data.taluk_weight * 100)))
            .replace('{district}', district)
        : null;

  return (
    <View style={{ gap: 20 }}>
      {/* A season in which the district sows little (summer almost everywhere): the crops need irrigation */}
      {data.season_sown_share !== null && data.season_sown_share < LITTLE_SOWN && (
        <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text, padding: 14, borderRadius: radius.medium, backgroundColor: colors.accentSoft }}>
          🌱{' '}
          {t.littleSown
            .replaceAll('{season}', t.seasonNames[data.season])
            .replace('{n}', data.season_sown_share < 0.01 ? '<1' : String(Math.round(data.season_sown_share * 100)))}
        </Text>
      )}

      {/* A place without crop statistics (a few districts outside Karnataka): the answer could not be checked */}
      {data.district_middle && (
        <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text, padding: 14, borderRadius: radius.medium, backgroundColor: colors.accentSoft }}>
          ⚠️ {t.middleNote}
        </Text>
      )}
      {data.untested_place && (
        <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text, padding: 14, borderRadius: radius.medium, backgroundColor: colors.accentSoft }}>
          ⚠️ {t.noStatsHere}
        </Text>
      )}

      {talukNote && (
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted, padding: 14, borderRadius: radius.medium, backgroundColor: colors.primarySoft }}>
          ℹ️ {talukNote}
        </Text>
      )}

      {/* Best crop (to sow this season) */}
      <Card color={colors.accentSoft}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#8A6100', textTransform: 'uppercase' }}>
          ⭐ {(data.season_best ? t.bestToSow : t.bestCropFor).replace('{season}', t.seasonNames[data.season])}
        </Text>
        <Text selectable style={{ fontSize: 34, fontWeight: '800', color: colors.text }}>
          {cropName(best.crop, language)}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {best.confident && <ConfidentBadge label={t.confident} />}
          <SuitNotes suits={best.suits} land={land} />
          {YEAR_ROUND_CROPS.includes(best.crop) && <YearRoundBadge label={t.yearRound} />}
        </View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primaryDark }}>
          {strength(bestReliability, t)}
        </Text>
        <ScoreBar score={best.score} color={colors.accent} />
        <Text style={{ fontSize: 16, lineHeight: 22, color: colors.text }}>
          {tenths(best.probability) >= 1 ? t.shareOfLand.replace('{n}', String(tenths(best.probability))) : t.shareRare}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
          {t.reliabilityNote.replace('{n}', String(tenths(bestReliability)))}
        </Text>
        {/* Rain-fed land where rain alone can't grow the best crop this year: say so, and what it can grow */}
        {bestNeed !== null && (
          <View style={{ gap: 6, padding: 12, borderRadius: radius.small, backgroundColor: colors.card }}>
            <IrrigationBadge label={t.needsIrrigation} />
            <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>
              {(data.crop_facts?.level === 'taluk' ? t.needsIrrigationTaluk : t.needsIrrigationDistrict)
                .replace('{n}', String(Math.round(bestNeed * 100)))
                .replace('{crop}', cropName(best.crop, language))
                .replace('{place}', place)}
            </Text>
            <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.primaryDark }}>
              {rainCanGrow.length > 0 ? t.rainfedChoices.replace('{crops}', rainCanGrow.join(', ')) : t.rainfedNoChoices}
            </Text>
          </View>
        )}
      </Card>

      {/* Year-round crops at the top (plantations, fruit trees): the season's field crops, listed apart */}
      {showSowList && (
        <Card>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>
            🌱 {t.sowTitle.replace('{season}', t.seasonNames[data.season])}
          </Text>
          {data.sow_this_season.map((item) => {
            const sown = item.taluk_share ?? item.district_share;
            return (
              <View key={item.crop} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{cropName(item.crop, language)}</Text>
                <Text style={{ fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] }}>
                  {sown !== null ? t.sowShare.replace('{n}', String(Math.max(Math.round(sown * 100), 1))) : shareLabel(item.probability, t)}
                </Text>
              </View>
            );
          })}
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.sowNote}</Text>
        </Card>
      )}

      {/* The land's best crop when it stands all year: shown apart from what to sow this season */}
      {yearRoundBest && (
        <Card>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primaryDark, textTransform: 'uppercase' }}>
            🌳 {t.yearRoundBest}
          </Text>
          <Text selectable style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>
            {cropName(yearRoundBest.crop, language)}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {yearRoundBest.confident && <ConfidentBadge label={t.confident} />}
            {needOf(yearRoundBest.crop) !== null && <IrrigationBadge label={t.needsIrrigation} />}
          </View>
          <ScoreBar score={yearRoundBest.score} color={colors.primary} />
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>
            {tenths(yearRoundBest.probability) >= 1
              ? t.shareOfLand.replace('{n}', String(tenths(yearRoundBest.probability)))
              : t.shareRare}
          </Text>
          <SuitNotes suits={yearRoundBest.suits} land={land} />
          {yearRoundMore.length > 0 && (
            <View style={{ gap: 8, paddingTop: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>{t.yearRoundMore}</Text>
              {yearRoundMore.map((item) => (
                <View key={item.crop} style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{cropName(item.crop, language)}</Text>
                    <Text style={{ fontSize: 14, color: colors.muted, fontVariant: ['tabular-nums'] }}>{shareLabel(item.probability, t)}</Text>
                  </View>
                  {needOf(item.crop) !== null && <IrrigationBadge label={t.needsIrrigation} />}
                  <SuitNotes suits={item.suits} land={land} />
                </View>
              ))}
            </View>
          )}
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.yearRoundBestNote}</Text>
        </Card>
      )}

      {/* Other crops */}
      {others.length > 0 && (
        <Card>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{t.otherCrops}</Text>
          {others.map((item) => (
            <View key={item.crop} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>
                  {cropName(item.crop, language)}
                </Text>
                <Text style={{ fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] }}>
                  {shareLabel(item.probability, t)}
                </Text>
              </View>
              <ScoreBar score={item.score} color={colors.primary} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {item.confident && <ConfidentBadge label={t.confident} />}
                {YEAR_ROUND_CROPS.includes(item.crop) && <YearRoundBadge label={t.yearRound} />}
                {needOf(item.crop) !== null && <IrrigationBadge label={t.needsIrrigation} />}
              </View>
              <SuitNotes suits={item.suits} land={land} />
            </View>
          ))}

          {/* Every other crop the model knows, for a farmer who wants to see beyond the top 5 */}
          {rest.length > 0 && (
            <Pressable onPress={() => setShowAll(!showAll)} accessibilityRole="button" style={{ paddingVertical: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>
                {showAll ? t.hideAllCrops : t.seeAllCrops.replace('{n}', String(shown.size + rest.length))}
              </Text>
            </Pressable>
          )}
          {showAll && (
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.allCropsNote}</Text>
              {rest.map((item) => (
                <View key={item.crop} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{cropName(item.crop, language)}</Text>
                    <Text style={{ fontSize: 14, color: colors.muted, fontVariant: ['tabular-nums'] }}>{shareLabel(item.probability, t)}</Text>
                  </View>
                  {YEAR_ROUND_CROPS.includes(item.crop) && <YearRoundBadge label={t.yearRound} />}
                  <SuitNotes suits={item.suits} land={land} />
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {/* Herbs, spices and plantation crops the model does not know, that suit the land by their needs */}
      {data.other_crops.length > 0 && <OtherCropsCard data={data} land={land} />}

      {/* This monsoon so far, against normal (June-November only) */}
      {data.season_rain && <SeasonRainCard season={data.season_rain} rainfed={rainfed} />}

      {/* Details for those who want them (why this crop, official figures, soil and climate numbers): kept
          behind one button so the farmer's answer above stays short */}
      <Pressable
        onPress={() => setShowDetails(!showDetails)}
        accessibilityRole="button"
        style={{ padding: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>
          {showDetails ? t.hideDetails : t.moreDetails}
        </Text>
      </Pressable>
      {showDetails && (
        <>
        {/* Why */}
        {reasons.length > 0 && (
          <Card>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{t.whyTitle}</Text>
            {reasons.map(([feature, value]) => (
              <View key={feature} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, flexShrink: 1 }}>
                    {t.features[feature] ?? feature}
                  </Text>
                  <Text style={{ fontSize: 14, color: value >= 0 ? colors.primary : colors.danger }}>
                    {value >= 0 ? '▲ ' + t.helped : '▼ ' + t.against}
                  </Text>
                </View>
                <ScoreBar
                  score={(Math.abs(value) / biggest) * 100}
                  color={value >= 0 ? colors.primary : colors.danger}
                />
              </View>
            ))}
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.whyNote}</Text>
          </Card>
        )}

        {/* What the district sowed most this season (crop survey), to compare with the model */}
        {data.season_sowing && <SeasonSowingCard sowing={data.season_sowing} />}

        {/* What is really grown here, to compare with the model */}
        {data.crop_facts && <CropFactsCard facts={data.crop_facts} />}

        {/* The land's soil and climate */}
        <Card>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{t.yourLand}</Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
            {data.area === 'taluk'
              ? t.talukTypical
                  .replace('{taluk}', talukName(data.location.taluk ?? ''))
                  .replace('{n}', String(data.sample_points))
              : data.area === 'district'
                ? t.districtTypical
                    .replace('{district}', districtName(data.location.district ?? '', language))
                    .replace('{n}', String(data.sample_points))
                : t.soilSource}
            {data.soil_read_metres_away
              ? ' ' + t.soilNearby.replace('{m}', String(data.soil_read_metres_away))
              : ''}
          </Text>
          {[
            { title: t.soil, keys: SOIL },
            { title: t.climate, keys: CLIMATE },
          ].map((group) => (
            <View key={group.title} style={{ gap: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>{group.title}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {group.keys.map((key) => (
                  <View
                    key={key}
                    style={{
                      flexGrow: 1,
                      flexBasis: '45%',
                      padding: 12,
                      gap: 2,
                      borderRadius: radius.small,
                      backgroundColor: colors.primarySoft,
                    }}>
                    <Text style={{ fontSize: 13, color: colors.muted }}>{t.features[key]}</Text>
                    <Text selectable style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
                      {showValue(key, data.features[key])}
                      {UNITS[key]}
                    </Text>
                    {FROM_SOIL_TEST[key] && data.soil_test?.[FROM_SOIL_TEST[key]] !== undefined && (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>✓ {t.soilTest.fromYou}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </Card>

        </>
      )}


      {/* The farmer's own soil test: what was used, and N/P/K ratings */}
      {data.soil_test && (
        <Card>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>🧪 {t.soilTest.title}</Text>
          {(data.soil_test.ph !== undefined || data.soil_test.organic_carbon_pct !== undefined) && (
            <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>
              {[
                data.soil_test.ph !== undefined && `${t.soilTest.ph}: ${data.soil_test.ph}`,
                data.soil_test.organic_carbon_pct !== undefined &&
                  `${t.soilTest.organic_carbon_pct}: ${data.soil_test.organic_carbon_pct}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              {' — '}
              {t.soilTest.usedInModel}
            </Text>
          )}
          {RATED_VALUES.map((key) => {
            const rating = data.soil_ratings?.[key];
            if (!rating) {
              return null;
            }
            return (
              <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontSize: 15, color: colors.text, flexShrink: 1 }}>
                  {t.soilTest[key]}: {data.soil_test?.[key]}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: RATING_COLORS[rating] }}>{t.soilTest[rating]}</Text>
              </View>
            );
          })}
          {(data.soil_test.n !== undefined || data.soil_test.p !== undefined || data.soil_test.k !== undefined) && (
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t.soilTest.npkNote}</Text>
          )}
          {data.soil_ratings && Object.keys(data.soil_ratings).length > 0 && (
            <Text style={{ fontSize: 13, color: colors.muted }}>{t.soilTest.ratingSource}</Text>
          )}
        </Card>
      )}

      <WaterPlan
        crops={answered}
        lat={data.location.lat}
        lng={data.location.lng}
      />

      <FeedbackForm
        recommendationId={data.recommendation_id}
        recommended={answered}
      />

      {data.recommendations.some((item) => item.confident) && (
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center' }}>{t.confidentNote}</Text>
      )}
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center' }}>{t.disclaimer}</Text>
    </View>
  );
}
