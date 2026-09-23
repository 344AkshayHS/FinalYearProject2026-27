import { Text, View } from 'react-native';

import { Card } from '@/components/card';
import { FeedbackForm } from '@/components/feedback-form';
import { WaterPlan } from '@/components/water-plan';
import { useApp } from '@/lib/app-context';
import { cropName } from '@/lib/translations';
import { colors, radius } from '@/theme';

export type Recommendation = {
  crop: string;
  probability: number;
  score: number;
  confident: boolean;
  shap: Record<string, number> | null;
  lime: Record<string, number> | null;
};

type Rating = 'low' | 'medium' | 'high';
type RatedValue = 'organic_carbon_pct' | 'n' | 'p' | 'k';

// Soil test values that get a Low / Medium / High rating, in the order they are shown
const RATED_VALUES: RatedValue[] = ['organic_carbon_pct', 'n', 'p', 'k'];

export type RecommendResponse = {
  recommendation_id: string;
  location: { lat: number; lng: number; state: string | null; district: string | null };
  features: Record<string, number>;
  model_version: string;
  recommendations: Recommendation[];
  top_crop_reliability: number; // how often a top crop with this probability was the area's main crop in testing
  soil_test: Partial<Record<'ph' | 'organic_carbon_pct' | 'n' | 'p' | 'k', number>> | null;
  soil_ratings: Partial<Record<RatedValue, Rating>> | null;
  soil_read_metres_away: number;
};

// Model features that the farmer's own soil test replaces
const FROM_SOIL_TEST: Record<string, 'ph' | 'organic_carbon_pct'> = { pH: 'ph', Organic_Carbon: 'organic_carbon_pct' };
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

export function Results({ data }: { data: RecommendResponse }) {
  const { t, language } = useApp();
  const [best, ...others] = data.recommendations;

  // The 3 features that moved the model most for the best crop (from SHAP)
  const reasons = Object.entries(best.shap ?? {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);
  const biggest = Math.max(...reasons.map(([, value]) => Math.abs(value)), 0.0001);

  return (
    <View style={{ gap: 20 }}>
      {/* Best crop */}
      <Card color={colors.accentSoft}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#8A6100', textTransform: 'uppercase' }}>
          ⭐ {t.bestCrop}
        </Text>
        <Text selectable style={{ fontSize: 34, fontWeight: '800', color: colors.text }}>
          {cropName(best.crop, language)}
        </Text>
        {best.confident && <ConfidentBadge label={t.confident} />}
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primaryDark }}>
          {strength(data.top_crop_reliability, t)}
        </Text>
        <ScoreBar score={best.score} color={colors.accent} />
        <Text style={{ fontSize: 16, lineHeight: 22, color: colors.text }}>
          {tenths(best.probability) >= 1 ? t.shareOfLand.replace('{n}', String(tenths(best.probability))) : t.shareRare}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
          {t.reliabilityNote.replace('{n}', String(tenths(data.top_crop_reliability)))}
        </Text>
      </Card>

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
              {item.confident && <ConfidentBadge label={t.confident} />}
            </View>
          ))}
        </Card>
      )}

      {/* The land's soil and climate */}
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{t.yourLand}</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
          {t.soilSource}
          {data.soil_read_metres_away > 0
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
        crops={data.recommendations.map((item) => item.crop)}
        lat={data.location.lat}
        lng={data.location.lng}
      />

      <FeedbackForm
        recommendationId={data.recommendation_id}
        recommended={data.recommendations.map((item) => item.crop)}
      />

      {data.recommendations.some((item) => item.confident) && (
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center' }}>{t.confidentNote}</Text>
      )}
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center' }}>{t.disclaimer}</Text>
    </View>
  );
}
