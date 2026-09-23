import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { colors } from '@/theme';

// Folded "Admin login" box on the profile screen; opens the ML dashboard
export function AdminLogin() {
  const { t, adminToken, adminLogin, adminLogout } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await adminLogin(username, password);
      setPassword('');
      router.push('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'server_error');
    }
    setLoading(false);
  }

  if (adminToken) {
    return (
      <Card>
        <Button title={t.admin.openDashboard} onPress={() => router.push('/admin')} />
        <Button title={t.admin.logout} onPress={adminLogout} variant="outline" />
      </Card>
    );
  }

  return (
    <Card>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" hitSlop={8}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.primary }}>
          {open ? '▾ ' : '▸ '}
          {t.admin.open}
        </Text>
      </Pressable>
      {open && (
        <View style={{ gap: 14 }}>
          <Text style={{ fontSize: 14, color: colors.muted }}>{t.admin.intro}</Text>
          <TextField label={t.admin.username} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          <TextField label={t.password} value={password} onChangeText={setPassword} secureTextEntry />
          {error && (
            <Text selectable style={{ fontSize: 15, color: colors.danger }}>
              {t.errors[error] ?? t.errors.server_error}
            </Text>
          )}
          <Button title={t.admin.login} onPress={submit} loading={loading} />
        </View>
      )}
    </Card>
  );
}
