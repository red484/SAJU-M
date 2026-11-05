import test from 'node:test';
import assert from 'node:assert/strict';
import { errorDetails, llmLogDetails } from '../src/server/logging.mjs';
import { createReadingRoutes } from '../src/server/routes/readings.mjs';

const privateText = 'PRIVATE_CONCERN_AND_TOKEN_DO_NOT_LOG';
test('diagnostics contain only permitted codes, HTTP statuses and numeric response summaries', () => {
  assert.deepEqual(errorDetails({code:'ECONNRESET',status:502,message:privateText,stack:privateText}),{code:'ECONNRESET',status:502});
  assert.deepEqual(errorDetails({code:privateText,status:privateText}),{code:'UNKNOWN'});
  assert.deepEqual(errorDetails({code:'ALICE',status:200}),{code:'UNKNOWN'});
  const shape={model:privateText,keyLabel:privateText,usage:{in:42,out:privateText},finishReason:privateText,
    basis:{summary:privateText},text:privateText,qualityIssues:[privateText],faults:2,truncated:false};
  const logged=JSON.parse(JSON.stringify(llmLogDetails(shape)));
  assert.deepEqual(logged,{inputTokens:42,finishReason:'unknown',truncated:false,faults:2,qualityIssueCount:1});
  assert.equal(shape.basis.summary,privateText,'logging must not modify the actual answer');
});

function request(route) {
  const req={method:'POST',headers:{authorization:'Bearer test-token'},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from('{}');}};
  return new Promise((resolve,reject)=>{
    let status;
    route(req,{writeHead(value){status=value;},end(value){resolve({status,body:JSON.parse(value)});}}).catch(reject);
  });
}
test('AI response and error routes never print interpretation content or upstream error messages', async () => {
  const originalKey=process.env.CAFE24_LLM_API_KEY, originalLog=console.log, originalError=console.error;
  const logs=[];
  let fail=false, saved;
  process.env.CAFE24_LLM_API_KEY='test-only';
  console.log=console.error=value=>logs.push(JSON.parse(value));
  const telemetry={async start(){return {id:null,started:Date.now()};},async finish(_usage,details){saved=details;}};
  const auth={async userFromToken(){return {id:'diagnostic-test-user'};}};
  const quota={async run(){
    if(fail)throw Object.assign(new Error(privateText),{status:502,code:'ECONNRESET'});
    return {text:'실제 사용자 답변',source:'cafe24',basis:{summary:privateText},shape:{routing:{provider:'deepinfra',model:'resolved-model'},basis:{summary:privateText},model:privateText,usage:{in:5,out:8},finishReason:'stop',faults:0}};
  }};
  try {
    const route=createReadingRoutes(telemetry,auth,quota).coach;
    const reply=await request(route);
    assert.equal(reply.status,200);
    assert.equal(reply.body.text,'실제 사용자 답변');
    assert.deepEqual(saved.routing,{provider:'deepinfra',model:'resolved-model'});
    assert.ok(!Object.hasOwn(reply.body,'routing'),'diagnostic routing does not become public response data');
    assert.equal(reply.body.basis.summary,privateText,'interpretation evidence must still reach the user');
    fail=true;
    assert.equal((await request(route)).status,502);
    assert.equal(logs.length,2);
    assert.deepEqual(logs[0],{event:'llm.response',feature:'coach',inputTokens:5,outputTokens:8,finishReason:'stop',truncated:false,faults:0});
    assert.deepEqual(logs[1],{event:'llm.error',feature:'coach',code:'ECONNRESET',status:502});
    assert.ok(!JSON.stringify(logs).includes(privateText));
  } finally {
    console.log=originalLog;console.error=originalError;
    if(originalKey===undefined)delete process.env.CAFE24_LLM_API_KEY;else process.env.CAFE24_LLM_API_KEY=originalKey;
  }
});
