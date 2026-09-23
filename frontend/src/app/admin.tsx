import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { colors, radius } from '@/theme';

// The ML dashboard for the project team (English only: it is for the presentation and the report).
// Every number comes from GET /admin/overview: live service checks, the database, and the result
// files saved by the training scripts in ml-service/training.

type Comparison = {
  model: string;
  india_accuracy: number;
  india_macro_f1: number;
  india_top3_main_crop: number;
  karnataka_accuracy: number;
  karnataka_macro_f1: number;
  karnataka_top3_main_crop: number;
};

type Overview = {
  admin: string;
  services: Record<string, { ok: boolean; detail: string }>;
  activity: {
    users: number;
    recommendations: number;
    feedback: number;
    soil_places_cached: number;
    top_crops: { crop: string; times: number }[];
    feedback_by_outcome: { outcome: string; times: number }[];
    recent: {
      id: string;
      created_at: string;
      model_version: string;
      state: string | null;
      district: string | null;
      crop: string | null;
      probability: string | null;
      used_soil_test: boolean;
    }[];
  };
  report: {
    model: {
      version: string;
      type: string;
      settings: { n_estimators: number; min_samples_leaf: number };
      features: string[];
      crops: string[];
      validation: string;
      accuracy_ceiling: { india: number; karnataka: number };
      karnataka_only_random_forest: { accuracy: number; macro_f1: number; top3_main_crop: number };
      conformal: {
        level: number;
        measured_coverage_karnataka: number;
        average_set_size_karnataka: number;
      };
    };
    feature_importance: Record<string, number>;
    dataset: {
      training_rows: number;
      sample_points: number;
      karnataka_points: number;
      states: number;
      districts: number;
      crops: number;
      points_per_state: Record<string, number>;
    };
    model_comparison: Comparison[];
    shap_lime: {
      mean_jaccard_all: number;
      mean_spearman_all: number;
      mean_jaccard_karnataka: number;
      mean_spearman_karnataka: number;
      per_crop: { crop: string; grown_in_karnataka: boolean; jaccard_top3: number; spearman: number }[];
    };
    calibration: {
      calibration: { from: number; to: number; mean_predicted: number; mean_real_share: number }[];
      top_crop_reliability: { from: number; to: number; points: number; main_crop_rate: number }[];
    };
    first_experiment: { dataset: string; model: string; accuracy: number; macro_f1: number }[];
    feedback_retraining: Record<string, string | number | boolean>[];
  } | null;
};

const METRICS: { key: keyof Comparison; label: string }[] = [
  { key: 'india_accuracy', label: 'India accuracy' },
  { key: 'india_top3_main_crop', label: 'India top-3' },
  { key: 'karnataka_accuracy', label: 'Karnataka accuracy' },
  { key: 'karnataka_top3_main_crop', label: 'Karnataka top-3' },
  { key: 'india_macro_f1', label: 'India macro-F1' },
];

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Card>
      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text }}>{title}</Text>
      {note && <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{note}</Text>}
      {children}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', padding: 12, gap: 2, borderRadius: radius.small, backgroundColor: colors.primarySoft }}>
      <Text style={{ fontSize: 13, color: colors.muted }}>{label}</Text>
      <Text selectable style={{ fontSize: 18, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }}>
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </Text>
    </View>
  );
}

function Stats({ items }: { items: [string, string | number][] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {items.map(([label, value]) => (
        <Stat key={label} label={label} value={value} />
      ))}
    </View>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{children}</Text>;
}

// What happens when a farmer taps "Find crops", in order, with the real source of each step
function Pipeline({ crops, features }: { crops: number; features: number }) {
  const steps = [
    ['Location', 'Phone GPS with expo-location: live position updates, kept until a reading is within 100 m or 30 s pass. Or a district picked from the list.'],
    ['District', 'Backend finds the district polygon the point is in (Karnataka Census 2011 and India district GeoJSON maps). OpenStreetMap Nominatim adds the taluk, and corrects the district near a border.'],
    ['Soil', 'ISRIC SoilGrids v2.0 for that exact point, top 30 cm: pH, nitrogen, organic carbon, clay, sand, CEC. Saved in PostgreSQL and reused within 1 km. A farmer’s own pH and organic carbon replace the map values.'],
    ['Climate', 'NASA POWER 20-year averages (2001–2020): temperature, winter and hottest month, humidity, rainfall, monsoon and post-monsoon share, dry months, sunlight. Height and steepness come from the Open-Meteo elevation map.'],
    ['Model', `The ${features} values go to the Random Forest in the Python ML service, which gives a probability for each of ${crops} crops. The top 5 are returned.`],
    ['Explanation', 'SHAP (TreeExplainer) and LIME explain the top crop. The 90% conformal set marks crops as “Likely suitable”.'],
    ['Saved', 'Every input and output is stored in PostgreSQL (recommendations, recommendation_items), so each result can be traced below.'],
    ['Daily water', 'Open-Meteo forecast (today’s evaporation and rain) × FAO crop factor for the growth stage.'],
    ['Chat', 'Rule-based answers from sourced crop facts; optionally phrased by Gemini, rejected if it writes a number not in the facts.'],
  ];
  return (
    <View style={{ gap: 12 }}>
      {steps.map(([title, text], index) => (
        <View key={title} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.white }}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{title}</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function AdminScreen() {
  const { adminToken, adminLogout } = useApp();
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<keyof Comparison>('india_accuracy');

  useEffect(() => {
    api<Overview>('/admin/overview', { token: adminToken })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.code : 'server_error'));
  }, [adminToken]);

  if (error) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Text selectable style={{ fontSize: 16, color: colors.danger }}>
          Could not load the dashboard ({error}).
        </Text>
        {error === 'admin_login_required' && (
          <Pressable onPress={adminLogout} accessibilityRole="button">
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>Log in again</Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (!data) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  }

  const { services, activity, report } = data;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
      <Text style={{ fontSize: 14, color: colors.muted }}>Logged in as {data.admin}</Text>

      <Section title="How a recommendation is made">
        <Pipeline crops={report?.model.crops.length ?? 0} features={report?.model.features.length ?? 0} />
      </Section>

      <Section title="Live status" note="Checked now, every time this page opens.">
        {Object.entries(services).map(([name, service]) => (
          <Line key={name}>
            {service.ok ? '🟢' : '🔴'} <Text style={{ fontWeight: '800' }}>{name.replace('_', ' ')}</Text>: {service.detail}
          </Line>
        ))}
      </Section>

      {!report ? (
        <Section title="Model report" note="The ML service is not running, so the training results can’t be read." >
          <View />
        </Section>
      ) : (
        <>
          <Section
            title="Training data"
            note="Labels: crop area per district — ICRISAT 2015–2019 where it reports, data.gov.in 2010–2014 elsewhere, plus the Coffee Board for coffee and Horticultural Statistics at a Glance 2018 for fruit and vegetables. Features: SoilGrids soil, NASA POWER climate and Open-Meteo terrain at random points inside each district.">
            <Stats
              items={[
                ['Training rows', report.dataset.training_rows],
                ['Sample points', report.dataset.sample_points],
                ['Karnataka points', report.dataset.karnataka_points],
                ['States', report.dataset.states],
                ['Districts', report.dataset.districts],
                ['Crops', report.dataset.crops],
              ]}
            />
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>Sample points per state (top 10)</Text>
            <BarChart
              bars={Object.entries(report.dataset.points_per_state)
                .slice(0, 10)
                .map(([state, points]) => ({ label: state, value: points, highlight: state === 'Karnataka' }))}
              format={(value) => String(value)}
            />
          </Section>

          <Section
            title="7 models compared (Rule 1)"
            note={`${report.model.validation}: every score is on districts the model never saw. Best possible accuracy (ceiling): India ${percent(report.model.accuracy_ceiling.india)}, Karnataka ${percent(report.model.accuracy_ceiling.karnataka)}. Only the ★ model runs in the app; the others are the comparison for the report.`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {METRICS.map((item) => (
                <Chip key={item.key} label={item.label} selected={item.key === metric} onPress={() => setMetric(item.key)} />
              ))}
            </View>
            <BarChart
              bars={report.model_comparison.map((row) => ({
                label: row.model,
                value: Number(row[metric]),
                highlight: row.model === report.model.type,
              }))}
              format={percent}
              max={1}
            />
            <Line>
              Random Forest trained on Karnataka only: accuracy {percent(report.model.karnataka_only_random_forest.accuracy)}, top-3{' '}
              {percent(report.model.karnataka_only_random_forest.top3_main_crop)} on Karnataka.
            </Line>
          </Section>

          <Section
            title={`The app’s model: ${report.model.type}`}
            note={`Version ${report.model.version} · ${report.model.settings.n_estimators} trees · at least ${report.model.settings.min_samples_leaf} rows per leaf. Feature importance: how much the forest uses each input.`}>
            <BarChart
              bars={Object.entries(report.feature_importance)
                .sort((a, b) => b[1] - a[1])
                .map(([feature, value]) => ({ label: feature.replace(/_/g, ' '), value }))}
              format={percent}
            />
          </Section>

          <Section
            title="Explanations agree? SHAP vs LIME (Rule 2)"
            note="For each crop, the top 3 features from SHAP and from LIME are compared (Jaccard: 1 = same three, 0 = none shared), and the full rankings with Spearman.">
            <Stats
              items={[
                ['Jaccard, all crops', report.shap_lime.mean_jaccard_all],
                ['Spearman, all crops', report.shap_lime.mean_spearman_all],
                ['Jaccard, Karnataka crops', report.shap_lime.mean_jaccard_karnataka],
                ['Spearman, Karnataka crops', report.shap_lime.mean_spearman_karnataka],
              ]}
            />
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>Karnataka crops: top-3 Jaccard</Text>
            <BarChart
              bars={report.shap_lime.per_crop
                .filter((row) => row.grown_in_karnataka)
                .sort((a, b) => b.jaccard_top3 - a.jaccard_top3)
                .map((row) => ({ label: row.crop, value: row.jaccard_top3 }))}
              max={1}
            />
          </Section>

          <Section
            title="90% confidence set (Rule 3)"
            note="Split conformal prediction on held-out Karnataka districts: the crops shown as “Likely suitable” should contain a crop really grown there 90% of the time.">
            <Stats
              items={[
                ['Target', percent(report.model.conformal.level)],
                ['Measured coverage', percent(report.model.conformal.measured_coverage_karnataka)],
                ['Average set size', `${report.model.conformal.average_set_size_karnataka.toFixed(1)} crops`],
              ]}
            />
          </Section>

          <Section
            title="Can the numbers be trusted? (calibration)"
            note="Held-out districts again. If the model says 45%, about 45% of similar land should really grow that crop. Bars: predicted (top) vs real share (bottom).">
            {report.calibration.calibration.map((row) => (
              <View key={row.from} style={{ gap: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                  Predicted {percent(Math.max(0, row.from))}–{percent(row.to)}
                </Text>
                <BarChart
                  bars={[
                    { label: 'predicted', value: row.mean_predicted },
                    { label: 'real share', value: row.mean_real_share, highlight: true },
                  ]}
                  format={percent}
                  max={1}
                />
              </View>
            ))}
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>
              How often the top crop was the area’s main crop
            </Text>
            <BarChart
              bars={report.calibration.top_crop_reliability.map((row) => ({
                label: `top crop at ${percent(Math.max(0, row.from))}–${percent(row.to)} (${row.points} points)`,
                value: row.main_crop_rate,
              }))}
              format={percent}
              max={1}
            />
          </Section>

          {report.first_experiment.length > 0 && (
            <Section
              title="First experiment: the team’s original CSV"
              note="Most papers test on one Kaggle dataset. The same models scored very high there but dropped on our combined multi-source data, which is why the app uses the location-based data above.">
              <BarChart
                bars={report.first_experiment
                  .filter((row) => row.model === 'Random Forest')
                  .map((row) => ({ label: `Random Forest · ${row.dataset}`, value: row.accuracy }))}
                format={percent}
                max={1}
              />
            </Section>
          )}

          <Section
            title="Learning from farmer feedback"
            note="Run with npm run export-feedback and training/retrain_with_feedback.py. A new model is kept only if held-out accuracy drops by less than 0.5 points.">
            {report.feedback_retraining.length === 0 ? (
              <Line>No retraining run yet.</Line>
            ) : (
              report.feedback_retraining.map((run) => (
                <Line key={String(run.date)}>
                  {String(run.date)}: {String(run.usable_feedback)} feedback · India {String(run.india_before)} → {String(run.india_after)} ·
                  Karnataka {String(run.karnataka_before)} → {String(run.karnataka_after)} · {run.kept ? 'kept' : 'not kept'}
                </Line>
              ))
            )}
          </Section>
        </>
      )}

      <Section title="App activity" note="Straight from the PostgreSQL database.">
        <Stats
          items={[
            ['Farmers', activity.users],
            ['Recommendations', activity.recommendations],
            ['Feedback', activity.feedback],
            ['Soil points cached', activity.soil_places_cached],
          ]}
        />
        {activity.top_crops.length > 0 && (
          <>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>Most recommended crops</Text>
            <BarChart bars={activity.top_crops.map((row) => ({ label: row.crop, value: row.times }))} format={String} />
          </>
        )}
        {activity.feedback_by_outcome.length > 0 && (
          <Line>
            Feedback: {activity.feedback_by_outcome.map((row) => `${row.outcome} ${row.times}`).join(' · ')}
          </Line>
        )}
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>Latest recommendations (tap to see every step)</Text>
        {activity.recent.length === 0 && <Line>None yet.</Line>}
        {activity.recent.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => router.push({ pathname: '/admin-recommendation', params: { id: row.id } })}
            accessibilityRole="button"
            style={{ paddingVertical: 10, gap: 2, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              #{row.id} · {new Date(row.created_at).toLocaleString('en-IN')} · {row.model_version}
              {row.used_soil_test ? ' · soil test' : ''}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
              {row.district ?? '?'}, {row.state ?? '?'} → {row.crop ?? '?'}
              {row.probability ? ` (${percent(Number(row.probability))})` : ''} ›
            </Text>
          </Pressable>
        ))}
      </Section>
    </ScrollView>
  );
}
