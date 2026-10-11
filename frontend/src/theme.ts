// App colours: fresh leaf greens with a warm harvest accent, in a light and a dark theme

export type Theme = 'light' | 'dark';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

// The original look
const LIGHT = {
  background: '#F4F7F1',
  card: '#FFFFFF',
  primary: '#2E7D32',
  primaryDark: '#1B4D20',
  primarySoft: '#E6F2E4',
  accent: '#F2A900',
  accentSoft: '#FFF4D6',
  warningText: '#8A6100', // dark amber, for text on the yellow boxes
  text: '#1B2A1D',
  muted: '#5E6E61',
  border: '#DDE6D9',
  danger: '#C62828',
  dangerSoft: '#FDECEC',
  onPrimary: '#FFFFFF', // text on a green or red button
  // The big green blocks: the "Hello" card on Home and the top of the sign-in page
  hero: '#2E7D32',
  heroText: '#FFFFFF',
  heroSubtext: '#F0F7EF',
};

// Dark: a deep black background with dark boxes and light text, and a bright, fresh green for buttons, headings,
// icons and the chosen item (dark text on the green buttons). The same names as above, so every screen works in
// both. Each text colour was checked for contrast on the backgrounds it is drawn on (test/basics.test.ts).
const DARK: typeof LIGHT = {
  background: '#0B0F0C',
  card: '#161C18',
  primary: '#22C55E',
  primaryDark: '#4ADE80', // headings and icons: a bright green
  primarySoft: '#1C2A21', // boxes inside a card, the chosen tab: a dark green-grey
  accent: '#FBBF24',
  accentSoft: '#2B2410',
  warningText: '#FCD34D',
  text: '#F1F5F2',
  muted: '#A7B3AB',
  border: '#2A332D',
  danger: '#F87171',
  dangerSoft: '#3A1A1A',
  onPrimary: '#052E16', // the bright green and red buttons need dark text to be read
  hero: '#15803D',
  heroText: '#FFFFFF',
  heroSubtext: '#DCFCE7',
};

export type Colors = typeof LIGHT;

// Both themes. A screen takes the chosen one with useColors() (lib/app-context.tsx), so it is drawn again in the
// new colours as soon as the farmer changes the theme. The website uses the light ones (web/src/main.tsx).
export const THEME_COLORS: Record<Theme, Colors> = { light: LIGHT, dark: DARK };

export const radius = { small: 10, medium: 16, large: 24 };

export const cardShadow = '0 2px 10px rgba(27, 77, 32, 0.08)';
export const tabBarShadow = '0 -2px 12px rgba(27, 77, 32, 0.08)'; // above the bar at the bottom
export const buttonShadow = '0 2px 8px rgba(0, 0, 0, 0.18)'; // a round button on a photo (the heart)
