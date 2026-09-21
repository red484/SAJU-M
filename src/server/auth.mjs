import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { readBody, sendJson, validateOrigin } from './http.mjs';
import { expiredSessionCookie, getSession, secureCookie, sessionCookie, sessionId } from './session.mjs';
import { exchangeTossLogin } from './toss-auth.mjs';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const cookie = (name, value, req, maxAge, sameSite = 'Lax') => `${name}=${value}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secureCookie(req)}`;
const readCookie = (req, name) => req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] || '';
const authToken = req => {
  const bearer = String(req.headers.authorization || '');
  return bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : readCookie(req, 'dalbit_auth');
};
const safeReturn = value => String(value || '/settings').startsWith('/') && !String(value).startsWith('//') ? String(value) : '/settings';
const configured = provider => provider === 'google'
  ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  : provider === 'apple'
    ? Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && (process.env.APPLE_PRIVATE_KEY_B64 || process.env.APPLE_PRIVATE_KEY))
    : provider === 'toss' && (process.env.TOSS_LOGIN_MOCK === 'true' || Boolean(process.env.TOSS_MTLS_CERT_PATH && process.env.TOSS_MTLS_KEY_PATH));

export function applePrivateKey() {
  const encoded = process.env.APPLE_PRIVATE_KEY_B64?.trim();
  if (encoded) return Buffer.from(encoded, 'base64').toString('utf8').trim();
  return (process.env.APPLE_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n');
}

function baseUrl(req) {
  if (process.env.AUTH_BASE_URL) return process.env.AUTH_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

async function appleSecret() {
  const key = await importPKCS8(applePrivateKey(), 'ES256');
  return new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })
    .setIssuer(process.env.APPLE_TEAM_ID).setSubject(process.env.APPLE_CLIENT_ID)
    .setAudience('https://appleid.apple.com').setIssuedAt().setExpirationTime('5m').sign(key);
}

async function exchange(provider, code, redirectUri, nonce) {
  const body = new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  let endpoint, audience, keys, issuer;
  if (provider === 'google') {
    endpoint = 'https://oauth2.googleapis.com/token'; audience = process.env.GOOGLE_CLIENT_ID; keys = googleKeys; issuer = GOOGLE_ISSUERS;
    body.set('client_id', audience); body.set('client_secret', process.env.GOOGLE_CLIENT_SECRET);
  } else {
    endpoint = 'https://appleid.apple.com/auth/token'; audience = process.env.APPLE_CLIENT_ID; keys = appleKeys; issuer = 'https://appleid.apple.com';
    body.set('client_id', audience); body.set('client_secret', await appleSecret());
  }
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const tokens = await response.json();
  if (!response.ok || !tokens.id_token) throw new Error(`${provider} token exchange failed`);
  const { payload } = await jwtVerify(tokens.id_token, keys, { audience, issuer });
  if (!nonce || payload.nonce !== nonce) throw new Error(`${provider} nonce verification failed`);
  return { provider, subject: payload.sub, email: payload.email || null, name: payload.name || null };
}

export function createAuthRoutes(repository) {
  return async function auth(req, res, url) {
    if (url.pathname === '/api/auth/providers') return sendJson(res, { google: configured('google'), apple: configured('apple'), toss: configured('toss') });
    if (url.pathname === '/api/auth/me') {
      const user = await repository.userFromToken(authToken(req));
      return sendJson(res, { user: user ? { id: user.id, name: user.display_name, email: user.email } : null });
    }
    if (url.pathname === '/api/auth/start') {
      const provider = url.searchParams.get('provider');
      if (!['google', 'apple'].includes(provider) || !configured(provider)) return sendJson(res, { error: '로그인 제공자가 설정되지 않았습니다.' }, 503);
      const state = randomBytes(24).toString('hex');
      const nonce = randomBytes(24).toString('hex');
      const redirectUri = `${baseUrl(req)}/api/auth/callback/${provider}`;
      const params = new URLSearchParams({ client_id: provider === 'google' ? process.env.GOOGLE_CLIENT_ID : process.env.APPLE_CLIENT_ID,
        redirect_uri: redirectUri, response_type: 'code', scope: provider === 'google' ? 'openid email profile' : 'name email', state, nonce });
      if (provider === 'google') { params.set('access_type', 'offline'); params.set('prompt', 'select_account'); }
      else params.set('response_mode', 'form_post');
      res.writeHead(302, { Location: `${provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://appleid.apple.com/auth/authorize'}?${params}`,
        'Set-Cookie': [cookie('dalbit_oauth_state', state, req, 600, provider === 'apple' ? 'None' : 'Lax'), cookie('dalbit_oauth_nonce', nonce, req, 600, provider === 'apple' ? 'None' : 'Lax'), cookie('dalbit_oauth_return', encodeURIComponent(safeReturn(url.searchParams.get('returnTo'))), req, 600, provider === 'apple' ? 'None' : 'Lax')] });
      return res.end();
    }
    if (url.pathname === '/api/auth/toss' && req.method === 'POST') {
      if (!configured('toss')) return sendJson(res, { error: 'Toss 로그인이 설정되지 않았습니다.' }, 503);
      if (!validateOrigin(req)) return sendJson(res, { error: '이 앱에서 다시 시도해 주세요.' }, 403);
      try {
        const body = JSON.parse(await readBody(req, 20_000) || '{}');
        if (!body.authorizationCode && process.env.TOSS_LOGIN_MOCK !== 'true') return sendJson(res, { error: 'authorizationCode가 필요합니다.' }, 400);
        const toss = process.env.TOSS_LOGIN_MOCK === 'true'
          ? { userKey: String(body.mockUserKey || 'local-dev-user'), name: String(body.mockName || '').trim() || null,
            email: String(body.mockEmail || '').trim() || null }
          : await exchangeTossLogin({ authorizationCode: body.authorizationCode, referrer: body.referrer });
        const session = getSession(req);
        const displayName = toss.name || `토스 사용자 ${toss.userKey.slice(-4)}`;
        const signed = await repository.signIn({ provider: 'toss', subject: toss.userKey,
          email: toss.email || null, name: displayName }, sessionId(session.token));
        return sendJson(res, { token: signed.token, user: { id: signed.userId, name: displayName, email: toss.email || null } });
      } catch (error) {
        console.error(JSON.stringify({ event: 'auth.failed', provider: 'toss', error: error.message }));
        return sendJson(res, { error: error.message || 'Toss 로그인에 실패했습니다.' }, error.status || 500);
      }
    }
    if (url.pathname.startsWith('/api/auth/callback/')) {
      const provider = url.pathname.split('/').pop();
      if (!['google', 'apple'].includes(provider) || !configured(provider)) return sendJson(res, { error: '로그인 제공자가 설정되지 않았습니다.' }, 503);
      let params = url.searchParams;
      if (req.method === 'POST') params = new URLSearchParams(await readBody(req, 20_000));
      if (params.get('state') !== readCookie(req, 'dalbit_oauth_state')) return sendJson(res, { error: '로그인 요청을 확인할 수 없습니다.' }, 400);
      const session = getSession(req); const anonymousId = sessionId(session.token);
      try {
        const identity = await exchange(provider, params.get('code'), `${baseUrl(req)}/api/auth/callback/${provider}`, readCookie(req, 'dalbit_oauth_nonce'));
        const signed = await repository.signIn(identity, anonymousId);
        const location = decodeURIComponent(readCookie(req, 'dalbit_oauth_return') || '%2Fsettings');
        res.writeHead(302, { Location: safeReturn(location), 'Set-Cookie': [sessionCookie(req, session), cookie('dalbit_auth', signed.token, req, 2_592_000), cookie('dalbit_oauth_state', '', req, 0), cookie('dalbit_oauth_nonce', '', req, 0), cookie('dalbit_oauth_return', '', req, 0)] });
        return res.end();
      } catch (error) { console.error(JSON.stringify({ event: 'auth.failed', provider, error: error.message })); res.writeHead(302, { Location: '/?auth=failed' }); return res.end(); }
    }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      if (!validateOrigin(req)) return sendJson(res, { error: '이 사이트에서 다시 시도해 주세요.' }, 403);
      await repository.logout(authToken(req));
      return sendJson(res, { ok: true }, 200, { 'Set-Cookie': [cookie('dalbit_auth', '', req, 0), expiredSessionCookie(req)] });
    }
    if (url.pathname === '/api/auth/account' && req.method === 'DELETE') {
      if (!validateOrigin(req)) return sendJson(res, { error: '이 사이트에서 다시 시도해 주세요.' }, 403);
      const user = await repository.userFromToken(authToken(req));
      if (!user) return sendJson(res, { error: '로그인이 필요합니다.' }, 401);
      const session = getSession(req);
      await repository.deleteAccount(user.id, sessionId(session.token));
      return sendJson(res, { ok: true }, 200, { 'Set-Cookie': [cookie('dalbit_auth', '', req, 0), expiredSessionCookie(req)] });
    }
    return sendJson(res, { error: '없는 인증 경로입니다.' }, 404);
  };
}
