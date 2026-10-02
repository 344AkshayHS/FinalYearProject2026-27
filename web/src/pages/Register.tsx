import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { AuthPage } from '~/components/AuthPage';
import { Button, ErrorBox, TextField } from '~/components/ui';
import { ApiError } from '~/lib/api';
import { useApp } from '~/lib/app-context';

export function Register() {
  const { t, register } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRegister(event: FormEvent) {
    event.preventDefault();
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
    <AuthPage>
      <form onSubmit={onRegister} className="stack">
        <h2>{t.register}</h2>
        <ErrorBox message={error} />
        <TextField label={t.fullName} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />
        <TextField label={t.phone} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="numeric" maxLength={10} autoComplete="tel" placeholder="98765 43210" required />
        <TextField label={t.password} hint={t.passwordHint} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" maxLength={128} required />
        <Button title={t.register} loading={loading} submit />
        <Link to="/login" className="center-link">
          {t.haveAccount}
        </Link>
      </form>
    </AuthPage>
  );
}
