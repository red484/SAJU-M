import { apiRequest, appsInToss, setTossAuthToken } from './client.js';

export const authProviders = () => apiRequest('/api/auth/providers');
export const currentUser = () => apiRequest('/api/auth/me');
export const logout = () => apiRequest('/api/auth/logout', { method: 'POST' });
export const deleteAccount = () => apiRequest('/api/auth/account', { method: 'DELETE' });
export const loginUrl = provider => `/api/auth/start?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent('/?auth=success')}`;

export async function loginWithToss() {
  if (!appsInToss) throw new Error('토스 앱 안에서만 사용할 수 있어요.');
  const { appLogin } = await import('@apps-in-toss/web-framework');
  const payload = await appLogin();
  const result = await apiRequest('/api/auth/toss', {
    method: 'POST',
    body: JSON.stringify({ authorizationCode: payload.authorizationCode, referrer: payload.referrer })
  });
  if (!result.response.ok || !result.body.token) throw new Error(result.body.error || '토스 로그인을 완료하지 못했어요.');
  setTossAuthToken(result.body.token);
  return result;
}

export function clearTossLogin() { setTossAuthToken(''); }
export const isAppsInToss = () => appsInToss;
