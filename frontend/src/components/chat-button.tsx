import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Animated, PanResponder, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

const SIZE = 60; // avatar circle
const BOX = { width: 76, height: 96 }; // avatar + label underneath
const MARGIN = 16;
const TAP_DISTANCE = 6; // moved less than this = a tap, not a drag

// Round chat avatar. It starts at the bottom left and the farmer can drag it anywhere on the screen,
// so it never covers what they want to read. A tap opens the crop helper chat.
export function ChatButton({ crop, label }: { crop?: string; label: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState({ width: 0, height: 0 });
  // How far the button has been dragged from its starting corner
  const [position] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));

  const panResponder = useMemo(() => {
    // Where the whole button still fits on the screen
    const maxX = Math.max(0, area.width - BOX.width - 2 * MARGIN);
    const maxUp = Math.max(0, area.height - BOX.height - 2 * MARGIN - insets.bottom);
    const clamp = (x: number, y: number) => ({
      x: Math.min(Math.max(x, 0), maxX),
      y: Math.min(Math.max(y, -maxUp), 0),
    });

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Start each drag from where the button is now
      onPanResponderGrant: () => position.extractOffset(),
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, move) => {
        position.flattenOffset();
        if (Math.abs(move.dx) < TAP_DISTANCE && Math.abs(move.dy) < TAP_DISTANCE) {
          router.push({ pathname: '/chat', params: crop ? { crop } : {} });
          return;
        }
        // Dropped partly off the screen: slide back inside
        position.stopAnimation(({ x, y }) => {
          Animated.spring(position, { toValue: clamp(x, y), useNativeDriver: false }).start();
        });
      },
    });
  }, [area, crop, insets.bottom, position, router]);

  return (
    // Invisible layer over the screen, only to know how far the button may be dragged
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={(event) => setArea(event.nativeEvent.layout)}>
      <Animated.View
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        onAccessibilityTap={() => router.push({ pathname: '/chat', params: crop ? { crop } : {} })}
        style={{
          position: 'absolute',
          left: MARGIN,
          bottom: insets.bottom + MARGIN,
          width: BOX.width,
          alignItems: 'center',
          gap: 4,
          transform: position.getTranslateTransform(),
        }}>
        <View
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primaryDark,
            borderWidth: 3,
            borderColor: colors.white,
            boxShadow: '0 4px 14px rgba(27, 77, 32, 0.35)',
          }}>
          <Text style={{ fontSize: 30 }}>🤖</Text>
          {/* Speech badge, so it reads as "chat" */}
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.accent,
              borderWidth: 2,
              borderColor: colors.white,
            }}>
            <Text style={{ fontSize: 11 }}>💬</Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={{
            paddingVertical: 2,
            paddingHorizontal: 8,
            borderRadius: 999,
            overflow: 'hidden',
            fontSize: 12,
            fontWeight: '700',
            color: colors.white,
            backgroundColor: colors.primary,
          }}>
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}
