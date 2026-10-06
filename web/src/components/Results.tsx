// A recommendation, as the phone app shows it (frontend/src/components/results.tsx): the farmer's answer first
// (the crop to sow, the other crops), the technical cards ("why this crop", soil and climate numbers) behind a
// "More details" button, then the water plan and feedback form.

import { useState } from 'react';
import { Link } from 'react-router-dom';

import { cropPath, CropRowLink, CropThumb } from '~/components/CropPhoto';
import { FeedbackForm } from '~/components/FeedbackForm';
import { CropFactsCard, OtherCropsCard, SeasonRainCard, SeasonSowingCard, SuitNotes, type Land } from '~/components/ResultCards';
import { Badge, Card, Note, ScoreBar } from '~/components/ui';
import { WaterPlan } from '~/components/WaterPlan';
import { useApp } from '~/lib/app-context';
import type { RatedValue, RecommendResponse, Suits, WaterSource } from '~/lib/types';
import { mostlyIrrigatedShare } from '@/lib/crop-water';
import { MAX_COMPARE } from '@/lib/crops';
import { YEAR_ROUND_CROPS } from '@/lib/season';
import { cropName, districtName, talukName } from '@/lib/translations';

// Soil test values that get a Low / Medium / High rating, in the order they are shown
const RATED_VALUES: RatedValue[] = ['organic_carbon_pct', 'n', 'p', 'k'];

// Model features that the farmer's own soil test replaces
const FROM_SOIL_TEST: Record<string, 'ph' | 'organic_carbon_pct'> = { pH: 'ph', Organic_Carbon: 'organic_carbon_pct' };

// Year-round crops listed under the land's best one (4 in all)
const YEAR_ROUND_MORE = 3;

// How many crops "See top crops" lists in all, counting those already shown
const TOP_LIST = 10;

// Below this share of the district's field crops, a season "sows little" and the page says so
const LITTLE_SOWN = 0.1;

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

// Shares are stored as 0-1 and shown as a percentage, everything else as is
function showValue(key: string, value: number) {
  return key === 'Monsoon_Rain_Share' || key === 'Post_Monsoon_Rain_Share' ? Math.round(value * 100) : value;
}

// A crop's big photo (the harvested crop) with "Photos and details", both opening the crop's page
function CropPhotoLink({ crop, className }: { crop: string; className: string }) {
  const { t } = useApp();
  return (
    <Link to={cropPath(crop)} className="crop-photo-link">
      <CropThumb crop={crop} className={className} />
      <span className="big-link">{t.cropPage.details} ›</span>
    </Link>
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
  const rest = data.all_crops.filter((item) => !shown.has(item.crop) && !cannotGrow(item.suits)).slice(0, Math.max(0, TOP_LIST - shown.size));

  // Rain-fed land: mark crops that most farmers here irrigate (census, Karnataka only)
  const rainfed = waterSource === 'rain';
  const land: Land = {
    ownPh: data.soil_test?.ph,
    mapPh: data.features.pH,
    rainfed,
    rain: data.rain_checked_mm,
    lowNitrogen: data.soil_ratings?.n === 'low',
  };
  const needOf = (crop: string) => (rainfed ? mostlyIrrigatedShare(data.crop_facts?.irrigated, crop) : null);
  const bestNeed = needOf(best.crop);
  const place = data.crop_facts?.level === 'taluk' ? talukName(data.crop_facts.name, language) : districtName(data.crop_facts?.name ?? '', language);
  const rainCanGrow = data.recommendations.filter((item) => needOf(item.crop) === null).map((item) => cropName(item.crop, language));

  // Shown when a year-round crop is in the top 3, so the crops sown this season are not hidden below it
  const showSowList = data.sow_this_season.length > 0 && data.recommendations.slice(0, 3).some((item) => YEAR_ROUND_CROPS.includes(item.crop));

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
        ? t.talukPartlyDistrict.replace('{n}', String(Math.round(data.taluk_weight * 100))).replace('{district}', district)
        : null;

  return (
    <div className="stack-large">
      {/* A season in which the district sows little (summer almost everywhere): the crops need irrigation */}
      {data.season_sown_share !== null && data.season_sown_share < LITTLE_SOWN && (
        <p className="callout callout-warning">
          🌱{' '}
          {t.littleSown
            .replaceAll('{season}', t.seasonNames[data.season])
            .replace('{n}', data.season_sown_share < 0.01 ? '<1' : String(Math.round(data.season_sown_share * 100)))}
        </p>
      )}

      {/* A place without crop statistics (a few districts outside Karnataka): the answer could not be checked */}
      {data.district_middle && <p className="callout callout-warning">⚠️ {t.middleNote}</p>}
      {data.untested_place && <p className="callout callout-warning">⚠️ {t.noStatsHere}</p>}

      {talukNote && <p className="callout note">ℹ️ {talukNote}</p>}

      {/* Best crop (to sow this season) */}
      <Card accent>
        <p className="label-small warning-text">⭐ {(data.season_best ? t.bestToSow : t.bestCropFor).replace('{season}', t.seasonNames[data.season])}</p>
        <p className="crop-title">{cropName(best.crop, language)}</p>
        <CropPhotoLink crop={best.crop} className="photo-wide" />
        <div className="badges">
          {best.confident && <Badge kind="confident" label={t.confident} />}
          {YEAR_ROUND_CROPS.includes(best.crop) && <Badge kind="yearRound" label={t.yearRound} />}
        </div>
        <SuitNotes suits={best.suits} land={land} />
        <p className="big-text bold dark-text">{strength(bestReliability, t)}</p>
        <ScoreBar score={best.score} tone="accent" />
        <p className="big-text">{tenths(best.probability) >= 1 ? t.shareOfLand.replace('{n}', String(tenths(best.probability))) : t.shareRare}</p>
        <Note>{t.reliabilityNote.replace('{n}', String(tenths(bestReliability)))}</Note>
        {/* Rain-fed land where rain alone can't grow the best crop this year: say so, and what it can grow */}
        {bestNeed !== null && (
          <div className="callout callout-white">
            <Badge kind="irrigation" label={t.needsIrrigation} />
            <p>
              {(data.crop_facts?.level === 'taluk' ? t.needsIrrigationTaluk : t.needsIrrigationDistrict)
                .replace('{n}', String(Math.round(bestNeed * 100)))
                .replace('{crop}', cropName(best.crop, language))
                .replace('{place}', place)}
            </p>
            <p className="bold dark-text">{rainCanGrow.length > 0 ? t.rainfedChoices.replace('{crops}', rainCanGrow.join(', ')) : t.rainfedNoChoices}</p>
          </div>
        )}
      </Card>

      {/* Year-round crops at the top (plantations, fruit trees): the season's field crops, listed apart */}
      {showSowList && (
        <Card>
          <h2>🌱 {t.sowTitle.replace('{season}', t.seasonNames[data.season])}</h2>
          {data.sow_this_season.map((item) => {
            const sown = item.taluk_share ?? item.district_share;
            return (
              <CropRowLink
                key={item.crop}
                crop={item.crop}
                right={sown !== null ? t.sowShare.replace('{n}', String(Math.max(Math.round(sown * 100), 1))) : shareLabel(item.probability, t)}
              />
            );
          })}
          <Note>{t.sowNote}</Note>
        </Card>
      )}

      {/* The land's best crop when it stands all year: shown apart from what to sow this season */}
      {yearRoundBest && (
        <Card>
          <p className="label-small dark-text">🌳 {t.yearRoundBest}</p>
          <p className="crop-title crop-title-small">{cropName(yearRoundBest.crop, language)}</p>
          <CropPhotoLink crop={yearRoundBest.crop} className="photo-wide photo-wide-small" />
          <div className="badges">
            {yearRoundBest.confident && <Badge kind="confident" label={t.confident} />}
            {needOf(yearRoundBest.crop) !== null && <Badge kind="irrigation" label={t.needsIrrigation} />}
          </div>
          <ScoreBar score={yearRoundBest.score} />
          <p>{tenths(yearRoundBest.probability) >= 1 ? t.shareOfLand.replace('{n}', String(tenths(yearRoundBest.probability))) : t.shareRare}</p>
          <SuitNotes suits={yearRoundBest.suits} land={land} />
          {yearRoundMore.length > 0 && (
            <div className="stack-small">
              <p className="bold primary-text">{t.yearRoundMore}</p>
              {yearRoundMore.map((item) => (
                <CropRowLink key={item.crop} crop={item.crop} right={shareLabel(item.probability, t)}>
                  {needOf(item.crop) !== null && <Badge kind="irrigation" label={t.needsIrrigation} />}
                  <SuitNotes suits={item.suits} land={land} />
                </CropRowLink>
              ))}
            </div>
          )}
          <Note>{t.yearRoundBestNote}</Note>
        </Card>
      )}

      {/* Other crops */}
      {others.length > 0 && (
        <Card>
          <h2>{t.otherCrops}</h2>
          {others.map((item) => (
            <CropRowLink key={item.crop} crop={item.crop} right={shareLabel(item.probability, t)}>
              <ScoreBar score={item.score} />
              <div className="badges">
                {item.confident && <Badge kind="confident" label={t.confident} />}
                {YEAR_ROUND_CROPS.includes(item.crop) && <Badge kind="yearRound" label={t.yearRound} />}
                {needOf(item.crop) !== null && <Badge kind="irrigation" label={t.needsIrrigation} />}
              </div>
              <SuitNotes suits={item.suits} land={land} />
            </CropRowLink>
          ))}

          {/* Every other crop the model knows, for a farmer who wants to see beyond the top 5 */}
          {rest.length > 0 && (
            <button type="button" className="link-button big-link" onClick={() => setShowAll(!showAll)}>
              {showAll ? t.hideAllCrops : t.seeAllCrops.replace('{n}', String(shown.size + rest.length))}
            </button>
          )}
          {showAll && (
            <div className="stack">
              <Note>{t.allCropsNote}</Note>
              {rest.map((item) => (
                <CropRowLink key={item.crop} crop={item.crop} right={shareLabel(item.probability, t)}>
                  {YEAR_ROUND_CROPS.includes(item.crop) && <Badge kind="yearRound" label={t.yearRound} />}
                  <SuitNotes suits={item.suits} land={land} />
                </CropRowLink>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* The best crop and the next ones side by side */}
      {shown.size >= 2 && (
        <Link to={`/compare?crops=${encodeURIComponent(answered.slice(0, MAX_COMPARE).join(','))}`} className="button button-outline">
          {t.compare.compareThese}
        </Link>
      )}

      {/* Herbs, spices and plantation crops the model does not know, that suit the land by their needs */}
      {data.other_crops.length > 0 && <OtherCropsCard data={data} land={land} />}

      {/* This monsoon so far, against normal (June-November only) */}
      {data.season_rain && <SeasonRainCard season={data.season_rain} rainfed={rainfed} />}

      {/* Details for those who want them (why this crop, official figures, soil and climate numbers): kept
          behind one button so the farmer's answer above stays short */}
      <button type="button" className="button button-outline" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? t.hideDetails : t.moreDetails}
      </button>
      {showDetails && (
        <>
          {/* Why */}
          {reasons.length > 0 && (
            <Card>
              <h2>{t.whyTitle}</h2>
              {reasons.map(([feature, value]) => (
                <div key={feature} className="stack-tiny">
                  <div className="row-between">
                    <span className="bold">{t.features[feature] ?? feature}</span>
                    <span className={value >= 0 ? 'primary-text' : 'error-text'}>{value >= 0 ? '▲ ' + t.helped : '▼ ' + t.against}</span>
                  </div>
                  <ScoreBar score={(Math.abs(value) / biggest) * 100} tone={value >= 0 ? 'primary' : 'danger'} />
                </div>
              ))}
              <Note>{t.whyNote}</Note>
            </Card>
          )}

          {/* What the district sowed most this season (crop survey), to compare with the model */}
          {data.season_sowing && <SeasonSowingCard sowing={data.season_sowing} />}

          {/* What is really grown here, to compare with the model */}
          {data.crop_facts && <CropFactsCard facts={data.crop_facts} />}

          {/* The land's soil and climate */}
          <Card>
            <h2>{t.yourLand}</h2>
            <Note>
              {data.area === 'taluk'
                ? t.talukTypical.replace('{taluk}', talukName(data.location.taluk ?? '', language)).replace('{n}', String(data.sample_points))
                : data.area === 'district'
                  ? t.districtTypical.replace('{district}', districtName(data.location.district ?? '', language)).replace('{n}', String(data.sample_points))
                  : t.soilSource}
              {data.soil_read_metres_away ? ' ' + t.soilNearby.replace('{m}', String(data.soil_read_metres_away)) : ''}
            </Note>
            {[
              { title: t.soil, keys: SOIL },
              { title: t.climate, keys: CLIMATE },
            ].map((group) => (
              <div key={group.title} className="stack-small">
                <p className="bold primary-text">{group.title}</p>
                <div className="values-grid">
                  {group.keys.map((key) => (
                    <div key={key} className="value-box">
                      <span className="note">{t.features[key]}</span>
                      <span className="big-text bold">
                        {showValue(key, data.features[key])}
                        {UNITS[key]}
                      </span>
                      {FROM_SOIL_TEST[key] && data.soil_test?.[FROM_SOIL_TEST[key]] !== undefined && (
                        <span className="small-text bold primary-text">✓ {t.soilTest.fromYou}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* The farmer's own soil test: what was used, and N/P/K ratings */}
      {data.soil_test && (
        <Card>
          <h2>🧪 {t.soilTest.title}</h2>
          {(data.soil_test.ph !== undefined || data.soil_test.organic_carbon_pct !== undefined) && (
            <p>
              {[
                data.soil_test.ph !== undefined && `${t.soilTest.ph}: ${data.soil_test.ph}`,
                data.soil_test.organic_carbon_pct !== undefined && `${t.soilTest.organic_carbon_pct}: ${data.soil_test.organic_carbon_pct}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              {' — '}
              {t.soilTest.usedInModel}
            </p>
          )}
          {RATED_VALUES.map((key) => {
            const rating = data.soil_ratings?.[key];
            if (!rating) {
              return null;
            }
            return (
              <div key={key} className="row-between">
                <span>
                  {t.soilTest[key]}: {data.soil_test?.[key]}
                </span>
                <span className={`bold rating-${rating}`}>{t.soilTest[rating]}</span>
              </div>
            );
          })}
          {(data.soil_test.n !== undefined || data.soil_test.p !== undefined || data.soil_test.k !== undefined) && <Note>{t.soilTest.npkNote}</Note>}
          {data.soil_ratings && Object.keys(data.soil_ratings).length > 0 && <Note>{t.soilTest.ratingSource}</Note>}
        </Card>
      )}

      <WaterPlan crops={answered} lat={data.location.lat} lng={data.location.lng} />

      <FeedbackForm recommendationId={data.recommendation_id} recommended={answered} />

      {data.recommendations.some((item) => item.confident) && <p className="note center-text">{t.confidentNote}</p>}
      <p className="note center-text">{t.disclaimer}</p>
    </div>
  );
}
