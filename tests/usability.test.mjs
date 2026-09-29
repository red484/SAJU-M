import assert from 'node:assert/strict';
import { countryForCity, hourIndex } from '../src/client/form-usability.js';
import { unrelatedQuestion, SCOPE_NOTICE } from '../src/client/consultation-scope.js';
import { coachReply, realtimeSystemPrompt } from '../src/server/services/coach-service.mjs';

assert.equal(countryForCity('서울'), '한국');
assert.equal(countryForCity('부산'), '한국');
assert.equal(countryForCity('뉴욕'), '미국');
assert.equal(countryForCity('로스앤젤레스'), '미국');
assert.equal(countryForCity('토론토'), '캐나다');
assert.equal(countryForCity('직접 입력'), '기타');
for (const [time,index] of [['23:00',0],['00:59',0],['01:00',1],['02:59',1],['03:00',2],['22:59',11]]) assert.equal(hourIndex(time),index);
for (const text of ['오늘 날씨 알려줘','비 오나요?','파이썬 코드 작성해줘','사주 말고 레시피 알려줘']) assert.ok(unrelatedQuestion(text));
for (const text of ['연애운이 궁금해요','네','이직을 고민 중이에요','날씨 때문에 데이트를 취소해서 속상해요']) assert.equal(unrelatedQuestion(text),false);
const chart={name:'테스트',gender:'female',pillars:['辛巳','己亥','壬辰','丙午'],dayStem:'임',element:'수',strong:['화'],weak:['목'],topics:['진로'],signals:[],records:[],turnIndex:1};
const oldFetch=globalThis.fetch;
globalThis.fetch=()=>{throw new Error('Out-of-scope questions must not call AI');};
try{
  const reply=await coachReply({chart,messages:[{role:'user',text:'오늘 날씨 알려줘'}]});
  assert.equal(reply.text,SCOPE_NOTICE);
  assert.equal(reply.source,'scope');
  const safe=await coachReply({chart,messages:[{role:'user',text:'날씨 때문에 죽고 싶어요'}]});
  assert.equal(safe.source,'safety');
}finally{globalThis.fetch=oldFetch;}
assert.match(realtimeSystemPrompt({...chart,periodFlow:[]}),/상담 범위/);
console.log('PASS: country mapping, hour boundaries, unrelated-question guard, safety precedence and server scope.');
