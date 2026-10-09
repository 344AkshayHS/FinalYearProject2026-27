// "Edit profile": the photo and the name. Same as frontend/src/app/edit-profile.tsx on the phone. The mobile number
// is shown but never changes: it is the account's login ID. "Change password" opens its own page (ChangePassword.tsx). The photo is shrunk to a small square JPEG in the browser (a canvas, no library) before it is sent.

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { Avatar, BackLink, Button, Card, ErrorBox, Note, Spinner, TextField } from '~/components/ui';
import { api, ApiError } from '~/lib/api';
import { useApp, type User } from '~/lib/app-context';
import { webText } from '~/lib/web-text';

const PHOTO_SIZE = 320; // pixels, enough for the profile circle and about 30 KB

// The middle square of the picture, PHOTO_SIZE wide, as JPEG in base64
async function smallSquareJpeg(file: File) {
  const picture = await createImageBitmap(file);
  const side = Math.min(picture.width, picture.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  canvas.getContext('2d')!.drawImage(picture, (picture.width - side) / 2, (picture.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
}

export function EditProfile() {
  const { t, user, language, updateUser } = useApp();
  const [name, setName] = useState(user?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!user) {
    return null;
  }
  const errorText = (err: unknown) => t.errors[err instanceof ApiError ? err.code : 'server_error'] ?? t.errors.server_error;

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // the same file can be chosen again
    if (!file) {
      return;
    }
    setPhotoError(null);
    setPhotoMessage(null);
    setPhotoBusy(true);
    try {
      const image = await smallSquareJpeg(file);
      const data = await api<{ photo_updated_at: string }>('/users/me/photo', { method: 'PUT', body: { image } });
      updateUser({ ...user!, photo_updated_at: data.photo_updated_at });
      setPhotoMessage(t.editProfile.photoSaved);
    } catch (err) {
      setPhotoError(err instanceof ApiError ? errorText(err) : t.errors.photo_invalid); // not a picture the browser can read
    }
    setPhotoBusy(false);
  }

  async function removePhoto() {
    setPhotoError(null);
    setPhotoMessage(null);
    setPhotoBusy(true);
    try {
      await api('/users/me/photo', { method: 'DELETE' });
      updateUser({ ...user!, photo_updated_at: null });
    } catch (err) {
      setPhotoError(errorText(err));
    }
    setPhotoBusy(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
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
      const data = await api<{ user: User }>('/users/me', { method: 'PATCH', body });
      updateUser(data.user);
      setMessage(t.editProfile.saved);
    } catch (err) {
      setError(errorText(err));
    }
    setSaving(false);
  }

  return (
    <div className="page-medium stack-large">
      <BackLink />
      <h1>{t.editProfile.title}</h1>

      <Card>
        <h3>{t.editProfile.photo}</h3>
        <div className="row">
          <Avatar large />
          {photoBusy && (
            <p className="row note">
              <Spinner /> {t.editProfile.savingPhoto}
            </p>
          )}
        </div>
        <ErrorBox message={photoError} />
        {photoMessage && <Note>✓ {photoMessage}</Note>}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPhoto} />
        <div className="row">
          <Button title={webText[language].profile.choosePhoto} onClick={() => fileInput.current?.click()} variant="outline" loading={photoBusy} />
          {user.photo_updated_at && <Button title={t.editProfile.removePhoto} onClick={removePhoto} variant="outline" loading={photoBusy} />}
        </div>
      </Card>

      <Card>
        <form onSubmit={save} className="stack">
          <h3>{t.editProfile.details}</h3>
          <TextField label={t.fullName} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />
          <div className="field">
            <span className="field-label">{t.phone}</span>
            <strong className="fixed-value">{user.phone}</strong>
            <span className="note">{t.editProfile.phoneFixed}</span>
          </div>
          <ErrorBox message={error} />
          {message && <Note>✓ {message}</Note>}
          <Button title={t.editProfile.save} submit loading={saving} />
        </form>
      </Card>

      {/* Password: its own page */}
      <Link to="/profile/password" className="button button-outline">
        {t.changePassword.open}
      </Link>
    </div>
  );
}
