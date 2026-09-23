// Small helper for calling the GreenRoot backend.
// Errors come back as short codes (e.g. "login_failed") so the app can show them in English or Kannada.

import Constants from 'expo-constants';

const BACKEND_PORT = 4000;
// A recommendation reads soil, climate and terrain from three outside services, so it can take a
// while the first time for a place. After this the app stops waiting and offers "try again".
const TIMEOUT_MS = 150_000;

// Where is the backend?
//  1. EXPO_PUBLIC_API_URL from .env, if it is set (needed for a built APK).
//  2. Otherwise the PC running `npx expo start`: the app already talks to it for the code itself,
//     so the backend is on that same PC. This keeps working when the Wi-Fi gives the PC a new address.
//  3. An Android emulator reaches the PC it runs on as 10.0.2.2, never as localhost.
function backendUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) {
    return fromEnv;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host) {
    return undefined; // a built app with no address set
  }
  const onThisMachine = host === 'localhost' || host === '127.0.0.1';
  const reachableHost = onThisMachine && process.env.EXPO_OS === 'android' ? '10.0.2.2' : host;
  return `http://${reachableHost}:${BACKEND_PORT}`;
}

const API_URL = backendUrl();

export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export async function api<T>(path: string, options: { method?: string; body?: object; token?: string | null } = {}) {
  let response: Response;
  try {
    response = await fetch(API_URL + path, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // no answer, no internet, or the server took too long
    throw new ApiError('network');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error ?? 'server_error');
  }
  return data as T;
}
