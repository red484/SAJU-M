import {Solar} from 'lunar-javascript';
import KoreanLunarCalendar from 'korean-lunar-calendar';
import {DateTime} from 'luxon';
import {STEM,BRANCH,SK,BK,ELEMENTS,COLORNAME,COLORS,HOURS,HARMONY,HIDDEN,STAGE,BIRTHPLACE,TRIAD,PEACH,HORSE,CANOPY,NOBLE,STEMHUE,ZODIAC,TENSCORE,STAGESCORE,OFFICER,OFFICERSAY,YELLOWGOD,ISYELLOW,DRAGONSTART,PURPOSE,TENSAY,STAGESAY,MARKSAY,SHIN12,ROBSTART,SHINSAY,BRANCHCLASH,STEMCLASH,TENGROUP,STAGEDAY,FLOWSAY,FLOWGROUND,SIGNALS,TOPIC,topics} from './constants.js';
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
const CAREER_QUESTION=[
 '새로운 가능성이 여러 갈래라 어느 일부터 시작할지 고민이신가요?',
 '마음이 가는 일은 있지만 오래 이어갈 방식이 걸리시나요?',
 '지금 맡은 일을 놓기 어려워 다음 방향을 고르기 망설여지시나요?',
 '어느 길이 맞는지보다 납득할 기준이 아직 모자란 쪽인가요?',
 '여러 가능성을 살피느라 첫 선택을 고르기 어려운 쪽인가요?'
];
const LOVE_STYLE=[
 ['호감이 생기면 관계를 앞으로 움직여 보고 싶은 편이에요. 다만 가능성을 빠르게 키우느라 상대의 실제 속도를 앞서가지 않는지 살펴보세요.','먼저 연락하는 쪽이 한쪽에만 쏠리지 않는지','다음 만남을 제안하되 답을 재촉하지 말고 상대가 구체적인 날짜로 화답하는지 보세요.'],
 ['말과 반응을 주고받을 때 마음이 선명해지는 편이에요. 초반의 강한 표현보다 시간이 지나도 온도가 이어지는지가 더 중요해요.','말한 호감과 약속을 지키는 행동이 함께 가는지','서운함을 돌려 말하지 말고 “나는 이럴 때 안심돼요”라는 문장 하나로 전해보세요.'],
 ['천천히 쌓이는 신뢰와 일상의 안정감을 중요하게 여기는 편이에요. 관계를 지키려다 상대 몫까지 혼자 책임지지 않는지 살펴보세요.','연락·약속·배려가 서로 오가는지','이번 주 관계에서 내가 한 노력과 상대가 한 노력을 한 줄씩 적어 균형을 확인하세요.'],
 ['관계의 뜻과 기준이 분명해야 마음을 놓는 편이에요. 확실한 답을 얻으려다 아직 자라는 관계를 너무 빨리 판정하지 않는지가 관건이에요.','애매한 말보다 관계를 대하는 태도와 경계가 분명한지','꼭 확인할 기준 하나만 정해 부드럽고 직접적인 질문으로 물어보세요.'],
 ['상대의 맥락을 오래 살피고 마음을 천천히 여는 편이에요. 이해하려는 시간이 길어져 내 의사를 보여줄 때를 놓치지 않는지 살펴보세요.','대화 뒤에 다음 연락이나 만남으로 이어지는 구체성이 있는지','해석만 이어가기보다 내가 원하는 관계의 속도를 한 문장으로 밝혀보세요.']
];
const LOVE_FLOW={
 '비견':['서로의 속도와 주도권을 맞춰보는 흐름이에요','연락과 약속을 누가 먼저 시작하는지'],
 '겁재':['주변 분위기보다 두 사람의 기준을 다시 확인할 때예요','비교나 경쟁 없이 내 관계에 집중할 수 있는지'],
 '식신':['부담 없는 대화와 만남으로 친밀감을 쌓기 좋아요','편안한 대화가 다음 만남으로 자연스럽게 이어지는지'],
 '상관':['참았던 말을 꺼내기 쉬운 만큼 표현의 온도를 조절할 때예요','솔직한 대화 뒤에도 존중과 연락이 이어지는지'],
 '편재':['새로운 접점이나 다양한 만남을 열어두기 쉬운 흐름이에요','호감 표현이 일회성이 아니라 다시 약속으로 이어지는지'],
 '정재':['관계를 꾸준히 이어갈 생활 리듬을 확인할 때예요','바쁜 날에도 약속과 연락의 기본선이 지켜지는지'],
 '편관':['관계를 빠르게 규정하고 싶은 압박이 생길 수 있어요','상대가 부담을 피하지 않고 의사를 분명히 말하는지'],
 '정관':['서로 기대하는 관계의 모양을 정리하기 좋아요','말한 기준과 실제 행동이 일치하는지'],
 '편인':['상대의 속뜻을 추측하기보다 잠시 거리를 두고 사실을 볼 때예요','질문했을 때 회피하지 않고 구체적으로 답하는지'],
 '정인':['안심과 돌봄을 주고받는 방식을 확인할 때예요','힘든 날에도 배려가 일방향이 아닌지']
};
function loveTopicReading(r,iso){
 const style=LOVE_STYLE[r.strong[0]],month=flow(r,iso)[1],[timing,signal]=LOVE_FLOW[month.god];
 const active=['장생','목욕','관대','건록','제왕'].includes(month.stage)
  ? '마음만 재기보다 작은 표현으로 상대의 반응을 확인해도 좋아요.'
  : '결론을 서두르기보다 지금까지 반복된 행동을 차분히 확인하세요.';
 const timingText=`이번 달은 ${timing} ${active}`;
 const signalText=`현실에서는 ${signal}, 그리고 ${style[1]}를 함께 보세요.`;
 return {title:'마음의 거리와 타이밍',core:style[0],body:`${style[0]} 가까운 흐름으로는 ${timingText} ${signalText}`,timing:timingText,signal:signalText,action:style[2],basis:`이번 달 ${month.p.gz}의 ${month.god} 흐름과 ${month.stage}의 속도`};
}
export function topicReading(r,t,iso=DateTime.now().setZone('Asia/Seoul').toISODate()){
 if(t==='연애')return loveTopicReading(r,iso);
 const a=TOPIC[t]||TOPIC.진로,trait=TRAITS[r.strong[0]];return {title:a[0],body:`사주에서는 ${trait[1]}으로 읽혀요. ${t}에서는 ${trait[3]}이 나와 잘 맞는지 천천히 살펴보세요. ${a[1]}`,action:a[2]};
}
export function reading(r,p){const e=r.strong[0],w=r.weak[0];return {summary:`${p.name}님의 일간은 ${ELEMENTS[r.element]}입니다. ${r.total}글자에서 ${r.strong.length>1?'가장 많이 나타난 기운 중':'가장 많이 나타난'} ${ELEMENTS[e]}은 ${TRAITS[e][0]}으로 읽어볼 수 있어요.`,strength:TRAITS[e][0],caution:TRAITS[e][2],environment:TRAITS[e][3],balance:`${ELEMENTS[w]}은 ${r.cnt[w]}개로 상대적으로 적게 나타납니다. ${TRAITS[w][0]}을 일상의 습관으로 보완해보는 관점입니다. 없는 기운이 곧 결핍이나 불운이라는 뜻은 아니에요.`,action:topicReading(r,p.topics?.[0]||'진로').action};}
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
export function safety(text){if(/자살|죽고\s*싶|죽을|자해|목숨|살기\s*싫|해치고\s*싶/.test(text))return '지금은 사주보다 안전이 먼저예요. 혼자 견디지 말고 믿을 수 있는 사람에게 지금의 상황을 알려주세요. 즉시 위험하다면 한국에서는 119 또는 112에 연락하거나 가까운 응급실로 가세요. 자살예방상담전화 109는 24시간 연결됩니다. 해외라면 현지 긴급전화나 위기상담 서비스를 이용해 주세요. 지금 혼자 계신가요?';if(/흉통|호흡\s*곤란|(?:가슴|흉부).{0,8}(?:아프|통증|조이)|숨(?:이)?\s*(?:안\s*쉬|못\s*쉬|막히)/.test(text))return '지금 가슴 통증이나 호흡 곤란을 겪고 있다면 사주 상담을 멈추고 즉시 119 또는 가까운 응급실에 도움을 요청해 주세요.';if(/진단|처방|치료|임신|질환|무슨\s*병|어떤\s*병|약을|약\s*먹|복용|암\s*(?:인가|일까|진단|치료)/.test(text))return '사주로 질병이나 치료 결과를 판단할 수 없어요. 어떤 점이 걱정되는지 정리해 의료 전문가에게 확인해 주세요. 지금 가장 궁금한 점은 무엇인가요?';if(/투자|주식|코인|매수|매도|대출|재무|수익/.test(text))return '사주로 투자 수익이나 매매 시점을 예측하지 않습니다. 손실을 감당할 수 있는 범위, 수수료와 부채를 먼저 확인하세요. 구체적인 투자·대출 결정은 자격 있는 금융 전문가와 상의하고, 오늘은 자산과 지출을 정리하는 데 집중해보세요.';if(/법률|소송|고소|이혼|계약|재판|변호사/.test(text))return '사주는 법률 판단이나 사건 결과를 예측하는 근거가 아닙니다. 계약서·관련 자료와 기한을 정리하고 변호사 또는 공인된 법률상담기관에 확인하세요. 오늘은 놓치면 안 되는 기한 하나를 확인해보세요.';return null;}
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
 ['관계 거리',/연락|만남|소개팅|고백|헤어|이별|재회|결혼|사귀|연인|애인|남친|여친|썸/,'서로 표현한 의사와 경계','다음에 만나기로 한 시점'],
 ['지출 구조',/지출|저축|대출|생활비|비상금?/,'고정 지출과 비상 자금의 개월 수','줄일 수 있는 항목 한 가지']];
const figures=t=>[...t.matchAll(/(\d+(?:\.\d+)?)\s*(%|퍼센트|배|만 ?원|억|개월|달|년|주|시간)/g)].map(m=>m[1]+m[2].replace(/\s/g,'').replace('퍼센트','%'));
const batchim=w=>{const c=w.charCodeAt(w.length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28!==0;};
const yeyo=w=>w+(batchim(w)?'이에요':'예요');
function readFactors(latest,earlier){const out=[];for(const [label,re,a,b] of FACTOR){const fresh=re.test(latest);if(fresh||re.test(earlier))out.push({label,checks:[a,b],fresh:fresh&&!re.test(earlier)});}return out;}

// 첫 마디가 늘 결정을 들고 오지는 않습니다. 잠이 안 온다는 말에
// "선택지를 두 개 적어주세요"라고 답하면 듣지 않은 것이 됩니다.
const FEEL=[
 [/불면|잠\s*을?\s*못|잠이\s*안|못\s*자|잠자리|뒤척|설쳤|설치고|잠들|새벽에\s*깨/,'잠이 잘 오지 않는 날이 이어지면 판단도 같이 흐려집니다. 오래 이어진다면 수면은 사주가 아니라 진료로 푸는 쪽이 맞습니다.'],
 [/피곤|지쳐|지침|기운\s*이?\s*없|무기력|번아웃|쉬고\s*싶/,'기운이 바닥에 닿아 있을 때는 무엇을 더 하기보다 덜어낼 것을 먼저 찾는 편이 낫습니다.'],
 [/불안|초조|두렵|무섭|겁이/,'앞이 보이지 않을 때 불안이 가장 커집니다. 무엇이 불확실한지 이름을 붙이는 것만으로도 조금 줄어듭니다.'],
 [/우울|눈물|슬프|공허|가라앉/,'마음이 가라앉아 있을 때는 큰 결정을 잠시 미뤄도 괜찮습니다.'],
 [/외롭|쓸쓸|혼자\s*인|혼자\s*같/,'혼자 버티고 있다는 느낌이 들 때가 가장 지칩니다.'],
 [/힘들|버겁|답답|스트레스|짜증|화가\s*나|속상/,'감당할 것이 한꺼번에 몰려 있을 때 그렇게 느껴집니다.']];
const GREET=/^\s*(안녕|하이|헬로|여보세요|반가|ㅎㅇ|안뇽)\S*/;
// 같은 결의 말을 두 번 하면 같은 문장을 되돌려주지 않게 뒷말을 바꿉니다.
const ASK=['지금 마음에 제일 크게 걸려 있는 일이 무엇인지, 떠오르는 대로 한두 가지만 들려주세요.',
 '그 마음이 언제부터였는지, 그 무렵에 달라진 일이 있었는지 알려주세요.'];
export function smallTalk(text,nth=0){
 for(const [re,line] of FEEL)if(re.test(text))return line+'\n'+ASK[nth%2];
 // 인사만 있을 때. 인사 뒤에 사연이 붙어 있으면 그쪽을 먼저 봅니다.
 if(GREET.test(text)&&text.replace(GREET,'').trim().length<6)
  return '반갑습니다. 오늘은 어떤 이야기부터 꺼내볼까요?\n요즘 마음에 걸리는 일이나 정해야 하는 일이 있다면 편하게 적어주세요.';
 return null;
}
// 사용자가 되풀이해 꺼낸 소재를 세어 최근 순으로 돌려줍니다. 프롬프트의
// '누적 신호'에 들어가, 도령이 명식을 설명하는 대신 먼저 짚어볼 거리가 됩니다.
// 사용자가 쓴 문장만 봅니다. 도령이 한 말은 세지 않습니다.
export function signalsOf(conversations,limit=5){
 const seen=new Map();
 const msgs=[];
 for(const c of conversations||[])for(const m of c.messages||[])if(m.role==='user')msgs.push(m);
 msgs.sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
 msgs.forEach((m,i)=>{
  for(const [re,name] of SIGNALS){
   if(!re.test(m.text||''))continue;
   const v=seen.get(name)||{name,count:0,last:-1};
   v.count++;v.last=i;seen.set(name,v);
  }
 });
 // 두 번 이상 나온 것만 신호로 봅니다. 한 번 나온 말은 되풀이가 아닙니다.
 return [...seen.values()].filter(v=>v.count>=2)
  .sort((a,b)=>b.last-a.last).slice(0,limit).map(({name,count})=>({name,count}));
}

export function coach(r,p,conversation,text){const safe=safety(text);if(safe)return {text:safe,phase:'safety'};const user=conversation.messages.filter(m=>m.role==='user');const previous=user.at(-2)?.text||'';let topic=conversation.topic||p.topics?.[0]||'진로',named=false;
 if(/^(?:음|응|뭐|네|예|무슨\s*뜻)(?:[?？!…\.\s]*)$/.test(text.trim())&&previous){const aboutHealth=/건강|몸|아프|통증|증상|병원|졸리|졸려|졸음/.test(previous);return {text:aboutHealth?'제가 너무 앞서갔네요. 아직 어떤 점이 걱정되는지 듣지 못했어요. 편한 만큼만 말씀해 주실래요?':'제가 질문을 너무 크게 드렸네요. 지금 마음에 걸리는 상황 하나만 말씀해 주실래요?',topic:aboutHealth?'건강':topic,context:null,phase:'clarify'};}
 const sleepy=/졸리|졸려|졸음|잠(?:이)?\s*쏟아/;
 if(sleepy.test(text)&&conversation.context!=='sleepiness')return {text:'요즘 자주 졸리시군요. 사주로 원인을 미리 정하진 않을게요. 하루 중 언제 졸음이 가장 몰리나요?',topic:'건강',context:'sleepiness',phase:'clarify'};
 if(conversation.topic==='건강'&&conversation.context==='sleepiness'&&!/진로|이직|직장|연애|가족|재물|투자/.test(text)){
  const duration=/\d+\s*(?:일|주|달|개월|년)\s*(?:째|동안|전부터)?|몇\s*(?:주|달|개월)/.test(text);
  return {text:duration?'그만큼 이어졌군요. 일상에 지장이 있거나 계속 걱정된다면 사주 대신 의료진에게 확인해 주세요. 하루 중 어떤 일이 가장 불편한가요?':'말씀해 주신 때에 졸음이 오는군요. 이런 날이 언제부터 이어졌는지 알려주실래요?',topic:'건강',context:'sleepiness',phase:'listen'};
 }
 if(/건강\s*(?:관련|문제|때문|이)?.{0,12}(?:고민|걱정)|(?:고민|걱정).{0,12}건강/.test(text)&&!/(?:흉통|호흡\s*곤란|진단|처방|치료)/.test(text))return {text:'건강 때문에 마음이 쓰이시는군요. 아직 어떤 점이 걱정되는지는 듣지 못했어요. 편한 만큼만 말씀해 주실래요?',topic:'건강',context:null,phase:'clarify'};
 if(/진로\s*(?:에\s*대한|때문|관련)?.{0,10}(?:고민|걱정)|(?:고민|걱정).{0,10}진로/.test(text)&&!/(?:이직|퇴사|직장|회사|취업|전공|진학|제안|선택|연봉|업무)/.test(text)){const month=flow(r,DateTime.now().setZone('Asia/Seoul').toISODate())[1];return {text:`진로 이야기도 같이 해요. 이번 달은 ‘${month.title}’ 쪽으로 읽혀요. ${CAREER_QUESTION[r.strong[0]]||'지금 가장 마음에 걸리는 장면은 무엇인가요?'}`,topic:'진로',context:null,phase:'clarify'};}
 if(/연애\s*(?:에\s*대한|때문|관련)?.{0,10}(?:고민|걱정)|(?:고민|걱정).{0,10}연애/.test(text)&&!/(?:짝사랑|썸|소개팅|연락|만남|고백|사귀|연인|애인|남친|여친|재회|결혼|이별|헤어)/.test(text))return {text:'연애 이야기라면 먼저 지금의 관계부터 알아야 마음을 함부로 단정하지 않을 수 있어요. 현재는 솔로·썸·연애 중·재회 고민 중 어디에 가장 가까우신가요?',topic:'연애',context:null,phase:'clarify'};
 // 사용자가 직접 꺼낸 주제인지 구분합니다. 프로필에 적어둔 관심사를
 // "진로 이야기를 정리해볼게요"처럼 단정해 버리면 안 한 말을 지어낸 셈입니다.
 if(/연애|짝사랑|소개팅|썸|연인|애인|남친|여친|고백|이별|재회|결혼|(?<![가-힣])사랑|(?<![가-힣])상대/.test(text)){topic='연애';named=true;}
 else if(/이직|퇴사|직장|진로|회사/.test(text)){topic='진로';named=true;}
 else if(/돈|재물|지출/.test(text)){topic='재물';named=true;}
 else if(/가족|부모|자녀|(?<![가-힣])아이(?![디폰스티콘])/.test(text)){topic='가족';named=true;}
 if(!conversation.context||topic!==conversation.topic){
  // 아직 견줄 거리가 안 나왔으면 문맥을 비워 둔 채 한 번 더 듣습니다.
  const open=named?null:smallTalk(text,user.length);
  if(open)return {text:open,topic,context:null,phase:'listen'};
  return {text:`${named?topic+' 이야기를 함께 정리해볼게요. ':''}지금 생각하는 선택지는 무엇이고, 가장 걱정되는 조건 하나는 무엇인가요?\n이미 마음이 기울었다면 그 이유도 알려주세요.`,topic,context:text,phase:'question'};
 }
 const t=topicReading(r,topic),earlier=user.slice(0,-1).map(m=>m.text).join(' '),found=readFactors(text,earlier),nums=figures([earlier,text].join(' '));
 // Nothing named yet: ask for the options themselves instead of restating the
 // question back, which is what made earlier replies feel like an echo.
 if(!found.length){
  if(topic==='연애')return {text:`사주 관점\n${t.core}\n\n현실 확인\n${t.timing} ${t.signal}\n\n오늘 할 일\n${t.action}`,topic,context:conversation.context,phase:'advice'};
  return {text:`사주 관점\n${t.body}\n\n현실 확인\n아직 고민의 범위가 넓어요. 지금 그대로 가져가고 싶은 것과 가장 바꾸고 싶은 것을 하나씩 알려주세요.\n\n오늘 할 일\n메모장에 ‘유지할 것’과 ‘바꿀 것’을 적고 각각 한 줄만 채워보세요.`,topic,context:conversation.context,phase:'advice'};
 }
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
