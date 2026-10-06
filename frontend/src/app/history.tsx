import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { CropThumb } from '@/components/crop-photo';
import { Text } from '@/components/text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { placeOf, type PastResult } from '@/lib/past-results';
import { cropName } from '@/lib/translations';
import { cardShadow, colors, radius } from '@/theme';

// The farmer's past results, newest first. Each crop opens its page.
export default function HistoryScreen() {
  const { t, token, language } = useApp();
  const router = useRouter();
  const [history, setHistory] = useState<PastResult[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Loaded each time the page opens, so a result just made on Home is in the list
  useFocusEffect(
    useCallback(() => {
      api<{ recommendations: PastResult[]; total: number }>('/users/me/recommendations', { token })
        .then((data) => {
          setHistory(data.recommendations);
          setTotal(data.total);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    }, [token])
  );

  const locale = language === 'kn' ? 'kn-IN' : 'en-IN';

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}>
      {history === null && !failed && <ActivityIndicator color={colors.primary} />}
      {failed && <Text style={{ fontSize: 16, color: colors.danger }}>{t.errors.server_error}</Text>}
      {history?.length === 0 && <Text style={{ fontSize: 16, lineHeight: 22, color: colors.muted }}>{t.noHistory}</Text>}
      {total !== null && history !== null && total > history.length && (
        <Text style={{ fontSize: 14, color: colors.muted }}>{t.historyLatest.replace('{n}', String(history.length))}</Text>
      )}

      {history?.map((item) => (
        <View
          key={item.id}
          style={{ padding: 16, gap: 10, borderRadius: radius.large, borderCurve: 'continuous', backgroundColor: colors.card, boxShadow: cardShadow }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {new Date(item.created_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
              {item.season ? ' · ' + t.seasonNames[item.season] : ''}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>📍 {placeOf(item, language)}</Text>
          </View>
          {/* The result's top 3 crops */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(item.crops ?? []).slice(0, 3).map((c) => (
              <Pressable
                key={c.crop}
                onPress={() => router.push({ pathname: '/crop/[name]', params: { name: c.crop } })}
                accessibilityRole="button"
                style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
                <CropThumb crop={c.crop} size={72} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{cropName(c.crop, language)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
