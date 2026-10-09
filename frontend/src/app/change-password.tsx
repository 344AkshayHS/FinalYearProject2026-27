import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FormError } from '@/components/auth-screen';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { KeyboardView } from '@/components/keyboard-view';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { colors } from '@/theme';

const MIN_PASSWORD = 8; // the same rule as the server (backend/src/routes/users.js)

// "Change password", opened from Edit profile: the old password, then the new one two times (like most apps).
// The server checks the old password and logs the account out on every other phone.
export default function ChangePasswordScreen() {
  const { t, token } = useApp();
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The mistakes the phone can see before asking the server
  function problem() {
    if (oldPassword === '') {
      return t.changePassword.oldMissing;
    }
    if (newPassword.length < MIN_PASSWORD) {
      return t.errors.password_short;
    }
    if (newPassword !== confirmPassword) {
      return t.changePassword.mismatch;
    }
    if (newPassword === oldPassword) {
      return t.changePassword.same;
    }
    return null;
  }

  async function save() {
    const found = problem();
    setError(found);
    if (found) {
      return;
    }
    setSaving(true);
    try {
      await api('/users/me', { method: 'PATCH', token, body: { current_password: oldPassword, new_password: newPassword } });
      setDone(true);
    } catch (err) {
      setError(t.errors[err instanceof ApiError ? err.code : 'server_error'] ?? t.errors.server_error);
    }
    setSaving(false);
  }

  if (done) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <Card>
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 48 }}>✅</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primaryDark, textAlign: 'center' }}>{t.changePassword.done}</Text>
            <Text style={{ fontSize: 17, lineHeight: 25, color: colors.text, textAlign: 'center' }}>{t.changePassword.doneNote}</Text>
          </View>
          <Button title={t.changePassword.back} onPress={() => router.back()} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <KeyboardView>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
        <Card>
          <Text style={{ fontSize: 17, lineHeight: 25, color: colors.text }}>{t.changePassword.intro}</Text>
          <TextField
            label={t.changePassword.oldPassword}
            value={oldPassword}
            onChangeText={setOldPassword}
            secureTextEntry
            autoComplete="current-password"
            maxLength={128}
          />
          <TextField
            label={t.changePassword.newPassword}
            hint={t.changePassword.newPasswordHint}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={128}
          />
          <TextField
            label={t.changePassword.confirmPassword}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={128}
            onSubmitEditing={save}
          />
          <FormError message={error} />
          <Button title={t.changePassword.save} onPress={save} loading={saving} />
        </Card>
      </ScrollView>
    </KeyboardView>
  );
}
