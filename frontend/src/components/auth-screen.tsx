import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { KeyboardView } from '@/components/keyboard-view';
import { LanguageSwitch } from '@/components/language-switch';
import { TextSizeSwitch } from '@/components/text-size-switch';
import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import { cardShadow, colors, radius } from '@/theme';

// Shared look for the login and register screens: green header, logo, and a white form card
export function AuthScreen({ children }: { children: ReactNode }) {
  const { t } = useApp();

  return (
    // The keyboard never covers the box being typed in (the screen scrolls it into view)
    <KeyboardView>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}>
        <View
          style={{
            backgroundColor: colors.primary,
            paddingTop: 90,
            paddingBottom: 70,
            alignItems: 'center',
            gap: 10,
            borderBottomLeftRadius: 36,
            borderBottomRightRadius: 36,
          }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: colors.white,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ fontSize: 40 }}>🌱</Text>
          </View>
          <Text style={{ fontSize: 32, fontWeight: '800', color: colors.white }}>{t.appName}</Text>
          <Text style={{ fontSize: 16, color: colors.primarySoft }}>{t.tagline}</Text>
        </View>

        <View
          style={{
            marginTop: -40,
            marginHorizontal: 20,
            padding: 22,
            gap: 18,
            backgroundColor: colors.card,
            borderRadius: radius.large,
            borderCurve: 'continuous',
            boxShadow: cardShadow,
          }}>
          {children}
        </View>

        {/* Language and text size, before logging in too */}
        <View style={{ padding: 28, gap: 14 }}>
          <LanguageSwitch />
          <TextSizeSwitch />
        </View>
      </ScrollView>
    </KeyboardView>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <Text
      selectable
      style={{
        padding: 12,
        borderRadius: 10,
        color: colors.danger,
        backgroundColor: colors.dangerSoft,
        fontSize: 15,
      }}>
      {message}
    </Text>
  );
}
