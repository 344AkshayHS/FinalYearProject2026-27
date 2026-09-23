import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { Card } from '@/components/card';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { colors } from '@/theme';

// Every step of one saved recommendation, exactly as stored in PostgreSQL:
// where it was, the soil and climate values the model got, what it answered and why.

type Trace = {
  recommendation: Record<string, string | null> & {
    farmer_soil: Record<string, number> | null;
  };
  items: {
    rank: number;
    crop: string;
    probability: string;
    confident: boolean;
    shap_values: Record<string, number> | null;
    lime_weights: Record<string, number> | null;
  }[];
  feedback: { crop: string; outcome: string; note: string | null; created_at: string }[];
};

// Model feature -> column in the recommendations table, with its unit
const SOIL = [
  ['pH', 'ph', ''],
  ['Nitrogen', 'nitrogen', ' g/kg'],
  ['Organic carbon', 'organic_carbon', ' g/kg'],
  ['Clay', 'clay', ' %'],
  ['Sand', 'sand', ' %'],
  ['CEC', 'cec', ' cmol/kg'],
];
const CLIMATE = [
  ['Temperature', 'temperature_c', ' °C'],
  ['Winter temperature', 'winter_temperature_c', ' °C'],
  ['Humidity', 'humidity_pct', ' %'],
  ['Rainfall', 'rainfall_mm', ' mm/yr'],
  ['Monsoon share of rain', 'monsoon_rain_share', ''],
  ['Post-monsoon share of rain', 'post_monsoon_rain_share', ''],
  ['Dry months (under 50 mm)', 'dry_months', ''],
  ['Hottest month', 'max_temperature_c', ' °C'],
  ['Sunlight', 'solar_radiation', ' kWh/m²/day'],
  ['Height above sea level', 'elevation_m', ' m'],
  ['Steepness', 'slope_degrees', '°'],
];

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text }}>
        {number}. {title}
      </Text>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ fontSize: 15, color: colors.muted, flexShrink: 1 }}>{label}</Text>
      <Text selectable style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
        {value}
      </Text>
    </View>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{children}</Text>;
}

export default function AdminRecommendationScreen() {
  const { adminToken } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Trace>(`/admin/recommendations/${id}`, { token: adminToken })
      .then(setTrace)
      .catch((err) => setError(err instanceof ApiError ? err.code : 'server_error'));
  }, [id, adminToken]);

  if (error) {
    return (
      <Text selectable style={{ padding: 20, fontSize: 16, color: colors.danger }}>
        Could not load recommendation #{id} ({error}).
      </Text>
    );
  }
  if (!trace) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  }

  const r = trace.recommendation;
  const top = trace.items[0];
  const signed = (values: Record<string, number> | null) =>
    Object.entries(values ?? {})
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([feature, value]) => ({ label: feature.replace(/_/g, ' '), value }));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
      <Text style={{ fontSize: 14, color: colors.muted }}>
        Recommendation #{id} · {new Date(String(r.created_at)).toLocaleString('en-IN')} · model {r.model_version}
      </Text>

      <Step number={1} title="Location">
        <Row label="Latitude, longitude" value={`${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)}`} />
        <Row label="District" value={r.district ?? '—'} />
        <Row label="State" value={r.state ?? '—'} />
        <Note>From the phone’s GPS (or the sample farm point of a district picked by hand), matched to district boundary maps.</Note>
      </Step>

      <Step number={2} title="Soil (top 30 cm)">
        {SOIL.map(([label, column, unit]) => (
          <Row key={column} label={label} value={`${Number(r[column])}${unit}`} />
        ))}
        <Note>Source: {r.soil_source ?? 'ISRIC SoilGrids v2.0'}.</Note>
        {r.farmer_soil && (
          <Note>
            The farmer gave a soil test ({Object.entries(r.farmer_soil).map(([key, value]) => `${key} ${value}`).join(', ')}).
            Soil map had pH {Number(r.map_ph)} and organic carbon {Number(r.map_organic_carbon)} g/kg; the model used the values above.
          </Note>
        )}
      </Step>

      <Step number={3} title="Climate (20-year average)">
        {CLIMATE.map(([label, column, unit]) => (
          <Row key={column} label={label} value={`${Number(r[column])}${unit}`} />
        ))}
        <Note>Source: {r.climate_source}.</Note>
      </Step>

      <Step number={4} title="Model output: top 5 crops">
        <BarChart
          bars={trace.items.map((item) => ({
            label: `${item.crop}${item.confident ? ' (90% set)' : ''}`,
            value: Number(item.probability),
            highlight: item.rank === 1,
          }))}
          format={(value) => `${(value * 100).toFixed(1)}%`}
          max={1}
        />
        <Note>Random Forest probabilities: the share of similar land that grows each crop.</Note>
      </Step>

      {top && (
        <Step number={5} title={`Why ${top.crop}?`}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>SHAP (TreeExplainer)</Text>
          <BarChart bars={signed(top.shap_values)} format={(value) => (value >= 0 ? '+' : '') + value.toFixed(3)} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>LIME</Text>
          <BarChart bars={signed(top.lime_weights)} format={(value) => (value >= 0 ? '+' : '') + value.toFixed(3)} />
          <Note>Green pushes towards {top.crop}, red towards other crops, compared with an average farm in the training data.</Note>
        </Step>
      )}

      <Step number={6} title="Farmer feedback">
        {trace.feedback.length === 0 ? (
          <Note>No feedback for this recommendation yet.</Note>
        ) : (
          trace.feedback.map((item) => (
            <Row key={item.crop} label={item.crop} value={`${item.outcome}${item.note ? ` — ${item.note}` : ''}`} />
          ))
        )}
      </Step>
    </ScrollView>
  );
}
