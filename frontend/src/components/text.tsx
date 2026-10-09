import { Children, createContext, use, type ReactNode } from 'react';
import { Text as NativeText, StyleSheet, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useApp } from '@/lib/app-context';
import { toKannadaDigits } from '@/lib/digits';
import { SMALLEST_TEXT, TEXT_SCALE } from '@/lib/text-size';

// React Native's own size for a text that sets none
const DEFAULT_SIZE = 16;

// True inside another Text: a part of a sentence (bold word) keeps the size of its sentence
const InsideText = createContext(false);

// The app's Text. It is React Native's Text, except that
//  - every text is at least SMALLEST_TEXT big and grows with the farmer's "Text size" (Profile), so people who
//    cannot read small letters can still use the app;
//  - in Kannada with "Numbers: ೧೨೩" chosen (Profile → Language) the digits 0-9 are shown as ೦-೯.
// Every screen uses it, so texts added later and data that arrives later (the weather, a result, a chat answer)
// follow the farmer's choices by themselves.
export function Text({ children, style, ...props }: TextProps) {
  const { language, numerals, textSize } = useApp();
  const inside = use(InsideText);
  const flat = StyleSheet.flatten(style) ?? {};
  // A part of a sentence with no size of its own takes the sentence's size
  const size = inside && flat.fontSize === undefined ? null : readableSize(flat, TEXT_SCALE[textSize]);

  return (
    <NativeText {...props} style={size ? [style, size] : style}>
      <InsideText value>{language === 'kn' && numerals === 'kannada' ? withKannadaDigits(children) : children}</InsideText>
    </NativeText>
  );
}

// The size to show a text at: never under SMALLEST_TEXT, times the farmer's text size. A line height set by the
// screen grows by the same amount, so lines never overlap.
function readableSize({ fontSize = DEFAULT_SIZE, lineHeight }: TextStyle, scale: number): StyleProp<TextStyle> {
  const size = Math.round(Math.max(fontSize, SMALLEST_TEXT) * scale);
  return lineHeight === undefined ? { fontSize: size } : { fontSize: size, lineHeight: Math.round((lineHeight * size) / fontSize) };
}

function withKannadaDigits(children: ReactNode) {
  // A Text inside this one converts its own digits
  return Children.map(children, (child) => (typeof child === 'string' || typeof child === 'number' ? toKannadaDigits(String(child)) : child));
}
