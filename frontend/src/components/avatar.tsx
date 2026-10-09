import { Image, View } from 'react-native';

import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import { colors } from '@/theme';

// The farmer's profile photo in a circle, or the first letter of their name when there is none (or while it loads).
// The photo itself is loaded once for the whole app (lib/app-context.tsx), so every screen shows the same one and
// changes together. preview: a photo on this phone to show instead (Edit profile shows the picked photo while it is
// being saved).
export function Avatar({ size, preview }: { size: number; preview?: string }) {
  const { user, photo } = useApp();
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const shown = preview ?? photo;

  if (shown) {
    return <Image source={{ uri: shown }} accessibilityIgnoresInvertColors style={{ ...circle, backgroundColor: colors.primarySoft }} />;
  }
  return (
    <View style={{ ...circle, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.43, fontWeight: '800', color: colors.white }}>{user?.full_name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}
