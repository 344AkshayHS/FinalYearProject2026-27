// Shared state of the website, like frontend/src/lib/app-context.tsx in the phone app:
// the logged-in user, the chosen language, and a summary of the farmer's last result (so the crop
// helper chat can answer "can I grow rice here?").
//
// The phone keeps its login token in SecureStore. The website does not keep any token: the backend
// puts it in an httpOnly cookie. All the page knows is "who am I?", which it asks with GET /users/me.

import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { api, whenLoginExpires } from '~/lib/api';
import type { FarmSummary } from '@/lib/chatbot';
import { translations, type Language } from '@/lib/translations';

export type User = { id: string; full_name: string; phone: string; preferred_language: Language };

type AppState = {
  ready: boolean;
  user: User | null;
  language: Language;
  t: (typeof translations)['en'];
  login: (phone: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  // Admin (ML dashboard) login. Only remembered while this page stays open, like on the phone.
  adminLoggedIn: boolean;
  adminLogin: (username: string, password: string) => Promise<void>;
  adminLogout: () => void;
  // The last "Find crops" result, in memory only
  farm: FarmSummary | null;
  setFarm: (farm: FarmSummary | null) => void;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [language, setLanguageState] = useState<Language>(savedLanguage);
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [farm, setFarm] = useState<FarmSummary | null>(null);

  // The page follows the language: the browser reads Kannada text with the right font and spelling rules
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // On start: is there a valid login cookie? Also, if the backend ever says the login ran out, log out
  useEffect(() => {
    whenLoginExpires(() => {
      setUser(null);
      setAdminLoggedIn(false);
      setFarm(null);
    });
    api<{ user: User }>('/users/me')
      .then((data) => setUser(data.user))
      .catch(() => {}) // not logged in (or the server is down): the login page shows
      .finally(() => setReady(true));
  }, []);

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
    setFarm(null);
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
        setLanguage,
        adminLoggedIn,
        adminLogin,
        adminLogout,
        farm,
        setFarm,
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
