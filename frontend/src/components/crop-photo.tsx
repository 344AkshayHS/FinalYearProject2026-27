import { useState } from 'react';
import { Image, Pressable, View, type DimensionValue } from 'react-native';
import { useRouter } from 'expo-router';

import { Text } from '@/components/text';
import { fileUrl } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { findCrop, mainPhoto, type CropPhoto } from '@/lib/crops';
import { cropName } from '@/lib/translations';
import { colors, radius as radii } from '@/theme';

// A crop photo from the backend (crop-images/). Under it a light green box with a seedling shows while the
// photo loads, and stays if it cannot load (no internet, backend off): the farmer never sees a broken picture.
export function PhotoBox({ photo, width, height, radius = radii.small }: { photo: CropPhoto | null; width: DimensionValue; height: number; radius?: number }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const uri = photo && failedPath !== photo.path ? fileUrl(photo.path) : undefined;
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: Math.min(height * 0.4, 44) }}>🌱</Text>
      {uri && photo && (
        <Image
          source={{ uri }}
          onError={() => setFailedPath(photo.path)}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ position: 'absolute', width: '100%', height: '100%' }}
        />
      )}
    </View>
  );
}

// A crop's photo in a list: the harvested crop, as farmers see it at the market
export function CropThumb({ crop, size = 52 }: { crop: string; size?: number }) {
  const { crops } = useApp();
  return <PhotoBox photo={mainPhoto(findCrop(crops, crop))} width={size} height={size} />;
}

// One crop in a list: its photo, its name and a figure on the right. A tap opens the crop's page.
export function CropRowLink({ crop, right, children }: { crop: string; right?: string; children?: React.ReactNode }) {
  const { language } = useApp();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/crop/[name]', params: { name: crop } })}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
      <CropThumb crop={crop} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text, flexShrink: 1 }}>{cropName(crop, language)}</Text>
          {right && <Text style={{ fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] }}>{right}</Text>}
        </View>
        {children}
      </View>
      <Text style={{ fontSize: 22, color: colors.muted }}>›</Text>
    </Pressable>
  );
}
