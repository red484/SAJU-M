import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { metricsEnabled, setMetricsEnabled, trackProductEvent, configureProductMetrics } from '../src/client/product-metrics.js';
import { createProductEventsRoute } from '../src/server/routes/product-events.mjs';
import { TelemetryRepository } from '../src/server/repositories/telemetry-repository.mjs';

function call(route, body, options={}) {
  const req={method:options.method||'POST',headers:{host:'localhost',...options.headers},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from(typeof body==='string'?body:JSON.stringify(body));}};
  return new Promise((resolve,reject)=>{let status;route(req,{writeHead(s){status=s;},end(text){resolve({status,body:JSON.parse(text)});}}).catch(reject);});
}
const event={event:'choice_saved',channel:'web',consent:true};

test('default off, opt-in sends categories without credentials; opt-out and unavailable storage stop requests',async()=>{
  const originalFetch=globalThis.fetch,originalStorage=globalThis.localStorage;
  const values=new Map(),requests=[];
  globalThis.localStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  globalThis.fetch=async(...args)=>{requests.push(args);return {ok:true};};
  try {
    assert.equal(metricsEnabled(),false);await trackProductEvent('choice_saved');assert.equal(requests.length,0);
    assert.equal(setMetricsEnabled(true),true);configureProductMetrics('android');await trackProductEvent('choice_saved');
    const [url,request]=requests[0];assert.equal(url,'/api/product-events');
    assert.deepEqual(JSON.parse(request.body),{...event,channel:'android'});
    assert.equal(request.credentials,'omit');assert.equal(request.referrerPolicy,'no-referrer');
    assert.deepEqual(request.headers,{'Content-Type':'application/json'});
    await trackProductEvent('private text');assert.equal(requests.length,1);
    setMetricsEnabled(false);await trackProductEvent('review_saved');assert.equal(requests.length,1);
    globalThis.localStorage={getItem(){throw Error('blocked');}};assert.equal(metricsEnabled(),false);await trackProductEvent('review_saved');assert.equal(requests.length,1);
  } finally {globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage;configureProductMetrics('web');}
});

test('endpoint requires explicit consent and fixed fields; rejects content, bad origins, large bodies and abuse',async()=>{
  const received=[],route=createProductEventsRoute({async recordProductEvent(v){received.push(v);}});
  assert.equal((await call(route,event)).status,202);assert.deepEqual(received,[event]);
  for(const body of [{...event,consent:false},{...event,account:'private'}, {...event,event:'my concern'}, {...event,channel:'other'},null,'{'])assert.equal((await call(route,body)).status,400);
  assert.equal((await call(route,event,{headers:{origin:'https://evil.example'}})).status,403);
  assert.equal((await call(route,'x'.repeat(257))).status,413);
  assert.equal((await call(route,event,{method:'GET'})).status,405);
  assert.equal((await call(createProductEventsRoute(null),event)).status,503);
  for(let i=0;i<60;i++)await call(route,event);
  assert.equal((await call(route,event)).status,429);
  assert.ok(received.length<=60);
});

test('database stores only daily category sums; cleanup retains exactly 30 Korean dates',async()=>{
  const db=new PGlite();
  const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
  const pool={query,async connect(){return {query,release(){}};}};
  try {
    for(const file of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../server/migrations/'+file,import.meta.url),'utf8'));
    const repo=new TelemetryRepository(pool);
    await repo.recordProductEvent(event);await repo.recordProductEvent(event);await repo.recordProductEvent({...event,channel:'toss'});
    assert.deepEqual((await query('SELECT channel,count::integer FROM product_event_counts ORDER BY channel')).rows,[{channel:'toss',count:1},{channel:'web',count:2}]);
    await query("INSERT INTO product_event_counts(day,event,channel) VALUES ((now() AT TIME ZONE 'Asia/Seoul')::date-30,'review_saved','web'),((now() AT TIME ZONE 'Asia/Seoul')::date-29,'review_saved','web')");
    assert.equal((await repo.deleteExpiredLogs()).product_event_counts,1);
    assert.equal((await query('SELECT count(*)::integer AS count FROM product_event_counts')).rows[0].count,3);
    assert.deepEqual((await query("SELECT column_name FROM information_schema.columns WHERE table_name='product_event_counts' ORDER BY ordinal_position")).rows.map(v=>v.column_name),['id','day','channel','event','count']);
  } finally {await db.close();}
});

test('first-answer metric fires for a successful AI answer only, including a retry, and never includes question text',async()=>{
  const vm=await import('node:vm');
  const source=await readFile(new URL('../src/client/app.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('async function requestAi('),source.indexOf('\nasync function retryAi('));
  const events=[];let reply={source:'rules',text:'private response'};
  const context=vm.createContext({trackProductEvent:event=>events.push(event),chartFor:()=>({}),requestCoachWithRetry:async()=>({response:{ok:true},body:reply}),coachQuota:null,coachLoginRequired:false});
  vm.runInContext(fn,context);
  const conversation={messages:[{role:'user',id:'private-id',text:'private concern'}]};
  await context.requestAi(conversation,[]);assert.deepEqual(events,[]);
  reply={source:'cafe24',text:'private response'};
  await context.requestAi(conversation,[]);assert.deepEqual(events,['consultation_first_answer']);
  conversation.messages.push({role:'assistant',source:'cafe24'});
  await context.requestAi(conversation,[]);assert.deepEqual(events,['consultation_first_answer']);
});
