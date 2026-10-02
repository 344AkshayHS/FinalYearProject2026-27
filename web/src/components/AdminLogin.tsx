import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, ErrorBox, TextField } from '~/components/ui';
import { ApiError } from '~/lib/api';
import { useApp } from '~/lib/app-context';

// Folded "Admin login" box on the profile page; opens the ML dashboard
export function AdminLogin() {
  const { t, adminLoggedIn, adminLogin, adminLogout } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await adminLogin(username, password);
      setPassword('');
      navigate('/ml-dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'server_error');
    }
    setLoading(false);
  }

  if (adminLoggedIn) {
    return (
      <Card>
        <Button title={t.admin.openDashboard} onClick={() => navigate('/ml-dashboard')} />
        <Button title={t.admin.logout} onClick={adminLogout} variant="outline" />
      </Card>
    );
  }

  return (
    <Card>
      <button type="button" className="link-button big-link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾ ' : '▸ '}
        {t.admin.open}
      </button>
      {open && (
        <form onSubmit={submit} className="stack">
          <p className="note">{t.admin.intro}</p>
          <TextField label={t.admin.username} value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" required />
          <TextField label={t.password} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" maxLength={128} required />
          <ErrorBox message={error ? (t.errors[error] ?? t.errors.server_error) : null} />
          <Button title={t.admin.login} loading={loading} submit />
        </form>
      )}
    </Card>
  );
}
