import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {ageEligibility,AGE_NOTICE} from '../shared/age-policy.mjs';
import {readBody,sendJson,validateOrigin} from './http.mjs';
import {secureCookie} from './session.mjs';
import {createMemoryRateLimiter} from './rate-limit.mjs';
import {clientAddress} from './http.mjs';
// A restart requires confirmation again; no new deployment secret or birth-date store.
const key=randomBytes(32), ttl=30*86400;
const sign=value=>createHmac('sha256',key).update(value).digest('hex');
export function ageToken(now=Date.now()) { const value=String(Math.floor(now/1000)+ttl);return value+'.'+sign(value); }
export function ageVerified(req,now=Date.now()) {
 const token=String(req.headers['x-ongi-age']||req.headers.cookie?.match(/(?:^|;\s*)ongi_age=([^;]+)/)?.[1]||'');
 if(!/^\d{10}\.[a-f0-9]{64}$/.test(token))return false;
 const [expiry,mac]=token.split('.');
 if(!/^\d{10}$/.test(expiry||'')||!/^[a-f0-9]{64}$/.test(mac||''))return false;
 const remaining=Number(expiry)-Math.floor(now/1000);
 return remaining>0&&remaining<=ttl&&timingSafeEqual(Buffer.from(mac),Buffer.from(sign(expiry)));
}
const allowed=createMemoryRateLimiter({windowMs:60_000,max:20});
export async function ageRoute(req,res) {
 if(req.method==='GET')return sendJson(res,{verified:ageVerified(req)});
 if(req.method!=='POST')return sendJson(res,{error:'허용되지 않은 요청입니다.'},405);
 if(!validateOrigin(req))return sendJson(res,{error:'이 사이트에서 다시 확인해 주세요.'},403);
 if(!allowed(clientAddress(req)))return sendJson(res,{error:'잠시 후 다시 확인해 주세요.'},429);
 try {
  const body=JSON.parse(await readBody(req,1024));
  if(!ageEligibility(body.birth))return sendJson(res,{code:'AGE_RESTRICTED',error:AGE_NOTICE},403,{'Set-Cookie':`ongi_age=; HttpOnly; Path=/; Max-Age=0${secureCookie(req)}`});
  const token=ageToken();
  return sendJson(res,{verified:true,token},200,{'Set-Cookie':`ongi_age=${token}; HttpOnly; Path=/; Max-Age=${ttl}; SameSite=${secureCookie(req)?'None':'Lax'}${secureCookie(req)}`});
 }catch{return sendJson(res,{error:'양력 생년월일을 확인해 주세요.'},400);}
}
export function requiresAge(req,url) {
 const path=url.pathname;
 if(path==='/api/journal')return req.method!=='DELETE';
 if(['/api/coach','/api/epic'].includes(path))return req.method==='POST';
 if(path.startsWith('/api/toss-billing/'))return req.method==='POST';
 if(path==='/api/store-billing/sync')return req.method==='POST';
 if(path.startsWith('/api/relationship-invites'))return req.method==='POST';
 if(path==='/api/auth/start')return !(req.method==='POST' && url.searchParams.get('provider')==='apple' && url.searchParams.get('intent')==='delete');
 if(path.startsWith('/api/auth/callback/')){
  if(path!=='/api/auth/callback/apple')return true;
  const cookie=name=>req.headers.cookie?.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'))?.[1];
  return !(cookie('dalbit_delete_auth') && cookie('dalbit_delete_state') && cookie('dalbit_delete_state')===cookie('dalbit_oauth_state'));
 }
 return ['/api/auth/guest','/api/auth/toss','/api/auth/password/register','/api/auth/password/login'].includes(path);
}
