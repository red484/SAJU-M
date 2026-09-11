import assert from 'node:assert/strict';
import {dayName,dayIndex,monthIndex,calculate,coach,monthly,topicReading,flow,safety,manse,fortune} from '../src/engine.js';
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
assert.ok(!/규모이에요/.test(adv.text),'wrong particle after an open syllable');// 일진 이름은 만세력에서 바로 나오는 값이라 사람과 무관하게 같습니다.
assert.equal(dayName('2026-09-09').label,'병술');
assert.equal(dayName('2026-09-09').name,'붉은 개의 날');
// 그날의 점수는 항목의 합일 뿐이어야 합니다 — 숨은 항이 있으면 실패합니다.
const di=dayIndex(a,'2026-09-09');
assert.equal(di.score,di.base+di.parts.reduce((t,p)=>t+p.score,0));
assert.ok(di.parts.some(p=>p.key==='일간과의 관계'));
assert.ok(di.parts.some(p=>p.key==='십이운성'));
// 같은 입력은 같은 값 — 무작위가 섞이지 않았는지.
assert.equal(dayIndex(a,'2026-09-09').score,dayIndex(a,'2026-09-09').score);
assert.equal(monthIndex(a,'2026-09').length,30);
assert.equal(monthIndex(a,'2026-02').length,28);
assert.match(safety('죽고 싶어요'),/109/);assert.match(safety('코인 투자'),/예측하지/);
assert.equal(flow(a,'2026-09-10').length,3);assert.equal(monthly([],'2026-09').list.length,0);

// ── 만세력 · 대운 ──────────────────────────────────────────────
// 1995-05-17 15:30 서울 → 乙亥 辛巳 戊申 庚申. 표준 만세력과 대조한 값.
const ms=manse(calculate(base));
assert.deepEqual(ms.rows.map(r=>r.gz),['乙亥','辛巳','戊申','庚申']);
assert.deepEqual(ms.empty,['인','묘']);                       // 戊申은 甲辰순 → 공망 寅卯
assert.deepEqual(ms.rows.map(r=>r.stage),['절','건록','병','병']); // 戊 일간 기준 십이운성
assert.deepEqual(ms.rows.map(r=>r.stem),['정관','상관','일간','식신']);
assert.deepEqual(ms.rows[0].hidden.map(h=>h.k),['무','갑','임']);  // 亥의 지장간
assert.ok(ms.rows[1].marks.includes('역마'));                  // 년지 亥(해묘미) → 巳가 역마

// 양남·음녀는 순행, 음남·양녀는 역행. 년간 乙은 음간.
const fw=fortune(calculate({...base,gender:'female'}),{...base,gender:'female'});
const bw=fortune(calculate({...base,gender:'male'}),{...base,gender:'male'});
assert.equal(fw.forward,true);assert.equal(bw.forward,false);
assert.equal(fw.list[0].gz,'壬午');   // 월주 辛巳에서 순행
assert.equal(bw.list[0].gz,'庚辰');   // 월주 辛巳에서 역행
assert.equal(fw.start,7);             // 망종까지 20일 ÷ 3
assert.equal(bw.start,4);             // 입하부터 11일 ÷ 3
assert.equal(fortune(calculate(base),base),null,'성별이 없으면 방향을 정할 수 없다');

console.log('PASS: lunar/leap conversion, term boundary, unknown time, invalid/DST dates, manse pillars, 십이운성, 공망, 신살, 대운 direction, 일진 이름·점수 합·월 길이, contextual coaching and safety.');
