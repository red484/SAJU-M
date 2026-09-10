import {Solar} from 'lunar-javascript';
import KoreanLunarCalendar from 'korean-lunar-calendar';
import {DateTime} from 'luxon';
import {STEM,BRANCH,SK,BK,ELEMENTS,TOPIC,topics} from './constants.js';
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
export function flow(r,iso){const dt=DateTime.fromISO(iso,{zone:'Asia/Seoul'}).set({hour:12});const a=at({clock:'civil'},dt);return ['year','month','day'].map((key,i)=>{const p=a.pillars[i],rel=mod(SE[p.s]-r.element,5);const notes=[['내 기준 돌아보기','내 방식과 주변의 방식을 비교하며 우선순위를 정리해 보세요.'],['생각을 표현하기','아직 정리되지 않은 생각을 글이나 대화로 꺼내보세요.'],['자원 점검하기','시간과 비용을 어디에 쓰는지 돌아보세요.'],['책임과 경계 정하기','주어진 역할과 내가 감당할 범위를 구분해 보세요.'],['배움과 회복 챙기기','새로운 정보를 살피고 도움을 요청해 보세요.']][rel];return {key,p,rel,...{title:notes[0],body:notes[1]},god:tenGod(r.day,p.s)};});}
export function safety(text){if(/자살|죽고\s*싶|죽을|자해|목숨|살기\s*싫|해치고\s*싶/.test(text))return '지금은 사주보다 안전이 먼저예요. 혼자 견디지 말고 믿을 수 있는 사람에게 지금의 상황을 알려주세요. 즉시 위험하다면 한국에서는 119 또는 112에 연락하거나 가까운 응급실로 가세요. 자살예방상담전화 109는 24시간 연결됩니다. 해외라면 현지 긴급전화나 위기상담 서비스를 이용해 주세요. 지금 혼자 계신가요?';if(/건강|증상|병원|진단|통증|약|임신|암|의료/.test(text))return '사주로 질환·임신·치료 결과를 판단할 수 없어요. 증상과 복용 중인 약, 지속된 기간을 정리해 의료 전문가와 상의하세요. 심한 흉통·호흡곤란 등 긴급한 증상은 즉시 응급 도움을 받으세요. 오늘은 몸 상태를 한 줄로 남기고 필요한 진료를 확인해보세요.';if(/투자|주식|코인|매수|매도|대출|재무|수익/.test(text))return '사주로 투자 수익이나 매매 시점을 예측하지 않습니다. 손실을 감당할 수 있는 범위, 수수료와 부채를 먼저 확인하세요. 구체적인 투자·대출 결정은 자격 있는 금융 전문가와 상의하고, 오늘은 자산과 지출을 정리하는 데 집중해보세요.';if(/법률|소송|고소|이혼|계약|재판|변호사/.test(text))return '사주는 법률 판단이나 사건 결과를 예측하는 근거가 아닙니다. 계약서·관련 자료와 기한을 정리하고 변호사 또는 공인된 법률상담기관에 확인하세요. 오늘은 놓치면 안 되는 기한 하나를 확인해보세요.';return null;}
export function coach(r,p,conversation,text){const safe=safety(text);if(safe)return {text:safe,phase:'safety'};const user=conversation.messages.filter(m=>m.role==='user');let topic=conversation.topic||p.topics?.[0]||'진로';if(/연애|사랑|상대|고백/.test(text))topic='연애';else if(/이직|퇴사|직장|진로|회사/.test(text))topic='진로';else if(/돈|재물|지출/.test(text))topic='재물';else if(/가족|부모|아이/.test(text))topic='가족';
 if(!conversation.context||topic!==conversation.topic)return {text:`${topic} 이야기를 함께 정리해볼게요. 지금 생각하는 선택지는 무엇이고, 가장 걱정되는 조건 하나는 무엇인가요?\n이미 마음이 기울었다면 그 이유도 알려주세요.`,topic,context:text,phase:'question'};
 const t=topicReading(r,topic),previous=user.slice(-2,-1)[0]?.text;return {text:`사주 관점\n${t.body}\n\n현실적인 체크포인트\n처음 남긴 고민 “${conversation.context.slice(0,100)}”에 이번에 말씀하신 “${text.slice(0,140)}”를 함께 놓고 보세요. ${previous&&user.length>2?'앞서 말한 조건이 지금도 중요한지 다시 확인해 보세요.':'바꿀 수 있는 조건과 당장 바꿀 수 없는 조건을 나누어 보세요.'}\n\n오늘 할 일\n${user.length>3?'앞서 정리한 행동을 해봤다면 결과 한 가지와 달라진 생각 한 가지를 기록해보세요.':t.action}\n\n이 중 먼저 정리하고 싶은 조건은 무엇인가요?`,topic,context:conversation.context,phase:'advice'};
}
export function monthly(records,month){const list=records.filter(r=>r.date?.startsWith(month)),done=list.filter(r=>r.result==='good'||r.result==='rethink'),low=done.filter(r=>r.confidence<50),high=done.filter(r=>r.confidence>=50),avg=a=>a.length?Math.round(a.filter(r=>r.result==='good').length/a.length*100):null;return {list,done,low,high,lowRate:avg(low),highRate:avg(high),moods:list.reduce((a,r)=>{if(r.mood)a[r.mood]=(a[r.mood]||0)+1;return a;},{}),insight:low.length>=3&&high.length>=3?`완료한 기록에서 확신 50 미만 ${low.length}건의 만족 비율은 ${avg(low)}%, 50 이상 ${high.length}건은 ${avg(high)}%였어요. 스스로 남긴 소수 기록의 관찰이며 인과관계나 미래 예측은 아닙니다.`:'확신 수준별 비교는 두 그룹에 완료 기록이 각각 3개 이상 쌓이면 보여드려요. 지금은 선택과 실제 결과를 차근차근 남겨보세요.'};}
