// The farmer's past results (backend GET /users/me/recommendations), shown on the profile and the history page.
// Used by the phone app and the website.

import type { Season } from '@/lib/season';
import { districtName, stateName, type Language } from '@/lib/translations';

export type PastResult = {
  id: string;
  created_at: string;
  season: Season | null; // null for results made before the season model
  latitude: string;
  longitude: string;
  state: string | null;
  district: string | null;
  crops: { crop: string; score: string }[] | null;
};

// "Mysuru, Karnataka" (Karnataka districts are saved under our crop-data names, which districtName writes nicely).
// Results saved without a district show the GPS point.
export function placeOf(item: PastResult, language: Language) {
  const place = [item.district && districtName(item.district, language), item.state && stateName(item.state, language)]
    .filter(Boolean)
    .join(', ');
  return place || `${Number(item.latitude).toFixed(3)}, ${Number(item.longitude).toFixed(3)}`;
}
