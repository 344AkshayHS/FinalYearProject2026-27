import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { ActivityIndicator, Pressable } from 'react-native';

import { Text } from '@/components/text';
import { colors, radius } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean; // greyed out and cannot be pressed (for example while a photo is being saved)
  variant?: 'primary' | 'outline' | 'danger'; // danger: red, for "Delete"
  icon?: { ios: SFSymbol; android: AndroidSymbol }; // shown before the title, e.g. the reload arrows of "Check again"
};

export function Button({ title, onPress, loading = false, disabled = false, variant = 'primary', icon }: Props) {
  const filled = variant !== 'outline';
  const off = loading || disabled;
  const color = filled ? colors.white : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => ({
        minHeight: 54,
        paddingHorizontal: 20,
        borderRadius: radius.medium,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 10,
        backgroundColor: variant === 'danger' ? colors.danger : filled ? colors.primary : 'transparent',
        borderWidth: filled ? 0 : 1.5,
        borderColor: colors.primary,
        opacity: disabled ? 0.5 : pressed || loading ? 0.8 : 1,
      })}>
      {loading && <ActivityIndicator color={color} />}
      {!loading && icon && <SymbolView name={{ ios: icon.ios, android: icon.android, web: icon.android }} tintColor={color} size={22} />}
      <Text style={{ fontSize: 17, fontWeight: '700', color }}>{title}</Text>
    </Pressable>
  );
}
