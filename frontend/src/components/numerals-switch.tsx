import { Text as NativeText, Pressable, View } from 'react-native';

import { useApp } from '@/lib/app-context';
import type { Numerals } from '@/lib/digits';
import { colors } from '@/theme';

// The two choices show themselves as they look, so they are never converted (React Native's own Text)
const OPTIONS: { value: Numerals; label: string }[] = [
  { value: 'western', label: '123' },
  { value: 'kannada', label: '೧೨೩' },
];

// Kannada only: numbers as 0-9 or as Kannada numerals, in the same pill as the language switch
export function NumeralsSwitch() {
  const { numerals, setNumerals } = useApp();

  return (
    <View style={{ flexDirection: 'row', alignSelf: 'center', padding: 4, borderRadius: 999, backgroundColor: colors.primarySoft }}>
      {OPTIONS.map((option) => {
        const selected = option.value === numerals;
        return (
          <Pressable
            key={option.value}
            onPress={() => setNumerals(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{ paddingVertical: 8, paddingHorizontal: 24, borderRadius: 999, backgroundColor: selected ? colors.primary : 'transparent' }}>
            <NativeText style={{ fontSize: 16, fontWeight: '700', color: selected ? colors.white : colors.primaryDark }}>{option.label}</NativeText>
          </Pressable>
        );
      })}
    </View>
  );
}
