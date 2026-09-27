import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { AdminLogin } from '@/components/admin-login';
import { Button } from '@/components/button';
import { LanguageSwitch } from '@/components/language-switch';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { Season } from '@/lib/season';
import { cropName } from '@/lib/translations';
import { cardShadow, colors, radius } from '@/theme';

type PastResult = {
  id: string;
  created_at: string;
  season: Season | null; // null for results made before the season model
  latitude: string;
  longitude: string;
  crops: { crop: string; score: string }[] | null;
};

export default function ProfileScreen() {
  const { t, user, token, language, logout } = useApp();
  const [history, setHistory] = useState<PastResult[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<{ recommendations: PastResult[] }>('/users/me/recommendations', { token })
      .then((data) => setHistory(data.recommendations))
      .catch(() => setFailed(true));
  }, [token]);

  const cardStyle = {
    padding: 20,
    gap: 14,
    borderRadius: radius.large,
    borderCurve: 'continuous' as const,
    backgroundColor: colors.card,
    boxShadow: cardShadow,
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
      {/* Who is logged in */}
      <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center' }]}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.white }}>
            {user?.full_name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{user?.full_name}</Text>
          <Text selectable style={{ fontSize: 15, color: colors.muted }}>
            +91 {user?.phone}
          </Text>
        </View>
      </View>

      {/* Language */}
      <View style={cardStyle}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{t.language}</Text>
        <LanguageSwitch />
      </View>

      {/* Past results */}
      <View style={cardStyle}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{t.history}</Text>
        {history === null && !failed && <ActivityIndicator color={colors.primary} />}
        {failed && <Text style={{ color: colors.danger }}>{t.errors.server_error}</Text>}
        {history?.length === 0 && <Text style={{ fontSize: 15, color: colors.muted }}>{t.noHistory}</Text>}
        {history?.map((item) => (
          <View key={item.id} style={{ gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {new Date(item.created_at).toLocaleDateString(language === 'kn' ? 'kn-IN' : 'en-IN')} ·{' '}
              {item.season ? t.seasonNames[item.season] + ' · ' : ''}
              {Number(item.latitude).toFixed(3)}, {Number(item.longitude).toFixed(3)}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
              {(item.crops ?? []).slice(0, 3).map((c) => cropName(c.crop, language)).join(' · ')}
            </Text>
          </View>
        ))}
      </View>

      <AdminLogin />

      <Button title={t.logout} onPress={logout} variant="outline" />
    </ScrollView>
  );
}
