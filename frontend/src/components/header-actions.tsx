import type { ReactNode } from 'react';
import { View } from 'react-native';

import { BellButton } from '@/components/bell-button';
import { LanguageButton } from '@/components/language-button';

// The top right of the Home, Chatbot and Profile tabs: what a screen adds itself (Chatbot's "New chat"), the
// English/Kannada switch, and the bell at the far right
export function HeaderActions({ children }: { children?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginRight: 14 }}>
      {children}
      <LanguageButton />
      <BellButton />
    </View>
  );
}
