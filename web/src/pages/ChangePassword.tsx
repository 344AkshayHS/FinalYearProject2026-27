// "Change password", opened from Edit profile: the old password, then the new one two times (like most apps).
// Same as frontend/src/app/change-password.tsx on the phone. The server checks the old password and logs the
// account out everywhere else.

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { BackLink, Button, Card, ErrorBox, TextField } from '~/components/ui';
import { api, ApiError } from '~/lib/api';
import { useApp } from '~/lib/app-context';

const MIN_PASSWORD = 8; // the same rule as the server (backend/src/routes/users.js)

export function ChangePassword() {
  const { t } = useApp();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The mistakes the browser can see before asking the server
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

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = problem();
    setError(found);
    if (found) {
      return;
    }
    setSaving(true);
    try {
      await api('/users/me', { method: 'PATCH', body: { current_password: oldPassword, new_password: newPassword } });
      setDone(true);
    } catch (err) {
      setError(t.errors[err instanceof ApiError ? err.code : 'server_error'] ?? t.errors.server_error);
    }
    setSaving(false);
  }

  if (done) {
    return (
      <div className="page-medium stack-large">
        <Card>
          <div className="stack center-text">
            <p className="big-emoji" aria-hidden="true">
              ✅
            </p>
            <h2>{t.changePassword.done}</h2>
            <p>{t.changePassword.doneNote}</p>
            <Link to="/profile" className="button button-primary">
              {t.changePassword.back}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-medium stack-large">
      <BackLink />
      <h1>{t.changePassword.title}</h1>
      <Card>
        <form onSubmit={save} className="stack" noValidate>
          <p>{t.changePassword.intro}</p>
          <TextField
            label={t.changePassword.oldPassword}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            maxLength={128}
          />
          <TextField
            label={t.changePassword.newPassword}
            hint={t.changePassword.newPasswordHint}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            maxLength={128}
          />
          <TextField
            label={t.changePassword.confirmPassword}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            maxLength={128}
          />
          <ErrorBox message={error} />
          <Button title={t.changePassword.save} submit loading={saving} />
        </form>
      </Card>
    </div>
  );
}
