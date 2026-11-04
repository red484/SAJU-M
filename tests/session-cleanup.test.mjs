import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import vm from 'node:vm';
import { errorDetails } from '../src/server/logging.mjs';
import { AuthRepository } from '../src/server/repositories/auth-repository.mjs';

const digest = token => createHash('sha256').update(token).digest('hex');
test('expired authentication cleanup is bounded and preserves accounts, journals and purchases', async () => {
  const db = new PGlite();
  const query = async (sql, args=[]) => {
    const result = await db.query(sql, args);
    return {...result, rowCount: result.affectedRows || result.rows.length};
  };
  const pool = {query, async connect() {return {query, release() {}};}};
  const auth = new AuthRepository(pool);
  const user='12345678-1234-1234-1234-123456789012';
  try {
    for (const file of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL('../server/migrations/'+file,import.meta.url),'utf8'));
    await query('INSERT INTO app_users(id) VALUES($1)',[user]);
    await query("INSERT INTO auth_identities(id,user_id,provider,provider_subject) VALUES($1,$1,'toss','tester')",[user]);
    await query("INSERT INTO anonymous_sessions(id,user_id,expires_at) VALUES('anonymous',$1,now()-interval '1 year')",[user]);
    const journal={profile:{name:'보존할 테스트'},conversations:[],records:[],savedAnswers:[]};
    await query("INSERT INTO saju_journals(session_id,user_id,payload) VALUES('anonymous',$1,$2::jsonb)",[user,JSON.stringify(journal)]);
    await query("INSERT INTO coach_answers(user_id,request_id,question_hash,response) VALUES($1,'answer','hash','{}')",[user]);
    await query("INSERT INTO toss_coach_orders(order_id,user_id,sku,purchased_at,expires_at) VALUES('order',$1,'sku',now()-interval '1 year',now()-interval '11 months')",[user]);
    await query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[digest('valid'),user]);
    await query(`INSERT INTO auth_sessions(token_hash,user_id,expires_at)
      SELECT md5(n::text)||md5(n::text),$1,now()-interval '1 second' FROM generate_series(1,2345) AS n`,[user]);
    await query('BEGIN');
    await query('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now())',[digest('boundary'),user]);
    const preserved=['app_users','auth_identities','anonymous_sessions','saju_journals','coach_answers','toss_coach_orders'];
    const before = await Promise.all(preserved.map(async table=>(await query(`SELECT * FROM ${table}`)).rows));
    assert.equal(await auth.userFromToken('boundary'),null);
    assert.equal(await auth.deleteExpiredSessions(),1000);
    assert.equal(await auth.deleteExpiredSessions(),1000);
    assert.equal(await auth.deleteExpiredSessions(),346);
    assert.equal(await auth.deleteExpiredSessions(),0);
    assert.equal((await query('SELECT token_hash FROM auth_sessions')).rows[0].token_hash,digest('valid'));
    assert.equal((await auth.userFromToken('valid')).id,user);
    assert.equal(await auth.userFromToken('boundary'),null);
    const after = await Promise.all(preserved.map(async table=>(await query(`SELECT * FROM ${table}`)).rows));
    assert.deepEqual(after,before);
    await query('COMMIT');
    const signed=await auth.signIn({provider:'toss',subject:'tester'},'anonymous','fresh');
    assert.equal((await auth.userFromToken(signed.token)).id,user);
    assert.deepEqual((await query('SELECT payload FROM saju_journals WHERE user_id=$1',[user])).rows[0].payload,journal);
  } finally {await db.close();}
});


test('scheduled cleanup skips overlapping runs and retries after a database failure', async () => {
  const source=await readFile(new URL('../server/index.mjs',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('let cleaningData = false;'),source.indexOf('\nasync function shutdown()'));
  let scheduled, rejectFirst, calls=0, unref=false;
  const errors=[], logs=[];
  vm.runInNewContext(block, {
    errorDetails,
    telemetryRepository: {async deleteExpiredLogs() {return {llm_requests:0,audit_logs:0,usage_sessions:0,product_event_counts:0};}},
    authRepository: {deleteExpiredSessions() {
      calls++;
      return calls===1?new Promise((_,reject)=>{rejectFirst=reject;}):Promise.resolve(0);
    }},
    console: {log: value=>logs.push(JSON.parse(value)),error:value=>errors.push(JSON.parse(value))},
    setInterval(callback, milliseconds) {
      assert.equal(milliseconds,60*60*1000);scheduled=callback;
      return {unref() {unref=true;}};
    }
  });
  assert.ok(unref);
  await scheduled();
  assert.equal(calls,1,'startup pass must not overlap the periodic pass');
  rejectFirst(Object.assign(new Error('private database error'),{code:'ECONNRESET'}));
  await new Promise(setImmediate);
  assert.deepEqual(errors,[{event:'auth.session_cleanup_failed',code:'ECONNRESET'}]);
  await scheduled();
  assert.equal(calls,2);
  assert.deepEqual(logs.filter(log=>log.event.startsWith('auth.')),[{event:'auth.expired_sessions_cleaned',deleted:0}]);
});

test('account journal requires the matching live login for reads, writes and deletion', async () => {
  const {PostgresJournalRepository}=await import('../src/server/repositories/postgres-journal-repository.mjs');
  const {createJournalRoute}=await import('../src/server/routes/journal.mjs');
  const db=new PGlite();
  const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
  const pool={query,async connect(){return {query,release(){}};}};
  const auth=new AuthRepository(pool), journals=new PostgresJournalRepository(pool);
  const route=createJournalRoute(journals,auth);
  const device='a'.repeat(64), id=digest(device), anonymous='b'.repeat(64);
  const journal={profile:null,records:[],conversations:[],savedAnswers:[]};
  async function call(method,token,session=device,revision=1,asCookie=false) {
    let status;
    const headers={cookie:`dalbit_session=${session}`+(asCookie?`; dalbit_auth=${token}`:''), ...(token&&!asCookie?{authorization:`Bearer ${token}`}:{})};
    const req={method,headers,socket:{encrypted:false},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({data:journal,revision}));}};
    let body;
    await route(req,{writeHead(value){status=value;},end(value){body=JSON.parse(value);}});
    return {status,body};
  }
  try {
    for(const file of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL('../server/migrations/'+file,import.meta.url),'utf8'));
    await journals.put(id,journal,0);
    const expired=await auth.signIn({provider:'toss',subject:'owner'},id,id);
    await query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[digest(expired.token)]);
    const live=await auth.signIn({provider:'toss',subject:'owner'},id,id);
    const other=await auth.signIn({provider:'toss',subject:'other'},'other','other');
    for(const method of ['GET','PUT','DELETE'])for(const token of [null,expired.token,other.token]){
      const out=await call(method,token);
      assert.equal(out.status,401,method);
      assert.equal(out.body.code,'AUTH_REQUIRED');
      assert.equal(out.body.data,undefined);
    }
    await auth.deleteExpiredSessions();
    assert.equal((await call('GET',expired.token)).status,401);
    assert.deepEqual((await call('GET',live.token)).body.data,journal);
    assert.deepEqual((await call('GET',live.token,device,1,true)).body.data,journal);
    assert.equal((await call('PUT',live.token)).status,200);
    assert.deepEqual((await journals.get(id)).data,journal);
    await journals.put(digest(anonymous),journal,0);
    assert.equal((await call('GET',null,anonymous)).status,200);
    assert.equal((await call('PUT',null,anonymous)).status,200);
    assert.equal((await call('DELETE',null,anonymous)).status,200);
    await auth.deleteAccount(other.userId,id);
    assert.deepEqual((await journals.get(id)).data,journal,'deleting another account cannot remove this journal');
    assert.equal((await auth.userFromToken(live.token)).id,live.userId);
    await query('UPDATE anonymous_sessions SET user_id=NULL WHERE id=$1',[id]);
    const third=await auth.signIn({provider:'toss',subject:'third'},'third','third');
    await auth.deleteAccount(third.userId,id);
    assert.deepEqual((await query('SELECT payload FROM saju_journals WHERE user_id=$1',[live.userId])).rows[0].payload,journal,'legacy unlinked journals must survive another account deletion');
  } finally {await db.close();}
});

test('HTTP password re-login restores the journal after authentication expires', async()=>{
  const {createServer}=await import('node:http');
  const {createApiHandler}=await import('../src/server/api-handler.mjs');
  const {PostgresJournalRepository}=await import('../src/server/repositories/postgres-journal-repository.mjs');
  const db=new PGlite();
  const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
  const pool={query,async connect(){return {query,release(){}};}};
  let server;
  try {
    for(const file of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL('../server/migrations/'+file,import.meta.url),'utf8'));
    const auth=new AuthRepository(pool);
    const api=createApiHandler({journalRepository:new PostgresJournalRepository(pool),authRepository:auth});
    server=createServer((req,res)=>void api(req,res));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    let cookies=new Map();
    const request=async(path,method='GET',body)=>{
      const response=await fetch(base+path,{method,headers:{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/json'},...(body&&method!=='GET'?{body:JSON.stringify(body)}:{})});
      for(const line of response.headers.getSetCookie()){
        const pair=line.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));
      }
      return {status:response.status,body:await response.json()};
    };
    const journal={profile:null,records:[{id:'kept',title:'복원할 기록'}],conversations:[],savedAnswers:[]};
    await request('/api/journal');
    assert.equal((await request('/api/journal','PUT',{data:journal,revision:0})).status,200);
    const password='test-only-password-123';
    const registered=await request('/api/auth/password/register','POST',{password,acknowledgeRecovery:true});
    assert.equal(registered.status,200);
    const oldCookies=new Map(cookies);
    await query("UPDATE auth_sessions SET expires_at=now()-interval '1 second'");
    for(const method of ['GET','PUT','DELETE'])assert.equal((await request('/api/journal',method,{data:journal,revision:1})).status,401);
    assert.equal(await auth.deleteExpiredSessions(),1);
    assert.equal((await request('/api/auth/me')).body.user,null);
    assert.equal((await request('/api/auth/password/login','POST',{loginId:registered.body.loginId,password})).status,200);
    assert.deepEqual((await request('/api/journal')).body.data,journal);
    cookies=oldCookies;
    assert.equal((await request('/api/journal')).body.data,null,'rotated session must not retain access to the account');
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await db.close();
  }
});


test('scheduled retention drains batches of expired operational logs in the same run',async()=>{
  const source=await readFile(new URL('../server/index.mjs',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('let cleaningData = false;'),source.indexOf('\nasync function shutdown()'));
  const logs=[];let calls=0;
  vm.runInNewContext(block,{
    errorDetails,authRepository:{async deleteExpiredSessions(){return 0;}},
    telemetryRepository:{async deleteExpiredLogs(){calls++;return {llm_requests:0,audit_logs:calls===1?1000:5,usage_sessions:0,product_event_counts:0};}},
    console:{log:v=>logs.push(JSON.parse(v)),error(){assert.fail('unexpected cleanup error');}},
    setInterval(){return {unref(){}};}
  });
  await new Promise(setImmediate);
  assert.equal(calls,2);
  assert.deepEqual(logs.find(log=>log.event==='operational.expired_logs_cleaned').deleted,{llm_requests:0,audit_logs:1005,usage_sessions:0,product_event_counts:0});
});
