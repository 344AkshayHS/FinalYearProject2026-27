// The crops the farmer saved with the heart on a crop's page, the latest first.
// Same as frontend/src/app/saved.tsx on the phone.

import { Link } from 'react-router-dom';

import { CropRowLink } from '~/components/CropPhoto';
import { BackLink, Card, Spinner } from '~/components/ui';
import { useApp } from '~/lib/app-context';
import { MAX_COMPARE } from '@/lib/crops';

export function Saved() {
  const { t, language, crops, reloadCrops } = useApp();
  const locale = language === 'kn' ? 'kn-IN' : 'en-IN';

  return (
    <div className="stack-large narrow">
      <BackLink />
      <h1>{t.profileMenu.saved}</h1>

      {crops === null && <Spinner />}
      {crops === 'failed' && (
        <div className="callout callout-danger">
          <p className="error-text">{t.cropPage.loadFailed}</p>
          <button type="button" className="link-button" onClick={reloadCrops}>
            {t.tryAgain}
          </button>
        </div>
      )}

      {crops !== null && crops !== 'failed' && (
        <>
          {crops.saved.length === 0 ? (
            <p className="note">{t.savedPage.empty}</p>
          ) : (
            <Card>
              {crops.saved.map((item) => (
                <CropRowLink key={item.crop} crop={item.crop}>
                  <span className="note">
                    {t.savedPage.savedOn.replace('{date}', new Date(item.created_at).toLocaleDateString(locale, { dateStyle: 'medium' }))}
                  </span>
                </CropRowLink>
              ))}
            </Card>
          )}
          {crops.saved.length >= 2 && (
            <Link
              to={`/compare?crops=${encodeURIComponent(crops.saved.slice(0, MAX_COMPARE).map((item) => item.crop).join(','))}`}
              className="button button-primary">
              {t.savedPage.compareSaved}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
