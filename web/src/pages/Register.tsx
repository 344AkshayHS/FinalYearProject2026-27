import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { AuthPage } from '~/components/AuthPage';
import { askForCode, CodeField } from '~/components/CodeField';
import { Button, ErrorBox, TextField } from '~/components/ui';
import { ApiError } from '~/lib/api';
import { useApp } from '~/lib/app-context';

// Two steps, as in the phone app: the farmer's details, then the code we send by SMS to their number
export function Register() {
  const { t, register, language } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // null: the details are being filled in. A time: the code was sent, and "Send the code again" works from then.
  const [canResendAt, setCanResendAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function showError(err: unknown) {
    const errorCode = err instanceof ApiError ? err.code : 'server_error';
    setError(t.errors[errorCode] ?? t.errors.server_error);
  }

  // The backend checks every detail before it sends the SMS
  async function sendCode(again: boolean) {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      setCanResendAt(await askForCode('/users/register/code', { full_name: name, phone: phone.trim(), password, language }));
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
      await register(name, phone.trim(), password, code);
      // Account made: App.tsx moves to the home page by itself
    } catch (err) {
      showError(err);
      setLoading(false);
    }
  }

  function editDetails() {
    setCanResendAt(null);
    setCode('');
    setError(null);
    setNotice(null);
  }

  return (
    <AuthPage>
      <form onSubmit={onSubmit} className="stack">
        <h2>{t.register}</h2>
        <ErrorBox message={error} />
        {canResendAt === null ? (
          <>
            <TextField label={t.fullName} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />
            <TextField label={t.phone} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="numeric" maxLength={10} autoComplete="tel" placeholder="00000 00000" required />
            <TextField label={t.password} hint={t.passwordHint} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" maxLength={128} required />
            <Button title={t.code.send} loading={loading} submit />
          </>
        ) : (
          <>
            <CodeField phone={phone.trim()} value={code} onChange={setCode} canResendAt={canResendAt} onResend={() => sendCode(true)} busy={loading} notice={notice} />
            <Button title={t.register} loading={loading} submit />
            <button type="button" className="link-button center-link" onClick={editDetails}>
              {t.code.editDetails}
            </button>
          </>
        )}
        <Link to="/login" className="center-link">
          {t.haveAccount}
        </Link>
      </form>
    </AuthPage>
  );
}
