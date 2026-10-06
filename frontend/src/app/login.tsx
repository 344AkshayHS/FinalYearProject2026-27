import { Link } from 'expo-router';
import { useState } from 'react';

import { AdminLogin } from '@/components/admin-login';
import { AuthScreen, FormError } from '@/components/auth-screen';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { colors } from '@/theme';

export default function LoginScreen() {
  const { t, login } = useApp();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    setError(null);
    setLoading(true);
    try {
      await login(phone.trim(), password);
      // Logged in: the layout switches to the home screen by itself
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      setError(t.errors[code] ?? t.errors.server_error);
      setLoading(false);
    }
  }

  return (
    <AuthScreen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{t.login}</Text>
      <FormError message={error} />
      <TextField
        label={t.phone}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={10}
        autoComplete="tel"
        placeholder="98765 43210"
      />
      <TextField
        label={t.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={onLogin}
      />
      <Button title={t.login} onPress={onLogin} loading={loading} />
      <Link href="/register" replace style={{ alignSelf: 'center', padding: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primary }}>{t.noAccount}</Text>
      </Link>
      <AdminLogin />
    </AuthScreen>
  );
}
