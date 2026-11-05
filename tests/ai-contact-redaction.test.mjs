import assert from 'node:assert/strict';
import {redactContactText,redactModelMessages} from '../src/server/ai-contact-redaction.mjs';
import {chatCompletion} from '../src/server/integrations/cafe24-llm.mjs';
for(const contact of ['person@example.com','first.last+tag@sub.example.co.kr','01012345678','010-1234-5678','010 1234 5678','010.1234.5678','+82 10 1234 5678','+82-10-1234-5678']){
 assert.ok(!redactContactText('연락처 '+contact+'입니다.').includes(contact),contact);
}
const unchanged='1995-05-17 오후 3시, 50회 4,900원, R1 C1, 010320 종목, ABC01012345678 주문, 00101234567899';
assert.equal(redactContactText(unchanged),unchanged);
const structured=JSON.stringify({id:'R1',title:'person@example.com으로 연락',expectation:'010-1234-5678',actual:'직장을 바꾸어 봄'});
const parsed=JSON.parse(redactContactText(structured));assert.equal(parsed.id,'R1');assert.equal(parsed.actual,'직장을 바꾸어 봄');assert.ok(!parsed.title.includes('person@example.com'));
const original=[{role:'system',content:structured},{role:'user',content:[{type:'text',text:'person@example.com'},{type:'image_url',image_url:{url:'https://example.com/image'}}]},{role:'assistant',content:'010-1234-5678'}];
const snapshot=structuredClone(original),redacted=redactModelMessages(original);
assert.deepEqual(original,snapshot);assert.equal(redacted[1].content[0].text,'[이메일 비공개]');assert.deepEqual(redacted[1].content[1],original[1].content[1]);assert.equal(redactContactText(redactContactText(structured)),redactContactText(structured));
assert.equal(redactContactText('x'.repeat(100000)+'@invalid'), 'x'.repeat(100000)+'@invalid');
// Exercise the actual transport: retries and continuations all get sanitized copies.
const oldFetch=globalThis.fetch,env={...process.env};
try{
 process.env.CAFE24_LLM_API_KEY='sk-test-only';process.env.CAFE24_LLM_API_KEYS='sk-second-test-only';
 const calls=[];globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);calls.push({body,auth:options.headers.Authorization});
  if(calls.length===1)return new Response(JSON.stringify({error:{message:'busy'}}),{status:429});
  const truncated=calls.length===2;
  return new Response(JSON.stringify({choices:[{message:{content:truncated?'직장 고민 010-5555-6666':' 을 이어서 살펴봅니다.'},finish_reason:truncated?'length':'stop'}]}),{status:200});
 };
 const result=await chatCompletion({messages:original,maxTokens:100,continueOnLength:true,maxContinuations:1});
 assert.equal(calls.length,3);assert.equal(calls[0].auth,'Bearer sk-test-only');assert.equal(calls[1].auth,'Bearer sk-second-test-only');
 for(const {body} of calls){const text=JSON.stringify(body.messages);for(const contact of ['person@example.com','010-1234-5678','010-5555-6666'])assert.ok(!text.includes(contact));assert.ok(text.includes('R1'));}
 assert.deepEqual(original,snapshot);assert.equal(result.continuations,1);
 // Sanitization does not rewrite provider output or the user's saved source data.
 assert.ok(result.text.includes('010-5555-6666'));
 console.log('contact redaction: common formats, context/JSON preservation, immutable input, key retry and continuation transport passed');
}finally{globalThis.fetch=oldFetch;for(const key of Object.keys(process.env))if(!Object.hasOwn(env,key))delete process.env[key];Object.assign(process.env,env);}
