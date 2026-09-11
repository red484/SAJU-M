import {Solar} from 'lunar-javascript';
import KoreanLunarCalendar from 'korean-lunar-calendar';
import {DateTime} from 'luxon';
import {STEM,BRANCH,SK,BK,ELEMENTS,COLORNAME,COLORS,HOURS,HARMONY,HIDDEN,STAGE,BIRTHPLACE,TRIAD,PEACH,HORSE,CANOPY,NOBLE,STEMHUE,ZODIAC,TENSCORE,STAGESCORE,OFFICER,OFFICERSAY,YELLOWGOD,ISYELLOW,DRAGONSTART,PURPOSE,TENSAY,STAGESAY,MARKSAY,SHIN12,ROBSTART,SHINSAY,BRANCHCLASH,STEMCLASH,TENGROUP,STAGEDAY,FLOWSAY,FLOWGROUND,TOPIC,topics} from './constants.js';
const SE=[0,0,1,1,2,2,3,3,4,4],BE=[4,2,0,0,2,1,1,2,3,3,2,4];
const mod=(a,b)=>(a%b+b)%b;
function solar(dt){return Solar.fromYmdHms(dt.year,dt.month,dt.day,dt.hour,dt.minute,dt.second);}
function parts(gz,k){const s=STEM.indexOf(gz[0]),b=BRANCH.indexOf(gz[1]);return {k,s,b,gz,label:SK[s]+BK[b]};}
export function tenGod(day,other){const r=mod(SE[other]-SE[day],5),same=day%2===other%2;return [['비견','겁재'],['식신','상관'],['편재','정재'],['편관','정관'],['편인','정인']][r][same?0:1];}
function at(profile,dt){
 // Solar term tables are UTC+8. Year/month are selected by the real instant,
 // independently from the local day/hour clock convention.
 const table=solar(dt.setZone('UTC+8')).getLunar();
 const clock=profile.clock==='mean'?dt.toUTC().plus({minutes:profile.longitude*4}):dt;
 const local=solar(clock).getLunar(),ec=local.getEightChar();ec.setSect(2);
 const day=ec.getDay(),hourB=Math.floor((clock.hour+1)%24/2),hourS=(STEM.indexOf(day[0])%5*2+hourB)%10;
 return {pillars:[parts(table.getYearInGanZhiExact(),'년주'),parts(table.getMonthInGanZhiExact(),'월주'),parts(day,'일주'),parts(STEM[hourS]+BRANCH[hourB],'시주')],clock,term:table.getPrevJie().getSolar().toYmdHms()};
}
export function calculate(p){
 const [y,m,d]=p.birth.split('-').map(Number);if(!y||y<1900||y>2050)throw new Error('1900년부터 오늘까지의 날짜를 입력해 주세요.');
 let date={year:y,month:m,day:d};const cal=new KoreanLunarCalendar();
 if(p.calendar==='lunar'){if(!cal.setLunarDate(y,m,d,!!p.leap))throw new Error('존재하지 않는 음력 날짜 또는 윤달입니다.');date=cal.getSolarCalendar();}
 let dt=DateTime.fromObject({...date,hour:p.unknown?12:Number(p.time.split(':')[0]),minute:p.unknown?0:Number(p.time.split(':')[1])},{zone:p.zone});
 if(!dt.isValid)throw new Error('날짜 또는 시간대를 확인해 주세요.');
 if(!p.unknown&&(dt.hour!==Number(p.time.split(':')[0])||dt.minute!==Number(p.time.split(':')[1])))throw new Error('서머타임 전환으로 존재하지 않는 시각입니다. 출생 기록을 확인해 주세요.');
 if(dt.getPossibleOffsets().length>1&&!p.unknown)throw new Error('서머타임 종료로 두 번 존재하는 시각입니다. 현재 이 경계 시각은 지원하지 않아요.');
 if(dt.startOf('day')>DateTime.now().setZone(p.zone).startOf('day'))throw new Error('미래의 출생일은 입력할 수 없어요.');
 if(p.clock==='mean'&&(!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180))throw new Error('경도는 -180부터 180 사이로 입력해 주세요.');
 const result=at(p,dt),pillars=result.pillars.slice(0,p.unknown?3:4),cnt=[0,0,0,0,0];pillars.forEach(v=>{cnt[SE[v.s]]++;cnt[BE[v.b]]++;});
 const sum=cnt.reduce((a,b)=>a+b,0),max=Math.max(...cnt),min=Math.min(...cnt),strong=cnt.map((v,i)=>v===max?i:-1).filter(v=>v>=0),weak=cnt.map((v,i)=>v===min?i:-1).filter(v=>v>=0);
 const day=pillars[2].s;let boundary=false;
 if(p.unknown){const ends=[at(p,dt.startOf('day')),at(p,dt.endOf('day'))];boundary=ends[0].pillars.slice(0,3).map(v=>v.gz).join()!==ends[1].pillars.slice(0,3).map(v=>v.gz).join();}
 return {...result,pillars,cnt,pct:cnt.map(v=>Math.round(v/sum*100)),strong,weak,day,element:SE[day],solarDate:dt.toISODate(),offset:dt.offset,unknown:p.unknown,boundary,total:sum,ten:pillars.map(v=>v.k==='일주'?'일간':tenGod(day,v.s)),clockLabel:result.clock.toFormat('yyyy-MM-dd HH:mm')};
}
const TRAITS=[
 ['방향을 정하고 꾸준히 자라는 힘','새로운 가능성을 발견하고 시작을 이어가는 편','성장을 서두르며 일을 벌리는 패턴','배움과 시도가 허용되는 환경','진행 중인 일 중 하나만 골라 마무리 기준을 적어보세요.'],
 ['생각을 표현하고 사람을 연결하는 힘','분위기를 읽고 마음을 드러내는 편','열의를 모두 쏟고 뒤늦게 지치는 패턴','반응을 주고받고 표현할 수 있는 환경','오늘의 에너지를 가장 많이 쓴 일 뒤에 쉬는 시간을 비워두세요.'],
 ['흐름을 안정시키고 책임지는 힘','한번 맡은 일을 차근차근 정리하는 편','다른 사람의 책임까지 혼자 안는 패턴','역할과 약속이 분명하고 신뢰가 쌓이는 환경','내가 맡을 일과 함께 나눌 일을 한 가지씩 구분해보세요.'],
 ['기준을 세우고 결론을 내리는 힘','모호한 상황에서 핵심을 분별하는 편','완벽한 답을 찾느라 자신에게 엄격해지는 패턴','기준과 피드백이 명확한 환경','꼭 지킬 기준 하나와 양보할 조건 하나를 적어보세요.'],
 ['깊이 살피고 유연하게 적응하는 힘','바로 반응하기보다 맥락을 이해하는 편','생각이 길어져 첫 행동을 미루는 패턴','혼자 생각할 시간과 유연한 선택권이 있는 환경','생각 중인 일을 10분 안에 할 수 있는 행동으로 줄여보세요.']];
export function topicReading(r,t){const a=TOPIC[t]||TOPIC.진로;return {title:a[0],body:`${ELEMENTS[r.strong[0]]} 기운을 ${TRAITS[r.strong[0]][0]}으로 읽으면, ${t}에서도 ${TRAITS[r.strong[0]][3]}이 맞는지 살펴볼 수 있어요. ${a[1]}`,action:a[2]};}
export function reading(r,p){const e=r.strong[0],w=r.weak[0];return {summary:`${p.name}님은 ${TRAITS[e][1]}으로 읽힙니다. 다만 ${TRAITS[e][2]}은 돌아볼 필요가 있어요.`,strength:TRAITS[e][0],caution:TRAITS[e][2],environment:TRAITS[e][3],balance:`${ELEMENTS[w]}은 ${r.cnt[w]}개로 상대적으로 적게 나타납니다. ${TRAITS[w][0]}을 일상의 습관으로 보완해보는 관점입니다. 없는 기운이 곧 결핍이나 불운이라는 뜻은 아니에요.`,action:topicReading(r,p.topics?.[0]||'진로').action};}
// 흐름 카드. 천간은 십성으로 주제를, 지지는 십이운성으로 세기를 말하고,
// 원국 지지와 부딪히면 그 자리도 함께 짚습니다. 예전에는 천간을 오행 다섯
// 관계로만 눌러 써서 편인과 정인이 같은 문장을 받았습니다.
export function flow(r,iso){
 const dt=DateTime.fromISO(iso,{zone:'Asia/Seoul'}).set({hour:12});
 const a=at({clock:'civil'},dt);
 return ['year','month','day'].map((key,i)=>{
  const p=a.pillars[i],god=tenGod(r.day,p.s),[title,body]=FLOWSAY[god];
  const stage=stageOf(r.day,p.b);
  // 지지 속에 든 천간도 일간 기준으로 읽습니다. 겉의 십성만으로는
  // 같은 천간이 붙은 해와 달이 계속 같은 말만 하게 됩니다.
  const hidden=HIDDEN[p.b].map(v=>({stem:STEM[v],read:SK[v],god:tenGod(r.day,v)}));
  const marks=marksOf(r,p.b).map(name=>({name,say:MARKSAY[name]}));
  return {key,p,god,title,body,stage,ground:FLOWGROUND[stage],hidden,marks,clash:groundClash(r,p.b)};
 });
}
// 흐름의 지지가 원국 지지와 마주 보면(여섯 칸 차이) 그 자리를 알려 줍니다.
function groundClash(r,b){
 for(const p of r.pillars){
  if(mod(b-p.b,12)!==6)continue;
  const lo=Math.min(b,p.b),hi=Math.max(b,p.b),pair=BK[lo]+BK[hi];
  return {name:pair+'충',at:p.k,say:BRANCHCLASH[pair]||''};
 }
 return null;
}
export function safety(text){if(/자살|죽고\s*싶|죽을|자해|목숨|살기\s*싫|해치고\s*싶/.test(text))return '지금은 사주보다 안전이 먼저예요. 혼자 견디지 말고 믿을 수 있는 사람에게 지금의 상황을 알려주세요. 즉시 위험하다면 한국에서는 119 또는 112에 연락하거나 가까운 응급실로 가세요. 자살예방상담전화 109는 24시간 연결됩니다. 해외라면 현지 긴급전화나 위기상담 서비스를 이용해 주세요. 지금 혼자 계신가요?';if(/건강|증상|병원|진단|통증|약|임신|암|의료/.test(text))return '사주로 질환·임신·치료 결과를 판단할 수 없어요. 증상과 복용 중인 약, 지속된 기간을 정리해 의료 전문가와 상의하세요. 심한 흉통·호흡곤란 등 긴급한 증상은 즉시 응급 도움을 받으세요. 오늘은 몸 상태를 한 줄로 남기고 필요한 진료를 확인해보세요.';if(/투자|주식|코인|매수|매도|대출|재무|수익/.test(text))return '사주로 투자 수익이나 매매 시점을 예측하지 않습니다. 손실을 감당할 수 있는 범위, 수수료와 부채를 먼저 확인하세요. 구체적인 투자·대출 결정은 자격 있는 금융 전문가와 상의하고, 오늘은 자산과 지출을 정리하는 데 집중해보세요.';if(/법률|소송|고소|이혼|계약|재판|변호사/.test(text))return '사주는 법률 판단이나 사건 결과를 예측하는 근거가 아닙니다. 계약서·관련 자료와 기한을 정리하고 변호사 또는 공인된 법률상담기관에 확인하세요. 오늘은 놓치면 안 되는 기한 하나를 확인해보세요.';return null;}
// Conditions people actually weigh, each with the checks that turn a feeling
// into something comparable. A factor is claimed only when the user's own
// words name it, so a reply never invents a concern they did not raise.
const FACTOR=[
 ['보상',/연봉|급여|월급|보상|인센티브|스톡|지분|페이|수입/,'기본급과 변동급의 비율','사이닝 보너스·스톡의 반환과 베스팅 조건'],
 ['안정성',/안정|불안|리스크|위험|망하|폐업|버틸|해고|짤리/,'수습 기간 중 계약이 끝나는 조건','최근 1년 자발적 퇴사율'],
 ['조직 규모',/규모|스타트업|대기업|중소|인원|직원 ?수|초기 ?기업|작은 ?(?:회사|곳|기업|팀)|(?:회사|기업|조직|팀)가? ?작/,'지금 현금으로 버틸 수 있는 개월 수','최근 매출과 투자 추이'],
 ['성장',/성장|커리어|배울|배우|기회|경력|스킬/,'1년 뒤 맡게 될 역할의 범위','옆에서 배울 사람이 있는지'],
 ['시간',/워라밸|야근|근무 ?시간|주말|휴가|퇴근/,'실제 퇴근 시각과 주말 근무 빈도','휴가 사용률'],
 ['함께 일할 사람',/상사|팀|동료|대표|문화|사람들/,'함께 일할 팀의 최근 이직','결정이 내려지는 방식'],
 ['거리',/출퇴근|통근|이사|재택|원격/,'편도 통근 시간','재택이 가능한 일수'],
 ['관계 거리',/연락|만남|고백|헤어|사귀|썸/,'서로 표현한 의사와 경계','다음에 만나기로 한 시점'],
 ['지출 구조',/지출|저축|대출|생활비|비상금?/,'고정 지출과 비상 자금의 개월 수','줄일 수 있는 항목 한 가지']];
const figures=t=>[...t.matchAll(/(\d+(?:\.\d+)?)\s*(%|퍼센트|배|만 ?원|억|개월|달|년|주|시간)/g)].map(m=>m[1]+m[2].replace(/\s/g,'').replace('퍼센트','%'));
const batchim=w=>{const c=w.charCodeAt(w.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28!==0;};
const yeyo=w=>w+(batchim(w)?'이에요':'예요');
function readFactors(latest,earlier){const out=[];for(const [label,re,a,b] of FACTOR){const fresh=re.test(latest);if(fresh||re.test(earlier))out.push({label,checks:[a,b],fresh:fresh&&!re.test(earlier)});}return out;}

export function coach(r,p,conversation,text){const safe=safety(text);if(safe)return {text:safe,phase:'safety'};const user=conversation.messages.filter(m=>m.role==='user');let topic=conversation.topic||p.topics?.[0]||'진로';if(/연애|사랑|상대|고백/.test(text))topic='연애';else if(/이직|퇴사|직장|진로|회사/.test(text))topic='진로';else if(/돈|재물|지출/.test(text))topic='재물';else if(/가족|부모|아이/.test(text))topic='가족';
 if(!conversation.context||topic!==conversation.topic)return {text:`${topic} 이야기를 함께 정리해볼게요. 지금 생각하는 선택지는 무엇이고, 가장 걱정되는 조건 하나는 무엇인가요?\n이미 마음이 기울었다면 그 이유도 알려주세요.`,topic,context:text,phase:'question'};
 const t=topicReading(r,topic),earlier=user.slice(0,-1).map(m=>m.text).join(' '),found=readFactors(text,earlier),nums=figures([earlier,text].join(' '));
 // Nothing named yet: ask for the options themselves instead of restating the
 // question back, which is what made earlier replies feel like an echo.
 if(!found.length)return {text:`사주 관점\n${t.body}\n\n현실 확인\n아직 비교할 조건이 잡히지 않았어요. 놓고 고민 중인 선택지를 두 개로 적어주시고, 각각에서 얻는 것과 잃는 것을 한 줄씩 붙여주세요.\n\n오늘 할 일\n${t.action}`,topic,context:conversation.context,phase:'advice'};
 const nth=user.length,fresh=found.filter(f=>f.fresh),labels=found.map(f=>f.label);
 // Newest concerns first, and never more than three at once: a list that grows
 // every turn stops being a comparison and becomes a wall.
 const shown=[...fresh,...found.filter(f=>!f.fresh)].slice(0,3);
 const focus=fresh[0]||found[0],action=focus.checks[nth%2];
 const lead=fresh.length?`이번에 더해주신 조건은 ${yeyo(fresh.map(f=>f.label).join('·'))}. `:'새로 더해진 조건은 없어요. ';
 // The reading itself does not change between turns, so state it once and refer
 // back to it after that instead of reprinting the same paragraph.
 const view=nth<=2?t.body:`앞서 본 ${topic} 해석은 그대로예요. 이번에는 조건 쪽만 보겠습니다.`;
 const rank=labels.length>1?`\n\n${shown.map(f=>f.label).join(' · ')} 중 지금 가장 포기하기 어려운 순서로 알려주시면, 그 기준으로 좁혀드릴게요.`:`\n\n${labels[0]} 말고 지금 함께 걸리는 조건이 하나 더 있다면 알려주세요.`;
 return {text:`사주 관점\n${view}\n\n현실 확인\n${lead}지금 비교할 조건은 ${shown.map(f=>f.label).join('·')}${found.length>shown.length?` 외 ${found.length-shown.length}가지`:''}${nums.length?` (${[...new Set(nums)].join(', ')})`:''}입니다. 아래를 확인하면 느낌이 아니라 숫자로 비교할 수 있어요.\n${shown.map(f=>`· ${f.label} — ${f.checks[0]} / ${f.checks[1]}`).join('\n')}\n\n오늘 할 일\n${action} 하나만 오늘 확인해서 답을 적어두세요. 나머지는 그다음에 봐도 늦지 않아요.${rank}`,topic,context:conversation.context,phase:'advice'};
}

export function monthly(records,month){const list=records.filter(r=>r.date?.startsWith(month)),done=list.filter(r=>r.result==='good'||r.result==='rethink'),low=done.filter(r=>r.confidence<50),high=done.filter(r=>r.confidence>=50),avg=a=>a.length?Math.round(a.filter(r=>r.result==='good').length/a.length*100):null;return {list,done,low,high,lowRate:avg(low),highRate:avg(high),moods:list.reduce((a,r)=>{if(r.mood)a[r.mood]=(a[r.mood]||0)+1;return a;},{}),insight:low.length>=3&&high.length>=3?`완료한 기록에서 확신 50 미만 ${low.length}건의 만족 비율은 ${avg(low)}%, 50 이상 ${high.length}건은 ${avg(high)}%였어요. 스스로 남긴 소수 기록의 관찰이며 인과관계나 미래 예측은 아닙니다.`:'확신 수준별 비교는 두 그룹에 완료 기록이 각각 3개 이상 쌓이면 보여드려요. 지금은 선택과 실제 결과를 차근차근 남겨보세요.'};}

// 음력 날짜가 곧 달의 위상이라, 별도 천문 계산 없이 유도됩니다. frac은 밝은
// 부분의 비율(0 삭 · 1 보름), waxing은 차오르는 중인지입니다.
const PHASE_NAME=['삭','초승달','상현달','상현 지나','보름달','보름 지나','하현달','그믐달'];
export function moonPhase(iso){
 const dt=DateTime.fromISO(iso,{zone:'Asia/Seoul'}).set({hour:12});
 const day=solar(dt).getLunar().getDay();
 const angle=2*Math.PI*((day-1)/29.53);
 const frac=(1-Math.cos(angle))/2;
 return {day,frac,waxing:angle<Math.PI,name:PHASE_NAME[Math.round(angle/(2*Math.PI)*8)%8]};
}

// 오늘 하루의 신호 두 가지. 어느 쪽도 점수가 아니라 근거를 가진 값입니다.
// 시간은 일지와 육합하는 지지의 시진, 색은 일간을 생하는 오행(인성)입니다.
export function daySignals(r,iso){
 const dt=DateTime.fromISO(iso,{zone:'Asia/Seoul'}).set({hour:12});
 const a=at({clock:'civil'},dt),dayGz=a.pillars[2];
 const pair=HARMONY[dayGz.b],[label,from,to]=HOURS[pair];
 const support=(SE[r.day]+4)%5;
 return {
  // 육합이 밤 시진을 가리키는 날이 있습니다. 값을 비틀지 않고, 깨어 있는
  // 시간에 어떻게 쓰라는 것인지만 덧붙입니다.
  hour:{label:label+'시',from,to,night:Number(from.slice(0,2))>=22||Number(from.slice(0,2))<6,basis:`오늘 일지 ${BK[dayGz.b]}와 육합하는 ${label}시`,note:Number(from.slice(0,2))>=22||Number(from.slice(0,2))<6?'잠든 시간이라면 굳이 깨어 있을 것 없어요. 잠들기 전이나 일어난 직후에 오늘 할 일을 정해두면 같은 결을 탑니다.':null},
  color:{name:COLORNAME[support],hex:COLORS[support],element:ELEMENTS[support],basis:`일간 ${SK[r.day]}(${ELEMENTS[SE[r.day]]})${batchim(ELEMENTS[SE[r.day]])?"을":"를"} 생하는 ${ELEMENTS[support]}의 빛깔`}};
}

// ── 만세력 상세 ────────────────────────────────────────────────
// 지장간(여기·중기·본기), 십이운성, 공망, 신살. 어느 것도 길흉 등급이
// 아니라 명식에서 바로 읽히는 자리 이름입니다.
// 공망·십이운성·신살은 원국 밖에서도 쓰입니다(그날의 일진 판정). 원국에
// 매인 계산이므로 r을 받아 그 사람 기준의 판정자를 돌려줍니다.
export function emptyOf(r){
 const p=r.pillars[2],idx=mod((p.s-p.b)*6+p.b,60),hb=mod(mod(idx-idx%10,60),12);
 return [mod(hb+10,12),mod(hb+11,12)];
}
// 십이운성: 양간은 장생부터 순행, 음간은 역행.
export const stageOf=(day,b)=>STAGE[mod((day%2===0?b-BIRTHPLACE[day]:BIRTHPLACE[day]-b),12)];
export function marksOf(r,b){
 const day=r.day,g=TRIAD[r.pillars[0].b],dg=TRIAD[r.pillars[2].b],empty=emptyOf(r),out=[];
 if(b===PEACH[g]||b===PEACH[dg])out.push('도화');
 if(b===HORSE[g]||b===HORSE[dg])out.push('역마');
 if(b===CANOPY[g]||b===CANOPY[dg])out.push('화개');
 if(NOBLE[day].includes(b))out.push('천을귀인');
 if(empty.includes(b))out.push('공망');
 return out;
}

export function manse(r){
 const day=r.day;
 return {empty:emptyOf(r).map(b=>BK[b]),
  rows:r.pillars.map(v=>({key:v.k,gz:v.gz,label:v.label,
   stem:v.k==='일주'?'일간':tenGod(day,v.s),
   hidden:HIDDEN[v.b].map(h=>({k:SK[h],ten:tenGod(day,h)})),
   branch:tenGod(day,HIDDEN[v.b].at(-1)),
   stage:stageOf(day,v.b),marks:marksOf(r,v.b)}))};
}

// ── 대운 ──────────────────────────────────────────────────────
// 순행·역행은 년간의 음양과 성별로 갈립니다. 양남·음녀는 순행,
// 음남·양녀는 역행. 대운수는 절기까지의 일수를 3으로 나눈 값이고,
// 성별을 받지 못하면 방향이 정해지지 않으므로 계산하지 않습니다.
export function fortune(r,p){
 if(p.gender!=='female'&&p.gender!=='male')return null;
 const yang=r.pillars[0].s%2===0,forward=yang===(p.gender==='male');
 const dt=DateTime.fromISO(r.solarDate,{zone:p.zone||'Asia/Seoul'}).set({hour:12});
 const lunar=solar(dt.setZone('UTC+8')).getLunar();
 const edge=(forward?lunar.getNextJie():lunar.getPrevJie()).getSolar();
 const days=Math.abs(DateTime.fromObject({year:edge.getYear(),month:edge.getMonth(),day:edge.getDay()},{zone:'UTC+8'}).diff(dt.setZone('UTC+8'),'days').days);
 const start=Math.max(1,Math.round(days/3));
 const mi=STEM.indexOf(r.pillars[1].gz[0]),mb=BRANCH.indexOf(r.pillars[1].gz[1]);
 const birthYear=Number(r.solarDate.slice(0,4));
 return {forward,start,list:Array.from({length:8},(_,i)=>{const n=i+1;
  const s2=mod(forward?mi+n:mi-n,10),b2=mod(forward?mb+n:mb-n,12);
  return {age:start+i*10,year:birthYear+start+i*10,gz:STEM[s2]+BRANCH[b2],label:SK[s2]+BK[b2],ten:tenGod(r.day,s2),stage:STAGE[mod((r.day%2===0?b2-BIRTHPLACE[r.day]:BIRTHPLACE[r.day]-b2),12)]};})};
}

// ── 그날의 일진 ────────────────────────────────────────────────
// 일진을 부르는 이름. 만세력에서 바로 나오는 값이라 사람마다 같습니다.
export function dayName(iso){
 const dt=DateTime.fromISO(iso,{zone:'Asia/Seoul'}).set({hour:12});
 const gz=at({clock:'civil'},dt).pillars[2];
 return {gz:gz.gz,label:gz.label,name:`${STEMHUE[gz.s]} ${ZODIAC[gz.b]}의 날`,s:gz.s,b:gz.b};
}

// 그날이 이 사람에게 어떻게 걸리는지. 총점은 아래 항목들의 합일 뿐이고,
// 항목과 배점을 그대로 함께 돌려주므로 숫자 뒤에 숨은 계산이 없습니다.
export function dayIndex(r,iso){
 const d=dayName(iso),parts=[];
 const ten=tenGod(r.day,d.s),stage=stageOf(r.day,d.b),marks=marksOf(r,d.b);
 parts.push({key:'일간과의 관계',value:ten,score:TENSCORE[ten]});
 parts.push({key:'십이운성',value:stage,score:STAGESCORE[stage]});
 for(const m of marks){
  if(m==='천을귀인')parts.push({key:'신살',value:m,score:12});
  else if(m==='공망')parts.push({key:'신살',value:m,score:-10});
 }
 const flavor=marks.filter(m=>m!=='천을귀인'&&m!=='공망');
 const score=Math.max(0,Math.min(100,20+parts.reduce((a,p)=>a+p.score,0)));
 return {...d,ten,stage,marks,flavor,parts,score,base:20};
}

// 한 달치를 한 번에. 달력이 하루씩 호출하며 만세력을 다시 여는 것을 막습니다.
export function monthIndex(r,month){
 const first=DateTime.fromISO(month+'-01',{zone:'Asia/Seoul'});
 if(!first.isValid)return [];
 return Array.from({length:first.daysInMonth},(_,i)=>dayIndex(r,first.plus({days:i}).toISODate()));
}

// ── 택일 ──────────────────────────────────────────────────────
// 그날의 건제십이신과 황도흑도. 월지와 일지만으로 정해지므로 사람과 무관합니다.
export function daySelect(iso){
 const dt=DateTime.fromISO(iso,{zone:'Asia/Seoul'}).set({hour:12});
 const a=at({clock:'civil'},dt),mb=a.pillars[1].b,db=a.pillars[2].b;
 const oi=mod(db-mb,12);                       // 建은 월건과 같은 지지의 날
 const yi=mod(db-DRAGONSTART[mb%6],12);        // 청룡이 시작하는 지지에서부터
 const lunarDay=solar(dt).getLunar().getDay();
 return {officer:OFFICER[oi],oi,say:OFFICERSAY[oi],
  god:YELLOWGOD[yi],yi,yellow:!!ISYELLOW[yi],
  sonless:lunarDay%10===9||lunarDay%10===0,lunarDay};
}

// 한 달에서 그 일에 맞는 날을 고릅니다. 점수는 아래 항목의 합일 뿐이고,
// 어떤 항목이 몇 점이었는지 그대로 함께 돌려줍니다.
export function goodDays(month,purpose){
 const P=PURPOSE[purpose];if(!P)return [];
 const first=DateTime.fromISO(month+'-01',{zone:'Asia/Seoul'});
 if(!first.isValid)return [];
 return Array.from({length:first.daysInMonth},(_,i)=>{
  const iso=first.plus({days:i}).toISODate(),d=daySelect(iso),parts=[];
  parts.push({key:'건제십이신',value:d.officer,score:P.w[d.oi]*2});
  parts.push({key:'황도흑도',value:d.god,score:d.yellow?1:-1});
  if(P.sonless&&d.sonless)parts.push({key:'손 없는 날',value:'음력 '+d.lunarDay+'일',score:1});
  return {iso,...d,parts,score:parts.reduce((t,p)=>t+p.score,0)};
 });
}

// 하루치 전체 판독. 점수·근거·본문·시간·색·달·택일을 한 번에 모아 돌려줍니다.
// 모두 이미 계산된 값에서 나오므로 날짜를 눌러도 외부 호출이 없습니다.
export function dayReading(r,iso){
 const d=dayIndex(r,iso),[headline,lead]=TENSAY[d.ten];
 const paragraphs=[lead,STAGESAY[d.stage]];
 const marks=d.marks.map(m=>MARKSAY[m]).filter(Boolean);
 if(marks.length)paragraphs.push(marks.join(' '));
 const sig=daySignals(r,iso);
 return {...d,headline,paragraphs,
  hour:sig.hour,color:sig.color,moon:moonPhase(iso),select:daySelect(iso),
  clash:clashes(r,iso),shin:shinsal(r,iso),stageDay:STAGEDAY[d.stage]};
}

// ── 합과 충 ────────────────────────────────────────────────────
// 그날의 일진이 원국의 어느 자리를 치는지 봅니다. 천간은 여섯 칸 차이가
// 충이고(무·기는 중앙의 토라 제외), 지지는 마주 보는 자리가 충입니다.
export function clashes(r,iso){
 const d=dayName(iso),out={stems:[],branches:[]};
 const mid=s=>s===4||s===5;
 for(const p of r.pillars){
  if(!mid(d.s)&&!mid(p.s)&&mod(d.s-p.s,10)===6){
   const key=p.k==='일주'?'일간':TENGROUP[tenGod(r.day,p.s)];
   if(key&&!out.stems.some(v=>v.key===key)){const [title,say]=STEMCLASH[key];out.stems.push({key,title,say,at:p.k,gz:STEM[d.s]+'–'+STEM[p.s]});}
  }
  if(mod(d.b-p.b,12)===6){
   const lo=Math.min(d.b,p.b),hi=Math.max(d.b,p.b),pair=BK[lo]+BK[hi],name=pair+'충';
   // 이름으로 중복을 거릅니다. 원국에 같은 지지가 둘이면 같은 충이 두 번 잡힙니다.
   if(!out.branches.some(v=>v.name===name))out.branches.push({name,at:p.k,say:BRANCHCLASH[pair]||''});
  }
 }
 return out;
}

// 십이신살. 겁살에서 시작해 열둘이 차례로 돌고, 겁살의 자리는 년지의
// 삼합 국이 정합니다.
export function shinsal(r,iso){
 const d=dayName(iso),start=ROBSTART[TRIAD[r.pillars[0].b]];
 const name=SHIN12[mod(d.b-start,12)];
 return {name,say:SHINSAY[name]};
}
