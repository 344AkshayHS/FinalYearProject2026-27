// Kannada has its own numerals, ೦ ೧ ೨ ೩ ೪ ೫ ೬ ೭ ೮ ೯ (Unicode U+0CE6 to U+0CEF). In Profile → Language the farmer
// chooses whether the Kannada app shows them or the 0-9 most newspapers and forms use. Used by the phone app
// (components/text.tsx) and the website (lib/app-context.tsx).

export type Numerals = 'western' | 'kannada';

const KANNADA_ZERO = 0x0ce6;

// Digits joined to English letters are part of a name, not a number: P2O5 and K2O (fertiliser) stay as they are
export function toKannadaDigits(text: string) {
  return text.replace(/(?<![A-Za-z])[0-9]+(?![A-Za-z])/g, (number) =>
    [...number].map((digit) => String.fromCharCode(KANNADA_ZERO + Number(digit))).join('')
  );
}

export function toWesternDigits(text: string) {
  return text.replace(/[೦-೯]/g, (digit) => String(digit.charCodeAt(0) - KANNADA_ZERO));
}
