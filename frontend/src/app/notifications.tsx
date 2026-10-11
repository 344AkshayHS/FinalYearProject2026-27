import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/text';
import { useApp, useColors } from '@/lib/app-context';
import { useNotices } from '@/lib/notices-context';
import type { Notice } from '@/lib/notices';
import { cardShadow, radius } from '@/theme';

// The bell's page: rain coming, a sowing season starting, and "how are your crops?" (lib/notices.ts).
// A tap on a message opens Home (to find crops) or the feedback page of that result.
export default function NotificationsScreen() {
  const colors = useColors();
  const { t } = useApp();
  const { notices, seen, markSeen, refresh } = useNotices();
  const router = useRouter();
  // What was already seen when the page opened: the other messages keep their "New" mark while it is open
  const [seenBefore] = useState(seen);

  // Check the date and the past results again when the page opens
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Everything on the page now counts as seen, so the bell's red number goes away
  const ids = notices.map((notice) => notice.id).join(' ');
  useEffect(() => {
    if (ids) {
      markSeen(ids.split(' '));
    }
  }, [ids, markSeen]);

  function open(notice: Notice) {
    if ('feedback' in notice.opens) {
      router.push({ pathname: '/feedback/[id]', params: { id: notice.opens.feedback } });
    } else {
      router.navigate('/');
    }
  }

  if (notices.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <Text style={{ fontSize: 56 }}>🔔</Text>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{t.notices.empty}</Text>
        <Text style={{ fontSize: 16, lineHeight: 23, color: colors.muted, textAlign: 'center' }}>{t.notices.emptyNote}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}>
      {notices.map((notice) => {
        const isNew = !seenBefore.includes(notice.id);
        return (
          <Pressable
            key={notice.id}
            onPress={() => open(notice)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: 14,
              padding: 18,
              borderRadius: radius.large,
              borderCurve: 'continuous',
              borderWidth: 2,
              borderColor: isNew ? colors.primary : 'transparent',
              backgroundColor: colors.card,
              boxShadow: cardShadow,
              opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={{ fontSize: 32 }}>{notice.icon}</Text>
            <View style={{ flex: 1, gap: 6 }}>
              {isNew && (
                <Text
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 10,
                    paddingVertical: 2,
                    borderRadius: 999,
                    overflow: 'hidden',
                    fontSize: 15,
                    fontWeight: '700',
                    color: colors.onPrimary,
                    backgroundColor: colors.primary,
                  }}>
                  {t.notices.newTag}
                </Text>
              )}
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{notice.title}</Text>
              <Text style={{ fontSize: 16, lineHeight: 23, color: colors.muted }}>{notice.text}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
