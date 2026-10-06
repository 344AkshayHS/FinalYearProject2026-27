import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CropRowLink } from '@/components/crop-photo';
import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import { MAX_COMPARE } from '@/lib/crops';
import { colors } from '@/theme';

// The crops the farmer saved with the heart on a crop's page, the latest first
export default function SavedScreen() {
  const { t, language, crops, reloadCrops } = useApp();
  const router = useRouter();
  const locale = language === 'kn' ? 'kn-IN' : 'en-IN';

  if (crops === null || crops === 'failed') {
    return (
      <View style={{ flex: 1, padding: 20, gap: 14 }}>
        {crops === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={{ fontSize: 16, lineHeight: 22, color: colors.danger }}>{t.cropPage.loadFailed}</Text>
            <Button title={t.tryAgain} onPress={reloadCrops} variant="outline" />
          </>
        )}
      </View>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
      {crops.saved.length === 0 ? (
        <Text style={{ fontSize: 16, lineHeight: 22, color: colors.muted }}>{t.savedPage.empty}</Text>
      ) : (
        <Card>
          {crops.saved.map((item) => (
            <CropRowLink key={item.crop} crop={item.crop}>
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {t.savedPage.savedOn.replace('{date}', new Date(item.created_at).toLocaleDateString(locale, { dateStyle: 'medium' }))}
              </Text>
            </CropRowLink>
          ))}
        </Card>
      )}

      {crops.saved.length >= 2 && (
        <Button
          title={t.savedPage.compareSaved}
          onPress={() =>
            router.push({
              pathname: '/compare',
              params: { crops: crops.saved.slice(0, MAX_COMPARE).map((item) => item.crop).join(',') },
            })
          }
        />
      )}
    </ScrollView>
  );
}
