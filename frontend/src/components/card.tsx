import { View } from 'react-native';

import { cardShadow, colors, radius } from '@/theme';

// White rounded box used for every section of the results
export function Card({ children, color = colors.card }: { children: React.ReactNode; color?: string }) {
  return (
    <View
      style={{
        padding: 20,
        gap: 14,
        borderRadius: radius.large,
        borderCurve: 'continuous',
        backgroundColor: color,
        boxShadow: cardShadow,
      }}>
      {children}
    </View>
  );
}
