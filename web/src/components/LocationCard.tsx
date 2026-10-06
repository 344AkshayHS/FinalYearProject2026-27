import { useEffect, useState } from 'react';

import { Button, Card, Spinner } from '~/components/ui';
import { apiWithRetry } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import type { FarmLocation } from '~/lib/use-farm-location';
import type { Taluk } from '~/lib/types';
import { webText } from '~/lib/web-text';
import { districtName, stateName, talukName } from '@/lib/translations';

// "You are in Beltangady taluk, Dakshina Kannada district" / "You are in Ludhiana, Punjab" /
// "Mysuru district (chosen by you)" / "Hunsur taluk, Mysuru district (chosen by you)" /
// "Wayanad district, Kerala (chosen by you)".
// Taluks are Karnataka only; one is left out when the taluk map cannot place the point.
function useLocationLabel(location: FarmLocation) {
  const { t, language } = useApp();
  const { gps, state, district, taluk } = location;

  if (!gps) {
    if (state && state !== 'Karnataka') {
      return t.chosenDistrictState.replace('{district}', district ?? '').replace('{state}', stateName(state, language));
    }
    const text = taluk ? t.chosenTaluk.replace('{taluk}', talukName(taluk.name, language)) : t.chosenDistrict;
    return text.replace('{district}', districtName(district ?? '', language));
  }
  if (gps.state === 'Karnataka') {
    const gpsTaluk = gps.taluk ? talukName(gps.taluk, language) : null;
    const text = gps.place && gpsTaluk
      ? t.detectedPlace.replace('{place}', gps.place).replace('{taluk}', gpsTaluk)
      : gpsTaluk
        ? t.detectedTaluk.replace('{taluk}', gpsTaluk)
        : t.detectedDistrict;
    return text.replace('{district}', districtName(gps.district, language));
  }
  return t.detectedDistrictState.replace('{district}', gps.district).replace('{state}', gps.state);
}

// The box that says where the land is: found by the browser, or picked from the district (and taluk) lists
export function LocationCard({ location }: { location: FarmLocation }) {
  const { t, language } = useApp();
  const { detecting, error, state, district, taluk, gps, roughGps, locateMe, chooseDistrict, setTaluk } = location;
  const label = useLocationLabel(location);

  // The lists to pick from. Each is kept with what it belongs to, so a list is never shown for another state or
  // district. failed = it could not be loaded even after asking again; "Try again" (attempt + 1) loads them again.
  const [attempt, setAttempt] = useState(0);
  const [states, setStates] = useState<string[] | null | 'failed'>(null);
  useEffect(() => {
    apiWithRetry<string[]>('/location/states')
      .then(setStates)
      .catch(() => setStates('failed'));
  }, [attempt]);

  // The state whose districts are listed: the one just picked, else the state of the current place
  const [pickedState, setPickedState] = useState<string | null>(null);
  const listedState = pickedState ?? state;
  const [districtList, setDistrictList] = useState<{ state: string; list: string[] | null } | null>(null);
  useEffect(() => {
    if (!listedState) {
      return;
    }
    let current = true;
    apiWithRetry<string[]>(`/location/districts?state=${encodeURIComponent(listedState)}`)
      .then((list) => current && setDistrictList({ state: listedState, list }))
      .catch(() => current && setDistrictList({ state: listedState, list: null }));
    return () => {
      current = false;
    };
  }, [listedState, attempt]);
  const districts = districtList?.state === listedState ? districtList.list : null;
  const districtsFailed = districtList?.state === listedState && districtList.list === null;

  // The taluks of the hand-picked Karnataka district (kept with the district they belong to)
  const [taluks, setTaluks] = useState<{ district: string; list: Taluk[] | null } | null>(null);
  useEffect(() => {
    if (!district || gps || state !== 'Karnataka') {
      return;
    }
    let current = true;
    apiWithRetry<Taluk[]>(`/location/taluks?district=${encodeURIComponent(district)}`)
      .then((list) => current && setTaluks({ district, list }))
      .catch(() => current && setTaluks({ district, list: null }));
    return () => {
      current = false;
    };
  }, [district, gps, state, attempt]);
  const talukList = taluks?.district === district ? taluks.list : null;
  const talukListFailed = taluks?.district === district && taluks.list === null;

  function tryAgain() {
    setStates(null); // shows the State box again while it loads
    setAttempt((n) => n + 1);
  }
  const tryAgainButton = (
    <button type="button" className="link-button" onClick={tryAgain}>
      {t.tryAgain}
    </button>
  );

  // Why the position could not be found, and what to do. A browser is not told to "open Settings" like a phone.
  const help =
    error === 'permission_denied'
      ? t.permissionHelp
      : error === 'permission_blocked'
        ? webText[language].locationBlockedHelp.replace('{button}', t.useMyLocation)
        : error === 'location_off'
          ? webText[language].locationUnavailableHelp.replace('{button}', t.useMyLocation)
          : t.pickDistrictInstead;

  return (
    <Card>
      <h2>{t.yourLocation}</h2>

      {detecting && (
        <div className="stack-small">
          <p className="row">
            <Spinner />
            <span className="bold">{t.detecting}</span>
          </p>
          <p className="note">{t.detectingHelp}</p>
        </div>
      )}

      {!detecting && district && (
        <div className={roughGps ? 'callout callout-warning' : 'callout'}>
          <p className="big-text bold">📍 {label}</p>
          {/* How exact the position is: a rough one (Wi-Fi, a laptop with no GPS) can name the wrong place */}
          {gps && gps.accuracy !== null && (
            <p className={roughGps ? 'note warning-text' : 'note'}>
              {roughGps
                ? '⚠️ ' + t.locationRough.replace('{n}', String(Math.round(gps.accuracy / 1000)))
                : t.locationAccurate.replace('{n}', String(Math.max(Math.round(gps.accuracy), 5)))}
            </p>
          )}
          <p className="note">
            {gps ? t.isThisRight : state !== 'Karnataka' ? t.middleNote : taluk ? t.manualNoteTaluk : t.manualNote}
          </p>
        </div>
      )}

      {!detecting && error && (
        <div className="callout callout-danger">
          <p className="error-text">
            {t.errors[error] ?? t.errors.server_error} {help}
          </p>
          {error === 'permission_denied' && <Button title={t.allowLocation} onClick={locateMe} />}
        </div>
      )}

      {!detecting && (
        <Button
          title={t.useMyLocation}
          onClick={() => {
            setPickedState(null);
            locateMe();
          }}
          variant={district ? 'outline' : 'primary'}
        />
      )}

      {/* Or pick the place by hand: state, then district, then (Karnataka) taluk. Type a first letter to jump to a name.
          Kannada names are listed in Kannada. */}
      {!detecting && states !== 'failed' && (
        <label className="field">
          <span className="field-label">{t.stateOptional}</span>
          <select value={listedState ?? ''} onChange={(e) => e.target.value && setPickedState(e.target.value)}>
            <option value="" disabled>
              {t.chooseState}
            </option>
            {(states ?? [])
              .map((name) => ({ name, shown: stateName(name, language) }))
              .sort((a, b) => a.shown.localeCompare(b.shown))
              .map(({ name, shown }) => (
                <option key={name} value={name}>
                  {shown}
                </option>
              ))}
          </select>
        </label>
      )}
      {!detecting && states === 'failed' && (
        <div className="callout callout-danger">
          <p className="error-text">{t.placesListError}</p>
          {tryAgainButton}
        </div>
      )}

      {!detecting && listedState && (
        <label className="field">
          <span className="field-label">{district && !gps ? t.changeDistrict : t.chooseDistrict}</span>
          <select
            value={!gps && district && districts?.includes(district) ? district : ''}
            onChange={(e) => {
              if (e.target.value) {
                chooseDistrict(listedState, e.target.value);
                setPickedState(null);
              }
            }}>
            <option value="" disabled>
              {t.chooseDistrict}
            </option>
            {(districts ?? [])
              .map((key) => ({ key, shown: districtName(key, language) }))
              .sort((a, b) => a.shown.localeCompare(b.shown))
              .map(({ key, shown }) => (
                <option key={key} value={key}>
                  {shown}
                </option>
              ))}
          </select>
          {districtsFailed && (
            <span className="error-text">
              {t.placesListError} {tryAgainButton}
            </span>
          )}
        </label>
      )}

      {/* A hand-picked Karnataka district can be narrowed to one of its taluks (optional) */}
      {!detecting && district && !gps && state === 'Karnataka' && (
        <label className="field">
          <span className="field-label">{t.talukOptional}</span>
          <select
            value={taluk?.key ?? ''}
            onChange={(e) => setTaluk(talukList?.find((item) => item.key === e.target.value) ?? null)}>
            <option value="">{t.wholeDistrict}</option>
            {talukList?.map((item) => (
              <option key={item.key} value={item.key}>
                {talukName(item.name, language)}
              </option>
            ))}
          </select>
          {talukListFailed && (
            <span className="error-text">
              {t.talukListError} {tryAgainButton}
            </span>
          )}
        </label>
      )}
    </Card>
  );
}
