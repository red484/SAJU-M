import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { productMetricsReport } from '../src/server/product-metrics-report.mjs';

const selected = (report, event='purchase_view') => report.overall.find(row=>row.event===event);

test('complete Korean days stay separate from today; counts are exact beyond JS safe integers',async()=>{
  const data={today:'2026-11-04',rows:[
    {day:'2026-11-04',channel:'web',event:'purchase_view',count:'100'},
    {day:'2026-11-03',channel:'web',event:'purchase_view',count:'9007199254740993'},
    {day:'2026-10-28',channel:'toss',event:'purchase_view',count:'2'},
    {day:'2026-10-27',channel:'web',event:'purchase_view',count:'3'},
    {day:'2026-10-21',channel:'web',event:'purchase_view',count:'4'},
    {day:'2026-10-20',channel:'web',event:'purchase_view',count:'5'},
    {day:'2026-11-01',channel:'web',event:'review_saved',count:'1'}
  ]};
  const report=await productMetricsReport({async query(sql){assert.ok(sql.startsWith('WITH period'));return {rows:[data]};}});
  assert.deepEqual(report.periods.last7,{from:'2026-10-28',to:'2026-11-03'});
  assert.deepEqual(report.periods.previous7,{from:'2026-10-21',to:'2026-10-27'});
  assert.deepEqual(selected(report),{event:'purchase_view',today:'100',last7:'9007199254740995',previous7:'7',last30:'9007199254741107',change7:'9007199254740988'});
  assert.equal(report.channels.find(v=>v.channel==='toss').events.find(v=>v.event==='purchase_view').last7,'2');
  assert.equal(selected(report,'purchase_granted').last30,'0');
  assert.equal(report.status,'observed_events');
  const decline=await productMetricsReport({async query(){return {rows:[{today:data.today,rows:[{day:'2026-10-26',channel:'web',event:'purchase_view',count:'2'}]}]};}});
  assert.equal(selected(decline).change7,'-2');
});

test('database snapshot excludes future and expired dates without changing stored counts; empty is not invented activity',async()=>{
  const db=new PGlite();
  try {
    await db.exec(await readFile(new URL('../server/migrations/011_product_event_counts.sql',import.meta.url),'utf8'));
    const pool={query:(sql,args)=>db.query(sql,args)};
    const empty=await productMetricsReport(pool);
    assert.equal(empty.status,'no_observed_events');assert.equal(empty.rows.length,0);assert.equal(empty.channels.length,0);
    assert.ok(empty.overall.every(v=>v.last30==='0'&&v.change7==='0'));
    await db.exec(`INSERT INTO product_event_counts(day,channel,event,count) VALUES
      ((now() AT TIME ZONE 'Asia/Seoul')::date,'web','choice_saved',1),
      ((now() AT TIME ZONE 'Asia/Seoul')::date-29,'web','choice_saved',2),
      ((now() AT TIME ZONE 'Asia/Seoul')::date-30,'web','choice_saved',4),
      ((now() AT TIME ZONE 'Asia/Seoul')::date+1,'web','choice_saved',8)`);
    const before=(await db.query('SELECT * FROM product_event_counts ORDER BY id')).rows;
    const report=await productMetricsReport(pool);
    assert.equal(report.rows.length,2);assert.equal(selected(report,'choice_saved').last30,'3');
    assert.equal(selected(report,'choice_saved').today,'1');
    assert.deepEqual((await db.query('SELECT * FROM product_event_counts ORDER BY id')).rows,before);
    assert.ok(!JSON.stringify(report).includes('user_id'));
  } finally {await db.close();}
});

test('query failure is surfaced rather than replaced by an empty report',async()=>{
  await assert.rejects(productMetricsReport({async query(){throw Error('test database failure');}}),/test database failure/);
});
