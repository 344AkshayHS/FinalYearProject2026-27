import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CropThumb } from '@/components/crop-photo';
import { Text } from '@/components/text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { placeOf, type PastResult } from '@/lib/past-results';
import { cropName } from '@/lib/translations';
import { cardShadow, colors, radius } from '@/theme';

// The farmer's past results, newest first. Each crop opens its page.
// The bin at the top right lets the farmer pick results and delete them from this list. The server only hides
// them from the farmer: the project keeps every result (backend DELETE /users/me/recommendations).
export default function HistoryScreen() {
  const { t, token, language } = useApp();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<PastResult[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [choosing, setChoosing] = useState(false); // the bin was pressed: tapping a result picks it
  const [chosen, setChosen] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const load = useCallback(() => {
    api<{ recommendations: PastResult[]; total: number }>('/users/me/recommendations', { token })
      .then((data) => {
        setHistory(data.recommendations);
        setTotal(data.total);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [token]);

  // Loaded each time the page opens, so a result just made on Home is in the list
  useFocusEffect(load);

  function stopChoosing() {
    setChoosing(false);
    setChosen([]);
    setDeleteFailed(false);
  }

  // Top right: the bin, or "Cancel" while picking results
  const hasHistory = (history?.length ?? 0) > 0;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        choosing ? (
          <Pressable onPress={stopChoosing} accessibilityRole="button" hitSlop={10}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.primary }}>{t.historyDelete.cancel}</Text>
          </Pressable>
        ) : hasHistory ? (
          <Pressable
            onPress={() => setChoosing(true)}
            accessibilityRole="button"
            accessibilityLabel={t.historyDelete.open}
            hitSlop={10}
            style={{ padding: 4 }}>
            <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} tintColor={colors.danger} size={28} />
          </Pressable>
        ) : null,
    });
  }, [navigation, choosing, hasHistory, t]);

  function toggle(id: string) {
    setChosen((old) => (old.includes(id) ? old.filter((other) => other !== id) : [...old, id]));
  }

  async function deleteChosen() {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await api('/users/me/recommendations', { method: 'DELETE', token, body: { ids: chosen } });
      stopChoosing();
      load();
    } catch {
      setDeleteFailed(true);
    }
    setDeleting(false);
  }

  function confirmDelete() {
    const title = chosen.length === 1 ? t.historyDelete.confirmOne : t.historyDelete.confirmMany.replace('{n}', String(chosen.length));
    Alert.alert(title, t.historyDelete.confirmMessage, [
      { text: t.historyDelete.cancel, style: 'cancel' },
      { text: t.historyDelete.confirm, style: 'destructive', onPress: deleteChosen },
    ]);
  }

  const locale = language === 'kn' ? 'kn-IN' : 'en-IN';
  const allChosen = history !== null && history.length > 0 && chosen.length === history.length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}>
        {history === null && !failed && <ActivityIndicator color={colors.primary} />}
        {failed && <Text style={{ fontSize: 16, color: colors.danger }}>{t.errors.server_error}</Text>}
        {history?.length === 0 && <Text style={{ fontSize: 17, lineHeight: 24, color: colors.muted }}>{t.noHistory}</Text>}
        {!choosing && total !== null && history !== null && total > history.length && (
          <Text style={{ fontSize: 15, color: colors.muted }}>{t.historyLatest.replace('{n}', String(history.length))}</Text>
        )}

        {/* While picking: what to do, and "Select all" */}
        {choosing && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{t.historyDelete.choose}</Text>
            <Button
              title={allChosen ? t.historyDelete.unselectAll : t.historyDelete.selectAll}
              onPress={() => setChosen(allChosen ? [] : (history ?? []).map((item) => item.id))}
              variant="outline"
            />
          </View>
        )}

        {history?.map((item) => {
          const picked = chosen.includes(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={choosing ? () => toggle(item.id) : undefined}
              disabled={!choosing}
              accessibilityRole={choosing ? 'checkbox' : undefined}
              accessibilityState={choosing ? { checked: picked } : undefined}
              style={{
                padding: 16,
                gap: 10,
                borderRadius: radius.large,
                borderCurve: 'continuous',
                backgroundColor: picked ? colors.dangerSoft : colors.card,
                borderWidth: 2,
                borderColor: picked ? colors.danger : 'transparent',
                boxShadow: cardShadow,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, color: colors.muted }}>
                    {new Date(item.created_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
                    {item.season ? ' · ' + t.seasonNames[item.season] : ''}
                  </Text>
                  <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>📍 {placeOf(item, language)}</Text>
                </View>
                {/* A big round tick box while picking */}
                {choosing && (
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: picked ? colors.danger : colors.muted,
                      backgroundColor: picked ? colors.danger : colors.card,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {picked && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={colors.white} size={20} />}
                  </View>
                )}
              </View>
              {/* The result's top 3 crops */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(item.crops ?? []).slice(0, 3).map((c) => (
                  <Pressable
                    key={c.crop}
                    onPress={() => (choosing ? toggle(item.id) : router.push({ pathname: '/crop/[name]', params: { name: c.crop } }))}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
                    <CropThumb crop={c.crop} size={72} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' }}>{cropName(c.crop, language)}</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* While picking: the red "Delete (n)" button stays at the bottom */}
      {choosing && (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 12 + insets.bottom,
            gap: 8,
            backgroundColor: colors.card,
            boxShadow: cardShadow,
          }}>
          {deleteFailed && <Text style={{ fontSize: 15, color: colors.danger }}>{t.historyDelete.failed}</Text>}
          <Button
            title={t.historyDelete.deleteSelected.replace('{n}', String(chosen.length))}
            onPress={confirmDelete}
            variant="danger"
            disabled={chosen.length === 0}
            loading={deleting}
          />
        </View>
      )}
    </View>
  );
}
