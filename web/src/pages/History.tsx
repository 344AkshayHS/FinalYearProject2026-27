// The farmer's past results, newest first. Each crop opens its page.
// Same as frontend/src/app/history.tsx on the phone: the bin at the top right lets the farmer pick results and
// delete them from this list. The server only hides them from the farmer: the project keeps every result.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { cropPath, CropThumb } from '~/components/CropPhoto';
import { BackLink, Button, Spinner } from '~/components/ui';
import { api } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import { placeOf, type PastResult } from '@/lib/past-results';
import { cropName } from '@/lib/translations';

// A rubbish bin, for "Delete history"
function BinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function History() {
  const { t, language } = useApp();
  const [history, setHistory] = useState<PastResult[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [choosing, setChoosing] = useState(false); // the bin was clicked: clicking a result picks it
  const [chosen, setChosen] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const load = useCallback(() => {
    api<{ recommendations: PastResult[]; total: number }>('/users/me/recommendations')
      .then((data) => {
        setHistory(data.recommendations);
        setTotal(data.total);
      })
      .catch(() => setFailed(true));
  }, []);

  // Loaded each time the page opens, so a result just made on Home is in the list
  useEffect(load, [load]);

  function stopChoosing() {
    setChoosing(false);
    setChosen([]);
    setDeleteFailed(false);
  }

  function toggle(id: string) {
    setChosen((old) => (old.includes(id) ? old.filter((other) => other !== id) : [...old, id]));
  }

  async function deleteChosen() {
    const question = chosen.length === 1 ? t.historyDelete.confirmOne : t.historyDelete.confirmMany.replace('{n}', String(chosen.length));
    if (!window.confirm(`${question}\n${t.historyDelete.confirmMessage}`)) {
      return;
    }
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await api('/users/me/recommendations', { method: 'DELETE', body: { ids: chosen } });
      stopChoosing();
      load();
    } catch {
      setDeleteFailed(true);
    }
    setDeleting(false);
  }

  const locale = language === 'kn' ? 'kn-IN' : 'en-IN';
  const allChosen = history !== null && history.length > 0 && chosen.length === history.length;

  return (
    <div className="stack-large">
      <BackLink />
      {/* The title, and at the top right the bin (or "Cancel" while picking) */}
      <div className="page-title-row">
        <h1>{t.profileMenu.history}</h1>
        {choosing ? (
          <Button title={t.historyDelete.cancel} onClick={stopChoosing} variant="outline" />
        ) : (
          (history?.length ?? 0) > 0 && (
            <button type="button" className="bin-button" onClick={() => setChoosing(true)}>
              <BinIcon />
              {t.historyDelete.open}
            </button>
          )
        )}
      </div>

      {history === null && !failed && <Spinner />}
      {failed && <p className="error-text">{t.errors.server_error}</p>}
      {history?.length === 0 && <p className="note">{t.noHistory}</p>}
      {!choosing && total !== null && history !== null && total > history.length && (
        <p className="note">{t.historyLatest.replace('{n}', String(history.length))}</p>
      )}

      {/* While picking: what to do, and "Select all" */}
      {choosing && (
        <div className="row">
          <p className="bold">{t.historyDelete.choose}</p>
          <Button
            title={allChosen ? t.historyDelete.unselectAll : t.historyDelete.selectAll}
            onClick={() => setChosen(allChosen ? [] : (history ?? []).map((item) => item.id))}
            variant="outline"
          />
        </div>
      )}

      <div className="history-grid">
        {history?.map((item) => {
          const picked = chosen.includes(item.id);
          return (
            <section
              key={item.id}
              className={choosing ? (picked ? 'card history-pick history-picked' : 'card history-pick') : 'card'}
              onClick={choosing ? () => toggle(item.id) : undefined}
              role={choosing ? 'checkbox' : undefined}
              aria-checked={choosing ? picked : undefined}
              tabIndex={choosing ? 0 : undefined}
              onKeyDown={choosing ? (event) => (event.key === ' ' || event.key === 'Enter') && (event.preventDefault(), toggle(item.id)) : undefined}>
              <div className="history-card-top">
                <div className="stack-tiny">
                  <p className="note">
                    {new Date(item.created_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
                    {item.season ? ' · ' + t.seasonNames[item.season] : ''}
                  </p>
                  <p className="bold">📍 {placeOf(item, language)}</p>
                </div>
                {/* A big round tick box while picking */}
                {choosing && (
                  <span className="pick-box" aria-hidden="true">
                    {picked ? '✓' : ''}
                  </span>
                )}
              </div>
              {/* The result's top 3 crops (while picking, a click picks the result instead of opening the crop) */}
              <div className="history-crops">
                {(item.crops ?? []).slice(0, 3).map((c) =>
                  choosing ? (
                    <span key={c.crop} className="history-crop">
                      <CropThumb crop={c.crop} className="photo-medium" />
                      <span className="bold">{cropName(c.crop, language)}</span>
                    </span>
                  ) : (
                    <Link key={c.crop} to={cropPath(c.crop)} className="history-crop">
                      <CropThumb crop={c.crop} className="photo-medium" />
                      <span className="bold">{cropName(c.crop, language)}</span>
                    </Link>
                  )
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* While picking: the red "Delete (n)" button stays at the bottom */}
      {choosing && (
        <div className="delete-bar">
          {deleteFailed && <p className="error-text">{t.historyDelete.failed}</p>}
          <Button
            title={t.historyDelete.deleteSelected.replace('{n}', String(chosen.length))}
            onClick={deleteChosen}
            variant="danger"
            disabled={chosen.length === 0}
            loading={deleting}
          />
        </div>
      )}
    </div>
  );
}
