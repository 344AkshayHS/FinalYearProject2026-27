import Constants from 'expo-constants';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/button';
import { LanguageSwitch } from '@/components/language-switch';
import { NumeralsSwitch } from '@/components/numerals-switch';
import { Text } from '@/components/text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { placeOf, type PastResult } from '@/lib/past-results';
import { cardShadow, colors, radius } from '@/theme';

type MenuItem = { title: string; subtitle: string; href: Href; ios: SFSymbol; android: AndroidSymbol };

// One line of the profile menu: icon, title, a short line under it, and an arrow. A tap opens the page.
function MenuRow({ item, first }: { item: MenuItem; first: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(item.href)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        opacity: pressed ? 0.6 : 1,
      })}>
      <SymbolView name={{ ios: item.ios, android: item.android, web: item.android }} tintColor={colors.primaryDark} size={24} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{item.title}</Text>
        <Text style={{ fontSize: 14, color: colors.muted }}>{item.subtitle}</Text>
      </View>
      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={colors.muted} size={20} />
    </Pressable>
  );
}

// The Profile tab: who is logged in, a menu (history, saved crops, compare, about), the language, the admin
// login and log out
export default function ProfileScreen() {
  const { t, user, token, language, logout, crops } = useApp();
  const [latest, setLatest] = useState<PastResult | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  // How many results there are and where the last one was, loaded each time the tab is opened
  useFocusEffect(
    useCallback(() => {
      api<{ recommendations: PastResult[]; total: number }>('/users/me/recommendations', { token })
        .then((data) => {
          setLatest(data.recommendations[0] ?? null);
          setTotal(data.total);
        })
        .catch(() => setTotal(null));
    }, [token])
  );

  const locale = language === 'kn' ? 'kn-IN' : 'en-IN';
  const savedCount = crops && crops !== 'failed' ? crops.saved.length : null;
  const menu: MenuItem[] = [
    {
      title: t.profileMenu.history,
      subtitle: !total ? t.profileMenu.historyNone : total === 1 ? t.profileMenu.historyOne : t.profileMenu.historyCount.replace('{n}', String(total)),
      href: '/history',
      ios: 'clock.arrow.circlepath',
      android: 'history',
    },
    {
      title: t.profileMenu.saved,
      subtitle: !savedCount ? t.profileMenu.savedNone : savedCount === 1 ? t.profileMenu.savedOne : t.profileMenu.savedCount.replace('{n}', String(savedCount)),
      href: '/saved',
      ios: 'heart',
      android: 'favorite',
    },
    { title: t.profileMenu.compare, subtitle: t.profileMenu.compareSub, href: '/compare', ios: 'square.split.2x1', android: 'compare_arrows' },
    {
      title: t.profileMenu.about,
      subtitle: t.profileMenu.aboutSub.replace('{v}', Constants.expoConfig?.version ?? ''),
      href: '/about',
      ios: 'info.circle',
      android: 'info',
    },
  ];

  const cardStyle = {
    padding: 20,
    gap: 14,
    borderRadius: radius.large,
    borderCurve: 'continuous' as const,
    backgroundColor: colors.card,
    boxShadow: cardShadow,
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
      {/* Who is logged in */}
      <View style={{ ...cardStyle, backgroundColor: colors.primarySoft }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.white }}>{user?.full_name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{user?.full_name}</Text>
            <Text selectable style={{ fontSize: 15, color: colors.muted }}>
              +91 {user?.phone}
            </Text>
            {latest && (
              <Text style={{ fontSize: 15, color: colors.primaryDark }}>
                📍 {t.profileMenu.lastPlace.replace('{place}', placeOf(latest, language))}
              </Text>
            )}
          </View>
        </View>
        {user?.created_at && (
          <Text style={{ fontSize: 14, color: colors.muted }}>
            {t.memberSince.replace('{date}', new Date(user.created_at).toLocaleDateString(locale, { dateStyle: 'medium' }))}
          </Text>
        )}
      </View>

      {/* History, saved crops, compare, about */}
      <View style={{ ...cardStyle, paddingVertical: 6, gap: 0 }}>
        {menu.map((item, index) => (
          <MenuRow key={item.title} item={item} first={index === 0} />
        ))}
      </View>

      {/* Language */}
      <View style={cardStyle}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{t.language}</Text>
        <LanguageSwitch />
        {/* In Kannada: numbers as 0-9 or as Kannada numerals */}
        {language === 'kn' && (
          <>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{t.numbers}</Text>
            <NumeralsSwitch />
          </>
        )}
      </View>

      <Button title={t.logout} onPress={logout} variant="outline" />
    </ScrollView>
  );
}
