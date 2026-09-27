// The three sowing seasons the crop model knows. Kharif is sown with the monsoon (June to September),
// rabi after it (October to January) and the summer crop from February to May - the same rule the
// ML service uses when no season is sent.
export type Season = 'Kharif' | 'Rabi' | 'Summer';

export const SEASONS: Season[] = ['Kharif', 'Rabi', 'Summer'];

// Crops that stand in the field all year (plantation crops, fruit trees, sugarcane, tapioca). The model
// counts them in every season, so the app marks them instead of calling them a crop of this season.
// The same list as YEAR_ROUND in ml-service/training/forest.py.
export const YEAR_ROUND_CROPS = [
  'sugarcane', 'coconut', 'arecanut', 'cashewnut', 'black pepper', 'cardamom', 'coffee',
  'banana', 'mango', 'grapes', 'pomegranate', 'papaya', 'sapota', 'tapioca',
];

export function seasonNow(date = new Date()): Season {
  const month = date.getMonth() + 1;
  if (month >= 6 && month <= 9) {
    return 'Kharif';
  }
  return month >= 10 || month === 1 ? 'Rabi' : 'Summer';
}
