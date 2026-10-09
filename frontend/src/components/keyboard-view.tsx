import { HeaderHeightContext } from 'expo-router/react-navigation';
import { use, type ReactNode } from 'react';
import { KeyboardAvoidingView } from 'react-native';

// Keeps the box being typed in above the phone's keyboard, on Android and iPhone: while the keyboard is open the
// screen gets shorter by its height, and a ScrollView inside scrolls the box into view.
// Android no longer does this by itself, because apps now draw behind the system bars ("edge-to-edge").
// The header's height is counted because the keyboard's position is measured from the top of the screen.
// A pop-up (Modal) has no header of its own: it passes offset={0}.
export function KeyboardView({ children, offset }: { children: ReactNode; offset?: number }) {
  const headerHeight = use(HeaderHeightContext) ?? 0;
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={offset ?? headerHeight} style={{ flex: 1 }}>
      {children}
    </KeyboardAvoidingView>
  );
}
