import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {TelemetryRepository} from '../src/server/repositories/telemetry-repository.mjs';

test('30-day cleanup deletes only expired operational rows, including the boundary and a backlog',async()=>{
  const db=new PGlite();
  const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
  const pool={query,async connect(){return {query,release(){}};}};
  const repo=new TelemetryRepository(pool);
  const user='12345678-1234-1234-1234-123456789012';
  const oldRun='12345678-1234-1234-1234-123456789013';
  const newRun='12345678-1234-1234-1234-123456789014';
  try {
    for(const f of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL('../server/migrations/'+f,import.meta.url),'utf8'));
    await query('BEGIN');
    await query('INSERT INTO app_users(id) VALUES($1)',[user]);
    await query("INSERT INTO anonymous_sessions(id,user_id) VALUES('device',$1)",[user]);
    await query("INSERT INTO saju_journals(session_id,user_id,payload) VALUES('device',$1,'{}')",[user]);
    await query("INSERT INTO coach_answers(user_id,request_id,question_hash,response,created_at) VALUES($1,'answer','hash','{}',now()-interval '1 year')",[user]);
    await query("INSERT INTO toss_coach_orders(order_id,user_id,sku,purchased_at,expires_at) VALUES('order',$1,'sku',now()-interval '1 year',now()-interval '11 months')",[user]);
    await query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES('token',$1,now()+interval '1 day')",[user]);
    await query("INSERT INTO usage_sessions(id,anonymous_session_id,feature,status,started_at) VALUES($1,'device','coach','completed',now()-interval '31 days')",[oldRun]);
    await query("INSERT INTO usage_sessions(id,anonymous_session_id,feature,status,started_at,completed_at) VALUES($1,'device','coach','completed',now()-interval '31 days',now())",[newRun]);
    // An old parent must not cascade into a recent child; their timestamps govern each row.
    await query("INSERT INTO llm_requests(usage_session_id,provider,status,created_at) VALUES($1,'cafe24','completed',now())",[oldRun]);
    await query("INSERT INTO llm_requests(usage_session_id,provider,status,created_at) VALUES($1,'cafe24','completed',now()-interval '30 days')",[newRun]);
    await query("INSERT INTO audit_logs(event_type,created_at) SELECT 'test',now()-interval '30 days' FROM generate_series(1,1005)");
    await query("INSERT INTO audit_logs(event_type,created_at) VALUES('recent',now()-interval '29 days')");
    const protectedTables=['app_users','anonymous_sessions','saju_journals','coach_answers','toss_coach_orders','auth_sessions'];
    const before=await Promise.all(protectedTables.map(async t=>(await query(`SELECT * FROM ${t}`)).rows));
    assert.deepEqual(await repo.deleteExpiredLogs(),{llm_requests:1,audit_logs:1000,usage_sessions:1});
    assert.deepEqual(await repo.deleteExpiredLogs(),{llm_requests:0,audit_logs:5,usage_sessions:0});
    assert.deepEqual(await repo.deleteExpiredLogs(),{llm_requests:0,audit_logs:0,usage_sessions:0});
    assert.equal((await query('SELECT usage_session_id FROM llm_requests')).rows[0].usage_session_id,null);
    assert.equal((await query('SELECT id FROM usage_sessions')).rows[0].id,newRun);
    assert.equal((await query('SELECT event_type FROM audit_logs')).rows[0].event_type,'recent');
    const after=await Promise.all(protectedTables.map(async t=>(await query(`SELECT * FROM ${t}`)).rows));
    assert.deepEqual(after,before);
    await query('COMMIT');
  } finally {await db.close();}
});

test('a failed operational cleanup rolls back the entire batch and releases its connection',async()=>{
  const sql=[];
  const repo=new TelemetryRepository({async connect(){return {async query(text){sql.push(text);if(text.includes('DELETE FROM audit_logs'))throw new Error('test failure');return {rowCount:1};},release(){sql.push('release');}};}});
  await assert.rejects(repo.deleteExpiredLogs(),/test failure/);
  assert.equal(sql[0],'BEGIN');
  assert.deepEqual(sql.slice(-2),['ROLLBACK','release']);
  assert.ok(!sql.includes('COMMIT'));
});
