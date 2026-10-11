import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text as NativeText, Pressable, View } from 'react-native';

import { useApp, useColors } from '@/lib/app-context';
import { useNotices } from '@/lib/notices-context';

// The bell at the top right: a red circle shows how many messages are new. A tap opens them (app/notifications.tsx).
// The number is drawn at a fixed size (React Native's own Text), so it never grows out of its small circle.
export function BellButton() {
  const colors = useColors();
  const { t } = useApp();
  const { notices, seen } = useNotices();
  const router = useRouter();
  const unseen = notices.filter((notice) => !seen.includes(notice.id)).length;

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={unseen ? t.notices.bellNew.replace('{n}', String(unseen)) : t.notices.title}
      hitSlop={10}
      style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.6 : 1 })}>
      <SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} tintColor={colors.primaryDark} size={28} />
      {unseen > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            minWidth: 20,
            height: 20,
            paddingHorizontal: 5,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.danger,
          }}>
          <NativeText style={{ fontSize: 13, fontWeight: '800', color: colors.onPrimary }}>{unseen > 9 ? '9+' : unseen}</NativeText>
        </View>
      )}
    </Pressable>
  );
}
