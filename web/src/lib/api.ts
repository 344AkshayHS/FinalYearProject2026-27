// Small helper for calling the GreenRoot backend, like frontend/src/lib/api.ts does for the phone app.
// Errors come back as short codes (e.g. "login_failed") so the page can show them in English or Kannada.
//
// Every call goes to "/api/..." on the website's own address. Login is an httpOnly cookie the browser
// keeps and sends by itself: this code never sees or stores the login token.

// A recommendation reads soil, climate and terrain from three outside services, so it can take a
// while the first time for a place. After this the page stops waiting and offers "try again".
const TIMEOUT_MS = 150_000;

export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

// The app state sets this: what to do when the backend says the login has run out
let onLoginExpired = () => {};
export function whenLoginExpires(handler: () => void) {
  onLoginExpired = handler;
}

export async function api<T>(path: string, options: { method?: string; body?: object } = {}) {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Tells the backend this is the website: it answers logins with a cookie, and only accepts
        // changes that also come from our own address (protection against forged requests)
        'X-Client': 'web',
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
