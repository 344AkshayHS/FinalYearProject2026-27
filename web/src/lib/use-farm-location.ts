// Where the farmer's land is: found by the browser's position (asked for as soon as the home page opens),
// or picked by hand: a state, then one of its districts and, for Karnataka, one of that district's taluks.
// Errors are kept as codes and translated when shown, so they follow the language switch.

import { useEffect, useState } from 'react';

import { ApiError } from '~/lib/api';
import { detectLocation, ROUGH_ACCURACY_M, type DetectedLocation } from '~/lib/detect-location';
import type { Taluk } from '~/lib/types';

export function useFarmLocation() {
  const [detecting, setDetecting] = useState(true);
  const [detected, setDetected] = useState<DetectedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  // The state of a hand-picked district
  const [pickedState, setPickedState] = useState<string | null>(null);
  // True once the farmer picks a district by hand - even the same one the browser found - until "Use my location" is used again
  const [manual, setManual] = useState(false);
  // Optional taluk of a hand-picked Karnataka district (null = the whole district)
  const [taluk, setTaluk] = useState<Taluk | null>(null);

  async function locateMe() {
    setDetecting(true);
    setError(null);
    try {
      const found = await detectLocation();
      setDetected(found);
      setDistrict(found.district);
      setManual(false);
      setTaluk(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'server_error');
    }
    setDetecting(false);
  }

  // Ask as soon as the page opens, so the district is ready before anything is clicked.
  // If it fails we only show why; the farmer can press "Use my location" again or pick a district.
  useEffect(() => {
    locateMe();
  }, []);

  function chooseDistrict(state: string, picked: string) {
    setPickedState(state);
    setDistrict(picked);
    setManual(true);
    setTaluk(null); // a taluk belongs to one district
    setError(null);
  }

  // The browser's position, unless the farmer picked a district by hand
  const gps = manual ? null : detected;
  const roughGps = gps !== null && (gps.accuracy ?? 0) > ROUGH_ACCURACY_M;

  const state = gps ? gps.state : pickedState;

  return { detecting, error, state, district, taluk, gps, roughGps, locateMe, chooseDistrict, setTaluk };
}

export type FarmLocation = ReturnType<typeof useFarmLocation>;
