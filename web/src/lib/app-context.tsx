// Shared state of the website, like frontend/src/lib/app-context.tsx in the phone app:
// the logged-in user, the chosen language, the farmer's last result (the crop pages use it, and the crop helper
// chat can answer "can I grow rice here?"), and the crop list with the farmer's saved crops.
//
// The phone keeps its login token in SecureStore. The website does not keep any token: the backend
// puts it in an httpOnly cookie. All the page knows is "who am I?", which it asks with GET /users/me.

import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { api, apiWithRetry, whenLoginExpires } from '~/lib/api';
import { farmSummary, type FarmSummary } from '@/lib/chatbot';
import { toKannadaDigits, toWesternDigits, type Numerals } from '@/lib/digits';
import { isTextSize, TEXT_SCALE, type TextSize } from '@/lib/text-size';
import type { CropData, LastResult } from '@/lib/crops';
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
  language: Language;
  t: (typeof translations)['en'];
  login: (phone: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void; // after "Edit profile" saves the details or the photo
  setLanguage: (language: Language) => Promise<void>;
  // In Kannada: numbers as 0-9 ('western', the default) or as ೦-೯ ('kannada'). Remembered on this device.
  numerals: Numerals;
  setNumerals: (numerals: Numerals) => void;
  // Normal, big or bigger letters on every page (the CSS multiplies each font size by --text-scale)
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  // Admin (ML dashboard) login. Only remembered while this page stays open, like on the phone.
  adminLoggedIn: boolean;
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

// The language is not secret, so the browser may remember it
function savedLanguage(): Language {
  try {
    return localStorage.getItem('language') === 'kn' ? 'kn' : 'en';
  } catch {
    return 'en'; // private window with storage blocked
  }
}

function savedTextSize(): TextSize {
  try {
    const saved = localStorage.getItem('textSize');
    return isTextSize(saved) ? saved : 'normal';
  } catch {
    return 'normal';
  }
}

function savedNumerals(): Numerals {
  try {
    return localStorage.getItem('numerals') === 'kannada' ? 'kannada' : 'western';
  } catch {
    return 'western';
  }
}

// Every text on the page, written with the chosen digits. Parts marked data-keep-digits (the 123 / ೧೨೩ switch
// itself) stay as they are, and so do typed values (inputs are not text on the page).
function writeDigits(root: Node, convert: (text: string) => string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.currentNode; node; node = walker.nextNode()!) {
    if (node.nodeType === Node.TEXT_NODE && !node.parentElement?.closest('[data-keep-digits], script, style')) {
      const text = node.nodeValue ?? '';
      const next = convert(text);
      if (next !== text) {
        node.nodeValue = next;
      }
    }
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [language, setLanguageState] = useState<Language>(savedLanguage);
  const [numerals, setNumeralsState] = useState<Numerals>(savedNumerals);
  const [textSize, setTextSizeState] = useState<TextSize>(savedTextSize);
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [forecastPlace, setForecastPlace] = useState<ForecastPlace | null>(null);
  const [crops, setCrops] = useState<CropData | null | 'failed'>(null);
  const [cropsAttempt, setCropsAttempt] = useState(0); // "Try again" loads the crops again

  // The page follows the language: the browser reads Kannada text with the right font and spelling rules
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Bigger letters: styles.css multiplies every font size by --text-scale
  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(TEXT_SCALE[textSize]));
  }, [textSize]);

  // Kannada numerals chosen: every number on the page is written ೦-೯, also those of texts and data that appear
  // later (a result, the weather, a chat answer), which the watcher converts as they arrive. Otherwise 0-9.
  useEffect(() => {
    const kannada = language === 'kn' && numerals === 'kannada';
    writeDigits(document.body, kannada ? toKannadaDigits : toWesternDigits);
    if (!kannada) {
      return;
    }
    const watcher = new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === 'characterData') {
          writeDigits(change.target, toKannadaDigits);
        }
        change.addedNodes.forEach((node) => writeDigits(node, toKannadaDigits));
      }
    });
    watcher.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => watcher.disconnect();
  }, [language, numerals]);

  // On start: is there a valid login cookie? Also, if the backend ever says the login ran out, log out
  useEffect(() => {
    whenLoginExpires(() => {
      setUser(null);
      setAdminLoggedIn(false);
      setLastResult(null);
      setForecastPlace(null);
      setCrops(null);
    });
    api<{ user: User }>('/users/me')
      .then((data) => setUser(data.user))
      .catch(() => {}) // not logged in (or the server is down): the login page shows
      .finally(() => setReady(true));
  }, []);

  // After login: every crop and the farmer's saved crops, once
  useEffect(() => {
    if (!user) {
      return;
    }
    let current = true;
    Promise.all([apiWithRetry<{ crops: CropData['list'] }>('/crops'), apiWithRetry<{ saved: CropData['saved'] }>('/users/me/saved')])
      .then(([list, saved]) => current && setCrops({ list: list.crops, saved: saved.saved }))
      .catch(() => current && setCrops('failed'));
    return () => {
      current = false;
    };
  }, [user, cropsAttempt]);

  function reloadCrops() {
    setCrops(null);
    setCropsAttempt((n) => n + 1);
  }

  async function toggleSaved(crop: string) {
    if (crops === null || crops === 'failed') {
      return;
    }
    const isSaved = crops.saved.some((item) => item.crop === crop);
    await api(`/users/me/saved/${encodeURIComponent(crop)}`, { method: isSaved ? 'DELETE' : 'PUT' });
    setCrops((old) =>
      old && old !== 'failed'
        ? {
            ...old,
            saved: isSaved ? old.saved.filter((item) => item.crop !== crop) : [{ crop, created_at: new Date().toISOString() }, ...old.saved],
          }
        : old,
    );
  }

  function saveLanguage(newLanguage: Language) {
    setLanguageState(newLanguage);
    try {
      localStorage.setItem('language', newLanguage);
    } catch {
      // storage blocked: the language just is not remembered
    }
  }

  function saveLogin(loggedIn: User) {
    setUser(loggedIn);
    saveLanguage(loggedIn.preferred_language);
  }

  async function login(phone: string, password: string) {
    const data = await api<{ user: User }>('/users/login', { method: 'POST', body: { phone, password } });
    saveLogin(data.user);
  }

  async function register(fullName: string, phone: string, password: string) {
    const data = await api<{ user: User }>('/users/register', {
      method: 'POST',
      body: { full_name: fullName, phone, password, language },
    });
    saveLogin(data.user);
  }

  async function adminLogin(username: string, password: string) {
    await api('/admin/login', { method: 'POST', body: { username, password } });
    setAdminLoggedIn(true);
  }

  function adminLogout() {
    api('/admin/logout', { method: 'POST' }).catch(() => {});
    setAdminLoggedIn(false);
  }

  async function logout() {
    adminLogout();
    await api('/users/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setLastResult(null);
    setForecastPlace(null);
    setCrops(null);
  }

  function setNumerals(newNumerals: Numerals) {
    setNumeralsState(newNumerals);
    try {
      localStorage.setItem('numerals', newNumerals);
    } catch {
      // storage blocked: the choice is just not remembered
    }
  }

  function setTextSize(size: TextSize) {
    setTextSizeState(size);
    try {
      localStorage.setItem('textSize', size);
    } catch {
      // storage blocked: the choice is just not remembered
    }
  }

  async function setLanguage(newLanguage: Language) {
    saveLanguage(newLanguage);
    if (user) {
      api('/users/me/language', { method: 'PATCH', body: { language: newLanguage } }).catch(() => {});
    }
  }

  return (
    <AppContext
      value={{
        ready,
        user,
        language,
        t: translations[language],
        login,
        register,
        logout,
        updateUser: setUser,
        setLanguage,
        numerals,
        setNumerals,
        textSize,
        setTextSize,
        adminLoggedIn,
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
