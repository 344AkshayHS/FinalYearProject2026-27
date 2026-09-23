import { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ChatButton } from '@/components/chat-button';
import { DistrictPicker } from '@/components/district-picker';
import { Results, type RecommendResponse } from '@/components/results';
import { EMPTY_SOIL_TEST, SoilTestForm, soilTestBody } from '@/components/soil-test-form';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { detectLocation, type DetectedLocation } from '@/lib/detect-location';
import { districtName } from '@/lib/translations';
import { cardShadow, colors, radius } from '@/theme';

function errorCode(err: unknown) {
  return err instanceof ApiError ? err.code : 'server_error';
}

// Location problems the farmer can fix with one tap: help text and button label for each
type LocationFix = {
  help: 'locationOffHelp' | 'permissionHelp' | 'permissionBlockedHelp';
  button: 'turnOnLocation' | 'allowLocation' | 'openSettings';
};
const LOCATION_FIXES: Record<string, LocationFix> = {
  location_off: { help: 'locationOffHelp', button: 'turnOnLocation' },
  permission_denied: { help: 'permissionHelp', button: 'allowLocation' },
  permission_blocked: { help: 'permissionBlockedHelp', button: 'openSettings' },
};

export default function HomeScreen() {
  const { t, user, token, language } = useApp();

  // Location: detected by GPS (asked for as soon as the screen opens), or picked by hand from the list.
  // Errors are kept as codes and translated when shown, so they follow the language switch.
  const [detecting, setDetecting] = useState(true);
  const [detected, setDetected] = useState<DetectedLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // The farmer's own soil test values (optional)
  const [soilTest, setSoilTest] = useState(EMPTY_SOIL_TEST);

  // Recommendation
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);

  const usingGps = detected !== null && district === detected.district;
  const firstName = user?.full_name.split(' ')[0] ?? '';

  // "You are in Beltangadi taluk, Dakshina Kannada district" / "You are in Ludhiana, Punjab" /
  // "Mysuru district (chosen by you)". The taluk is left out when OpenStreetMap did not know it.
  function locationLabel() {
    if (!usingGps) {
      return t.chosenDistrict.replace('{district}', districtName(district ?? '', language));
    }
    if (detected.state === 'Karnataka') {
      const text = detected.place && detected.taluk
        ? t.detectedPlace.replace('{place}', detected.place).replace('{taluk}', detected.taluk)
        : detected.taluk
          ? t.detectedTaluk.replace('{taluk}', detected.taluk)
          : t.detectedDistrict;
      return text.replace('{district}', districtName(detected.district, language));
    }
    const place = detected.taluk ? `${detected.taluk}, ${detected.district}` : detected.district;
    return t.detectedDistrictState.replace('{district}', place).replace('{state}', detected.state);
  }

  // Ask for location as soon as the screen opens, so the district is ready before anything is tapped.
  // If it fails here we only show why; the farmer can tap "Use my location" or pick a district.
  useEffect(() => {
    detectLocation()
      .then((location) => {
        setDetected(location);
        setDistrict(location.district);
      })
      .catch((err) => setLocationError(errorCode(err)))
      .finally(() => setDetecting(false));
  }, []);

  async function locateMe() {
    setDetecting(true);
    setLocationError(null);
    try {
      const location = await detectLocation();
      setDetected(location);
      setDistrict(location.district);
    } catch (err) {
      // Explain why. If it is not something a tap can fix, open the district list straight away.
      const code = errorCode(err);
      setLocationError(code);
      setPickerOpen(!LOCATION_FIXES[code]);
    }
    setDetecting(false);
  }

  // "Turn on location" / "Allow location" ask again inside the app (Android shows its own popup).
  // A blocked permission, or location on an iPhone, can only be changed in the phone's Settings.
  const [inSettings, setInSettings] = useState(false);
  function fixLocation() {
    const needsSettings =
      locationError === 'permission_blocked' || (locationError === 'location_off' && process.env.EXPO_OS === 'ios');
    if (needsSettings) {
      setInSettings(true);
      Linking.openSettings();
    } else {
      locateMe();
    }
  }

  // Coming back from Settings: try again by itself
  const retryAfterSettings = useEffectEvent(() => {
    setInSettings(false);
    locateMe();
  });
  useEffect(() => {
    if (!inSettings) {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        retryAfterSettings();
      }
    });
    return () => subscription.remove();
  }, [inSettings]);

  function chooseDistrict(picked: string) {
    setDistrict(picked);
    setLocationError(null);
    setPickerOpen(false);
  }

  async function findCrops() {
    if (!district) {
      return;
    }
    setAnalysing(true);
    setError(null);
    try {
      // With GPS we check the exact spot; with a hand-picked district, a sample farm point there
      const place = usingGps ? { lat: detected.lat, lng: detected.lng, state: detected.state, district } : { district };
      const body = { ...place, soil_test: soilTestBody(soilTest) };
      setResult(await api<RecommendResponse>('/recommend', { method: 'POST', body, token }));
    } catch (err) {
      setError(errorCode(err));
    }
    setAnalysing(false);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 110 }}>
        {/* Welcome */}
        <View
          style={{
            padding: 22,
            gap: 12,
            borderRadius: radius.large,
            borderCurve: 'continuous',
            backgroundColor: colors.primary,
            boxShadow: cardShadow,
          }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.white }}>
            {t.hello.replace('{name}', firstName)} 👋
          </Text>
          <Text style={{ fontSize: 16, lineHeight: 23, color: colors.primarySoft }}>{t.homeIntro}</Text>
        </View>

        {/* Location */}
        <View
          style={{
            padding: 20,
            gap: 14,
            borderRadius: radius.large,
            borderCurve: 'continuous',
            backgroundColor: colors.card,
            boxShadow: cardShadow,
          }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{t.yourLocation}</Text>

          {detecting && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ fontSize: 16, color: colors.muted }}>{t.detecting}</Text>
            </View>
          )}

          {!detecting && district && (
            <View style={{ gap: 6, padding: 14, borderRadius: radius.medium, backgroundColor: colors.primarySoft }}>
              <Text selectable style={{ fontSize: 18, fontWeight: '700', color: colors.primaryDark }}>
                📍{' '}
                {locationLabel()}
              </Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
                {usingGps ? t.isThisRight : t.manualNote}
              </Text>
            </View>
          )}

          {!detecting && locationError && LOCATION_FIXES[locationError] && (
            <View style={{ gap: 12, padding: 14, borderRadius: radius.medium, backgroundColor: colors.dangerSoft }}>
              <Text selectable style={{ fontSize: 16, lineHeight: 22, color: colors.danger }}>
                {t.errors[locationError]} {t[LOCATION_FIXES[locationError].help]}
              </Text>
              <Button title={t[LOCATION_FIXES[locationError].button]} onPress={fixLocation} />
            </View>
          )}

          {!detecting && locationError && !LOCATION_FIXES[locationError] && (
            <Text selectable style={{ fontSize: 15, lineHeight: 21, color: colors.danger }}>
              {t.errors[locationError] ?? t.errors.server_error} {t.pickDistrictInstead}
            </Text>
          )}

          {!detecting && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <View style={{ flexGrow: 1 }}>
                <Button title={t.useMyLocation} onPress={locateMe} variant={district ? 'outline' : 'primary'} />
              </View>
              <View style={{ flexGrow: 1 }}>
                <Button title={district ? t.changeDistrict : t.chooseDistrict} onPress={() => setPickerOpen(true)} variant="outline" />
              </View>
            </View>
          )}
        </View>

        <SoilTestForm values={soilTest} onChange={setSoilTest} />

        {/* Find crops */}
        {district && !detecting && (
          <Button title={result ? t.checkAgain : t.findCrops} onPress={findCrops} loading={analysing} />
        )}

        {analysing && (
          <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center' }}>{t.analysing}</Text>
        )}

        {error && !analysing && (
          <View style={{ padding: 18, gap: 12, borderRadius: radius.medium, backgroundColor: colors.dangerSoft }}>
            <Text selectable style={{ fontSize: 16, lineHeight: 22, color: colors.danger }}>
              {t.errors[error] ?? t.errors.server_error}
            </Text>
            <Pressable onPress={findCrops} accessibilityRole="button">
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.danger }}>{t.tryAgain}</Text>
            </Pressable>
          </View>
        )}

        {result && !analysing && <Results data={result} />}

        <DistrictPicker
          visible={pickerOpen}
          selected={district}
          onSelect={chooseDistrict}
          onClose={() => setPickerOpen(false)}
        />
      </ScrollView>

      {/* Crop helper chat (draggable), about the best crop if we have a result */}
      <ChatButton crop={result?.recommendations[0].crop} label={t.chat.short} />
    </View>
  );
}
