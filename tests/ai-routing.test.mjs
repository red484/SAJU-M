import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { routingMetadata } from '../src/server/ai-routing.mjs';
import { chatCompletion } from '../src/server/integrations/cafe24-llm.mjs';
import { TelemetryRepository } from '../src/server/repositories/telemetry-repository.mjs';
import { llmLogDetails } from '../src/server/logging.mjs';

const route={provider:'deepinfra',resolved_model_used:'google/gemini-2.5-flash'};
test('only bounded documented identifier fields are retained; missing metadata stays unknown',()=>{
 assert.deepEqual(routingMetadata({...route,prompt:'private text',authorization:'secret'}),{provider:'deepinfra',model:'google/gemini-2.5-flash'});
 for(const value of [undefined,null,{}, {provider:'person@example.com',resolved_model_used:'private concern with spaces'}, {provider:'sk-cafe24-secret',resolved_model_used:'sk-cafe24-secret'}, {provider:[],resolved_model_used:{}}, {provider:'a'.repeat(65),resolved_model_used:'a'.repeat(161)}])assert.deepEqual(routingMetadata(value),{provider:null,model:null});
 assert.deepEqual(llmLogDetails({routing:{provider:'private',model:'private'}}),{inputTokens:undefined,outputTokens:undefined,finishReason:'unknown',truncated:false,continuations:undefined,faults:undefined,qualityIssueCount:undefined});
});

test('router response metadata passes through completions; continuation reports the final response only',async()=>{
 const oldFetch=globalThis.fetch, oldKey=process.env.CAFE24_LLM_API_KEY;process.env.CAFE24_LLM_API_KEY='test-key';let calls=0;
 globalThis.fetch=async()=>{
  calls++;return new Response(JSON.stringify({model:'response-model',choices:[{message:{content:calls===1?'첫 부분':'이어 쓴 부분'},finish_reason:calls===1?'length':'stop'}],extra_fields:{routing_info:{...route,provider:calls===1?'google':'deepinfra',prompt:'private text'},secret:'never copy'}}),{headers:{'Content-Type':'application/json'}});
 };
 try {
  const out=await chatCompletion({messages:[{role:'user',content:'test'}],maxTokens:100,continueOnLength:true,maxContinuations:1});
  assert.equal(calls,2);assert.deepEqual(out.routing,{provider:'deepinfra',model:'google/gemini-2.5-flash'});assert.ok(!JSON.stringify(out.routing).includes('private'));
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.CAFE24_LLM_API_KEY;else process.env.CAFE24_LLM_API_KEY=oldKey;}
});

test('diagnostic rows store final routing metadata and report no account/session identifiers',async()=>{
 const db=new PGlite();const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 const pool={query,async connect(){return {query,release(){}};}};
 try {
  for(const f of (await readdir(new URL('../server/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../server/migrations/'+f,import.meta.url),'utf8'));
  const repo=new TelemetryRepository(pool);
  assert.deepEqual((await repo.routingReport()).rows,[]);
  await repo.finish({id:null,started:Date.now()},{model:'response-model',routing:{provider:route.provider,model:route.resolved_model_used}});
  await repo.finish({id:null,started:Date.now()},{model:'legacy-model'});

  const report=await repo.routingReport();assert.equal(report.rows.length,2);
  assert.deepEqual(report.rows.find(r=>r.routing_provider==='deepinfra'),{routing_provider:'deepinfra',resolved_model:'google/gemini-2.5-flash',status:'completed',records:'1'});
  assert.equal(report.rows.find(r=>r.routing_provider===null).resolved_model,null);
  assert.ok(!JSON.stringify(report).includes('usage_session_id'));
  assert.equal((await query('SELECT count(*)::int AS n FROM llm_requests')).rows[0].n,2);
 }finally{await db.close();}
});
