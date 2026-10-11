import { View } from 'react-native';

import { useColors } from '@/lib/app-context';
import { cardShadow, radius } from '@/theme';

// White rounded box used for every section of the results (color: another background, for example a yellow box)
export function Card({ children, color }: { children: React.ReactNode; color?: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        padding: 20,
        gap: 14,
        borderRadius: radius.large,
        borderCurve: 'continuous',
        backgroundColor: color ?? colors.card,
        boxShadow: cardShadow,
      }}>
      {children}
    </View>
  );
}
