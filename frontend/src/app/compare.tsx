import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CropPicker } from '@/components/crop-picker';
import { CropThumb } from '@/components/crop-photo';
import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import { cropRows, findCrop, landRows, MAX_COMPARE, resultPlace, type CropRow } from '@/lib/crops';
import { cropName } from '@/lib/translations';
import { colors } from '@/theme';

// One fact for every chosen crop: the fact's name across the top, each crop's value below it in its column
// (no sideways scrolling on a phone)
function CompareRow({ label, values }: { label: string; values: (string | null)[] }) {
  return (
    <View style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.muted }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {values.map((value, i) => (
          <Text key={i} selectable style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.text }}>
            {value ?? '—'}
          </Text>
        ))}
      </View>
    </View>
  );
}

// Rows for all the chosen crops: rowsOf(crop)[i] is row i of that crop
function CompareRows({ crops, rowsOf }: { crops: string[]; rowsOf: (crop: string) => CropRow[] }) {
  const table = crops.map(rowsOf);
  return (
    <View>
      {table[0].map((row, i) => (
        <CompareRow key={row.label} label={row.label} values={table.map((rows) => rows[i].value)} />
      ))}
    </View>
  );
}

// Compare crops side by side: the farmer picks up to 3 (the page can open with some already chosen, such as the
// crops of a result). Every figure is from the same sources as a crop's page.
export default function CompareScreen() {
  const params = useLocalSearchParams<{ crops?: string }>();
  const { t, language, crops, reloadCrops, lastResult } = useApp();
  const router = useRouter();
  const [chosen, setChosen] = useState(() =>
    (params.crops ?? '').split(',').filter(Boolean).slice(0, MAX_COMPARE)
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const full = chosen.length >= MAX_COMPARE;

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
  const known = chosen.filter((crop) => findCrop(crops, crop));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
      <Text style={{ fontSize: 16, lineHeight: 22, color: colors.text }}>{t.compare.intro}</Text>

      {/* The chosen crops, each with its photo, in the same columns as the rows below: a tap opens the crop,
          ✕ takes it out (the side padding is the cards' own) */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20 }}>
        {known.map((crop) => (
          <View key={crop} style={{ flex: 1, gap: 6, alignItems: 'center' }}>
            <Pressable
              onPress={() => router.push({ pathname: '/crop/[name]', params: { name: crop } })}
              accessibilityRole="button"
              style={{ alignItems: 'center', gap: 6 }}>
              <CropThumb crop={crop} size={84} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{cropName(crop, language)}</Text>
            </Pressable>
            <Pressable
              onPress={() => setChosen(chosen.filter((item) => item !== crop))}
              accessibilityRole="button"
              accessibilityLabel={t.compare.remove.replace('{crop}', cropName(crop, language))}
              hitSlop={8}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger }}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {full ? (
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.compare.full}</Text>
      ) : (
        <Button title={'＋ ' + t.compare.add} onPress={() => setPickerOpen(true)} variant="outline" />
      )}

      {known.length < 2 && <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted }}>{t.compare.empty}</Text>}

      {known.length >= 2 && (
        <>
          {/* For the farmer's land, from their last result */}
          <Card>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>📍 {t.compare.landTitle}</Text>
            {lastResult ? (
              <>
                <CompareRows crops={known} rowsOf={(crop) => landRows(crop, lastResult, t)} />
                <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
                  {t.cropPage.forYourLandNote
                    .replace('{place}', resultPlace(lastResult, language))
                    .replace('{season}', t.seasonNames[lastResult.data.season])}
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted }}>{t.compare.noResultNote}</Text>
            )}
          </Card>

          {/* What each crop is like */}
          <Card>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>🌾 {t.cropPage.aboutCrop}</Text>
            <CompareRows crops={known} rowsOf={(crop) => cropRows(crop, findCrop(crops, crop), t, language)} />
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.cropPage.sources}</Text>
          </Card>
        </>
      )}

      <CropPicker
        visible={pickerOpen}
        chosen={known}
        onSelect={(crop) => {
          setChosen([...known, crop].slice(0, MAX_COMPARE));
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </ScrollView>
  );
}
