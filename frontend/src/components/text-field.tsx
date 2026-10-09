import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import { inputFontSize } from '@/lib/text-size';
import { colors, radius } from '@/theme';

type Props = TextInputProps & { label: string; hint?: string };

// A labelled text box. A password box (secureTextEntry) gets an eye button: press it to see what you typed,
// press again to hide it.
export function TextField({ label, hint, secureTextEntry, ...inputProps }: Props) {
  const { t, textSize } = useApp();
  const [shown, setShown] = useState(false);
  const password = secureTextEntry === true;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderRadius: radius.small,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.border,
        }}>
        <TextInput
          placeholderTextColor={colors.muted}
          secureTextEntry={password && !shown}
          style={{ flex: 1, minHeight: 52, paddingHorizontal: 16, fontSize: inputFontSize(textSize), color: colors.text }}
          {...inputProps}
        />
        {password && (
          <Pressable
            onPress={() => setShown(!shown)}
            accessibilityRole="button"
            accessibilityLabel={shown ? t.hidePassword : t.showPassword}
            hitSlop={8}
            style={{ paddingHorizontal: 14, alignSelf: 'stretch', justifyContent: 'center' }}>
            <SymbolView
              name={shown ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' } : { ios: 'eye', android: 'visibility', web: 'visibility' }}
              tintColor={colors.muted}
              size={24}
            />
          </Pressable>
        )}
      </View>
      {hint && <Text style={{ fontSize: 13, color: colors.muted }}>{hint}</Text>}
    </View>
  );
}
