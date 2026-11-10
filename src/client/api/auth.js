import { apiRequest, appsInToss, setTossAuthToken, setTossSessionToken } from './client.js';
import { Capacitor, registerPlugin } from '@capacitor/core';

export const authProviders = () => apiRequest('/api/auth/providers');
export const currentUser = () => apiRequest('/api/auth/me');
export const logout = async () => { const result=await apiRequest('/api/auth/logout', { method: 'POST' });if(result.response.ok){try{sessionStorage.removeItem('ongi-age-token');}catch{}}return result; };
export const deleteAccount = (manualAppleRevocation = false, expectedUserId) => apiRequest('/api/auth/account', { method: 'DELETE',
  ...((manualAppleRevocation || expectedUserId !== undefined) ? { body: JSON.stringify({ ...(manualAppleRevocation ? {manualAppleRevocation:true} : {}), ...(expectedUserId !== undefined ? {expectedUserId} : {}) }) } : {}) });
export const deletionResult = () => apiRequest('/api/auth/deletion-result');
export const loginUrl = provider => `/api/auth/start?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent('/?auth=success')}`;

export async function loginGoogleInBrowser() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
  const automatic = Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('OngiAuth');
  const created = await apiRequest('/api/auth/native/create', { method: 'POST', body: JSON.stringify({ challenge, returnToApp: automatic }) });
  if (!created.response.ok) throw new Error(created.body.error || '로그인을 시작하지 못했어요.');
  const url = new URL(created.body.url);
  if (url.origin !== location.origin || url.pathname !== '/api/auth/native/start') throw new Error('로그인 주소를 확인하지 못했어요.');
  const ticket = url.searchParams.get('ticket');
  if (!/^[a-f0-9]{64}$/.test(ticket || '')) throw new Error('로그인 요청을 확인하지 못했어요.');
  let Browser, cancelled = false;
  if (automatic) {
    const result = await registerPlugin('OngiAuth').open({ url: url.href });
    cancelled = !result.completed;
  } else {
    ({ Browser } = await import('@capacitor/browser'));
    await Browser.open({ url: url.href });
  }
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const result = await apiRequest('/api/auth/native/complete', { method: 'POST', body: JSON.stringify({ ticket, verifier }) });
    if (!result.response.ok) throw new Error(result.body.error || '로그인을 완료하지 못했어요.');
    if (result.body.ok) { if (Browser) await Browser.close().catch(() => {}); return; }
    if (cancelled) throw new Error('로그인이 취소됐어요. 다시 시도해 주세요.');
  }
  throw new Error('로그인 시간이 지났어요. 다시 시도해 주세요.');
}

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
  if (result.body.session) setTossSessionToken(result.body.session);
  return result;
}

export function clearTossLogin() { setTossAuthToken(''); setTossSessionToken(''); }
export const isAppsInToss = () => appsInToss;
