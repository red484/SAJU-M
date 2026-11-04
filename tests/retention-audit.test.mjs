import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { retentionAudit } from '../src/server/retention-audit.mjs';

const privateMarker='private-order-user-question-response';

test('retention report inventories overlapping states without exposing contents or modifying records',async()=>{
  const db=new PGlite();
  const query=(sql,args=[])=>db.query(sql,args);
  const sql=[];
  const pool={async connect(){return {async query(text,args){sql.push(text);return query(text,args);},release(){}};}};
  try {
    for(const file of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../server/migrations/'+file,import.meta.url),'utf8'));
    const user='12345678-1234-1234-1234-123456789012',deleted='12345678-1234-1234-1234-123456789013';
    await query('INSERT INTO app_users(id) VALUES($1),($2)',[user,deleted]);
    await query(`INSERT INTO toss_coach_orders(order_id,user_id,sku,purchased_at,expires_at,used,refunded,created_at) VALUES
      ($1,$2,'sku',now(),now()+interval '30 days',0,false,now()),
      ('expired',$2,'sku',now()-interval '2 years',now()-interval '1 year',0,false,now()-interval '1 year'),
      ('refunded',$2,'sku',now(),now()+interval '30 days',0,true,now()),
      ('exhausted',$2,'sku',now(),now()+interval '30 days',50,false,now()),
      ('deleted',$3,'sku',now(),now()+interval '30 days',0,false,now()),
      ('future',$2,'sku',now()+interval '2 minutes',now()+interval '30 days',0,false,now())`,[privateMarker,user,deleted]);
    await query(`INSERT INTO coach_answers(user_id,request_id,question_hash,response,created_at) VALUES
      ($1,'recent',$2,$3,now()),($1,'old',$2,$3,now()-interval '1 year'),($4,'deleted',$2,$3,now())`,[user,privateMarker,JSON.stringify({text:privateMarker}),deleted]);
    await query('DELETE FROM app_users WHERE id=$1',[deleted]);
    await query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES('expired',$1,now()-interval '1 second'),('recent',$1,now()+interval '1 day')",[user]);
    await query("INSERT INTO usage_sessions(id,feature,status,started_at,completed_at) VALUES($1,'coach','completed',now()-interval '31 days',now()),($2,'coach','started',now()-interval '31 days',NULL)",[user,deleted]);
    await query("INSERT INTO llm_requests(provider,status,created_at) VALUES('cafe24','completed',now()-interval '31 days'),('cafe24','completed',now())");
    await query("INSERT INTO audit_logs(event_type,created_at) VALUES('test',now()-interval '31 days')");
    await query("INSERT INTO product_event_counts(day,event,channel) VALUES((now() AT TIME ZONE 'Asia/Seoul')::date-30,'choice_saved','web'),((now() AT TIME ZONE 'Asia/Seoul')::date-29,'choice_saved','web')");
    const tables=['app_users','toss_coach_orders','coach_answers','auth_sessions','usage_sessions','llm_requests','audit_logs','product_event_counts'];
    const snapshot=async()=>Promise.all(tables.map(async t=>(await query(`SELECT * FROM ${t} ORDER BY 1`)).rows));
    const before=await snapshot();
    const report=await retentionAudit(pool);
    assert.equal(report.mode,'read_only');
    assert.deepEqual(report.orders,{total:'6',unlinked:'1',locally_usable:'2',expired:'1',refunded:'1',exhausted:'1',stored_over_one_year:'1',inconsistent_dates:'1'});
    assert.deepEqual(report.answers,{total:'2',stored_over_30_days:'1',stored_over_one_year:'1'});
    assert.equal(report.operational.expired_auth_sessions,'1');
    assert.equal(report.operational.expired_usage_sessions,'1');
    assert.equal(report.operational.expired_llm_requests,'1');
    assert.equal(report.operational.expired_audit_logs,'1');
    assert.equal(report.operational.expired_product_event_counts,'1');
    assert.ok(!JSON.stringify(report).includes(privateMarker));
    assert.deepEqual(await snapshot(),before);
    assert.equal(sql[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    assert.equal(sql.at(-1),'COMMIT');
    assert.ok(sql.slice(2,-1).every(s=>s.startsWith('SELECT')));
    assert.ok(sql.every(s=>!s.includes('SELECT *')));
    // An empty DB subset is 0; the report never invents a transaction or a deletion candidate.
    await query('TRUNCATE toss_coach_orders,coach_answers');
    const empty=await retentionAudit(pool);
    assert.ok(Object.values(empty.orders).every(v=>v==='0'));
    assert.ok(Object.values(empty.answers).every(v=>v==='0'));
  } finally {await db.close();}
});

test('a query failure rolls back, releases the connection and does not return a partial zero report',async()=>{
  const sql=[];let released=false;
  await assert.rejects(retentionAudit({async connect(){return {async query(text){sql.push(text);if(text.startsWith('SELECT'))throw new Error('private upstream detail');return {rows:[]};},release(){released=true;}};}}),/private upstream detail/);
  assert.equal(sql.at(-1),'ROLLBACK');assert.ok(!sql.includes('COMMIT'));assert.ok(released);
});
