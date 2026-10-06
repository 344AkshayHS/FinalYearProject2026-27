import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { useApp } from '@/lib/app-context';
import { colors } from '@/theme';

export const SOIL_TEST_KEYS = ['ph', 'organic_carbon_pct', 'n', 'p', 'k'] as const;
export type SoilTestKey = (typeof SOIL_TEST_KEYS)[number];
export type SoilTestValues = Record<SoilTestKey, string>;

export const EMPTY_SOIL_TEST: SoilTestValues = { ph: '', organic_carbon_pct: '', n: '', p: '', k: '' };

// Only the filled-in values, as numbers, for the /recommend request (null when nothing was typed)
export function soilTestBody(values: SoilTestValues) {
  const filled = SOIL_TEST_KEYS.filter((key) => values[key].trim() !== '');
  if (filled.length === 0) {
    return null;
  }
  return Object.fromEntries(filled.map((key) => [key, Number(values[key].replace(',', '.'))]));
}

// Optional values from the farmer's own soil test (Soil Health Card)
export function SoilTestForm({ values, onChange }: { values: SoilTestValues; onChange: (values: SoilTestValues) => void }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" hitSlop={8}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.primary }}>
          {open ? '▾ ' + t.soilTest.close : '▸ ' + t.soilTest.open}
        </Text>
      </Pressable>

      {open && (
        <View style={{ gap: 14 }}>
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted }}>{t.soilTest.intro}</Text>
          {SOIL_TEST_KEYS.map((key) => (
            <TextField
              key={key}
              label={t.soilTest[key]}
              value={values[key]}
              onChangeText={(text) => onChange({ ...values, [key]: text })}
              keyboardType="decimal-pad"
            />
          ))}
        </View>
      )}
    </Card>
  );
}
