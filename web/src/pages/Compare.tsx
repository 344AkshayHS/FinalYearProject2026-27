// Compare crops side by side: the farmer picks up to 3 (the page can open with some already chosen, such as the
// crops of a result: /compare?crops=rice,ragi). Every figure is from the same sources as a crop's page.
// Same as frontend/src/app/compare.tsx on the phone.

import { useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { cropPath, CropThumb } from '~/components/CropPhoto';
import { BackLink, Button, Card, Note, Spinner } from '~/components/ui';
import { useApp } from '~/lib/app-context';
import { cropRows, findCrop, landRows, MAX_COMPARE, resultPlace, suggestedCrops, type CropRow } from '@/lib/crops';
import { cropName } from '@/lib/translations';

// A table: the facts down the left, one column per crop
function CompareTable({ crops, rowsOf }: { crops: string[]; rowsOf: (crop: string) => CropRow[] }) {
  const { language } = useApp();
  const table = crops.map(rowsOf);
  return (
    <div className="table-scroll">
      {/* --columns: on a phone-width screen each fact's name gets its own line, the crops' values share the line below */}
      <table className="compare-table" style={{ '--columns': crops.length } as CSSProperties}>
        <thead>
          <tr>
            <th />
            {crops.map((crop) => (
              <th key={crop} scope="col">
                {cropName(crop, language)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table[0].map((row, i) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {table.map((rows, column) => (
                <td key={crops[column]}>{rows[i].value ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The list to add a crop from: the last result's crops and the saved ones first, then every crop, with a search box
function CropChooser({ chosen, onSelect, onClose }: { chosen: string[]; onSelect: (crop: string) => void; onClose: () => void }) {
  const { t, language, crops, lastResult } = useApp();
  const [search, setSearch] = useState('');
  const all = crops && crops !== 'failed' ? crops.list.map((item) => item.crop) : [];
  const saved = crops && crops !== 'failed' ? crops.saved.map((item) => item.crop) : [];
  const suggested = suggestedCrops(lastResult, saved);
  const byName = (a: string, b: string) => cropName(a, language).localeCompare(cropName(b, language));

  const query = search.trim().toLowerCase();
  // Empty groups are left out, so a search that finds nothing shows "No crop with that name"
  const sections = (
    query
    ? [{ title: t.compare.all, crops: all.filter((crop) => crop.includes(query) || cropName(crop, 'kn').includes(search.trim())).sort(byName) }]
    : [
        { title: t.compare.fromResult, crops: suggested.fromResult },
        { title: t.compare.saved, crops: suggested.saved },
        { title: t.compare.all, crops: [...all].sort(byName) },
      ]
  ).filter((section) => section.crops.length > 0);

  return (
    <Card>
      <div className="row-between">
        <h2>{t.compare.add}</h2>
        <button type="button" className="link-button" onClick={onClose}>
          {t.close}
        </button>
      </div>
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.compare.search} aria-label={t.compare.search} autoFocus />
      <div className="chooser-list">
        {sections.length === 0 && <p className="note center-text">{t.compare.noMatch}</p>}
        {sections.map((section) => (
          <div key={section.title} className="stack-small">
            <p className="bold primary-text">{section.title}</p>
            {section.crops.map((crop) => {
              const isChosen = chosen.includes(crop);
              return (
                <button
                  key={crop}
                  type="button"
                  className={isChosen ? 'chooser-item chooser-item-chosen' : 'chooser-item'}
                  disabled={isChosen}
                  onClick={() => onSelect(crop)}>
                  <CropThumb crop={crop} className="photo-thumb-small" />
                  <span className="stack-tiny">
                    <span className="bold">{cropName(crop, language)}</span>
                    <span className="note">{cropName(crop, language === 'en' ? 'kn' : 'en')}</span>
                  </span>
                  {isChosen && <span className="primary-text">✓</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Compare() {
  const { t, language, crops, reloadCrops, lastResult } = useApp();
  const [params] = useSearchParams();
  const [chosen, setChosen] = useState(() => (params.get('crops') ?? '').split(',').filter(Boolean).slice(0, MAX_COMPARE));
  const [choosing, setChoosing] = useState(false);

  if (crops === null || crops === 'failed') {
    return (
      <div className="stack-large narrow">
        <BackLink />
        {crops === null ? (
          <Spinner />
        ) : (
          <div className="callout callout-danger">
            <p className="error-text">{t.cropPage.loadFailed}</p>
            <button type="button" className="link-button" onClick={reloadCrops}>
              {t.tryAgain}
            </button>
          </div>
        )}
      </div>
    );
  }
  const known = chosen.filter((crop) => findCrop(crops, crop));
  const full = known.length >= MAX_COMPARE;

  return (
    <div className="stack-large narrow">
      <BackLink />
      <div className="stack-small">
        <h1>{t.compare.title}</h1>
        <p>{t.compare.intro}</p>
      </div>

      {/* The chosen crops, each with its photo: a click opens the crop, ✕ takes it out */}
      <div className="compare-crops">
        {known.map((crop) => (
          <div key={crop} className="compare-crop">
            <Link to={cropPath(crop)} className="compare-crop-link">
              <CropThumb crop={crop} className="photo-medium" />
              <span className="bold">{cropName(crop, language)}</span>
            </Link>
            <button
              type="button"
              className="link-button danger-link"
              onClick={() => setChosen(known.filter((item) => item !== crop))}
              aria-label={t.compare.remove.replace('{crop}', cropName(crop, language))}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {full ? <Note>{t.compare.full}</Note> : !choosing && <Button title={'＋ ' + t.compare.add} onClick={() => setChoosing(true)} variant="outline" />}

      {choosing && !full && (
        <CropChooser
          chosen={known}
          onSelect={(crop) => {
            setChosen([...known, crop].slice(0, MAX_COMPARE));
            setChoosing(false);
          }}
          onClose={() => setChoosing(false)}
        />
      )}

      {known.length < 2 && <Note>{t.compare.empty}</Note>}

      {known.length >= 2 && (
        <>
          {/* For the farmer's land, from their last result */}
          <Card>
            <h2>📍 {t.compare.landTitle}</h2>
            {lastResult ? (
              <>
                <CompareTable crops={known} rowsOf={(crop) => landRows(crop, lastResult, t)} />
                <Note>
                  {t.cropPage.forYourLandNote
                    .replace('{place}', resultPlace(lastResult, language))
                    .replace('{season}', t.seasonNames[lastResult.data.season])}
                </Note>
              </>
            ) : (
              <Note>{t.compare.noResultNote}</Note>
            )}
          </Card>

          {/* What each crop is like */}
          <Card>
            <h2>🌾 {t.cropPage.aboutCrop}</h2>
            <CompareTable crops={known} rowsOf={(crop) => cropRows(crop, findCrop(crops, crop), t, language)} />
            <Note>{t.cropPage.sources}</Note>
          </Card>
        </>
      )}
    </div>
  );
}
