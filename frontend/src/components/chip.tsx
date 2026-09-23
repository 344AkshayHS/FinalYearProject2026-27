import { Pressable, Text } from 'react-native';

import { colors } from '@/theme';

// Small round button for picking one option (a crop, an answer, a question)
export function Chip({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: colors.primary,
        backgroundColor: selected ? colors.primary : colors.card,
      }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: selected ? colors.white : colors.primary }}>{label}</Text>
    </Pressable>
  );
}
