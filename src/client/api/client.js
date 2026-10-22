const apiBase = typeof __DALBIT_API_BASE__ === 'undefined' ? '' : __DALBIT_API_BASE__;
export const appsInToss = typeof __APPS_IN_TOSS__ !== 'undefined' && __APPS_IN_TOSS__;
const tossAuthKey = 'dalbit-toss-auth';
const tossSessionKey = 'dalbit-toss-session';

function randomSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function tossAuthToken() {
  return appsInToss ? localStorage.getItem(tossAuthKey) || '' : '';
}

export function setTossAuthToken(token) {
  if (!appsInToss) return;
  if (token) localStorage.setItem(tossAuthKey, token);
  else localStorage.removeItem(tossAuthKey);
}

// Login hands out a fresh session; logout drops it so the next visitor starts anonymously.
export function setTossSessionToken(token) {
  if (!appsInToss) return;
  if (/^[a-f0-9]{64}$/.test(token || '')) localStorage.setItem(tossSessionKey, token);
  else localStorage.removeItem(tossSessionKey);
}

function tossSessionToken() {
  if (!appsInToss) return '';
  let token = localStorage.getItem(tossSessionKey) || '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    token = randomSessionToken();
    localStorage.setItem(tossSessionKey, token);
  }
  return token;
}

export async function apiRequest(path, options = {}) {
  const { timeout = 15_000, ...requestOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const auth = tossAuthToken();
    const session = tossSessionToken();
    const response = await fetch(`${apiBase}${path}`, {
      ...requestOptions,
      credentials: appsInToss ? 'omit' : 'include',
      headers: {
        ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...(session ? { 'X-Dalbit-Session': session } : {}),
        ...requestOptions.headers
      },
      signal: requestOptions.signal || controller.signal
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } catch (error) {
    if (controller.signal.aborted && !requestOptions.signal?.aborted) {
      const timeoutError = new Error('서버 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.');
      timeoutError.name = 'AbortError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
