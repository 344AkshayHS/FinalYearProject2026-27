import { TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/text';
import { colors, radius } from '@/theme';

type Props = TextInputProps & { label: string; hint?: string };

export function TextField({ label, hint, ...inputProps }: Props) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={{
          minHeight: 52,
          paddingHorizontal: 16,
          fontSize: 17,
          color: colors.text,
          backgroundColor: colors.card,
          borderRadius: radius.small,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.border,
        }}
        {...inputProps}
      />
      {hint && <Text style={{ fontSize: 13, color: colors.muted }}>{hint}</Text>}
    </View>
  );
}
