import { Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import type { Language } from '@/lib/translations';
import { colors } from '@/theme';

const OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'kn', label: 'ಕನ್ನಡ' },
];

// Two-option pill to switch the whole app between English and Kannada
export function LanguageSwitch() {
  const { language, setLanguage } = useApp();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'center',
        padding: 4,
        borderRadius: 999,
        backgroundColor: colors.primarySoft,
      }}>
      {OPTIONS.map((option) => {
        const selected = option.value === language;
        return (
          <Pressable
            key={option.value}
            onPress={() => setLanguage(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 20,
              borderRadius: 999,
              backgroundColor: selected ? colors.primary : 'transparent',
            }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: selected ? colors.white : colors.primaryDark }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
