// Shared app state: the logged-in user, their login token, and the chosen language.
// The token and language are saved on the phone with SecureStore, so the user stays logged in.

import * as SecureStore from 'expo-secure-store';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/lib/api';
import { translations, type Language } from '@/lib/translations';

export type User = { id: string; full_name: string; phone: string; preferred_language: Language };

type AppState = {
  ready: boolean;
  user: User | null;
  token: string | null;
  language: Language;
  t: (typeof translations)['en'];
  login: (phone: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  // Admin (ML dashboard) login. Kept in memory only, so closing the app logs the admin out.
  adminToken: string | null;
  adminLogin: (username: string, password: string) => Promise<void>;
  adminLogout: () => void;
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [language, setLanguageState] = useState<Language>('en');
  const [adminToken, setAdminToken] = useState<string | null>(null);

  // On app start: load the saved language and token, and check the token is still valid
  useEffect(() => {
    async function start() {
      const savedLanguage = await SecureStore.getItemAsync('language');
      if (savedLanguage === 'en' || savedLanguage === 'kn') {
        setLanguageState(savedLanguage);
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

  async function saveLogin(data: { token: string; user: User }) {
    await SecureStore.setItemAsync('token', data.token);
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
        setLanguage,
        adminToken,
        adminLogin,
        adminLogout,
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
