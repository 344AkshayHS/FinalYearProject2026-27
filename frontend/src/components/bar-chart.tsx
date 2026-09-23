import { Text, View } from 'react-native';

import { colors } from '@/theme';

export type Bar = { label: string; value: number; highlight?: boolean };

type Props = {
  bars: Bar[];
  format?: (value: number) => string;
  max?: number; // full-width value; default: the biggest bar
};

// Simple horizontal bar chart built from Views (no chart library).
// Negative values (e.g. SHAP) are drawn in red, positive in green.
export function BarChart({ bars, format = (value) => value.toFixed(2), max }: Props) {
  const biggest = max ?? Math.max(...bars.map((bar) => Math.abs(bar.value)), 0.0001);

  return (
    <View style={{ gap: 10 }}>
      {bars.map((bar) => (
        <View key={bar.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text
              style={{ fontSize: 14, flexShrink: 1, color: colors.text, fontWeight: bar.highlight ? '800' : '500' }}>
              {bar.highlight ? '★ ' : ''}
              {bar.label}
            </Text>
            <Text selectable style={{ fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }}>
              {format(bar.value)}
            </Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View
              style={{
                width: `${Math.min(100, (Math.abs(bar.value) / biggest) * 100)}%`,
                height: '100%',
                borderRadius: 5,
                backgroundColor: bar.value < 0 ? colors.danger : bar.highlight ? colors.accent : colors.primary,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
