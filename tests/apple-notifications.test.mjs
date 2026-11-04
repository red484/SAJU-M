import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { verifyAppleNotification, createAppleNotificationRoute } from '../src/server/apple-notifications.mjs';
import { AuthRepository } from '../src/server/repositories/auth-repository.mjs';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), alg: 'RS256', kid: 'test' }] });
const now = Math.floor(Date.now() / 1000);
const event={ type:'consent-revoked',sub:'private-apple-subject',event_time:now-60 };
const token=(events=event, options={})=>new SignJWT({events,...options.claims}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(options.issuer||'https://appleid.apple.com').setAudience(options.audience||'test-app').setIssuedAt(now).setJti('private-jti').sign(privateKey);
const verify=value=>verifyAppleNotification(value,{audience:'test-app',keys});
const call=(route,body,method='POST')=>new Promise((resolve,reject)=>{
  let status;const req={method,headers:{},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from(typeof body==='string'?body:JSON.stringify(body));}};
  route(req,{writeHead(s){status=s;},end(value){resolve({status,body:JSON.parse(value)});}}).catch(reject);
});

test('Apple JWT signature, issuer, audience, claims and event timestamps are validated',async()=>{
  assert.deepEqual(await verify(await token()),{type:event.type,subject:event.sub,eventTime:event.event_time});
  assert.deepEqual(await verify(await token(JSON.stringify(event))),{type:event.type,subject:event.sub,eventTime:event.event_time});
  for(const value of [await token(event,{issuer:'https://evil.example'}),await token(event,{audience:'other-app'}),await token({...event,event_time:now+120}),await token({...event,event_time:now+30}),await token({...event,sub:''}),await token({...event,event_time:'123'}),await new SignJWT({events:event}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://appleid.apple.com').setAudience('test-app').setIssuedAt(now).sign(privateKey),'not-a-jwt'])await assert.rejects(verify(value));
  const signed=await token();await assert.rejects(verify(signed.slice(0,-10)+'tampered'));
});

test('only verified sign-out events reach the repository; ignored events reveal no user existence',async()=>{
  const calls=[];const repo={async revokeAppleSessions(...args){calls.push(args);return 2;}};
  const route=createAppleNotificationRoute(repo,{verify,audience:()=> 'test-app'});
  for(const type of ['consent-revoked','account-deleted','account-delete'])assert.equal((await call(route,{payload:await token({...event,type})})).status,200);
  assert.equal(calls.length,3);assert.deepEqual(calls[0],[event.sub,event.event_time]);
  for(const type of ['email-disabled','unknown'])assert.equal((await call(route,{payload:await token({...event,type})})).status,200);
  assert.equal(calls.length,3);
  for(const body of [{payload:'bad'},null,'{',{}])assert.equal((await call(route,body)).status,400);
  assert.equal((await call(route,'x'.repeat(32769))).status,413);
  assert.equal((await call(route,{},'GET')).status,405);
  assert.equal((await call(createAppleNotificationRoute(repo,{audience:()=>''}),{})).status,503);
  const temporarilyDown=createAppleNotificationRoute(repo,{verify:async()=>{throw Object.assign(new Error('private upstream'),{code:'ERR_JWKS_TIMEOUT'});},audience:()=> 'test-app'});
  assert.equal((await call(temporarilyDown,{payload:'jwt'})).status,503);
  const logs=[],original=console.error;console.error=value=>logs.push(value);
  try {
    const failed=createAppleNotificationRoute({async revokeAppleSessions(){throw new Error('private detail '+event.sub);}},{verify,audience:()=> 'test-app'});
    const result=await call(failed,{payload:await token()});assert.equal(result.status,503);
    assert.ok(!JSON.stringify(result).includes(event.sub));assert.ok(!logs.join('').includes('private'));
  }finally{console.error=original;}
});

test('duplicate and delayed notifications remove only pre-event Apple sessions, preserving accounts and journals',async()=>{
  const db=new PGlite();const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
  try {
    for(const f of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../server/migrations/'+f,import.meta.url),'utf8'));
    const user='12345678-1234-1234-1234-123456789012',other='12345678-1234-1234-1234-123456789013';
    await query('INSERT INTO app_users(id) VALUES($1),($2)',[user,other]);
    await query("INSERT INTO auth_identities(id,user_id,provider,provider_subject) VALUES($1,$1,'apple',$3),($2,$2,'google',$3)",[user,other,event.sub]);
    await query("INSERT INTO anonymous_sessions(id,user_id) VALUES('device',$1)",[user]);
    await query("INSERT INTO saju_journals(session_id,user_id,payload) VALUES('device',$1,'{\"private\":true}')",[user]);
    await query(`INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES
      ('old',$1,to_timestamp($3)-interval '1 second',now()+interval '1 day'),
      ('boundary',$1,to_timestamp($3),now()+interval '1 day'),
      ('new-login',$1,to_timestamp($3)+interval '1 second',now()+interval '1 day'),
      ('other',$2,to_timestamp($3)-interval '1 day',now()+interval '1 day')`,[user,other,event.event_time]);
    const before=(await query('SELECT * FROM saju_journals')).rows;
    const repo=new AuthRepository({query});
    assert.equal(await repo.revokeAppleSessions(event.sub,event.event_time),2);
    assert.equal(await repo.revokeAppleSessions(event.sub,event.event_time),0);
    assert.equal(await repo.revokeAppleSessions('unknown',event.event_time),0);
    assert.deepEqual((await query('SELECT token_hash FROM auth_sessions ORDER BY token_hash')).rows.map(r=>r.token_hash),['new-login','other']);
    assert.deepEqual((await query('SELECT * FROM saju_journals')).rows,before);
    assert.equal((await query('SELECT count(*)::int AS count FROM app_users')).rows[0].count,2);
  }finally{await db.close();}
});
