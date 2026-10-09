// Text size, chosen in Profile (and on the login page): bigger letters for farmers who cannot read small text.
// Used by the phone app (components/text.tsx) and the website (lib/app-context.tsx).

export type TextSize = 'normal' | 'large' | 'larger';

export const TEXT_SIZES: TextSize[] = ['normal', 'large', 'larger'];

// How much bigger every text gets
export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.2, larger: 1.4 };

// No text in the app is smaller than this (before the scale above), so notes and hints stay easy to read
export const SMALLEST_TEXT = 15;

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.includes(value as TextSize);
}

// The letters typed in a text box
export function inputFontSize(size: TextSize) {
  return Math.round(17 * TEXT_SCALE[size]);
}
