import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createAuthRoutes, revokeAppleTokens } from '../src/server/auth.mjs';

process.env.APPLE_CLIENT_ID='test-client';process.env.APPLE_TEAM_ID='test-team';process.env.APPLE_KEY_ID='test-key';
process.env.APPLE_PRIVATE_KEY=generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
const credentials={refreshToken:'private-refresh-token',accessToken:'private-access-token'};

test('revocation uses the Apple endpoint, prefers refresh token, fails closed and never returns credentials',async()=>{
  for(const [tokens,hint,value] of [[credentials,'refresh_token',credentials.refreshToken],[{accessToken:credentials.accessToken},'access_token',credentials.accessToken]]){
    let called;
    const result=await revokeAppleTokens(tokens,{secret:async()=> 'private-client-secret',request:async(url,options)=>{called={url,options};return {ok:true};}});
    assert.equal(result,undefined);assert.equal(called.url,'https://appleid.apple.com/auth/revoke');
    assert.equal(called.options.method,'POST');assert.equal(called.options.body.get('token_type_hint'),hint);assert.equal(called.options.body.get('token'),value);assert.ok(called.options.signal);
  }
  await assert.rejects(revokeAppleTokens({}, {request:()=>assert.fail('no request without token')}));
  await assert.rejects(revokeAppleTokens(credentials,{secret:async()=> 'secret',request:async()=>({ok:false})}),/revocation failed/);
});

function fixture({subject='apple-person',failRevoke=false}={}){
  const jar=new Map(),calls=[];let live=true;
  const repository={
    async registerPassword(){},async userFromToken(token){return live&&token==='private-auth'?{id:'owner'}:token==='different-auth'?{id:'other'}:null;},
    async appleSubject(user){return user==='owner'?'apple-person':null;},
    async deleteAccount(user){calls.push(['delete',user]);live=false;},async signIn(){calls.push(['signin']);return {token:'new-auth',userId:'owner'};}
  };
  const route=createAuthRoutes(repository,{exchangeIdentity:async(provider,code,redirect,nonce,include)=>{calls.push(['exchange',include]);if(code==='cancel')throw Error('cancelled');assert.ok(nonce);return {provider:'apple',subject,appleTokens:credentials};},revokeApple:async tokens=>{assert.deepEqual(tokens,credentials);calls.push(['revoke']);if(failRevoke)throw Error('private Apple error '+credentials.refreshToken);}});
  async function call(path,{method='GET',body='',origin='',useAuth=true}={}){
    let status,headers,text;
    const cookies=[...jar].map(([k,v])=>`${k}=${v}`);if(useAuth)cookies.push('dalbit_auth=private-auth');
    const req={method,headers:{host:'saju.example.com',cookie:cookies.join('; '),...(origin?{origin}:{}),'x-forwarded-proto':'https'},socket:{encrypted:true},async *[Symbol.asyncIterator](){if(body)yield Buffer.from(body);}};
    await route(req,{writeHead(s,h={}){status=s;headers=h;},end(v=''){text=v;}},new URL(path,'https://saju.example.com'));
    for(const cookie of [headers['Set-Cookie']||[]].flat()){const [pair]=cookie.split(';');const at=pair.indexOf('=');if(cookie.includes('Max-Age=0'))jar.delete(pair.slice(0,at));else jar.set(pair.slice(0,at),pair.slice(at+1));}
    return {status,headers,text,body:text?JSON.parse(text):null};
  }
  async function begin(returnTo=''){
    const result=await call('/api/auth/account',{method:'DELETE'});assert.equal(result.status,409);assert.equal(result.body.code,'APPLE_REAUTH_REQUIRED');assert.ok(!result.text.includes('private-auth'));
    assert.ok(!jar.has('dalbit_delete_auth'));
    const start=await call('/api/auth/start?provider=apple&intent=delete'+(returnTo?'&returnTo='+encodeURIComponent(returnTo):''),{method:'POST'});assert.equal(start.status,302);
    const proof=start.headers['Set-Cookie'].find(v=>v.startsWith('dalbit_delete_auth='));assert.match(proof,/HttpOnly; SameSite=None/);assert.match(proof,/Max-Age=600; Secure/);return jar.get('dalbit_oauth_state');
  }
  const callback=(state,code='valid')=>call('/api/auth/callback/apple',{method:'POST',body:new URLSearchParams({state,code}).toString(),useAuth:false});
  return {jar,calls,call,begin,callback,isLive:()=>live};
}

test('confirmed deletion reauthenticates the same Apple owner, revokes, then deletes without creating a new login',async()=>{
  const f=fixture();const state=await f.begin();const result=await f.callback(state);
  assert.equal(result.headers.Location,'/?account=deleted');assert.deepEqual(f.calls,[['exchange',true],['revoke'],['delete','owner']]);assert.equal(f.isLive(),false);
  assert.ok(!result.text.includes('private'));assert.ok(!f.jar.has('dalbit_delete_auth'));
  assert.equal((await f.call('/api/auth/deletion-result',{useAuth:false})).body.deleted,true);
  assert.equal((await f.call('/api/auth/deletion-result',{useAuth:false})).body.deleted,false);
});

test('wrong Apple account, cancellation, expired confirmation and failed revocation preserve the account',async()=>{
  const original=console.error,logs=[];console.error=v=>logs.push(v);
  try {
    for(const [options,code,expire] of [[{subject:'other-person'},'valid',false],[{},'cancel',false],[{failRevoke:true},'valid',false],[{},'valid',true]]){
      const f=fixture(options),state=await f.begin();if(expire)f.jar.delete('dalbit_delete_auth');
      const result=await f.callback(state,code);assert.equal(result.headers.Location,'/settings?deletion=failed');assert.equal(f.isLive(),true);assert.ok(!f.calls.some(c=>c[0]==='delete'));assert.ok(!f.jar.has('dalbit_delete_auth'));
    }
    assert.ok(!logs.join('').includes('private'));
  }finally{console.error=original;}
});

test('deletion requires the original confirmed login and matching OAuth state; explicit manual path still works',async()=>{
  const f=fixture();assert.equal((await f.call('/api/auth/start?provider=apple&intent=delete')).status,405);
  assert.equal((await f.call('/api/auth/start?provider=apple&intent=delete',{method:'POST',useAuth:false})).status,401);
  assert.equal((await f.call('/api/auth/start?provider=apple&intent=delete',{method:'POST',origin:'https://evil.example'})).status,403);
  assert.equal((await f.call('/api/auth/account',{method:'DELETE',origin:'https://evil.example'})).status,403);
  const state=await f.begin();assert.equal((await f.callback(state+'wrong')).status,400);assert.equal(f.calls.length,0);
  assert.equal((await f.call('/api/auth/account',{method:'DELETE',body:'{"manualAppleRevocation":"true"}'})).status,409);
  assert.equal((await f.call('/api/auth/account',{method:'DELETE',body:'{"manualAppleRevocation":true}'})).status,200);assert.deepEqual(f.calls,[['delete','owner']]);
  const normal=fixture();await normal.begin();await normal.call('/api/auth/start?provider=apple');assert.ok(!normal.jar.has('dalbit_delete_auth'));assert.ok(!normal.jar.has('dalbit_delete_state'));
});

test('direct deletion returns to the public page on success and failure without an arbitrary redirect',async()=>{
 for(const failRevoke of [false,true]){
  const f=fixture({failRevoke}),state=await f.begin('/account-deletion/?account=deleted');
  const result=await f.callback(state);
  assert.equal(result.headers.Location,failRevoke?'/account-deletion/?deletion=failed':'/account-deletion/?account=deleted');
 }
 const f=fixture(),state=await f.begin('/untrusted-target');assert.equal((await f.callback(state)).headers.Location,'/?account=deleted');
});
