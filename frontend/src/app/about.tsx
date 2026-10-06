import Constants from 'expo-constants';
import { Image, ScrollView, View } from 'react-native';

import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import { colors } from '@/theme';

// What GreenRoot is, its version, and where its data and photos come from
export default function AboutScreen() {
  const { t } = useApp();
  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Image source={require('../../assets/images/icon.png')} style={{ width: 84, height: 84, borderRadius: 20 }} />
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{t.appName}</Text>
        <Text style={{ fontSize: 15, color: colors.muted }}>{t.about.version.replace('{v}', version)}</Text>
      </View>

      <Text style={{ fontSize: 16, lineHeight: 23, color: colors.text }}>{t.about.intro}</Text>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{t.about.dataTitle}</Text>
        {t.about.data.map((line) => (
          <Text key={line} style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>
            • {line}
          </Text>
        ))}
      </Card>

      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.disclaimer}</Text>
    </ScrollView>
  );
}
