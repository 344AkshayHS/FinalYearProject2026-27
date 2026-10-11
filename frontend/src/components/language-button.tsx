import { Pressable } from 'react-native';

import { Text } from '@/components/text';
import { useApp, useColors } from '@/lib/app-context';

// "ಕನ್ನಡ" / "English" at the top right: one tap switches every screen between English and Kannada
export function LanguageButton() {
  const colors = useColors();
  const { t, language, setLanguage } = useApp();
  return (
    <Pressable
      onPress={() => setLanguage(language === 'en' ? 'kn' : 'en')}
      accessibilityRole="button"
      accessibilityLabel={t.switchLanguage}
      hitSlop={10}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>{t.otherLanguage}</Text>
    </Pressable>
  );
}
