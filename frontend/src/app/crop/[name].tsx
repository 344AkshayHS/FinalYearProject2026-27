import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PhotoBox } from '@/components/crop-photo';
import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import { cropRows, findCrop, landRows, orderedPhotos, resultPlace, type CropRow } from '@/lib/crops';
import { cropName } from '@/lib/translations';
import { buttonShadow, colors, radius } from '@/theme';

const PAGE_PADDING = 20;

// Label on the left, value on the right; "—" when our sources have no figure
function FactRows({ rows }: { rows: CropRow[] }) {
  return (
    <View>
      {rows.map((row, index) => (
        <View
          key={row.label}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 12,
            paddingVertical: 10,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: colors.border,
          }}>
          <Text style={{ fontSize: 15, color: colors.muted, flex: 1 }}>{row.label}</Text>
          <Text selectable style={{ fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'right' }}>
            {row.value ?? '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}

// One crop's page: its photos (the harvested crop first; swipe or tap a small photo for the others), the heart
// to save it, what it means for the farmer's land (last result) and what the crop is like
export default function CropScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { t, language, crops, reloadCrops, lastResult, toggleSaved } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const photoWidth = width - PAGE_PADDING * 2;
  const photoHeight = Math.round(photoWidth * 0.72);

  const entry = findCrop(crops, name);
  const photos = orderedPhotos(entry);
  const [index, setIndex] = useState(0);
  const gallery = useRef<ScrollView>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const isSaved = crops !== null && crops !== 'failed' && crops.saved.some((item) => item.crop === name);
  const photo = photos[index] ?? null;

  function showPhoto(next: number) {
    setIndex(next);
    gallery.current?.scrollTo({ x: next * photoWidth, animated: true });
  }

  async function heart() {
    setSaving(true);
    setSaveFailed(false);
    try {
      await toggleSaved(name);
    } catch {
      setSaveFailed(true);
    }
    setSaving(false);
  }

  const title = <Stack.Screen options={{ title: cropName(name, language) }} />;

  if (crops === null || crops === 'failed' || !entry) {
    return (
      <View style={{ flex: 1, padding: PAGE_PADDING, gap: 14 }}>
        {title}
        {crops === null && <ActivityIndicator color={colors.primary} />}
        {crops === 'failed' && (
          <>
            <Text style={{ fontSize: 16, lineHeight: 22, color: colors.danger }}>{t.cropPage.loadFailed}</Text>
            <Button title={t.tryAgain} onPress={reloadCrops} variant="outline" />
          </>
        )}
        {crops !== null && crops !== 'failed' && !entry && <Text style={{ fontSize: 16, color: colors.text }}>{t.cropPage.notFound}</Text>}
      </View>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: PAGE_PADDING, gap: 20, paddingBottom: 48 }}>
      {title}

      {/* Photos: swipe between them */}
      <View style={{ gap: 10 }}>
        <View style={{ borderRadius: radius.large, borderCurve: 'continuous', overflow: 'hidden' }}>
          {photos.length > 0 ? (
            <ScrollView
              ref={gallery}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / photoWidth))}
              style={{ width: photoWidth }}>
              {photos.map((item) => (
                <PhotoBox key={item.path} photo={item} width={photoWidth} height={photoHeight} radius={0} />
              ))}
            </ScrollView>
          ) : (
            <PhotoBox photo={null} width={photoWidth} height={photoHeight} radius={0} />
          )}

          {/* The heart: save the crop, or take it off the saved list */}
          <Pressable
            onPress={heart}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? t.cropPage.unsave : t.cropPage.save}
            accessibilityState={{ selected: isSaved, busy: saving }}
            hitSlop={8}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.card,
              boxShadow: buttonShadow,
              opacity: saving ? 0.6 : 1,
            }}>
            {/* A red outline heart, filled once saved */}
            <Text style={{ fontSize: isSaved ? 22 : 28, lineHeight: 32, color: colors.danger }}>{isSaved ? '❤️' : '♡'}</Text>
          </Pressable>
        </View>

        {photo && (
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primaryDark }}>{t.cropPage.photos[photo.slot]}</Text>
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {t.cropPage.photoCount.replace('{n}', String(index + 1)).replace('{total}', String(photos.length))}
              </Text>
            </View>
            {/* The credit the photo's licence asks for; a tap opens the page the photo came from */}
            <Pressable onPress={() => Linking.openURL(photo.source)} accessibilityRole="link">
              <Text style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}>
                {t.cropPage.photoBy
                  .replace('{author}', photo.author)
                  .replace('{license}', photo.license)
                  .replace('{site}', photo.site)}
              </Text>
            </Pressable>
          </View>
        )}

        {/* All photos small: a tap shows that one */}
        {photos.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {photos.map((item, i) => (
              <Pressable
                key={item.path}
                onPress={() => showPhoto(i)}
                accessibilityRole="button"
                accessibilityLabel={t.cropPage.photos[item.slot]}
                accessibilityState={{ selected: i === index }}
                style={{
                  borderRadius: radius.small + 3,
                  borderWidth: 3,
                  borderColor: i === index ? colors.primary : 'transparent',
                }}>
                <PhotoBox photo={item} width={64} height={64} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Name */}
      <View style={{ gap: 2 }}>
        <Text selectable style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>
          {cropName(name, language)}
        </Text>
        {language === 'kn' && <Text style={{ fontSize: 16, color: colors.muted }}>{cropName(name, 'en')}</Text>}
        <Text selectable style={{ fontSize: 15, fontStyle: 'italic', color: colors.muted }}>
          {entry.scientific_name}
        </Text>
        {saveFailed && <Text style={{ fontSize: 14, color: colors.danger }}>{t.cropPage.saveFailed}</Text>}
      </View>

      {/* What it means for the farmer's land */}
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>📍 {t.cropPage.forYourLand}</Text>
        {lastResult ? (
          <>
            <FactRows rows={landRows(name, lastResult, t)} />
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
              {t.cropPage.forYourLandNote
                .replace('{place}', resultPlace(lastResult, language))
                .replace('{season}', t.seasonNames[lastResult.data.season])}
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted }}>{t.cropPage.noResultYet}</Text>
        )}
      </Card>

      {/* What the crop is like */}
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>🌾 {t.cropPage.aboutCrop}</Text>
        <FactRows rows={cropRows(name, entry, t, language)} />
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{t.cropPage.sources}</Text>
      </Card>

      <Button title={t.cropPage.compare} onPress={() => router.push({ pathname: '/compare', params: { crops: name } })} />
    </ScrollView>
  );
}
