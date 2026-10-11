import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { useApp, useColors } from '@/lib/app-context';
import { cardShadow, radius, type Theme } from '@/theme';

const ICONS: Record<Theme, { ios: SFSymbol; android: AndroidSymbol }> = {
  light: { ios: 'sun.max', android: 'light_mode' },
  dark: { ios: 'moon', android: 'dark_mode' },
};
const THEMES: Theme[] = ['light', 'dark'];

// "Change theme" on the Profile tab: a tap opens a sheet from the bottom with Light and Dark; the chosen one has a
// tick. Choosing one changes the colours of the whole app at once and closes the sheet.
export function ThemeSetting() {
  const colors = useColors();
  const { t, theme, setTheme } = useApp();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: 18,
          paddingHorizontal: 20,
          borderRadius: radius.large,
          borderCurve: 'continuous',
          backgroundColor: colors.card,
          boxShadow: cardShadow,
          opacity: pressed ? 0.6 : 1,
        })}>
        <SymbolView name={{ ...ICONS[theme], web: ICONS[theme].android }} tintColor={colors.primaryDark} size={26} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{t.theme.title}</Text>
          <Text style={{ fontSize: 15, color: colors.muted }}>{t.theme[theme]}</Text>
        </View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={colors.muted} size={20} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        {/* The dark area above the sheet: a tap there closes it, like the back button */}
        <Pressable
          onPress={() => setOpen(false)}
          accessibilityLabel={t.theme.close}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
          {/* The sheet itself: taps on it do not close it */}
          <Pressable
            onPress={() => {}}
            style={{
              paddingTop: 12,
              paddingHorizontal: 20,
              paddingBottom: 20 + insets.bottom,
              borderTopLeftRadius: radius.large,
              borderTopRightRadius: radius.large,
              backgroundColor: colors.card,
            }}>
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
            <Text style={{ marginVertical: 18, fontSize: 19, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{t.theme.choose}</Text>
            {THEMES.map((option) => {
              const selected = option === theme;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setTheme(option);
                    setOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 18,
                    minHeight: 60,
                    paddingHorizontal: 8,
                    borderRadius: radius.medium,
                    backgroundColor: pressed ? colors.primarySoft : 'transparent',
                  })}>
                  <SymbolView name={{ ...ICONS[option], web: ICONS[option].android }} tintColor={colors.text} size={26} />
                  <Text style={{ flex: 1, fontSize: 18, fontWeight: selected ? '700' : '400', color: colors.text }}>{t.theme[option]}</Text>
                  {selected && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={colors.primary} size={26} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
