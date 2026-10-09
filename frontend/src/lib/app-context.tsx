// Shared app state: the logged-in user, their login token, the chosen language, the farmer's last result (the
// crop pages use it, and the crop helper chat can answer "can I grow rice here?"), and the crop list with the
// farmer's saved crops.
// The token and language are saved on the phone with SecureStore, so the user stays logged in.

import * as SecureStore from 'expo-secure-store';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { api, fileUrl, whenLoginExpires } from '@/lib/api';
import { toBase64 } from '@/lib/base64';
import type { Numerals } from '@/lib/digits';
import { farmSummary, type FarmSummary } from '@/lib/chatbot';
import type { CropData, LastResult } from '@/lib/crops';
import { isTextSize, type TextSize } from '@/lib/text-size';
import type { ForecastPlace } from '@/lib/weather';
import { translations, type Language } from '@/lib/translations';

export type User = {
  id: string;
  full_name: string;
  phone: string;
  preferred_language: Language;
  created_at: string;
  photo_updated_at: string | null; // when the profile photo last changed; null: no photo
};

type AppState = {
  ready: boolean;
  user: User | null;
  token: string | null;
  language: Language;
  t: (typeof translations)['en'];
  login: (phone: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void; // after "Edit profile" saves the details or the photo
  // The profile photo as a "data:" picture for every screen (components/avatar.tsx); null: none, or still loading.
  // Edit profile gives it at once after saving a new photo (with the photo's new photo_updated_at), so all screens
  // change together.
  photo: string | null;
  showPhoto: (photoUpdatedAt: string, picture: string) => void;
  setLanguage: (language: Language) => Promise<void>;
  // In Kannada: numbers as 0-9 ('western', the default) or as ೦-೯ ('kannada'). Remembered on this device.
  numerals: Numerals;
  setNumerals: (numerals: Numerals) => void;
  // Normal, big or bigger letters everywhere (components/text.tsx). Remembered on this device.
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  // Admin (ML dashboard) login. Kept in memory only, so closing the app logs the admin out.
  adminToken: string | null;
  adminLogin: (username: string, password: string) => Promise<void>;
  adminLogout: () => void;
  // The last "Find crops" result, in memory only, and the same in the words the chat uses
  lastResult: LastResult | null;
  // Where the weather card's forecast is for (set by the card), so the chat can answer "today's weather?" there
  forecastPlace: ForecastPlace | null;
  setForecastPlace: (place: ForecastPlace | null) => void;
  setLastResult: (result: LastResult | null) => void;
  farm: FarmSummary | null;
  // Every crop (photos, FAO needs) and the farmer's saved crops: null while loading, 'failed' if it could not load
  crops: CropData | null | 'failed';
  reloadCrops: () => void;
  toggleSaved: (crop: string) => Promise<void>; // saves a crop, or takes it off the list; throws if it fails
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [language, setLanguageState] = useState<Language>('en');
  const [numerals, setNumeralsState] = useState<Numerals>('western');
  const [textSize, setTextSizeState] = useState<TextSize>('normal');
  // The last photo loaded, with the photo_updated_at it belongs to: a photo of an older version (or of another
  // account) is never shown
  const [photoLoaded, setPhotoLoaded] = useState<{ version: string; picture: string } | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [forecastPlace, setForecastPlace] = useState<ForecastPlace | null>(null);
  const [crops, setCrops] = useState<CropData | null | 'failed'>(null);
  const [cropsAttempt, setCropsAttempt] = useState(0); // "Try again" loads the crops again

  // On app start: load the saved language and token, and check the token is still valid
  useEffect(() => {
    // If the server ever says the login has run out (they last 30 days), go back to the login screen
    whenLoginExpires(() => {
      SecureStore.deleteItemAsync('token');
      setToken(null);
      setUser(null);
      setLastResult(null);
      setForecastPlace(null);
      setCrops(null);
    });

    async function start() {
      const savedLanguage = await SecureStore.getItemAsync('language');
      if (savedLanguage === 'en' || savedLanguage === 'kn') {
        setLanguageState(savedLanguage);
      }
      if ((await SecureStore.getItemAsync('numerals')) === 'kannada') {
        setNumeralsState('kannada');
      }
      const savedSize = await SecureStore.getItemAsync('textSize');
      if (isTextSize(savedSize)) {
        setTextSizeState(savedSize);
      }

      const savedToken = await SecureStore.getItemAsync('token');
      if (savedToken) {
        try {
          const data = await api<{ user: User }>('/users/me', { token: savedToken });
          setUser(data.user);
          setToken(savedToken);
        } catch {
          await SecureStore.deleteItemAsync('token'); // expired or server unreachable
        }
      }
      setReady(true);
    }
    start();
  }, []);

  // The profile photo, each time it changes ("?v=" is the time it changed, so an old copy is never used). Only its
  // owner may see it, so the login token goes along. Read as plain bytes: React Native's Blob reader is slow.
  const photoVersion = user?.photo_updated_at ?? null;
  const photo = photoVersion && photoLoaded?.version === photoVersion ? photoLoaded.picture : null;
  useEffect(() => {
    const url = token && photoVersion ? fileUrl(`users/me/photo?v=${encodeURIComponent(photoVersion)}`) : undefined;
    if (!url || !photoVersion) {
      return;
    }
    let current = true;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`photo answer ${response.status}`))))
      .then((bytes) => current && setPhotoLoaded({ version: photoVersion, picture: `data:image/jpeg;base64,${toBase64(new Uint8Array(bytes))}` }))
      .catch(() => {}); // not loaded: the first letter of the name shows instead
    return () => {
      current = false;
    };
  }, [token, photoVersion]);

  // After login: every crop and the farmer's saved crops, once
  useEffect(() => {
    if (!token) {
      return;
    }
    let current = true;
    Promise.all([api<{ crops: CropData['list'] }>('/crops', { token }), api<{ saved: CropData['saved'] }>('/users/me/saved', { token })])
      .then(([list, saved]) => current && setCrops({ list: list.crops, saved: saved.saved }))
      .catch(() => current && setCrops('failed'));
    return () => {
      current = false;
    };
  }, [token, cropsAttempt]);

  function reloadCrops() {
    setCrops(null);
    setCropsAttempt((n) => n + 1);
  }

  async function toggleSaved(crop: string) {
    if (crops === null || crops === 'failed') {
      return;
    }
    const isSaved = crops.saved.some((item) => item.crop === crop);
    await api(`/users/me/saved/${encodeURIComponent(crop)}`, { method: isSaved ? 'DELETE' : 'PUT', token });
    setCrops((old) =>
      old && old !== 'failed'
        ? {
            ...old,
            saved: isSaved ? old.saved.filter((item) => item.crop !== crop) : [{ crop, created_at: new Date().toISOString() }, ...old.saved],
          }
        : old
    );
  }

  async function saveLogin(data: { token: string; user: User }) {
    // On an iPhone the token stays on this phone: it is not copied to a new phone from a backup
    await SecureStore.setItemAsync('token', data.token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    await SecureStore.setItemAsync('language', data.user.preferred_language);
    setToken(data.token);
    setUser(data.user);
    setLanguageState(data.user.preferred_language);
  }

  async function login(phone: string, password: string) {
    const data = await api<{ token: string; user: User }>('/users/login', {
      method: 'POST',
      body: { phone, password },
    });
    await saveLogin(data);
  }

  async function register(fullName: string, phone: string, password: string) {
    const data = await api<{ token: string; user: User }>('/users/register', {
      method: 'POST',
      body: { full_name: fullName, phone, password, language },
    });
    await saveLogin(data);
  }

  async function adminLogin(username: string, password: string) {
    const data = await api<{ token: string }>('/admin/login', { method: 'POST', body: { username, password } });
    setAdminToken(data.token);
  }

  function adminLogout() {
    api('/admin/logout', { method: 'POST', token: adminToken }).catch(() => {});
    setAdminToken(null);
  }

  async function logout() {
    adminLogout();
    api('/users/logout', { method: 'POST', token }).catch(() => {});
    await SecureStore.deleteItemAsync('token');
    setToken(null);
    setUser(null);
    setLastResult(null);
    setForecastPlace(null);
    setCrops(null);
  }

  function setNumerals(newNumerals: Numerals) {
    setNumeralsState(newNumerals);
    SecureStore.setItemAsync('numerals', newNumerals).catch(() => {});
  }

  function setTextSize(size: TextSize) {
    setTextSizeState(size);
    SecureStore.setItemAsync('textSize', size).catch(() => {});
  }

  async function setLanguage(newLanguage: Language) {
    setLanguageState(newLanguage);
    await SecureStore.setItemAsync('language', newLanguage);
    if (token) {
      api('/users/me/language', { method: 'PATCH', body: { language: newLanguage }, token }).catch(() => {});
    }
  }

  return (
    <AppContext
      value={{
        ready,
        user,
        token,
        language,
        t: translations[language],
        login,
        register,
        logout,
        updateUser: setUser,
        photo,
        showPhoto: (version, picture) => setPhotoLoaded({ version, picture }),
        setLanguage,
        numerals,
        setNumerals,
        textSize,
        setTextSize,
        adminToken,
        adminLogin,
        adminLogout,
        lastResult,
        forecastPlace,
        setForecastPlace,
        setLastResult,
        farm: lastResult ? farmSummary(lastResult.data, lastResult.waterSource) : null,
        crops,
        reloadCrops,
        toggleSaved,
      }}>
      {children}
    </AppContext>
  );
}

export function useApp() {
  const state = use(AppContext);
  if (!state) {
    throw new Error('useApp must be used inside <AppProvider>');
  }
  return state;
}
