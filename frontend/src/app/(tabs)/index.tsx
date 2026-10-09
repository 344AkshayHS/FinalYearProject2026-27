import { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/button';
import { DistrictPicker } from '@/components/district-picker';
import { Chip } from '@/components/chip';
import { Results, type RecommendResponse, type WaterSource } from '@/components/results';
import { StatePicker } from '@/components/state-picker';
import { EMPTY_SOIL_TEST, SoilTestForm, soilTestBody } from '@/components/soil-test-form';
import { KeyboardView } from '@/components/keyboard-view';
import { TalukPicker, type Taluk } from '@/components/taluk-picker';
import { Text } from '@/components/text';
import { WaterSourceCard } from '@/components/water-source-card';
import { WeatherCard, type WeatherPlace } from '@/components/weather-card';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { detectLocation, ROUGH_ACCURACY_M, type DetectedLocation } from '@/lib/detect-location';
import { SEASONS, seasonNow, type Season } from '@/lib/season';
import { districtName, stateName, talukName } from '@/lib/translations';
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
  const { t, user, token, language, setLastResult } = useApp();

  // Location: detected by GPS (asked for as soon as the screen opens), or picked by hand from the list.
  // Errors are kept as codes and translated when shown, so they follow the language switch.
  const [detecting, setDetecting] = useState(true);
  const [detected, setDetected] = useState<DetectedLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Picking by hand goes state, then district, then (Karnataka only) taluk. manualState is the state of the
  // picked district; pickedState is a state just picked whose districts are being listed.
  const [manualState, setManualState] = useState<string | null>(null);
  const [pickedState, setPickedState] = useState<string | null>(null);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  // True once the farmer picks a district by hand - even the same one GPS found - until GPS is used again
  const [manual, setManual] = useState(false);
  // Optional taluk of a hand-picked Karnataka district (null = the whole district)
  const [taluk, setTaluk] = useState<Taluk | null>(null);
  const [talukPickerOpen, setTalukPickerOpen] = useState(false);

  // The farmer's own soil test values (optional)
  const [soilTest, setSoilTest] = useState(EMPTY_SOIL_TEST);
  // Rain only or irrigated: on rain-fed land, crops the rain can't support this year are marked
  const [waterSource, setWaterSource] = useState<WaterSource>('rain');
  // The season to sow in: crops change with it. Starts at the season of today's date.
  const [season, setSeason] = useState<Season>(seasonNow);

  // Recommendation
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  // What the shown result was asked for (place and soil test), to notice when the farmer changes either
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  const usingGps = detected !== null && !manual;
  const roughGps = usingGps && (detected.accuracy ?? 0) > ROUGH_ACCURACY_M;
  const state = usingGps ? detected.state : manualState;
  const listedState = pickedState ?? state; // the state whose districts the list shows
  const firstName = user?.full_name.split(' ')[0] ?? '';
  // The weather card follows the same place: the GPS point, or the middle of the district picked by hand
  const weatherPlace: WeatherPlace | null = usingGps
    ? { lat: detected.lat, lng: detected.lng }
    : district && manualState
      ? { state: manualState, district }
      : null;

  // "You are in Beltangady taluk, Dakshina Kannada district" / "You are in Ludhiana, Punjab" /
  // "Mysuru district (chosen by you)" / "Hunsur taluk, Mysuru district (chosen by you)" /
  // "Wayanad district, Kerala (chosen by you)".
  // Taluks are Karnataka only; one is left out when the taluk map cannot place the point.
  function locationLabel() {
    if (!usingGps) {
      if (manualState && manualState !== 'Karnataka') {
        return t.chosenDistrictState.replace('{district}', district ?? '').replace('{state}', stateName(manualState, language));
      }
      const text = taluk ? t.chosenTaluk.replace('{taluk}', talukName(taluk.name, language)) : t.chosenDistrict;
      return text.replace('{district}', districtName(district ?? '', language));
    }
    if (detected.state === 'Karnataka') {
      const gpsTaluk = detected.taluk ? talukName(detected.taluk, language) : null;
      const text = detected.place && gpsTaluk
        ? t.detectedPlace.replace('{place}', detected.place).replace('{taluk}', gpsTaluk)
        : gpsTaluk
          ? t.detectedTaluk.replace('{taluk}', gpsTaluk)
          : t.detectedDistrict;
      return text.replace('{district}', districtName(detected.district, language));
    }
    return t.detectedDistrictState.replace('{district}', detected.district).replace('{state}', detected.state);
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
      setManual(false);
      setTaluk(null);
      setPickedState(null);
    } catch (err) {
      // Explain why. If it is not something a tap can fix, open the list to pick the place by hand straight away.
      const code = errorCode(err);
      setLocationError(code);
      if (!LOCATION_FIXES[code]) {
        if (state) {
          setPickerOpen(true);
        } else {
          setStatePickerOpen(true);
        }
      }
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

  // The state list closes first, then the district list opens: iPhones cannot open one full-screen sheet
  // while another is closing
  function chooseState(picked: string) {
    setPickedState(picked);
    setStatePickerOpen(false);
    setTimeout(() => setPickerOpen(true), 450);
  }

  function chooseDistrict(picked: string) {
    setDistrict(picked);
    setManualState(listedState);
    setPickedState(null);
    setManual(true);
    setTaluk(null); // a taluk belongs to one district
    setLocationError(null);
    setPickerOpen(false);
    // Karnataka only: next, the district's taluks ("Whole district" first, so skipping is one tap)
    if (listedState === 'Karnataka') {
      setTimeout(() => setTalukPickerOpen(true), 450);
    }
  }

  function chooseTaluk(picked: Taluk | null) {
    setTaluk(picked);
    setTalukPickerOpen(false);
  }

  // Rain only / Irrigated: the crop pages and the chat follow the choice too
  function changeWaterSource(source: WaterSource) {
    setWaterSource(source);
    if (result) {
      setLastResult({ data: result, waterSource: source });
    }
  }

  // With GPS we check the exact spot; a hand-picked Karnataka district (or taluk): sample farms across all of it;
  // a district of another state: one spot in its middle
  const place = usingGps
    ? { lat: detected.lat, lng: detected.lng, state: detected.state, district }
    : { state: manualState, district, taluk: taluk?.key };
  const askingFor = JSON.stringify({ place, soil: soilTestBody(soilTest) });
  // The place or the soil test changed since the crops below were found: a note above "Check again" says so
  const outdated = result !== null && checkedFor !== askingFor;

  // forSeason: a season chip tapped after a result is shown asks again at once, before the state updates
  async function findCrops(forSeason: Season = season) {
    if (!district) {
      return;
    }
    setAnalysing(true);
    setError(null);
    try {
      const body = { ...place, season: forSeason, soil_test: soilTestBody(soilTest) };
      const data = await api<RecommendResponse>('/recommend', { method: 'POST', body, token });
      setResult(data);
      setCheckedFor(askingFor);
      setLastResult({ data, waterSource }); // for the crop pages, and the crop helper chat ("can I grow rice here?")
    } catch (err) {
      setError(errorCode(err));
    }
    setAnalysing(false);
  }

  return (
    <KeyboardView>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}>
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
            <View style={{ gap: 6, paddingVertical: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{t.detecting}</Text>
              </View>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t.detectingHelp}</Text>
            </View>
          )}

          {!detecting && district && (
            <View
              style={{
                gap: 6,
                padding: 14,
                borderRadius: radius.medium,
                backgroundColor: roughGps ? colors.accentSoft : colors.primarySoft,
              }}>
              <Text selectable style={{ fontSize: 18, fontWeight: '700', color: colors.primaryDark }}>
                📍{' '}
                {locationLabel()}
              </Text>
              {/* How exact the phone's position is: a rough one (Wi-Fi, mobile towers) can name the wrong place */}
              {usingGps && detected.accuracy !== null && (
                <Text style={{ fontSize: 14, lineHeight: 20, color: roughGps ? colors.warningText : colors.muted, fontWeight: roughGps ? '600' : '400' }}>
                  {roughGps
                    ? '⚠️ ' + t.locationRough.replace('{n}', String(Math.round(detected.accuracy / 1000)))
                    : t.locationAccurate.replace('{n}', String(Math.max(Math.round(detected.accuracy), 5)))}
                </Text>
              )}
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
                {usingGps ? t.isThisRight : manualState !== 'Karnataka' ? t.middleNote : taluk ? t.manualNoteTaluk : t.manualNote}
              </Text>
            </View>
          )}

          {/* A hand-picked Karnataka district can be narrowed to one of its taluks (optional) */}
          {!detecting && district && !usingGps && manualState === 'Karnataka' && (
            <Button
              title={`${t.talukOptional}: ${taluk ? talukName(taluk.name, language) : t.wholeDistrict}`}
              onPress={() => setTalukPickerOpen(true)}
              variant="outline"
            />
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
                <Button
                  title={district ? t.changeDistrict : t.chooseDistrict}
                  onPress={() => (listedState ? setPickerOpen(true) : setStatePickerOpen(true))}
                  variant="outline"
                />
              </View>
            </View>
          )}

          {/* The state is optional too: the district list is that state's. Karnataka's are the default. */}
          {!detecting && (
            <Button
              title={`${t.stateOptional}: ${listedState ? stateName(listedState, language) : t.chooseState}`}
              onPress={() => setStatePickerOpen(true)}
              variant="outline"
            />
          )}
        </View>

        {!detecting && weatherPlace && (
          <WeatherCard
            place={weatherPlace}
            districtLabel={manualState === 'Karnataka' ? districtName(district ?? '', language) : (district ?? '')}
          />
        )}

        {/* Season to sow in: the model answers for this season */}
        <View
          style={{
            padding: 20,
            gap: 12,
            borderRadius: radius.large,
            borderCurve: 'continuous',
            backgroundColor: colors.card,
            boxShadow: cardShadow,
          }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{t.seasonTitle}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {SEASONS.map((option) => (
              <Chip
                key={option}
                label={t.seasons[option]}
                selected={season === option}
                onPress={() => {
                  if (analysing) {
                    return; // one question at a time: a second tap would save the same result twice
                  }
                  setSeason(option);
                  if (result && option !== season) {
                    findCrops(option);
                  }
                }}
              />
            ))}
          </View>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t.seasonHelp}</Text>
        </View>

        {/* Water for this land: decides whether crops the rain can't support are marked. Once crops are shown it
            moves under the best crop (in Results), where the farmer sees what the choice changes. */}
        {!result && <WaterSourceCard value={waterSource} onChange={changeWaterSource} />}

        <SoilTestForm values={soilTest} onChange={setSoilTest} />

        {/* Find crops */}
        {outdated && !analysing && (
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.warningText, padding: 14, borderRadius: radius.medium, backgroundColor: colors.accentSoft }}>
            📍 {t.placeChanged.replace('{button}', t.checkAgain)}
          </Text>
        )}
        {district && !detecting && (
          <Button
            title={result ? t.checkAgain : t.findCrops}
            onPress={() => findCrops()}
            loading={analysing}
            icon={result ? { ios: 'arrow.clockwise', android: 'refresh' } : undefined}
          />
        )}

        {analysing && (
          <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center' }}>{t.analysing}</Text>
        )}

        {error && !analysing && (
          <View style={{ padding: 18, gap: 12, borderRadius: radius.medium, backgroundColor: colors.dangerSoft }}>
            <Text selectable style={{ fontSize: 16, lineHeight: 22, color: colors.danger }}>
              {t.errors[error] ?? t.errors.server_error}
            </Text>
            <Pressable onPress={() => findCrops()} accessibilityRole="button">
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.danger }}>{t.tryAgain}</Text>
            </Pressable>
          </View>
        )}

        {result && !analysing && <Results data={result} waterSource={waterSource} onWaterSourceChange={changeWaterSource} />}

        <StatePicker
          visible={statePickerOpen}
          selected={listedState}
          onSelect={chooseState}
          onClose={() => setStatePickerOpen(false)}
        />
        {listedState && (
          <DistrictPicker
            visible={pickerOpen}
            state={listedState}
            selected={usingGps ? null : district}
            onSelect={chooseDistrict}
            onClose={() => setPickerOpen(false)}
          />
        )}
        {district && !usingGps && manualState === 'Karnataka' && (
          <TalukPicker
            visible={talukPickerOpen}
            district={district}
            selected={taluk}
            onSelect={chooseTaluk}
            onClose={() => setTalukPickerOpen(false)}
          />
        )}
      </ScrollView>
    </KeyboardView>
  );
}
