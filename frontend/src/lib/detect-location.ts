// Gets the phone's GPS position and asks the backend which district it is in.
// Every failure becomes a short error code (translated in translations.ts), so the
// screen can show the reason and fall back to the district list.

import * as Location from 'expo-location';

import { api, ApiError } from '@/lib/api';

const TIMEOUT_MS = 45_000; // real GPS can need this long outdoors after location was switched on
const GOOD_ACCURACY_M = 100; // stop listening once a reading is this accurate
const RECENT_MS = 2 * 60 * 1000;
// Worse than this, the position probably comes from Wi-Fi or mobile towers (or an emulator's internet
// location) and can be 10-20 km off - enough to name the wrong taluk or district - so the app warns
export const ROUGH_ACCURACY_M = 1000;

export type DetectedLocation = {
  lat: number;
  lng: number;
  accuracy: number | null; // metres, as the phone reports it (null when the phone does not say)
  district: string;
  state: string;
  taluk: string | null; // Karnataka only, as the Agriculture Census spells it, e.g. "BELTANGADY"
  place: string | null; // the village or town the phone reports, e.g. "Badaga Mijar"
};

// If location is switched off, Android can show its own "Turn on location" popup inside the app,
// so the farmer does not have to leave the app. iPhones have no such popup.
async function turnOnLocation() {
  if (await Location.hasServicesEnabledAsync().catch(() => false)) {
    return;
  }
  if (process.env.EXPO_OS === 'android') {
    try {
      await Location.enableNetworkProviderAsync();
      return;
    } catch {
      // the farmer tapped "No thanks"
    }
  }
  throw new ApiError('location_off');
}

// Listens to live position updates (the same way map apps do) instead of asking once.
// A single request can wait forever when location was just switched on; a live feed keeps
// trying until the phone has a fix. We keep the most accurate reading and stop as soon as one
// is within 100 m, or when time runs out.
function watchForPosition(): Promise<Location.LocationObject> {
  return new Promise((resolve, reject) => {
    let best: Location.LocationObject | null = null;
    let subscription: Location.LocationSubscription | null = null;
    let finished = false;

    function finish(position: Location.LocationObject | null) {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      subscription?.remove();
      if (position) {
        resolve(position);
      } else {
        reject(new ApiError('location_timeout'));
      }
    }

    // When time runs out, the best reading so far is used; its accuracy goes with it, so the screen
    // can warn when it is rough
    const timer = setTimeout(() => finish(best), TIMEOUT_MS);

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
      (position) => {
        const accuracy = position.coords.accuracy ?? Infinity;
        if (!best || accuracy < (best.coords.accuracy ?? Infinity)) {
          best = position;
        }
        if (accuracy <= GOOD_ACCURACY_M) {
          finish(position);
        }
      }
    )
      .then((started) => {
        subscription = started;
        if (finished) {
          started.remove(); // time ran out before the feed started
        }
      })
      .catch(() => {
        finished = true;
        clearTimeout(timer);
        reject(new ApiError('location_unsupported'));
      });
  });
}

async function getPosition() {
  await turnOnLocation();

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    // After "Don't allow" twice, the phone stops asking; it can then only be changed in Settings
    throw new ApiError(permission.canAskAgain ? 'permission_denied' : 'permission_blocked');
  }

  // A good position the phone already has from the last 2 minutes is instant.
  // Right after location is switched on this call can hang, so it only gets 2 seconds.
  const recent = await Promise.race([
    Location.getLastKnownPositionAsync({ maxAge: RECENT_MS, requiredAccuracy: GOOD_ACCURACY_M }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
  ]);
  return recent ?? watchForPosition();
}

export async function detectLocation(): Promise<DetectedLocation> {
  const position = await getPosition();
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;

  // The district and taluk must come from our server: they have to match the names in the crop data.
  // Taluks are Karnataka only (the server has no taluk data elsewhere, so it sends null there).
  // The phone's own address lookup adds the village or town.
  const [result, address] = await Promise.all([
    api<{ district: string; state: string; taluk: string | null }>(`/location/district?lat=${lat}&lon=${lng}`),
    fromPhone(lat, lng),
  ]);
  return {
    lat,
    lng,
    accuracy: position.coords.accuracy ?? null,
    district: result.district,
    state: result.state,
    taluk: result.taluk,
    place: address?.place ?? null,
  };
}

// Asks Android or iOS for the address of a point. It needs internet and is not available on every
// phone, so anything it cannot answer is simply left out.
async function fromPhone(lat: number, lng: number) {
  const [address] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
  if (!address) {
    return null;
  }
  return { place: address.city ?? address.district ?? address.name ?? null };
}
