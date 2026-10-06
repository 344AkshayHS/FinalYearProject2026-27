import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Animated, Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import { colors, tabBarShadow } from '@/theme';

// One tab's icon, in the style of WhatsApp and other Android apps (Google's Material 3 bottom bar):
// the chosen tab gets a light green pill behind its icon, which grows in from the middle when it is tapped.
// iPhone: the chosen icon is the filled one (house.fill). Android's icon font has outline icons only,
// so there the pill, the colour and the bold label show the chosen tab.
type TabIconProps = { focused: boolean; color: string; ios: [SFSymbol, SFSymbol]; android: 'home' | 'sms' | 'person' };

function TabIcon({ focused, color, ios, android }: TabIconProps) {
  const [grow] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.spring(grow, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }, [focused, grow]);

  return (
    <View style={{ width: 64, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 64,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.primarySoft,
          opacity: grow,
          transform: [{ scaleX: grow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}
      />
      <SymbolView name={{ ios: focused ? ios[1] : ios[0], android, web: android }} tintColor={color} size={24} />
    </View>
  );
}

// A tab's name under its icon: bold on the chosen tab
function TabLabel({ text, focused, color }: { text: string; focused: boolean; color: string }) {
  return <Text style={{ marginTop: 4, fontSize: 13, fontWeight: focused ? '700' : '500', color }}>{text}</Text>;
}

// The bar at the bottom of the screen: Home, Chatbot and Profile.
// The three screens stay open while the farmer moves between them, so a result on Home or a chat is still
// there when they come back.
export default function TabsLayout() {
  const { t, language, setLanguage } = useApp();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primaryDark,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        // One tap switches every screen between English and Kannada
        headerRight: () => (
          <Pressable
            onPress={() => setLanguage(language === 'en' ? 'kn' : 'en')}
            accessibilityRole="button"
            accessibilityLabel={t.switchLanguage}
            hitSlop={10}
            style={{ marginRight: 18 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>{t.otherLanguage}</Text>
          </Pressable>
        ),
        sceneStyle: { backgroundColor: colors.background },
        // Chosen tab: dark green and a bold label. The others: grey.
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.muted,
        // A white bar with a soft shadow above it instead of a grey line
        tabBarStyle: {
          height: 72 + insets.bottom,
          paddingTop: 8,
          backgroundColor: colors.card,
          borderTopWidth: 0,
          boxShadow: tabBarShadow,
        },
        tabBarHideOnKeyboard: true, // more room for the chat while typing
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t.appName,
          tabBarLabel: ({ focused, color }) => <TabLabel text={t.tabs.home} focused={focused} color={String(color)} />,
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused} color={String(color)} ios={['house', 'house.fill']} android="home" />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t.chat.title,
          // The GreenRoot robot next to the title
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Image
                source={require('../../../assets/images/chatbot.png')}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryDark }}
              />
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.primaryDark }}>{t.chat.title}</Text>
            </View>
          ),
          tabBarLabel: ({ focused, color }) => <TabLabel text={t.tabs.chat} focused={focused} color={String(color)} />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={String(color)} ios={['ellipsis.message', 'ellipsis.message.fill']} android="sms" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.profile,
          tabBarLabel: ({ focused, color }) => <TabLabel text={t.tabs.profile} focused={focused} color={String(color)} />,
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused} color={String(color)} ios={['person', 'person.fill']} android="person" />,
        }}
      />
    </Tabs>
  );
}
