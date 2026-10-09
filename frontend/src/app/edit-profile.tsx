import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { FormError } from '@/components/auth-screen';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { KeyboardView } from '@/components/keyboard-view';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { api, ApiError } from '@/lib/api';
import { useApp, type User } from '@/lib/app-context';
import { colors } from '@/theme';

// The photo is saved as a small square JPEG: enough for the profile circle, and about 30 KB to send
const PHOTO_SIZE = 320;
const PICK_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };

// "Edit profile": the photo (camera or gallery) and the name. The mobile number is shown but never changes: it is
// the account's login ID. "Change password" opens its own page (change-password.tsx), as in most apps.
export default function EditProfileScreen() {
  const { t, user, token, updateUser, showPhoto } = useApp();
  const router = useRouter();
  const [name, setName] = useState(user?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>(); // the picked photo, shown while it is being saved

  const errorText = (err: unknown) => t.errors[err instanceof ApiError ? err.code : 'server_error'] ?? t.errors.server_error;

  // Shrinks the picked photo to a small square JPEG and saves it on the server
  async function savePhoto(uri: string) {
    setPhotoBusy(true);
    setPreview(uri);
    try {
      const small = await ImageManipulator.manipulate(uri).resize({ width: PHOTO_SIZE }).renderAsync();
      const jpeg = await small.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
      const data = await api<{ photo_updated_at: string }>('/users/me/photo', { method: 'PUT', token, body: { image: jpeg.base64 } });
      showPhoto(data.photo_updated_at, `data:image/jpeg;base64,${jpeg.base64}`); // every screen shows it at once
      updateUser({ ...user!, photo_updated_at: data.photo_updated_at });
      setPhotoMessage(t.editProfile.photoSaved);
    } catch (err) {
      console.warn('GreenRoot: the photo was not saved', err); // the reason, in the "npx expo start" window
      setPhotoError(err instanceof ApiError ? errorText(err) : t.errors.photo_invalid);
    }
    setPreview(undefined);
    setPhotoBusy(false);
  }

  // Android may close the app while the gallery or camera is open (when the phone is short of memory). The photo
  // picked then comes back the next time this screen opens, and is saved like any other.
  useEffect(() => {
    ImagePicker.getPendingResultAsync().then((pending) => {
      if (pending && 'assets' in pending && !pending.canceled) {
        savePhoto(pending.assets[0].uri);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only once, when the screen opens
  }, []);

  if (!user) {
    return null;
  }

  async function choosePhoto(from: 'camera' | 'gallery') {
    setPhotoError(null);
    setPhotoMessage(null);
    if (from === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      setPhotoError(t.editProfile.cameraDenied);
      return;
    }
    const picked = from === 'camera' ? await ImagePicker.launchCameraAsync(PICK_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
    if (!picked.canceled) {
      await savePhoto(picked.assets[0].uri);
    }
  }

  async function removePhoto() {
    setPhotoError(null);
    setPhotoMessage(null);
    setPhotoBusy(true);
    try {
      await api('/users/me/photo', { method: 'DELETE', token });
      updateUser({ ...user!, photo_updated_at: null });
    } catch (err) {
      setPhotoError(errorText(err));
    }
    setPhotoBusy(false);
  }

  async function save() {
    setMessage(null);
    setError(null);
    const body: Record<string, string> = {};
    if (name.trim() !== user!.full_name) {
      body.full_name = name;
    }
    if (Object.keys(body).length === 0) {
      setMessage(t.editProfile.nothingChanged);
      return;
    }
    setSaving(true);
    try {
      const data = await api<{ user: User }>('/users/me', { method: 'PATCH', token, body });
      updateUser(data.user);
      setMessage(t.editProfile.saved);
    } catch (err) {
      setError(errorText(err));
    }
    setSaving(false);
  }

  return (
    <KeyboardView>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
        {/* Photo */}
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{t.editProfile.photo}</Text>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Avatar size={110} preview={preview} />
            {photoBusy && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ fontSize: 15, color: colors.muted }}>{t.editProfile.savingPhoto}</Text>
              </View>
            )}
          </View>
          <FormError message={photoError} />
          {photoMessage && <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primaryDark, textAlign: 'center' }}>✓ {photoMessage}</Text>}
          <Button title={t.editProfile.takePhoto} onPress={() => choosePhoto('camera')} variant="outline" disabled={photoBusy} />
          <Button title={t.editProfile.choosePhoto} onPress={() => choosePhoto('gallery')} variant="outline" disabled={photoBusy} />
          {user.photo_updated_at && (
            <Button title={t.editProfile.removePhoto} onPress={removePhoto} variant="outline" disabled={photoBusy} />
          )}
        </Card>

        {/* Name and mobile number (shown only) */}
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{t.editProfile.details}</Text>
          <TextField label={t.fullName} value={name} onChangeText={setName} autoComplete="name" maxLength={80} />
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{t.phone}</Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{user.phone}</Text>
            <Text style={{ fontSize: 15, color: colors.muted }}>{t.editProfile.phoneFixed}</Text>
          </View>
          <FormError message={error} />
          {message && <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primaryDark }}>✓ {message}</Text>}
          <Button title={t.editProfile.save} onPress={save} loading={saving} />
        </Card>

        {/* Password: its own page */}
        <Button title={t.changePassword.open} onPress={() => router.push('/change-password')} variant="outline" />
      </ScrollView>
    </KeyboardView>
  );
}
