import { Children, type ReactNode } from 'react';
import { Text as NativeText, type TextProps } from 'react-native';

import { useApp } from '@/lib/app-context';
import { toKannadaDigits } from '@/lib/digits';

// The app's Text. It is React Native's Text, except that in Kannada with "Numbers: ೧೨೩" chosen (Profile →
// Language) the digits 0-9 are shown as ೦-೯. Every screen uses it, so texts added later and data that arrives
// later (the weather, a result, a chat answer) follow the farmer's choice by themselves.
export function Text({ children, ...props }: TextProps) {
  const { language, numerals } = useApp();
  return <NativeText {...props}>{language === 'kn' && numerals === 'kannada' ? withKannadaDigits(children) : children}</NativeText>;
}

function withKannadaDigits(children: ReactNode) {
  // A Text inside this one converts its own digits
  return Children.map(children, (child) => (typeof child === 'string' || typeof child === 'number' ? toKannadaDigits(String(child)) : child));
}
