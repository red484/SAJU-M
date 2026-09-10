import assert from 'node:assert/strict';
import {calculate,coach,monthly,topicReading,flow,safety} from '../src/engine.js';
const base={name:'테스트',birth:'1995-05-17',time:'15:30',zone:'Asia/Seoul',longitude:126.978,clock:'civil',calendar:'solar',topics:['진로']};
const a=calculate(base);assert.equal(a.total,8);assert.equal(a.pillars.map(p=>p.gz).join(' '),'乙亥 辛巳 戊申 庚申');
const lunar=calculate({...base,birth:'1956-01-21',calendar:'lunar'});assert.equal(lunar.solarDate,'1956-03-03');
assert.equal(calculate({...base,birth:'2017-05-01',calendar:'lunar',leap:true}).solarDate,'2017-06-24');
assert.throws(()=>calculate({...base,birth:'2017-04-01',calendar:'lunar',leap:true}));assert.throws(()=>calculate({...base,birth:'2025-02-30'}));assert.throws(()=>calculate({...base,birth:'2099-01-01'}));
assert.equal(calculate({...base,unknown:true}).total,6);
const before=calculate({...base,birth:'2024-02-04',time:'17:20'}),after=calculate({...base,birth:'2024-02-04',time:'17:30'});assert.notEqual(before.pillars[0].gz,after.pillars[0].gz);assert.notEqual(before.pillars[1].gz,after.pillars[1].gz);
assert.equal(calculate({...base,birth:'2024-02-04',unknown:true}).boundary,true);
assert.throws(()=>calculate({...base,birth:'2024-03-10',time:'02:30',zone:'America/New_York'}));assert.throws(()=>calculate({...base,birth:'2024-11-03',time:'01:30',zone:'America/New_York'}));
assert.notEqual(topicReading(a,'진로').body,topicReading(a,'연애').body);
const c={messages:[{role:'user',text:'이직 고민'}],topic:'진로'};const q=coach(a,base,c,'이직 고민');assert.equal(q.phase,'question');Object.assign(c,q);c.messages.push({role:'user',text:'연봉과 안정성'});const adv=coach(a,base,c,'연봉은 20% 높지만 회사가 작은 게 걱정돼요.');
assert.match(adv.text,/사주 관점[\s\S]*현실 확인[\s\S]*오늘 할 일/);
// Conditions are named from the user's own words, with the figure kept.
assert.match(adv.text,/조직 규모/);assert.match(adv.text,/보상/);assert.match(adv.text,/20%/);
// The reply must not parrot the user's sentence back at them.
assert.ok(!adv.text.includes('회사가 작은 게 걱정돼요'),'coach echoed the user verbatim');
// 이에요/예요 follows the final consonant.
assert.ok(!/규모이에요/.test(adv.text),'wrong particle after an open syllable');assert.match(safety('죽고 싶어요'),/109/);assert.match(safety('코인 투자'),/예측하지/);
assert.equal(flow(a,'2026-09-10').length,3);assert.equal(monthly([],'2026-09').list.length,0);
console.log('PASS: lunar/leap conversion, term boundary, unknown time, invalid/DST dates, contextual coaching and safety.');
