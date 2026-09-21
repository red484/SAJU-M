import { readFile } from 'node:fs/promises';
import { request } from 'node:https';

const apiBase = () => (process.env.TOSS_API_BASE || 'https://apps-in-toss-api.toss.im').replace(/\/+$/, '');

function tossDetail(body, fallback) {
  const error = body?.error;
  if (error && typeof error === 'object') return error.reason || error.message || error.errorCode || fallback;
  return body?.message || (typeof error === 'string' ? error : '') || fallback;
}

function success(body, fallback) {
  if (body?.resultType === 'SUCCESS' && body.success && typeof body.success === 'object') return body.success;
  const error = new Error(tossDetail(body, fallback));
  error.status = 502;
  throw error;
}

async function mtls() {
  if (!process.env.TOSS_MTLS_CERT_PATH || !process.env.TOSS_MTLS_KEY_PATH) {
    const error = new Error('Toss 로그인 인증서가 설정되지 않았습니다.');
    error.status = 503;
    throw error;
  }
  return {
    cert: await readFile(process.env.TOSS_MTLS_CERT_PATH),
    key: await readFile(process.env.TOSS_MTLS_KEY_PATH),
    passphrase: process.env.TOSS_MTLS_KEY_PASSWORD || undefined
  };
}

async function tossJson(path, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(`${apiBase()}${path}`);
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const credentials = await mtls();
  return new Promise(resolve => {
    const req = request({ ...credentials, method, hostname: url.hostname, port: url.port || 443,
      path: `${url.pathname}${url.search}`, timeout: 60_000,
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': String(payload.length) } : {}), ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { error: text || `HTTP ${res.statusCode}` }; }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });
    req.on('error', error => resolve({ status: 599, body: { error: error.message } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 598, body: { error: 'Toss API request timed out' } }); });
    if (payload) req.write(payload);
    req.end();
  });
}

export async function exchangeTossLogin({ authorizationCode, referrer }) {
  const tokenResponse = await tossJson('/api-partner/v1/apps-in-toss/user/oauth2/generate-token', {
    method: 'POST', body: { authorizationCode, referrer }
  });
  if (tokenResponse.status >= 400) {
    const error = new Error(tossDetail(tokenResponse.body, 'Toss 로그인 토큰 요청에 실패했습니다.'));
    error.status = 502;
    throw error;
  }
  const token = success(tokenResponse.body, 'Toss 로그인 토큰 요청에 실패했습니다.');
  if (!token.accessToken) throw Object.assign(new Error('Toss 로그인 토큰 응답에 accessToken이 없습니다.'), { status: 502 });
  const meResponse = await tossJson('/api-partner/v1/apps-in-toss/user/oauth2/login-me', {
    headers: { Authorization: `Bearer ${token.accessToken}` }
  });
  if (meResponse.status >= 400) {
    const error = new Error(tossDetail(meResponse.body, 'Toss 사용자 정보 요청에 실패했습니다.'));
    error.status = 502;
    throw error;
  }
  const user = success(meResponse.body, 'Toss 사용자 정보 요청에 실패했습니다.');
  const userKey = String(user.userKey || '').trim();
  if (!userKey) throw Object.assign(new Error('Toss 사용자 정보 응답에 userKey가 없습니다.'), { status: 502 });
  return { userKey };
}
