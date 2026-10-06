import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { AdminLogin } from '~/components/AdminLogin';
import { AuthPage } from '~/components/AuthPage';
import { Button, ErrorBox, TextField } from '~/components/ui';
import { ApiError } from '~/lib/api';
import { useApp } from '~/lib/app-context';

export function Login() {
  const { t, login } = useApp();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(phone.trim(), password);
      // Logged in: App.tsx moves to the home page by itself
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      setError(t.errors[code] ?? t.errors.server_error);
      setLoading(false);
    }
  }

  return (
    <AuthPage>
      <form onSubmit={onLogin} className="stack">
        <h2>{t.login}</h2>
        <ErrorBox message={error} />
        <TextField label={t.phone} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="numeric" maxLength={10} autoComplete="tel" placeholder="98765 43210" required />
        <TextField label={t.password} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" maxLength={128} required />
        <Button title={t.login} loading={loading} submit />
        <Link to="/register" className="center-link">
          {t.noAccount}
        </Link>
      </form>
      <AdminLogin />
    </AuthPage>
  );
}
