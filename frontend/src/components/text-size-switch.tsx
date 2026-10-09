import { Text as NativeText, Pressable, View } from 'react-native';

import { useApp } from '@/lib/app-context';
import { TEXT_SIZES, type TextSize } from '@/lib/text-size';
import { colors } from '@/theme';

// How big the "A" of each choice is drawn, so the farmer sees the difference before pressing
const LETTER_SIZE: Record<TextSize, number> = { normal: 18, large: 24, larger: 30 };

// Normal, big or bigger letters for the whole app. The choices are drawn at a fixed size (React Native's own Text),
// so they never grow out of their buttons.
export function TextSizeSwitch() {
  const { t, textSize, setTextSize } = useApp();

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {TEXT_SIZES.map((size) => {
        const selected = size === textSize;
        return (
          <Pressable
            key={size}
            onPress={() => setTextSize(size)}
            accessibilityRole="button"
            accessibilityLabel={t.textSize[size]}
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              minHeight: 76,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.card,
            }}>
            <NativeText style={{ fontSize: LETTER_SIZE[size], fontWeight: '800', color: colors.primaryDark }}>A</NativeText>
            <NativeText style={{ fontSize: 15, fontWeight: selected ? '800' : '600', color: colors.text, textAlign: 'center' }}>
              {t.textSize[size]}
            </NativeText>
          </Pressable>
        );
      })}
    </View>
  );
}
