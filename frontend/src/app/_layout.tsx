import { Link, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppProvider, useApp } from '@/lib/app-context';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

function Screens() {
  const { ready, user, t, language, setLanguage, adminToken } = useApp();

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
        <Stack.Screen
          name="index"
          options={{
            title: t.appName,
            headerRight: () => (
              <View style={{ flexDirection: 'row', gap: 18 }}>
                {/* One tap switches every screen between English and Kannada */}
                <Pressable
                  onPress={() => setLanguage(language === 'en' ? 'kn' : 'en')}
                  accessibilityRole="button"
                  accessibilityLabel={t.switchLanguage}
                  hitSlop={10}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>{t.otherLanguage}</Text>
                </Pressable>
                <Link href="/profile" asChild>
                  <Pressable accessibilityRole="button" hitSlop={10}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>{t.profile}</Text>
                  </Pressable>
                </Link>
              </View>
            ),
          }}
        />
        <Stack.Screen name="profile" options={{ title: t.profile }} />
        <Stack.Screen name="chat" options={{ title: t.chat.title, presentation: 'modal' }} />

        {/* Only after the admin login on the profile screen */}
        <Stack.Protected guard={!!adminToken}>
          <Stack.Screen name="admin" options={{ title: 'ML dashboard' }} />
          <Stack.Screen name="admin-recommendation" options={{ title: 'One recommendation, step by step' }} />
        </Stack.Protected>
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
