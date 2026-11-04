import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import vm from 'node:vm';
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
  const block=source.slice(source.indexOf('let cleaningSessions = false;'),source.indexOf('\nasync function shutdown()'));
  let scheduled, rejectFirst, calls=0, unref=false;
  const errors=[], logs=[];
  vm.runInNewContext(block, {
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
  rejectFirst(Object.assign(new Error('private database error'),{code:'TEST_FAILURE'}));
  await new Promise(setImmediate);
  assert.deepEqual(errors,[{event:'auth.session_cleanup_failed',code:'TEST_FAILURE'}]);
  await scheduled();
  assert.equal(calls,2);
  assert.deepEqual(logs,[{event:'auth.expired_sessions_cleaned',deleted:0}]);
});
