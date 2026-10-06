// The farmer's past results, newest first. Each crop opens its page.
// Same as frontend/src/app/history.tsx on the phone.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { cropPath, CropThumb } from '~/components/CropPhoto';
import { BackLink, Spinner } from '~/components/ui';
import { api } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import { placeOf, type PastResult } from '@/lib/past-results';
import { cropName } from '@/lib/translations';

export function History() {
  const { t, language } = useApp();
  const [history, setHistory] = useState<PastResult[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Loaded each time the page opens, so a result just made on Home is in the list
  useEffect(() => {
    api<{ recommendations: PastResult[]; total: number }>('/users/me/recommendations')
      .then((data) => {
        setHistory(data.recommendations);
        setTotal(data.total);
      })
      .catch(() => setFailed(true));
  }, []);

  const locale = language === 'kn' ? 'kn-IN' : 'en-IN';

  return (
    <div className="stack-large narrow">
      <BackLink />
      <h1>{t.profileMenu.history}</h1>

      {history === null && !failed && <Spinner />}
      {failed && <p className="error-text">{t.errors.server_error}</p>}
      {history?.length === 0 && <p className="note">{t.noHistory}</p>}
      {total !== null && history !== null && total > history.length && (
        <p className="note">{t.historyLatest.replace('{n}', String(history.length))}</p>
      )}

      {history?.map((item) => (
        <section key={item.id} className="card">
          <div className="stack-tiny">
            <p className="note">
              {new Date(item.created_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
              {item.season ? ' · ' + t.seasonNames[item.season] : ''}
            </p>
            <p className="bold">📍 {placeOf(item, language)}</p>
          </div>
          {/* The result's top 3 crops */}
          <div className="history-crops">
            {(item.crops ?? []).slice(0, 3).map((c) => (
              <Link key={c.crop} to={cropPath(c.crop)} className="history-crop">
                <CropThumb crop={c.crop} className="photo-medium" />
                <span className="bold">{cropName(c.crop, language)}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
