import { View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import type { WaterSource } from '@/lib/water-choice';
import { colors, radius } from '@/theme';

type Props = {
  value: WaterSource;
  onChange: (source: WaterSource) => void;
  lines?: string[]; // after a result: what the choice means for it (waterChoiceLines), shown under the buttons
};

// "Water for this land": Rain only or Irrigated. Before a result it is part of the form on Home; once crops are
// shown it sits under the best crop, with what the choice changed, so the farmer sees the effect of a tap.
export function WaterSourceCard({ value, onChange, lines }: Props) {
  const { t } = useApp();
  return (
    <Card>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{t.waterSourceTitle}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {(['rain', 'irrigated'] as const).map((source) => (
          <Chip
            key={source}
            label={source === 'rain' ? t.rainOnly : t.irrigated}
            selected={value === source}
            onPress={() => onChange(source)}
          />
        ))}
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t.waterSourceHelp}</Text>
      {lines && lines.length > 0 && (
        <View style={{ gap: 8, padding: 14, borderRadius: radius.medium, backgroundColor: colors.primarySoft }}>
          {lines.map((line, index) => (
            <Text
              key={line}
              style={{ fontSize: 15, lineHeight: 22, color: colors.text, fontWeight: index === 0 ? '700' : '400' }}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}
