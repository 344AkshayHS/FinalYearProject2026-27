import { Link } from 'expo-router';
import { useState } from 'react';

import { AuthScreen, FormError } from '@/components/auth-screen';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { colors } from '@/theme';

export default function RegisterScreen() {
  const { t, register } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    setError(null);
    setLoading(true);
    try {
      await register(name, phone.trim(), password);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      setError(t.errors[code] ?? t.errors.server_error);
      setLoading(false);
    }
  }

  return (
    <AuthScreen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{t.register}</Text>
      <FormError message={error} />
      <TextField label={t.fullName} value={name} onChangeText={setName} autoComplete="name" />
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
        hint={t.passwordHint}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={onRegister}
      />
      <Button title={t.register} onPress={onRegister} loading={loading} />
      <Link href="/login" replace style={{ alignSelf: 'center', padding: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primary }}>{t.haveAccount}</Text>
      </Link>
    </AuthScreen>
  );
}
