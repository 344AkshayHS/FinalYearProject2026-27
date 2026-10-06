import { Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppProvider, useApp } from '@/lib/app-context';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

function Screens() {
  const { t, ready, user, adminToken, adminLogout } = useApp();

  // Keep the splash screen until we know if the user is logged in
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primaryDark,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}>
      {/* Only for logged-out users */}
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Only for logged-in users */}
      <Stack.Protected guard={!!user}>
        {/* Home, Chatbot and Profile, with the bar at the bottom: see app/(tabs)/_layout.tsx */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Pages that open over the tabs, with a back arrow: a crop (it sets its own title, the crop's name),
            the compare table, and the profile's history, saved crops and about pages */}
        <Stack.Screen name="crop/[name]" options={{ title: '' }} />
        <Stack.Screen name="compare" options={{ title: t.compare.title }} />
        <Stack.Screen name="history" options={{ title: t.profileMenu.history }} />
        <Stack.Screen name="saved" options={{ title: t.profileMenu.saved }} />
        <Stack.Screen name="about" options={{ title: t.profileMenu.about }} />
      </Stack.Protected>

      {/* Only after the admin login on the login screen (no farmer account needed). English only. "Log out"
          ends the admin session and goes back to the login screen (or Home for a logged-in farmer). */}
      <Stack.Protected guard={!!adminToken}>
        <Stack.Screen
          name="admin"
          options={{
            title: 'ML dashboard',
            headerRight: () => (
              <Pressable onPress={adminLogout} accessibilityRole="button" hitSlop={10}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>Log out</Text>
              </Pressable>
            ),
          }}
        />
        <Stack.Screen name="admin-recommendation" options={{ title: 'One recommendation, step by step' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Screens />
    </AppProvider>
  );
}
