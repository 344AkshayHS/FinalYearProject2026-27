import { useEffect, useState } from 'react';

import { AdminLogin } from '~/components/AdminLogin';
import { LanguageSwitch } from '~/components/AuthPage';
import { Button, Card, Spinner } from '~/components/ui';
import { api } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import type { Season } from '@/lib/season';
import { cropName } from '@/lib/translations';

type PastResult = {
  id: string;
  created_at: string;
  season: Season | null; // null for results made before the season model
  latitude: string;
  longitude: string;
  crops: { crop: string; score: string }[] | null;
};

export function Profile() {
  const { t, user, language, logout } = useApp();
  const [history, setHistory] = useState<PastResult[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<{ recommendations: PastResult[] }>('/users/me/recommendations')
      .then((data) => setHistory(data.recommendations))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="stack-large narrow">
      {/* Who is logged in */}
      <Card>
        <div className="row">
          <div className="avatar">{user?.full_name.charAt(0).toUpperCase()}</div>
          <div>
            <h2>{user?.full_name}</h2>
            <p className="note">+91 {user?.phone}</p>
          </div>
        </div>
      </Card>

      {/* Language */}
      <Card>
        <h3>{t.language}</h3>
        <LanguageSwitch />
      </Card>

      {/* Past results */}
      <Card>
        <h3>{t.history}</h3>
        {history === null && !failed && <Spinner />}
        {failed && <p className="error-text">{t.errors.server_error}</p>}
        {history?.length === 0 && <p className="note">{t.noHistory}</p>}
        {history?.map((item) => (
          <div key={item.id} className="history-item">
            <p className="note">
              {new Date(item.created_at).toLocaleDateString(language === 'kn' ? 'kn-IN' : 'en-IN')} · {item.season ? t.seasonNames[item.season] + ' · ' : ''}
              {Number(item.latitude).toFixed(3)}, {Number(item.longitude).toFixed(3)}
            </p>
            <p className="bold">{(item.crops ?? []).slice(0, 3).map((c) => cropName(c.crop, language)).join(' · ')}</p>
          </div>
        ))}
      </Card>

      <AdminLogin />

      <Button title={t.logout} onClick={logout} variant="outline" />
    </div>
  );
}
