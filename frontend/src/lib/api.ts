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

// Plain http is only safe on this PC or your own Wi-Fi (development and the demo APK). Anywhere else the
// password and login token would travel readable, so the app refuses to talk to such an address:
// use an https address there.
function isPrivateAddress(host: string) {
  return (
    host === 'localhost' ||
    host === '10.0.2.2' || // an Android emulator's name for the PC
    /^(127|10)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

function safeUrl(url: string | undefined) {
  if (!url || url.startsWith('https://')) {
    return url;
  }
  const host = url.replace(/^http:\/\//, '').split(/[:/]/)[0];
  if (isPrivateAddress(host)) {
    return url;
  }
  console.warn(`GreenRoot: ${url} is plain http on a public address, so it is not used. Use an https address.`);
  return undefined;
}

const API_URL = safeUrl(backendUrl());

// The address of a file the backend serves, such as a crop photo ("crop-images/rice/4-seeds.jpg").
// Undefined when there is no usable backend address: the photo then shows its placeholder.
export function fileUrl(path: string) {
  return API_URL === undefined ? undefined : `${API_URL}/${path}`;
}

export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

// The app sets this: what to do when the server says the login has run out (logins last 30 days)
let onLoginExpired = () => {};
export function whenLoginExpires(handler: () => void) {
  onLoginExpired = handler;
}

export async function api<T>(path: string, options: { method?: string; body?: object; token?: string | null } = {}) {
  let response: Response;
  if (API_URL === undefined) {
    throw new ApiError('network'); // no usable address (see safeUrl)
  }
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
    if (data.error === 'login_required') {
      onLoginExpired();
    }
    throw new ApiError(data.error ?? 'server_error');
  }
  return data as T;
}
