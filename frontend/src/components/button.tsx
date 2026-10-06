import { ActivityIndicator, Pressable } from 'react-native';

import { Text } from '@/components/text';
import { colors, radius } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'outline';
};

export function Button({ title, onPress, loading = false, variant = 'primary' }: Props) {
  const primary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 54,
        paddingHorizontal: 20,
        borderRadius: radius.medium,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 10,
        backgroundColor: primary ? colors.primary : 'transparent',
        borderWidth: primary ? 0 : 1.5,
        borderColor: colors.primary,
        opacity: pressed || loading ? 0.8 : 1,
      })}>
      {loading && <ActivityIndicator color={primary ? colors.white : colors.primary} />}
      <Text style={{ fontSize: 17, fontWeight: '700', color: primary ? colors.white : colors.primary }}>{title}</Text>
    </Pressable>
  );
}
