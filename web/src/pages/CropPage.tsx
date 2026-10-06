// One crop's page: its photos (the harvested crop first; the small photos or the arrows show the others), the
// heart to save it, what it means for the farmer's land (last result) and what the crop is like.
// Same as frontend/src/app/crop/[name].tsx on the phone.

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PhotoBox } from '~/components/CropPhoto';
import { BackLink, Card, Note, Spinner } from '~/components/ui';
import { useApp } from '~/lib/app-context';
import { cropRows, findCrop, landRows, orderedPhotos, resultPlace, type CropRow } from '@/lib/crops';
import { cropName } from '@/lib/translations';

// Label on the left, value on the right; "—" when our sources have no figure
function FactRows({ rows }: { rows: CropRow[] }) {
  return (
    <dl className="fact-rows">
      {rows.map((row) => (
        <div key={row.label} className="fact-row">
          <dt className="note">{row.label}</dt>
          <dd className="bold">{row.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CropPage() {
  const name = useParams().name ?? '';
  const { t, language, crops, reloadCrops, lastResult, toggleSaved } = useApp();
  const entry = findCrop(crops, name);
  const photos = orderedPhotos(entry);
  // The photo shown, kept with its crop so another crop's page starts at its first photo
  const [shown, setShown] = useState({ crop: name, index: 0 });
  const index = shown.crop === name ? Math.min(shown.index, Math.max(photos.length - 1, 0)) : 0;
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const isSaved = crops !== null && crops !== 'failed' && crops.saved.some((item) => item.crop === name);
  const photo = photos[index] ?? null;
  const show = (next: number) => setShown({ crop: name, index: (next + photos.length) % photos.length });

  async function heart() {
    setSaving(true);
    setSaveFailed(false);
    try {
      await toggleSaved(name);
    } catch {
      setSaveFailed(true);
    }
    setSaving(false);
  }

  if (crops === null || crops === 'failed' || !entry) {
    return (
      <div className="stack-large narrow">
        <BackLink />
        {crops === null && <Spinner />}
        {crops === 'failed' && (
          <div className="callout callout-danger">
            <p className="error-text">{t.cropPage.loadFailed}</p>
            <button type="button" className="link-button" onClick={reloadCrops}>
              {t.tryAgain}
            </button>
          </div>
        )}
        {crops !== null && crops !== 'failed' && !entry && <p>{t.cropPage.notFound}</p>}
      </div>
    );
  }

  return (
    <div className="stack-large narrow">
      <BackLink />

      {/* Photos */}
      <div className="stack-small">
        <div className="gallery">
          <PhotoBox key={photo?.path} photo={photo} className="photo-large" />
          {photos.length > 1 && (
            <>
              <button type="button" className="gallery-arrow gallery-arrow-left" onClick={() => show(index - 1)} aria-label={t.cropPage.photos[photos[(index - 1 + photos.length) % photos.length].slot]}>
                ‹
              </button>
              <button type="button" className="gallery-arrow gallery-arrow-right" onClick={() => show(index + 1)} aria-label={t.cropPage.photos[photos[(index + 1) % photos.length].slot]}>
                ›
              </button>
            </>
          )}
          {/* The heart: save the crop, or take it off the saved list */}
          <button
            type="button"
            className="heart-button"
            onClick={heart}
            disabled={saving}
            aria-pressed={isSaved}
            aria-label={isSaved ? t.cropPage.unsave : t.cropPage.save}
            title={isSaved ? t.cropPage.unsave : t.cropPage.save}>
            {/* A red outline heart, filled once saved */}
            <span className={isSaved ? undefined : 'heart-outline'}>{isSaved ? '❤️' : '♡'}</span>
          </button>
        </div>

        {photo && (
          <div className="stack-tiny">
            <div className="row-between">
              <span className="bold dark-text">{t.cropPage.photos[photo.slot]}</span>
              <span className="note">{t.cropPage.photoCount.replace('{n}', String(index + 1)).replace('{total}', String(photos.length))}</span>
            </div>
            {/* The credit the photo's licence asks for, with a link to the page the photo came from */}
            <a className="small-text photo-credit" href={photo.source} target="_blank" rel="noopener noreferrer">
              {t.cropPage.photoBy.replace('{author}', photo.author).replace('{license}', photo.license).replace('{site}', photo.site)}
            </a>
          </div>
        )}

        {/* All photos small: a click shows that one */}
        {photos.length > 1 && (
          <div className="gallery-thumbs">
            {photos.map((item, i) => (
              <button
                key={item.path}
                type="button"
                className={i === index ? 'gallery-thumb gallery-thumb-selected' : 'gallery-thumb'}
                onClick={() => show(i)}
                aria-label={t.cropPage.photos[item.slot]}
                aria-pressed={i === index}>
                <PhotoBox photo={item} className="photo-thumb-large" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Name */}
      <div className="stack-tiny">
        <h1>{cropName(name, language)}</h1>
        {language === 'kn' && <p className="note">{cropName(name, 'en')}</p>}
        <p className="note italic">{entry.scientific_name}</p>
        {saveFailed && <p className="error-text">{t.cropPage.saveFailed}</p>}
      </div>

      {/* What it means for the farmer's land */}
      <Card>
        <h2>📍 {t.cropPage.forYourLand}</h2>
        {lastResult ? (
          <>
            <FactRows rows={landRows(name, lastResult, t)} />
            <Note>
              {t.cropPage.forYourLandNote
                .replace('{place}', resultPlace(lastResult, language))
                .replace('{season}', t.seasonNames[lastResult.data.season])}
            </Note>
          </>
        ) : (
          <Note>{t.cropPage.noResultYet}</Note>
        )}
      </Card>

      {/* What the crop is like */}
      <Card>
        <h2>🌾 {t.cropPage.aboutCrop}</h2>
        <FactRows rows={cropRows(name, entry, t, language)} />
        <Note>{t.cropPage.sources}</Note>
      </Card>

      <Link to={`/compare?crops=${encodeURIComponent(name)}`} className="button button-primary">
        {t.cropPage.compare}
      </Link>
    </div>
  );
}

