import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { AuthPage } from '~/components/AuthPage';
import { askForCode, CodeField } from '~/components/CodeField';
import { Button, ErrorBox, TextField } from '~/components/ui';
import { ApiError } from '~/lib/api';
import { useApp } from '~/lib/app-context';

// "Forgot password", as in the phone app: the account's mobile number, then the code we send to it by SMS and a new
// password. Saving it logs the farmer in here; every other login of the account ends.
export function ForgotPassword() {
  const { t, resetPassword } = useApp();
  // The number already typed on the login page, if any
  const location = useLocation();
  const typedPhone = (location.state as { phone?: string } | null)?.phone ?? '';
  const [phone, setPhone] = useState(typedPhone);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  // null: the number is being typed. A time: the code was sent, and "Send the code again" works from then.
  const [canResendAt, setCanResendAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function showError(err: unknown) {
    const errorCode = err instanceof ApiError ? err.code : 'server_error';
    setError(t.errors[errorCode] ?? t.errors.server_error);
  }

  async function sendCode(again: boolean) {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      setCanResendAt(await askForCode('/users/forgot-password/code', { phone: phone.trim() }));
      if (again) {
        setCode('');
        setNotice(t.code.resent);
      }
    } catch (err) {
      showError(err);
    }
    setLoading(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (canResendAt === null) {
      return sendCode(false);
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await resetPassword(phone.trim(), code, newPassword);
      // Logged in: App.tsx moves to the home page by itself
    } catch (err) {
      showError(err);
      setLoading(false);
    }
  }

  function editNumber() {
    setCanResendAt(null);
    setCode('');
    setError(null);
    setNotice(null);
  }

  return (
    <AuthPage>
      <form onSubmit={onSubmit} className="stack">
        <h2>{t.forgot.title}</h2>
        <ErrorBox message={error} />
        {canResendAt === null ? (
          <>
            <p>{t.forgot.intro}</p>
            <TextField label={t.phone} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="numeric" maxLength={10} autoComplete="tel" placeholder="00000 00000" required />
            <Button title={t.code.send} loading={loading} submit />
          </>
        ) : (
          <>
            <CodeField phone={phone.trim()} value={code} onChange={setCode} canResendAt={canResendAt} onResend={() => sendCode(true)} busy={loading} notice={notice} />
            <TextField label={t.forgot.newPassword} hint={t.passwordHint} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" autoComplete="new-password" maxLength={128} required />
            <Button title={t.forgot.save} loading={loading} submit />
            <button type="button" className="link-button center-link" onClick={editNumber}>
              {t.code.editDetails}
            </button>
          </>
        )}
        <Link to="/login" className="center-link">
          {t.forgot.backToLogin}
        </Link>
      </form>
    </AuthPage>
  );
}
