// Gets the browser's position and asks the backend which district it is in, like
// frontend/src/lib/detect-location.ts does on the phone. Every failure becomes a short error code
// (translated in frontend/src/lib/translations.ts), so the page can show the reason and fall back to the
// district list.
//
// Browsers only share a position on https pages and on localhost. On plain http://<address> the browser
// refuses, and the farmer picks the district from the list instead.

import { api, ApiError } from '~/lib/api';

const TIMEOUT_MS = 45_000; // real GPS can need this long outdoors after location was switched on
// Worse than this, the position probably comes from Wi-Fi or the internet address (a laptop has no GPS) and can be
// 10-20 km off - enough to name the wrong taluk or district - so the page warns
export const ROUGH_ACCURACY_M = 1000;

export type DetectedLocation = {
  lat: number;
  lng: number;
  accuracy: number | null; // metres, as the browser reports it
  district: string;
  state: string;
  taluk: string | null; // Karnataka only, as the Agriculture Census spells it, e.g. "BELTANGADY"
  place: string | null; // the phone app adds the village or town; a browser cannot, so this stays null
};

function getPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new ApiError('location_unsupported'));
    }
    navigator.geolocation.getCurrentPosition(resolve, async (failure) => {
      if (failure.code === failure.PERMISSION_DENIED) {
        // After "Block" the browser never asks again: only the site settings can change it. Like on the phone,
        // that is a different error, because the fix is different.
        const state = await navigator.permissions?.query({ name: 'geolocation' }).then((permission) => permission.state, () => 'prompt');
        reject(new ApiError(state === 'denied' ? 'permission_blocked' : 'permission_denied'));
      } else if (failure.code === failure.TIMEOUT) {
        reject(new ApiError('location_timeout'));
      } else {
        reject(new ApiError('location_off')); // the device could not work out where it is
      }
    }, { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 2 * 60 * 1000 });
  });
}

export async function detectLocation(): Promise<DetectedLocation> {
  const position = await getPosition();
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;

  // The district and taluk must come from our server: they have to match the names in the crop data.
  // Taluks are Karnataka only (the server has no taluk data elsewhere, so it sends null there).
  const result = await api<{ district: string; state: string; taluk: string | null }>(`/location/district?lat=${lat}&lon=${lng}`);
  return {
    lat,
    lng,
    accuracy: position.coords.accuracy ?? null,
    district: result.district,
    state: result.state,
    taluk: result.taluk,
    place: null,
  };
}
