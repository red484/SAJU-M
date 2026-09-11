import {DateTime} from 'luxon';
import {dressPage} from './design.js';
import {topics,CITIES,ELEMENTS,ECHAR,COLORS,SK,PURPOSE} from './constants.js';
import {now,dateLabel} from './time.js';
// The 만세력 tables are ~323KB of the bundle and are not needed until a chart
// is actually cast, so engine.js loads on demand. E is null until then.
let E=null,enginePromise=null,engineTry=0;
// The specifier is built at runtime on purpose. A dynamic import that fails is
// recorded against its URL in the module map and every later import of that
// same URL rethrows the cached failure, so a retry has to ask for a new one.
const ensureEngine=()=>(enginePromise??=import(/* @vite-ignore */ '/engine.js'+(engineTry?'?r='+engineTry:'')).then(m=>(E=m)));
const engineReady=async()=>{try{await ensureEngine();return true;}catch{enginePromise=null;engineTry++;notice('만세력 자료를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.');return false;}};
const ENGINE_PAGES=['result','today','chat','choice','records'];
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data={profile:null,records:[],conversations:[],savedAnswers:[]},revision=0,result=null,page='welcome',loaded=false,saveState='loading',activeConversation=null,month=now().toFormat('yyyy-MM'),selectedDate=now().toISODate(),recordFilter='all',pendingProfile=null,saveQueue=Promise.resolve(),generation=0;
const uid=()=>crypto.randomUUID(), today=()=>now().toISODate(),ct=()=>data.conversations.find(c=>c.id===activeConversation),p=()=>data.profile;
// Moon phase as geometry rather than an emoji, so it inherits the page's ink
// and scales with the type around it. frac is the lit fraction; the terminator
// is an ellipse whose semi-axis collapses to zero at the quarters.
const moonSvg=(frac,waxing,size=20)=>{const R=10,C=12,k=1-2*frac,rx=Math.abs(k)*R,big=frac>.5?1:0;
 const outer=waxing?1:0,inner=(k>0)===waxing?0:1;
 return `<svg class="moon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".45"/><path d="M ${C},${C-R} A ${R},${R} 0 0,${outer} ${C},${C+R} A ${rx},${R} 0 0,${inner} ${C},${C-R} Z" fill="currentColor" opacity="${frac<.02?0:.9}"/></svg>`;};

// Five-axis chart for the element balance. A pentagon shows the shape of a
// chart at a glance in a way five stacked bars cannot; the counts stay beside
// it so the picture never has to be read for a number.
const elementRadar=r=>{const C=78,R=58,pt=(i,f)=>{const a=(-90+i*72)*Math.PI/180;return [C+Math.cos(a)*R*f,C+Math.sin(a)*R*f];};
 const poly=f=>ELEMENTS.map((_,i)=>pt(i,f).map(n=>n.toFixed(1)).join(',')).join(' ');
 const max=Math.max(...r.pct,1),data=ELEMENTS.map((_,i)=>pt(i,Math.max(r.pct[i]/max,.04)).map(n=>n.toFixed(1)).join(',')).join(' ');
 return `<svg class="radar" viewBox="0 0 156 156" role="img" aria-label="오행 비율 ${ELEMENTS.map((e,i)=>e+' '+r.pct[i]+'%').join(', ')}">
  ${[.34,.67,1].map(f=>`<polygon points="${poly(f)}" fill="none" stroke="var(--line)" stroke-width="1"/>`).join('')}
  ${ELEMENTS.map((_,i)=>`<line x1="${C}" y1="${C}" x2="${pt(i,1)[0].toFixed(1)}" y2="${pt(i,1)[1].toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`).join('')}
  <polygon points="${data}" fill="#4c7a6033" stroke="#4c7a60" stroke-width="1.8" stroke-linejoin="round"/>
  ${ELEMENTS.map((e,i)=>{const [x,y]=pt(i,1.2);return `<text x="${x.toFixed(1)}" y="${(y+4).toFixed(1)}" text-anchor="middle" font-size="11" fill="${COLORS[i]}">${ECHAR[i]}</text>`;}).join('')}
 </svg>`;};
// 운세 캘린더. 하루하루가 원국에 어떻게 걸리는지를 한 달 단위로 펼칩니다.
// 점수는 항목 합일 뿐이고, 날짜를 누르면 그 합을 그대로 볼 수 있습니다.
function calendar(){
 const mo=calMonth||now().toFormat('yyyy-MM');
 const days=E.monthIndex(result,mo),first=DateTime.fromISO(mo+'-01',{zone:'Asia/Seoul'});
 const pad=first.weekday%7,t=today();
 const band=v=>v>=75?'high':v>=55?'mid':'low';
 return `<div class="cal-head"><button class="plain" data-cal="-1" aria-label="이전 달">‹</button><b>${Number(mo.slice(0,4))}년 ${Number(mo.slice(5))}월</b><button class="plain" data-cal="1" aria-label="다음 달">›</button></div>
 <div class="cal-grid" role="grid">${['일','월','화','수','목','금','토'].map(d=>`<span class="cal-dow">${d}</span>`).join('')}
 ${'<span></span>'.repeat(pad)}
 ${days.map((d,i)=>{const iso=first.plus({days:i}).toISODate();
  return `<button class="cal-day ${band(d.score)}${iso===t?' today':''}" data-fday="${iso}" aria-label="${iso} ${d.name} ${d.score}점"><b>${i+1}</b><i>${d.score}</i></button>`;}).join('')}</div>
 <p class="hint">날짜를 누르면 그날의 일진과 점수가 어떻게 나왔는지 볼 수 있어요.</p>`;}

// 택일. 월지와 일지만으로 정해지므로 원국이 없어도 같은 값이고, 어떤 항목이
// 몇 점이었는지 날짜마다 그대로 붙여 보여줍니다.
function selectDays(){
 const mo=calMonth||now().toFormat('yyyy-MM');
 const all=E.goodDays(mo,calPurpose);
 const top=[...all].sort((a,b)=>b.score-a.score||a.iso.localeCompare(b.iso)).filter(d=>d.score>0).slice(0,6);
 return `<div class="purposes" role="group" aria-label="무엇을 정할지">${Object.entries(PURPOSE).map(([k,v])=>
   `<button class="chip${k===calPurpose?' on':''}" data-purpose="${k}">${v.label}</button>`).join('')}</div>
  ${top.length?`<ul class="pickdays">${top.map(d=>`<li><div><b>${dateLabel(d.iso)}</b><span>${d.officer}일 · ${d.god}${d.yellow?' (황도)':''}${d.sonless?' · 손 없는 날':''}</span></div>
   <p>${d.say}</p><p class="calc">${d.parts.map(p=>`${p.key} ${p.value} ${p.score>0?'+':''}${p.score}`).join(' / ')} = <b>${d.score}</b></p></li>`).join('')}</ul>`
   :'<p class="hint">이 달에는 이 일에 특별히 맞는 날이 없어요. 다음 달도 살펴보세요.</p>'}
  <p class="hint">건제십이신과 황도흑도로 고릅니다. 월지와 일지로 정해지는 값이라 누구에게나 같고, 사주와는 별개예요.</p>`;}

// 하루치 상세. 총점 뒤에 숨은 계산이 없다는 것을 보여주는 자리입니다.
// 하루치 전체 판독을 전면 시트로 엽니다. 점수는 맨 위에 두되 바로 아래에
// 그 점수를 만든 항목을 붙여, 숫자만 떼어 읽히지 않게 합니다.
function dayDetail(iso){
 const d=E.dayReading(result,iso),band=d.score>=75?'high':d.score>=55?'mid':'low';
 openModal(`<div class="daysheet">
  <div class="day-hero ${band}">
   <p class="day-date">${dateLabel(iso)} · ${now().setZone('Asia/Seoul').toFormat('yyyy')}</p>
   <b class="day-score">${d.score}<small>점</small></b>
   <p class="day-headline">${esc(d.headline)}</p>
   <p class="day-gz"><span class="moon-inline">${moonSvg(d.moon.frac,d.moon.waxing,14)}${d.moon.name}</span> · ${d.name} ${d.label}일</p>
  </div>

  <section class="day-sec"><h3>총운</h3>
   ${d.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</section>

  <section class="day-sec"><h3>오늘의 신호</h3>
   <dl class="day-dl">
    <dt>기운이 도는 시간</dt><dd><b>${d.hour.label}</b> ${d.hour.from}–${d.hour.to}<span>${esc(d.hour.basis)}</span>${d.hour.note?`<span>${esc(d.hour.note)}</span>`:''}</dd>
    <dt>곁에 둘 색</dt><dd><b><i class="swatch" style="background:${d.color.hex}"></i>${esc(d.color.name)}</b><span>${esc(d.color.basis)}</span></dd>
    <dt>이날의 결</dt><dd><b>${d.select.officer}일 · ${d.select.god}${d.select.yellow?' (황도)':''}</b><span>${esc(d.select.say)}</span>${d.select.sonless?'<span>손 없는 날입니다.</span>':''}</dd>
   </dl></section>

  ${(d.clash.stems.length||d.clash.branches.length)?`<section class="day-sec"><h3>합과 충으로 인한 변화</h3>
   ${d.clash.stems.map(v=>`<h4>${esc(v.title)}</h4><p class="day-where">${v.at}의 천간과 부딪힙니다 · ${esc(v.gz)}</p><p>${esc(v.say)}</p>`).join('')}
   ${d.clash.branches.map(v=>`<h4>${esc(v.name)}이 있습니다</h4><p class="day-where">${v.at}의 지지와 마주 봅니다</p><p>${esc(v.say)}</p>`).join('')}
   </section>`:`<section class="day-sec"><h3>합과 충으로 인한 변화</h3><p>오늘의 일진이 원국의 어느 자리와도 정면으로 부딪히지 않습니다. 흔들림이 적은 만큼 미뤄둔 일을 꺼내기에 무리가 없습니다.</p></section>`}

  <section class="day-sec"><h3>12신살과 운성으로 보는 하루</h3>
   <h4>이날의 12운성은 "${d.stage}"</h4>
   <p class="day-where">하루 동안 나에게 작용하는 기질</p><p>${esc(d.stageDay)}</p>
   <h4>이날의 12신살은 "${d.shin.name}"</h4>
   <p class="day-where">하루 동안 나에게 영향을 줄 수 있는 기운</p><p>${esc(d.shin.say)}</p>
  </section>

  <section class="day-sec"><h3>이 점수는 이렇게 나왔어요</h3>
   <table class="daytable"><tbody>
    <tr><th>기본</th><td>—</td><td>${d.base}</td></tr>
    ${d.parts.map(p=>`<tr><th>${p.key}</th><td>${p.value}</td><td>${p.score>0?'+':''}${p.score}</td></tr>`).join('')}
    <tr class="sum"><th>합계</th><td></td><td>${d.score}점</td></tr>
   </tbody></table>
   <p class="hint">일진이 내 일간에 걸리는 방식을 수치로 옮긴 값입니다. 좋고 나쁨의 등급이 아니며, 배점은 이 서비스가 정한 것이라 다른 곳의 점수와 같을 수 없습니다.</p>
   <button class="text-link" data-nav-day="${iso}">이 날로 선택 기록 남기기</button>
   <p class="day-foot">일간 운세는 그날의 흐름을 읽어 드리는 것이지 앞일을 맞히는 것이 아닙니다. 읽고 준비하는 데까지가 이 화면의 몫이에요.</p>
  </section>
 </div>`);}

const jumpNav=fo=>`<div class="jump" role="navigation" aria-label="이 페이지 안에서 이동">${[['topics','주제'],['chart','명식'],['manse','만세력'],['daeun','대운'],['flow','흐름']].map(([id,t])=>`<a href="#${id}">${t}</a>`).join('')}</div>`;
// 값은 0~100을 유지합니다. engine의 월간 비교가 50을 기준으로 나눕니다.
const CONFIDENCE=[[10,'많이 망설여요'],[30,'조금 망설여요'],[50,'반반이에요'],[70,'조금 확신해요'],[90,'확신이 있어요']];
const steps=(n,of=2)=>`<p class="steps" aria-label="${of}단계 중 ${n}단계">${Array.from({length:of},(_,i)=>`<i${i<n?' class="on"':''}></i>`).join('')}<span>${n}/${of}</span></p>`;
const ico=d=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const icon={today:ico('<circle cx="12" cy="12" r="4.2"/><path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M18.1 5.9l-1.5 1.5M7.4 16.6l-1.5 1.5"/>'),result:ico('<path d="M6.2 3.4h11.6v17.2L12 17.1l-5.8 3.5z"/>'),chat:ico('<path d="M4.2 5.2h15.6v10.8H9.6L4.2 19.8z"/>'),choice:ico('<circle cx="12" cy="12" r="8.6"/><path d="M15.7 8.3l-2.2 5.2-5.2 2.2 2.2-5.2z"/>'),records:ico('<path d="M4.4 6.4h15.2M4.4 12h15.2M4.4 17.6h9.6"/>')};
function notice(t){$('#notice').textContent=t;$('#notice').classList.add('visible');clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').classList.remove('visible'),6000);}
const fieldError=(form,key,msg)=>{const el=form.querySelector(`[name="${key}"]`);if(el){el.setAttribute('aria-invalid','true');el.focus();}const box=form.querySelector('.form-error');box.textContent=msg;box.hidden=false;};
function storageLabel(){return {loading:'저장소 연결 중',saved:'저장 완료',saving:'저장 중…',error:'저장하지 못함 · 다시 시도',ready:'저장 준비됨'}[saveState];}
function persist(){if(!loaded){notice('저장소 연결 후 다시 시도해 주세요.');return Promise.resolve(false);}const snapshot=JSON.stringify(data),g=generation;saveState='saving';refreshSave();saveQueue=saveQueue.then(async()=>{if(g!==generation)return false;try{const res=await fetch('/api/journal',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:JSON.parse(snapshot),revision})});const r=await res.json();if(!res.ok)throw new Error(r.error);revision=r.revision;saveState='saved';refreshSave();return true;}catch(e){saveState='error';refreshSave();notice(e.message||'저장하지 못했어요. 현재 입력은 유지됩니다.');return false;}});return saveQueue;}
let badgeTimer=null,badgeShown='',lastPage=null,calMonth=null,aiCoach=null,aiEpic=null,epic=null,epicBusy=false,calTab='일진',calPurpose='이사';
function refreshSave(){const changed=badgeShown!==saveState;badgeShown=saveState;clearTimeout(badgeTimer);
 const settled=saveState==='ready'||(saveState==='saved'&&!changed);
 const paint=hide=>document.querySelectorAll('[data-save-status]').forEach(el=>{el.textContent=storageLabel();el.dataset.state=saveState;el.hidden=hide;});
 paint(settled);
 if(saveState==='saved'&&changed)badgeTimer=setTimeout(()=>paint(true),1800);}
async function nav(to){if(!loaded&&to!=='welcome'&&to!=='settings'){notice('저장소 연결이 필요합니다. 잠시 후 다시 시도해 주세요.');return;}if(!p()&&ENGINE_PAGES.includes(to))to='birth';if(ENGINE_PAGES.includes(to)&&!await engineReady())return;page=to;render();}
function header(){return `<header><button class="brand" data-nav="welcome"><img src="/assets/mark.webp" alt="">달빛 사주</button><button class="plain" data-nav="settings" aria-label="개인정보와 저장 설정">보관함 설정</button></header>`;}
function navBar(){return `<nav aria-label="주요 메뉴">${[['today','오늘'],['result','사주'],['chat','상담'],['choice','선택'],['records','기록']].map(([id,label])=>`<button data-nav="${id}" ${page===id?'aria-current="page"':''}><span aria-hidden="true">${icon[id]}</span>${label}</button>`).join('')}</nav>`;}
function welcome(){return `<section class="welcome"><img class="landscape" src="/assets/splash.webp" fetchpriority="high" decoding="async" alt="보름달 아래 산과 호수, 불빛이 비치는 작은 정자"><span class="vertical">언제나, 당신의 곁에</span><div class="welcome-copy"><img class="mark" src="/assets/mark.webp" alt="달빛 사주"><h1>나를 읽고,<br>내일을 묻다</h1><p>천년의 지혜가 오늘의 당신과 만납니다.</p><button class="primary gold" data-nav="${p()?'result':'birth'}">${p()?'나의 사주 이어보기':'사주 시작하기'}</button><button class="welcome-link" data-nav="chat">이미 상담 중이신가요?</button><small>나를 위한, 달빛 사주</small></div></section>`;}
function birth(){const a=p()||{name:'',birth:'1995-05-17',time:'15:30',calendar:'solar',city:'서울',zone:'Asia/Seoul',longitude:126.978,clock:'civil',gender:'',topics:['진로']};return `<div class="narrow">${steps(1)}<p class="eyebrow">첫 번째 이야기 · 나의 시작</p><h1>태어난 순간에서<br>나의 이야기가 시작돼요.</h1><p class="muted">날짜는 정확히, 모르는 시간은 그대로 알려주세요.</p><form id="birth-form" novalidate><label>이름 또는 별명<input name="name" value="${esc(a.name)}" maxlength="20" autocomplete="given-name" placeholder="어떻게 불러드릴까요?"></label><div class="fields"><label>달력<select name="calendar"><option value="solar" ${a.calendar==='solar'?'selected':''}>양력</option><option value="lunar" ${a.calendar==='lunar'?'selected':''}>한국 음력</option></select></label><label>생년월일<input type="text" inputmode="numeric" name="birth" placeholder="1995-05-17" value="${esc(a.birth)}" aria-describedby="birth-hint"></label></div><p id="birth-hint" class="hint">연-월-일로 입력 · 1900년부터 오늘까지 지원</p><label class="check" id="leap-wrap" ${a.calendar!=='lunar'?'hidden':''}><input type="checkbox" name="leap" ${a.leap?'checked':''}>음력 윤달이에요</label><label>태어난 시간<input name="time" type="time" value="${esc(a.time||'12:00')}" ${a.unknown?'disabled':''}></label><label class="check"><input name="unknown" type="checkbox" ${a.unknown?'checked':''}>태어난 시간을 몰라요</label><p class="hint">시간 미상은 정오 기준 3주를 계산합니다. 절기·날짜 경계에서는 년·월·일주도 달라질 수 있어요.</p><fieldset class="segment"><legend>성별</legend>${[['female','여성'],['male','남성']].map(([v,t])=>`<label><input type="radio" name="gender" value="${v}" ${a.gender===v?'checked':''}>${t}</label>`).join('')}</fieldset><p class="hint">대운의 순행·역행을 가르는 값이라 여쭙습니다. 해석 문구는 성별로 달라지지 않아요.</p><label>태어난 도시<select name="city">${[...new Set(CITIES.map(v=>v[3]))].map(g=>`<optgroup label="${g}">${CITIES.filter(v=>v[3]===g).map(v=>`<option ${v[0]===a.city?'selected':''}>${v[0]}</option>`).join('')}</optgroup>`).join('')}<option ${a.city==='직접 입력'?'selected':''}>직접 입력</option></select></label><details id="precise" ${a.city==='직접 입력'||a.clock==='mean'?'open':''}><summary>정밀 계산 설정</summary><p class="hint">도시를 고르면 시간대와 경도가 자동으로 채워집니다. 대부분 그대로 두셔도 됩니다.</p><div class="fields"><label>시간대 (IANA)<input name="zone" value="${esc(a.zone)}" placeholder="Asia/Seoul" ${a.city!=='직접 입력'?'readonly':''}></label><label>출생지 경도<input name="longitude" type="number" step="0.001" min="-180" max="180" value="${a.longitude}" ${a.city!=='직접 입력'?'readonly':''}></label></div><label>시각 계산 방식<select name="clock"><option value="civil" ${a.clock==='civil'?'selected':''}>출생지의 기록된 현지 시각</option><option value="mean" ${a.clock==='mean'?'selected':''}>지역 경도 보정 · 지방평균태양시</option></select></label><p>한국 음력은 윤달을 포함해 변환합니다. 년·월주는 절기 교체 시각을 기준으로 하고, 일주는 자정에 바뀌는 방식을 사용합니다. 시간대의 과거 표준시·서머타임은 기기의 시간대 데이터에 따릅니다.</p><p>경도 보정은 지방평균태양시이며 균시차까지 반영한 진태양시는 아닙니다. 도시의 경도는 대표 지점이므로 경계 출생은 정확한 경도로 수정하세요. 여러 명리 유파의 계산 방식은 다를 수 있습니다.</p></details><div class="form-error" role="alert" hidden></div><p class="privacy-note">정보는 입력 후 서버의 개인 보관함에 저장됩니다. 이 브라우저의 보안 쿠키로 연결되며 다른 기기와 자동 동기화되지 않습니다. 설정에서 내보내기·전체 삭제가 가능합니다.</p><button class="primary" type="submit">관심 주제 선택하기</button></form></div>`;}
function topicPage(){const a=pendingProfile;return `<div class="narrow">${steps(2)}<p class="eyebrow">두 번째 이야기 · 마음의 방향</p><h1>지금 가장 궁금한<br>이야기는 무엇인가요?</h1><p class="muted">선택한 주제에 맞춰 해석과 행동을 연결해드려요.</p><form id="topic-form"><fieldset><legend>상담 주제 · 여러 개 선택 가능</legend><div class="topic-grid">${topics.map(t=>`<label class="topic-choice"><input type="checkbox" name="topic" value="${t}" ${(a.topics||['진로']).includes(t)?'checked':''}><span>${t}</span></label>`).join('')}</div></fieldset><label>지금의 고민 <span class="hint">선택 사항</span><textarea name="question" maxlength="500" placeholder="예: 이직 제안을 받았는데 안정적인 지금 직장과 고민돼요.">${esc(a.question||'')}</textarea></label><div class="form-error" role="alert" hidden></div><button class="primary">나의 사주 펼쳐보기</button><button type="button" class="secondary" data-nav="birth">정보 다시 확인하기</button></form></div>`;}
function basis(r=result){return `<div class="basis-open"><h3>왜 이렇게 해석했나요?</h3><p>일간은 ${SK[r.day]}${r.pillars[2].gz[0]} (${ELEMENTS[r.element]})입니다. 천간과 지지의 대표 오행을 각각 1개로 세어 총 ${r.total}개를 비교했습니다. ${ELEMENTS.map((e,i)=>`${e} ${r.cnt[i]}개`).join(' · ')}.</p><p>많이 나타난 기운은 ${r.strong.map(i=>ELEMENTS[i]).join('·')}, 적게 나타난 기운은 ${r.weak.map(i=>ELEMENTS[i]).join('·')}입니다. 비율은 개수 분포이며, 용신·신강·신약 판정이나 건강 수치가 아닙니다. 동률이면 모두 표시하며 문장은 첫 기운을 중심으로 구성합니다.</p><p>천간 십성: ${r.pillars.map((v,i)=>`${v.k} ${r.ten[i]}`).join(' · ')}. 일간과 다른 천간의 생극·음양 관계를 보여줍니다. 지장간·합충·대운을 모두 반영한 종합 감정은 아닙니다.</p><p>양력 ${r.solarDate} · ${esc(p().zone)} · UTC${r.offset>=0?'+':''}${r.offset/60}. 일·시 계산 시각 ${r.clockLabel}. 년·월주는 실제 절기 시각, 일주는 자정 기준입니다.</p>${r.unknown?`<p class="warning">시간 미상: 시주를 제외한 ${r.total}자이며 정오 기준입니다. ${r.boundary?'이날에는 절기 또는 날짜 경계로 다른 주도 달라질 수 있어 해석을 확정하면 안 됩니다.':'시간에 따라 시주·분포·관계 해석이 달라집니다.'}</p>`:''}<p>전통 명리의 자기 이해용 해석이며, 성격과 미래를 과학적으로 확정하지 않습니다.</p><a href="https://github.com/6tail/lunar-javascript" target="_blank" rel="noreferrer">절기·간지 계산 자료</a> · <a href="https://github.com/usingsky/korean_lunar_calendar_js" target="_blank" rel="noreferrer">한국 음력 변환 자료</a></div>`;}
function resultPage(){const r=result,a=E.reading(r,p()),ms=E.manse(r),fo=E.fortune(r,p());return `<div class="section-top"><div><p class="eyebrow">${esc(p().name)}님의 사주 노트</p><h1>나를 이해하는 네 개의 기둥</h1></div><button class="plain" data-nav="birth">정보 수정</button></div><section class="core"><span class="overline">지금, 나에게 건네는 말</span><h2>${esc(a.summary)}</h2><p>먼저 조건을 정리하고, 내 여력에 맞는 선택을 해보세요.</p><span class="pill">${p().calendar==='lunar'?'음력 → ':''}양력 ${r.solarDate} · ${r.unknown?'시간 미상':esc(p().time)}</span><span class="pill quiet">${p().clock==='mean'?'정밀 계산':'기본 계산'} · ${esc(p().city||'서울')}</span></section><div class="two-cards"><article class="card"><span class="eyebrow">나의 강점</span><h3>${a.strength}</h3><p>${a.environment}에서 이 힘을 편안하게 쓰는지 돌아보세요.</p></article><article class="card"><span class="eyebrow">돌아볼 패턴</span><h3>${a.caution}</h3><p>${a.balance}</p></article></div>${jumpNav(fo)}<section class="action-card"><span class="eyebrow">오늘, 딱 한 가지</span><h3>${a.action}</h3><button class="text-link" data-nav="choice">이 행동을 선택으로 기록하기</button></section><section class="block" id="topics"><h2 class="block-title">지금 마음이 향하는 이야기</h2>${p().topics.map(t=>{const v=E.topicReading(r,t);return `<article class="card topic-reading"><span class="pill">${t}</span><h3>${v.title}</h3><p>${v.body}</p><p class="concrete">${v.action}</p><div class="basis-open"><h4>이 주제의 해석 근거</h4><p>일간 ${r.pillars[2].gz[0]}, 가장 많이 나타난 ${r.strong.map(i=>ELEMENTS[i]).join('·')}의 개수와 ${t} 주제에 해당하는 자기 점검 질문을 조합했습니다. 사건의 성패를 예언하는 분석은 아닙니다.</p></div><button class="text-link" data-topic-chat="${t}">${t} 고민 이어가기</button></article>`;}).join('')}</section><section class="block" id="chart"><h2 class="block-title">상세 명식과 계산 근거</h2><section class="card"><h2>오행의 균형</h2><div class="balance">${elementRadar(r)}<ul class="element-legend">${ELEMENTS.map((e,i)=>`<li><i style="background:${COLORS[i]}"></i><b>${e}</b><span>${r.cnt[i]}개 · ${r.pct[i]}%</span></li>`).join('')}</ul></div><div class="pillars">${r.pillars.map(v=>`<div><span>${v.k}</span><b>${v.gz[0]}<br>${v.gz[1]}</b><small>${v.label}</small></div>`).join('')}${r.unknown?'<div><span>시주</span><b>未<br>詳</b><small>시간 미상</small></div>':''}</div>${basis()}</section></section><section class="block" id="manse"><h2 class="block-title">만세력 상세 · 지장간과 십이운성</h2><section class="card"><table class="manse"><thead><tr><th>자리</th><th>천간</th><th>지지</th><th>지장간</th><th>십이운성</th></tr></thead><tbody>${ms.rows.map(x=>`<tr><th>${x.key}</th><td><b>${x.gz[0]}</b> <small>${x.stem}</small></td><td><b>${x.gz[1]}</b> <small>${x.branch}</small></td><td>${x.hidden.map(h=>`<span>${h.k}<small>${h.ten}</small></span>`).join('')}</td><td>${x.stage}${x.marks.length?`<em>${x.marks.join(' · ')}</em>`:''}</td></tr>`).join('')}</tbody></table><p class="hint">공망은 ${ms.empty.join('·')}입니다. 십이운성과 신살은 명식에서 읽히는 자리 이름이며 좋고 나쁨의 등급이 아닙니다.</p></section></section>${fo?`<section class="block" id="daeun"><h2 class="block-title">대운 · 10년의 흐름</h2><section class="card"><p class="hint">${fo.forward?'순행':'역행'} · 대운수 ${fo.start} — 년간 ${SK[r.pillars[0].s]}(${r.pillars[0].s%2===0?'양':'음'})과 ${p().gender==='male'?'남성':'여성'}이라 ${fo.forward?'순행':'역행'}합니다.</p><ol class="daeun">${fo.list.map(d=>`<li><b>${d.age}세</b><span class="gz">${d.gz}</span><small>${d.label}</small><em>${d.ten} · ${d.stage}</em></li>`).join('')}</ol></section></section>`:'<section class="block" id="daeun"><h2 class="block-title">대운 · 10년의 흐름</h2><section class="card"><p>대운은 순행과 역행이 성별에 따라 갈려서, 성별을 알려주시면 계산해드릴 수 있어요.</p><button class="text-link" data-nav="birth">정보에 성별 추가하기</button></section></section>'}${epicBlock()}<section class="block" id="flow"><h2 class="block-title">올해에서 오늘까지의 흐름</h2>${flowCards(true)}</section><button class="primary mobile-only" data-nav="chat">달빛 도령과 이야기하기</button>`;}
function flowCards(bare){return `<section class="card">${bare?'':'<h2>올해에서 오늘까지</h2>'}<p class="hint">${today()} · 한국 시각 기준 · 일간과 흐름의 천간 관계</p><div class="flows">${E.flow(result,today()).map((f,i)=>`<article><span class="eyebrow">${['올해','이번 달','선택한 날'][i]} · ${f.p.gz} · ${f.god}</span><h3>${f.title}</h3><p>${f.body}</p></article>`).join('')}</div><p class="hint">연·월은 절기 기준입니다. 관계 해석은 돌아볼 주제를 제안하며 좋고 나쁨의 등급이나 확률이 아닙니다.</p></section>`;}
const DAILY_ART=[['todayRest','달빛이 비치는 고요한 계곡'],['todayTalk','매화 가지에 앉은 까치 두 마리'],['todayDeal','잔잔한 물가에 매인 나룻배'],['todayDuty','절벽 위에 홀로 선 소나무'],['todayStart','해 뜨는 강 위를 나는 학 두 마리']];
function dailyArt(rel){const [n,alt]=DAILY_ART[rel]??DAILY_ART[0];return `<img src="/assets/${n}.webp" width="760" height="300" decoding="async" alt="${alt}">`;}
function todayPage(){const f=E.flow(result,today())[2],due=data.records.filter(r=>r.due&&r.due<=today()&&r.result==='pending'),mo=E.moonPhase(today()),sig=E.daySignals(result,today());return `<p class="eyebrow">${now().setLocale('ko').toFormat('M월 d일 cccc')} · 한국 시각 · <span class="moon-inline">${moonSvg(mo.frac,mo.waxing,15)}${mo.name}</span></p><p class="dayname">오늘은 <b>${E.dayName(today()).name}</b>, ${E.dayName(today()).label}일이에요.</p><h1>오늘, 나에게 맞는 속도로.</h1><section class="daily-image">${dailyArt(f.rel)}<div><span>${f.p.gz} · ${f.god}</span><h2>${f.title}</h2><p>${f.body}</p></div></section><section class="signals"><div><span class="eyebrow">기운이 도는 시간</span><b>${sig.hour.label} <small>${sig.hour.from}–${sig.hour.to}</small></b><p>${sig.hour.basis}</p></div><div><span class="eyebrow">오늘 곁에 둘 색</span><b><i class="swatch" style="background:${sig.color.hex}"></i>${sig.color.name}</b><p>${sig.color.basis}</p></div></section><section class="action-card"><span class="eyebrow">오늘의 행동</span><h3>${E.reading(result,p()).action}</h3><button class="text-link" data-nav="choice">선택 기록 남기기</button></section>${due.length?`<section class="card"><h2>돌아볼 시간이 되었어요</h2>${due.map(r=>`<button class="record-row" data-record="${r.id}"><b>${esc(r.title)}</b><span>${dateLabel(r.due)} 회고 예정 · 결과 남기기</span></button>`).join('')}<p class="hint">이 안내는 방문할 때 표시됩니다. 자동 알림은 발송되지 않습니다.</p></section>`:''}<section class="block" id="cal"><h2 class="block-title">달력</h2><div class="tabs" role="tablist">${['일진','택일'].map(t=>`<button role="tab" aria-selected="${t===calTab}" class="tab${t===calTab?' on':''}" data-caltab="${t}">${t==='일진'?'일진 캘린더':'택일'}</button>`).join('')}</div>${calTab==='일진'?calendar():selectDays()}</section>${flowCards()}`;}
function currentConversation(){let c=ct();if(!c&&p()){c={id:uid(),created:new Date().toISOString(),profileKey:profileKey(),profileName:p().name,topic:p().topics[0],context:null,messages:[{id:uid(),role:'assistant',text:`안녕하세요, ${p().name}님. 달빛 도령입니다.\n사주와 함께 지금의 상황을 차분히 정리해볼게요. 어떤 선택을 고민하고 계신가요?`,at:new Date().toISOString()}]};data.conversations.push(c);activeConversation=c.id;}return c;}
function profileKey(){return JSON.stringify([p()?.birth,p()?.time,p()?.zone,p()?.calendar,p()?.unknown,p()?.clock,p()?.longitude]);}
function chatPanel(){const c=currentConversation();return `<section class="chat-panel"><div class="mentor"><img src="/assets/mentorAvatar.webp" alt="달빛 도령"><div><h2>달빛 도령</h2><span>${aiCoach?'달빛 사주 AI 상담':'문맥을 이어가는 체험 코칭'}</span></div><button class="plain" data-action="chat-history">이전 상담</button></div><p class="chat-note">${aiCoach?'사주와 대화 내용을 함께 읽고 답합니다. 사람 상담사가 아니며, 의료·법률·투자 판단에는 쓰지 마세요.':'AI·전문 상담사와의 실시간 대화가 아닙니다. 사주와 입력한 상황을 활용한 규칙 기반 코칭입니다.'}</p><div class="messages" role="log" aria-live="polite">${(c?.messages||[]).map(m=>`<article class="message ${m.role}"><div class="bubble">${esc(m.text)}</div>${m.role==='assistant'?`<div class="answer-tools"><button data-copy="${m.id}">복사</button><button data-save-answer="${m.id}">${data.savedAnswers.some(a=>a.messageId===m.id)?'저장됨':'저장'}</button><button data-share="${m.id}">공유</button></div>`:''}<time>${DateTime.fromISO(m.at).toFormat('HH:mm')}</time></article>`).join('')}${(c?.pending?'<article class="message assistant pending"><div class="bubble"><i></i><i></i><i></i><span class="sr-only">답변을 작성하고 있어요</span></div></article>':'')}</div><div class="quick-topics">${p().topics.map(t=>`<button data-quick="${t} 고민이 있어요">${t} 이야기</button>`).join('')}</div><form id="chat-form"><label class="sr-only" for="chat-input">상담 메시지</label><textarea id="chat-input" name="message" rows="2" maxlength="1500" placeholder="선택지와 걱정되는 조건을 들려주세요."></textarea><button class="send" aria-label="메시지 보내기">보내기</button></form><p class="hint chat-foot">건강·투자·법률 판단은 해당 전문가에게 확인해 주세요.</p></section>`;}
function choicePage(){const cyc=Array.from({length:15},(_,i)=>E.moonPhase(now().minus({days:14-i*1}).toISODate()));const mo=cyc[14];
 return `<div class="narrow"><section class="compass"><div class="dial">${cyc.map((m,i)=>{const a=(-90+i*24)*Math.PI/180;return `<span class="tick${i===14?' now':''}" style="left:${(50+Math.cos(a)*40).toFixed(1)}%;top:${(50+Math.sin(a)*40).toFixed(1)}%">${moonSvg(m.frac,m.waxing,i===14?20:13)}</span>`;}).join('')}<div class="dial-core"><img src="/assets/compassCore.webp" alt="" width="120" height="120"><b>${now().setLocale('ko').toFormat('M월 d일')}</b><small>${mo.name}</small></div></div><p class="hint">최근 보름의 달 흐름</p></section><p class="eyebrow">선택을 남기면, 나만의 기준이 보여요</p>`+`<h1>오늘의 선택을<br>내일의 나에게.</h1><form id="record-form"><fieldset class="presets"><legend>어떤 선택 앞에 있나요?</legend>${[['이직 제안에 답하기','진로'],['마음을 고백하기','연애'],['새로운 일을 시작하기','진로'],['큰 지출을 결정하기','재물']].map(([t,tp])=>`<button type="button" data-preset="${esc(t)}" data-preset-topic="${tp}">${t}</button>`).join('')}</fieldset><label>어떤 선택을 앞두고 있나요?<input name="title" maxlength="100" placeholder="직접 적어도 좋아요" required></label><label>주제<select name="topic">${topics.map(t=>`<option>${t}</option>`).join('')}</select></label><label>선택할 날짜<input name="date" type="date" value="${selectedDate}" required></label><fieldset class="scale"><legend>지금 이 선택에 얼마나 마음이 기울었나요?</legend><div class="scale-poles"><span>아직 망설여요</span><span>마음이 분명해요</span></div><div class="scale-row">${CONFIDENCE.map(([v,label],i)=>`<label class="dot d${i}"><input type="radio" name="confidence" value="${v}" ${v===50?'checked':''}><i></i><span>${label}</span></label>`).join('')}</div></fieldset><label>예상하는 결과와 이유<textarea name="expectation" maxlength="1000" placeholder="기대하는 변화와 걱정되는 점을 남겨보세요."></textarea></label><label>언제 돌아볼까요?<select name="delay"><option value="1">1일 후</option><option value="3" selected>3일 후</option><option value="7">7일 후</option></select></label><p class="privacy-note">저장 후 캘린더 일정을 내려받을 수 있어요. 캘린더 앱에서 가져오기를 완료해야 알림이 등록됩니다. 사이트의 푸시·이메일 자동 발송은 아직 연결되지 않았습니다.</p><div class="form-error" role="alert" hidden></div><button class="primary">선택 저장하고 다시 돌아보기</button></form></div>`;}
function recordsPage(){const m=E.monthly(data.records,month),filtered=m.list.filter(r=>recordFilter==='all'||(recordFilter==='pending'?r.result==='pending':r.result!=='pending'));const days=DateTime.fromISO(month+'-01').daysInMonth,offset=DateTime.fromISO(month+'-01').weekday%7;return `<div class="section-top"><div><p class="eyebrow">선택이 쌓이면, 나의 기준이 됩니다</p><h1>나의 기록</h1></div><button class="plain" data-nav="choice">새 기록</button></div><div class="month-nav"><button data-month="-1" aria-label="이전 달">‹</button><h2>${month.replace('-','년 ')}월</h2><button data-month="1" aria-label="다음 달">›</button></div><section class="card"><div class="calendar">${['일','월','화','수','목','금','토'].map(v=>`<span>${v}</span>`).join('')}${Array.from({length:offset},()=>'<span></span>').join('')}${Array.from({length:days},(_,i)=>{const day=month+'-'+String(i+1).padStart(2,'0'),n=m.list.filter(r=>r.date===day).length;return `<button data-day="${day}" class="${n?'has-record':''}" aria-label="${dateLabel(day)}, 기록 ${n}개">${i+1}${n?`<small>${n}</small>`:''}</button>`;}).join('')}</div></section><section class="card"><span class="eyebrow">이번 달 돌아보기</span><div class="stats"><div><b>${m.list.length}</b><span>선택 기록</span></div><div><b>${m.done.length}</b><span>결과 기록</span></div><div><b>${m.list.filter(r=>r.mood).length}</b><span>감정 기록</span></div></div><p>${m.insight}</p>${Object.keys(m.moods).length?`<div class="mood-summary">${Object.entries(m.moods).map(([k,v])=>`<span>${esc(k)} ${v}회</span>`).join('')}</div>`:'<p class="hint">결과를 남길 때 감정도 함께 선택해보세요.</p>'}</section><div class="filters">${[['all','전체'],['pending','돌아볼 선택'],['done','결과 남김']].map(([id,label])=>`<button data-filter="${id}" aria-pressed="${recordFilter===id}">${label}</button>`).join('')}</div>${filtered.length?filtered.sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<button class="record-row card" data-record="${r.id}"><span class="eyebrow">${dateLabel(r.date)} · ${esc(r.topic)}</span><h3>${esc(r.title)}</h3><p>${r.result==='pending'?`${dateLabel(r.due)}에 돌아보기`:resultLabel(r.result)} · 당시 확신 ${r.confidence}</p></button>`).join(''):'<div class="empty"><h3>아직 이 달의 기록이 없어요.</h3><p>큰 결정이 아니어도 좋아요. 오늘의 작은 선택부터 남겨보세요.</p><button class="secondary" data-nav="choice">첫 선택 기록하기</button></div>'}`;}
const resultLabel=v=>({pending:'아직 결과를 기다려요',good:'만족스러운 결과',neutral:'아직 판단하기 어려워요',rethink:'다르게 선택하고 싶어요'}[v]||'결과 미상');
function settingsPage(){return `<div class="narrow"><p class="eyebrow">나의 이야기, 나의 권한</p><h1>개인 보관함</h1><section class="card"><h2>어디에 저장되나요?</h2><p>프로필·상담·선택 기록·저장한 답변은 서버 데이터베이스에 보관됩니다. 이 브라우저의 보안 쿠키로만 보관함을 연결합니다.</p><p>쿠키를 지우거나 다른 기기를 쓰면 기존 기록을 다시 열 수 없습니다. 기기 간 로그인·복구는 아직 지원하지 않으므로 중요한 기록은 내보내기로 보관하세요.</p><p>외부 AI 또는 알림 발송 서비스로 대화가 전송되지 않습니다. 운영 서버 관리자 접근을 막는 종단간 암호화 서비스는 아닙니다.</p><button class="secondary" data-action="retry" data-save-status>${storageLabel()}</button></section><section class="card"><h2>내 기록 가져가기</h2><p>프로필·상담·선택 기록을 JSON 또는 읽기 쉬운 문서로 내보냅니다. 파일에는 개인정보가 포함됩니다.</p><div class="button-row"><button class="secondary" data-action="export-json">JSON 내보내기</button><button class="secondary" data-action="export-text">문서 내보내기</button></div></section><section class="card"><h2>저장한 상담 답변</h2>${data.savedAnswers.length?data.savedAnswers.map(a=>`<details><summary>${esc(a.text.slice(0,45))}</summary><p class="preline">${esc(a.text)}</p><button class="plain" data-remove-answer="${a.id}">저장 해제</button></details>`).join(''):'<p class="muted">상담 답변 아래의 ‘저장’을 누르면 이곳에 모입니다.</p>'}</section><section class="card"><h2>연결 상태</h2><p>체험 코칭: 사용 가능<br>실제 AI 상담: ${aiCoach?'연결됨':'미연결'}<br>자동 푸시·이메일: 미연결<br>캘린더 회고 일정: 파일 가져오기 방식</p></section><section class="card danger-zone"><h2>개인정보 전체 삭제</h2><p>현재 보관함의 프로필, 상담, 기록과 저장한 답변을 삭제합니다. 삭제 후 복구할 수 없습니다.</p><button class="danger" data-action="delete-all">내 정보와 기록 모두 삭제</button></section></div>`;}
function render(){const main={welcome,birth,topic:topicPage,result:resultPage,today:todayPage,chat:()=>'',choice:choicePage,records:recordsPage,settings:settingsPage}[page];const dual=p()&&['result','chat'].includes(page);$('#app').innerHTML=page==='welcome'?welcome():`${header()}<div class="workspace ${dual?'dual':''}"><main id="main">${page==='chat'?resultPage():main()}</main>${dual?`<aside>${chatPanel()}</aside>`:''}</div>${['birth','topic','settings'].includes(page)?'':navBar()}<button class="save-status" data-action="retry" data-save-status>${storageLabel()}</button>`;document.body.dataset.page=page;if(lastPage!==page){lastPage=page;window.scrollTo(0,0);}dressPage({page,result,profile:p()});bind();refreshSave();scrollChat();}
function scrollChat(){const a=$('.messages');if(a)a.scrollTop=a.scrollHeight;}
function openModal(html){const m=$('#modal');m.innerHTML=`<button class="modal-close plain" data-close aria-label="닫기">닫기 ×</button>${html}`;if(!m.open)m.showModal();m.querySelector('[data-close]').onclick=()=>m.close();m.addEventListener('click',e=>{if(e.target===m)m.close();},{once:true});bind(m);}
function recordDetail(id){const r=data.records.find(r=>r.id===id);if(!r)return;openModal(`<p class="eyebrow">${dateLabel(r.date)}의 선택</p><h2>${esc(r.title)}</h2><section class="compare"><div><span>선택 당시</span><p>${esc(r.expectation||'예상을 남기지 않았어요.')}</p><small>확신 ${r.confidence} / 100</small></div><div><span>그날의 해석</span><p>${esc(r.advice||'이전 버전의 기록입니다.')}</p></div></section><form id="edit-record" data-id="${id}"><label>선택 제목<input name="title" maxlength="100" value="${esc(r.title)}" required></label><label>실제 결과<select name="result">${['pending','good','neutral','rethink'].map(v=>`<option value="${v}" ${r.result===v?'selected':''}>${resultLabel(v)}</option>`).join('')}</select></label><label>돌아본 마음<select name="mood"><option value="">아직 선택하지 않음</option>${['기뻐요','편안해요','보통이에요','아쉬워요','속상해요'].map(v=>`<option ${r.mood===v?'selected':''}>${v}</option>`).join('')}</select></label><label>예상과 실제는 어떻게 달랐나요?<textarea name="actual" maxlength="1500">${esc(r.actual||'')}</textarea></label><label>회고 날짜<input type="date" name="due" value="${r.due}"></label><div class="form-error" role="alert" hidden></div><button class="primary">수정 내용 저장</button></form><button class="secondary" data-calendar="${id}">회고 일정 캘린더에 등록하기</button><p class="hint">캘린더 파일을 가져와야 일정·알림이 등록됩니다. 알림 허용 여부는 캘린더 앱에서 확인하세요.</p><button class="danger" data-delete-record="${id}">이 기록 삭제</button>`);}
function download(name,content,type='text/plain;charset=utf-8'){const u=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function calendarFile(id){const r=data.records.find(v=>v.id===id),date=DateTime.fromISO(r.due,{zone:'Asia/Seoul'}).set({hour:20}).toUTC(),fmt=d=>d.toFormat("yyyyMMdd'T'HHmmss'Z'");download('달빛-회고.ics',['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dalbit//Reflection//KO','BEGIN:VEVENT',`UID:${r.id}@dalbit`,`DTSTAMP:${fmt(DateTime.utc())}`,`DTSTART:${fmt(date)}`,`DTEND:${fmt(date.plus({minutes:15}))}`,'SUMMARY:달빛 사주 - 나의 선택 돌아보기','DESCRIPTION:달빛 사주 보관함에서 선택 당시의 예상과 실제 결과를 돌아보세요.','BEGIN:VALARM','TRIGGER:-PT10M','ACTION:DISPLAY','DESCRIPTION:나의 선택을 돌아볼 시간이에요.','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n')+'\r\n','text/calendar;charset=utf-8');notice('파일을 캘린더 앱에서 가져와 주세요. 가져오기 전에는 알림이 예약되지 않습니다.');}
function getMessage(id){return data.conversations.flatMap(c=>c.messages).find(m=>m.id===id);}
function exportText(){return ['달빛 사주 개인 보관함',JSON.stringify(p(),null,2),'\n선택 기록',...data.records.map(r=>`${r.date} ${r.title}\n예상: ${r.expectation}\n결과: ${resultLabel(r.result)}\n회고: ${r.actual||''}`),'\n상담',...data.conversations.map(c=>c.messages.map(m=>`${m.role==='user'?'나':'달빛 도령'} (${m.at})\n${m.text}`).join('\n\n')),'\n저장한 답변',...data.savedAnswers.map(a=>a.text)].join('\n\n');}
function bind(root=document){root.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));root.querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>recordDetail(b.dataset.record));root.querySelectorAll('[data-fday]').forEach(b=>b.onclick=()=>dayDetail(b.dataset.fday));root.querySelectorAll('[data-nav-day]').forEach(b=>b.onclick=()=>{selectedDate=b.dataset.navDay;$('#modal').close();nav('choice');});root.querySelectorAll('[data-caltab]').forEach(b=>b.onclick=()=>{calTab=b.dataset.caltab;render();});root.querySelectorAll('[data-purpose]').forEach(b=>b.onclick=()=>{calPurpose=b.dataset.purpose;render();});root.querySelectorAll('[data-cal]').forEach(b=>b.onclick=()=>{calMonth=DateTime.fromISO((calMonth||now().toFormat('yyyy-MM'))+'-01').plus({months:Number(b.dataset.cal)}).toFormat('yyyy-MM');render();});root.querySelectorAll('[data-topic-chat]').forEach(b=>b.onclick=()=>{activeConversation=null;page='chat';const c=currentConversation();c.topic=b.dataset.topicChat;render();sendMessage(`${c.topic} 고민을 정리하고 싶어요`);});root.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>sendMessage(b.dataset.quick));root.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(getMessage(b.dataset.copy).text);notice('답변을 복사했어요.');}catch{notice('복사 권한이 없어요. 답변을 직접 선택해 복사해 주세요.');}});root.querySelectorAll('[data-save-answer]').forEach(b=>b.onclick=()=>{const m=getMessage(b.dataset.saveAnswer);if(data.savedAnswers.some(a=>a.messageId===m.id)){notice('이미 보관함에 저장했어요.');return;}data.savedAnswers.push({id:uid(),messageId:m.id,text:m.text,at:new Date().toISOString()});persist();render();});root.querySelectorAll('[data-share]').forEach(b=>b.onclick=async()=>{const m=getMessage(b.dataset.share);try{if(navigator.share)await navigator.share({title:'달빛 사주 상담',text:m.text});else{await navigator.clipboard.writeText(m.text);notice('공유할 답변을 복사했어요.');}}catch(e){if(e.name!=='AbortError')notice('공유할 수 없어요. 복사 기능을 이용해 주세요.');}});root.querySelectorAll('[data-remove-answer]').forEach(b=>b.onclick=()=>{data.savedAnswers=data.savedAnswers.filter(a=>a.id!==b.dataset.removeAnswer);persist();render();});root.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{month=DateTime.fromISO(month+'-01').plus({months:Number(b.dataset.month)}).toFormat('yyyy-MM');render();});root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{recordFilter=b.dataset.filter;render();});root.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{const list=data.records.filter(r=>r.date===b.dataset.day);if(list.length)openModal(`<h2>${dateLabel(b.dataset.day)}의 기록</h2>${list.map(r=>`<button class="record-row" data-record="${r.id}">${esc(r.title)}</button>`).join('')}`);else{selectedDate=b.dataset.day;nav('choice');}});root.querySelectorAll('[data-calendar]').forEach(b=>b.onclick=()=>calendarFile(b.dataset.calendar)); root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));
 const bf=root.querySelector('#birth-form');if(bf){bf.elements.calendar.onchange=()=>{$('#leap-wrap').hidden=bf.elements.calendar.value!=='lunar';};bf.elements.unknown.onchange=()=>{bf.elements.time.disabled=bf.elements.unknown.checked;};bf.elements.city.onchange=()=>{const c=CITIES.find(c=>c[0]===bf.elements.city.value);for(const key of ['zone','longitude'])bf.elements[key].readOnly=!!c;if(c){bf.elements.zone.value=c[1];bf.elements.longitude.value=c[2];}else{const d=$('#precise');if(d)d.open=true;}};bf.onsubmit=async e=>{e.preventDefault();const f=new FormData(bf);const a={name:String(f.get('name')).trim(),birth:String(f.get('birth')).trim(),calendar:f.get('calendar'),leap:f.has('leap'),unknown:f.has('unknown'),time:f.get('time')||'12:00',city:f.get('city'),zone:String(f.get('zone')).trim(),longitude:Number(f.get('longitude')),clock:f.get('clock'),gender:f.get('gender')||'',topics:p()?.topics||['진로'],question:p()?.question||''};if(!f.has('unknown')&&!f.get('time'))return fieldError(bf,'time','시간을 입력하거나 시간 모름을 선택해 주세요.');if(!a.name)return fieldError(bf,'name','이름 또는 별명을 입력해 주세요.');if(!/^\d{4}-\d{2}-\d{2}$/.test(a.birth))return fieldError(bf,'birth','날짜를 1995-05-17처럼 입력해 주세요.');if(!await engineReady())return;try{E.calculate(a);pendingProfile=a;page='topic';render();}catch(err){fieldError(bf,'birth',err.message);}};}
 const tf=root.querySelector('#topic-form');if(tf)tf.onsubmit=async e=>{e.preventDefault();const f=new FormData(tf),selected=f.getAll('topic');if(!selected.length)return fieldError(tf,'topic','관심 주제를 한 가지 이상 골라주세요.');if(!await engineReady())return;data.profile={...pendingProfile,topics:selected,question:f.get('question')};result=E.calculate(p());activeConversation=data.conversations.findLast(c=>c.profileKey===profileKey())?.id||null;persist();nav('result');};
 const cf=root.querySelector('#chat-form');if(cf){cf.onsubmit=e=>{e.preventDefault();sendMessage(cf.elements.message.value);};cf.elements.message.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();cf.requestSubmit();}};}
 root.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const f=root.querySelector('#record-form');if(!f)return;f.elements.title.value=b.dataset.preset;f.elements.topic.value=b.dataset.presetTopic;f.elements.title.focus();});
 const rf=root.querySelector('#record-form');if(rf){rf.onsubmit=async e=>{e.preventDefault();const f=new FormData(rf),title=String(f.get('title')).trim(),date=String(f.get('date'));if(!title)return fieldError(rf,'title','선택의 제목을 입력해 주세요.');if(!DateTime.fromISO(date).isValid)return fieldError(rf,'date','선택 날짜를 확인해 주세요.');if(!await engineReady())return;const r={id:uid(),title,date,topic:f.get('topic'),confidence:Number(f.get('confidence')),expectation:f.get('expectation'),due:DateTime.fromISO(date).plus({days:Number(f.get('delay'))}).toISODate(),result:'pending',mood:'',actual:'',advice:E.topicReading(result,f.get('topic')).action,created:new Date().toISOString()};data.records.push(r);persist();month=date.slice(0,7);page='records';render();recordDetail(r.id);};}
 const ef=root.querySelector('#edit-record');if(ef){ef.onsubmit=e=>{e.preventDefault();const r=data.records.find(r=>r.id===ef.dataset.id),f=new FormData(ef);if(!String(f.get('title')).trim())return fieldError(ef,'title','선택의 제목을 입력해 주세요.');if(!DateTime.fromISO(f.get('due')).isValid)return fieldError(ef,'due','회고 날짜를 확인해 주세요.');Object.assign(r,{title:String(f.get('title')).trim(),result:f.get('result'),mood:f.get('mood'),actual:f.get('actual'),due:f.get('due')});persist();$('#modal').close();render();};const b=root.querySelector('[data-delete-record]');b.onclick=()=>{const id=ef.dataset.id;openModal('<h2>이 기록을 삭제할까요?</h2><p>예상과 회고 내용도 함께 삭제됩니다. 캘린더 일정은 캘린더 앱에서 별도로 삭제해 주세요.</p><button class="danger" id="confirm-delete-record">삭제하기</button>');$('#confirm-delete-record').onclick=()=>{data.records=data.records.filter(r=>r.id!==id);persist();$('#modal').close();render();};};}
}
// 실제 상담이 붙어 있는지 한 번만 확인합니다. 확인에 실패하면 없는 것으로
// 봅니다 — 규칙 기반 코칭이 늘 답을 내주므로 대화가 끊기지 않습니다.
async function coachAvailable(){
 if(aiCoach!==null)return aiCoach;
 try{const r=await fetch('/api/coach');aiCoach=r.ok&&(await r.json()).available===true;}catch{aiCoach=false;}
 return aiCoach;
}
// 명식은 계산된 값만 골라 보냅니다. 자유 문장은 대화 쪽에만 실립니다.
const chartFor=c=>({name:p().name,pillars:result.pillars.map(v=>v.gz),dayStem:SK[result.day],
 element:ELEMENTS[result.element],strong:result.strong.map(i=>ELEMENTS[i]),weak:result.weak.map(i=>ELEMENTS[i]),
 topics:p().topics,today:E.dayName(today()).name+' '+E.dayName(today()).label+'일'});

// 짧은 수긍 한 마디로 기록이 남습니다. 판정은 클라이언트에서 합니다 —
// 모델을 한 번 더 부르지 않아 즉시 반응하고, 같은 말에 늘 같게 동작합니다.
const batchim=w=>{const c=(w||'').charCodeAt((w||'').length-1);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28!==0;};
const YES=/^(응+|웅+|엉+|어+|네+|넹+|예+|ㅇ+|ㅇㅋ|오케이|오키|그래+|그러자|좋아요?|해줘|해주세요|부탁(해|해요|드려요)?|기록(해|해줘|해주세요)?|남겨(줘|주세요)?|등록(해|해줘)?|ok|okay|yes)[.!~\s]*$/i;
const NO=/(아니|아뇨|아니요|괜찮|나중|싫|됐어|하지\s*마|no)/i;
const affirmative=t=>{const v=t.trim();return v.length<=14&&YES.test(v);};

// 상담 중 남기는 기록. 선택 화면에서 만드는 것과 같은 모양이어야 회고·월간
// 집계가 그대로 동작합니다.
function recordFromOffer(o){
 const date=today();
 const r={id:uid(),title:o.title,date,topic:o.topic,confidence:50,expectation:o.expectation||'',
  due:DateTime.fromISO(date).plus({days:7}).toISODate(),result:'pending',mood:'',actual:'',
  advice:E.topicReading(result,o.topic).action,created:new Date().toISOString()};
 data.records.push(r);return r;}

// 대운 판독. 한 번 받아 두면 화면에 남고, 다시 열 때만 새로 부릅니다.
async function epicAvailable(){
 if(aiEpic!==null)return aiEpic;
 try{const r=await fetch('/api/epic');aiEpic=r.ok&&(await r.json()).available===true;}catch{aiEpic=false;}
 return aiEpic;
}
async function loadEpic(){
 const f=E.fortune(result,p());
 if(!f){notice('대운을 계산하려면 성별이 필요해요. 정보 수정에서 선택해 주세요.');return;}
 if(!await epicAvailable()){notice('판독이 아직 연결되지 않았어요.');return;}
 epicBusy=true;render();
 try{
  const r=await fetch('/api/epic',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({name:p().name,pillars:result.pillars.map(v=>v.gz),dayStem:SK[result.day],
    element:ELEMENTS[result.element],strong:result.strong.map(i=>ELEMENTS[i]),weak:result.weak.map(i=>ELEMENTS[i]),
    forward:f.forward,start:f.start,cycles:f.list.map(c=>({age:c.age,gz:c.gz,label:c.label,ten:c.ten,stage:c.stage}))})});
  const j=await r.json();
  if(r.ok&&j.reading)epic=j.reading;else notice(j.error||'판독을 불러오지 못했어요.');
 }catch{notice('판독을 불러오지 못했어요.');}
 epicBusy=false;render();
}

function epicBlock(){
 if(!aiEpic&&!epic)return '';
 if(!epic)return `<section class="block" id="epic"><h2 class="block-title">대운 판독</h2><p class="hint">여덟 구간의 대운을 한 편의 서사로 읽어 드려요. 계산된 명식과 십이운성만 재료로 씁니다.</p><button class="secondary" data-action="epic" ${epicBusy?'disabled':''}>${epicBusy?'읽는 중…':'판독 열기'}</button></section>`;
 const e=epic;
 return `<section class="block epic" id="epic"><h2 class="block-title">대운 판독</h2>
  <div class="epic-head"><span class="epic-en">${esc(e.en)}</span><b class="epic-kr">${esc(e.kr)}</b><span class="epic-idx">${esc(e.idx)}</span></div>
  <p class="epic-pull">${esc(e.pull).replace(/\n/g,'<br>')}</p>
  ${e.chapters.map(c=>`<article class="epic-ch"><div class="epic-ch-head"><span>${esc(c.age)}</span><span class="epic-en">${esc(c.en)}</span><b>${esc(c.kr)}</b></div>
   <p class="epic-pillar">${esc(c.pillar)}</p><p class="epic-gate">${esc(c.gate)}</p>
   <p class="epic-body">${esc(c.body)}</p><p class="epic-essay">${esc(c.essay)}</p></article>`).join('')}
  <p class="epic-close">${esc(e.closing)}</p>
  <button class="text-link" data-action="epic">다시 읽기</button></section>`;}

async function sendMessage(text){text=text.trim();if(!text)return;if(text.length>1500){notice('메시지는 1,500자 이내로 입력해 주세요.');return;}const c=currentConversation();if(c.profileKey!==profileKey()){notice('이전 사주의 상담입니다. 새 상담을 시작해 주세요.');return;}if(!await engineReady())return;c.messages.push({id:uid(),role:'user',text,at:new Date().toISOString()});
 // 직전 답변이 기록을 제안했다면, 수긍 한 마디로 바로 남깁니다.
 if(c.offer){
  const o=c.offer;c.offer=null;
  if(affirmative(text)){
   const r=recordFromOffer(o);
   c.messages.push({id:uid(),role:'assistant',source:'record',at:new Date().toISOString(),
    text:`남겨두었어요. “${o.title}”${batchim(o.title)?'을':'를'} ${dateLabel(r.due)}에 다시 꺼내 드릴게요.\n그때 어떻게 됐는지 알려주시면 기록이 이어집니다.`});
   persist();render();notice('선택 기록에 남겼어요.');return;
  }
  if(NO.test(text)){
   c.messages.push({id:uid(),role:'assistant',source:'record',at:new Date().toISOString(),
    text:'알겠어요, 남기지 않을게요. 계속 이야기해요.'});
   persist();render();return;
  }
 }
 // 규칙 기반 답을 먼저 만들어 둡니다. 실제 상담이 없거나 실패해도 이 답이
 // 나가므로 사용자는 빈 화면을 보지 않습니다.
 const fallback=E.coach(result,p(),c,text);
 Object.assign(c,{topic:fallback.topic||c.topic,context:fallback.context||c.context});
 let reply=fallback.text,source='rules';
 if(fallback.phase!=='safety'&&await coachAvailable()){
  c.pending=true;render();
  try{
   const r=await fetch('/api/coach',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chart:chartFor(c),messages:c.messages.filter(m=>m.role!=='system').slice(-12).map(m=>({role:m.role,text:m.text}))})});
   const j=await r.json();
   if(r.ok&&j.text){reply=j.text;source=j.source;if(j.offer)c.offer=j.offer;}
   else if(r.status===429)notice('잠시 뒤에 다시 물어봐 주세요.');
  }catch{/* 폴백 답을 그대로 씁니다 */}
  c.pending=false;
 }
 c.messages.push({id:uid(),role:'assistant',text:reply,source,at:new Date().toISOString()});persist();render();}
async function action(a){if(a==='epic'){if(await engineReady())await loadEpic();return;}if(a==='retry'){if(!loaded)await load();else await persist();return;}if(a==='export-json'){download('달빛-보관함.json',JSON.stringify(data,null,2),'application/json');return;}if(a==='export-text'){download('달빛-보관함.txt',exportText());return;}if(a==='chat-history'){openModal(`<h2>이전 상담 이어가기</h2><button class="secondary" id="new-chat">새 상담 시작하기</button>${data.conversations.slice().reverse().map(c=>`<button class="record-row" data-conversation="${c.id}"><b>${esc(c.profileName)} · ${esc(c.topic||'상담')}</b><span>${dateLabel(c.created.slice(0,10))} · ${c.messages.length}개 메시지 ${c.profileKey!==profileKey()?'· 이전 사주 (읽기 전용)':''}</span></button>`).join('')}`);$('#new-chat').onclick=()=>{activeConversation=null;$('#modal').close();render();persist();};document.querySelectorAll('[data-conversation]').forEach(b=>b.onclick=()=>{activeConversation=b.dataset.conversation;$('#modal').close();render();});return;}
 if(a==='delete-all'){openModal('<h2>개인정보를 모두 삭제할까요?</h2><p>현재 보관함의 프로필·상담·선택 기록·저장한 답변이 삭제됩니다. 내려받은 파일과 캘린더 일정은 별도로 삭제해 주세요.</p><label class="check"><input id="delete-confirm" type="checkbox">복구할 수 없음을 이해했습니다.</label><p id="delete-error" role="alert"></p><button class="danger" id="delete-final">전체 삭제</button>');$('#delete-final').onclick=async()=>{if(!$('#delete-confirm').checked){$('#delete-error').textContent='위 확인란을 선택해 주세요.';return;}$('#delete-final').disabled=true;await saveQueue;try{const res=await fetch('/api/journal',{method:'DELETE'});if(!res.ok)throw new Error('삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');generation++;data={profile:null,records:[],conversations:[],savedAnswers:[]};revision=0;result=null;activeConversation=null;localStorage.removeItem('dalbit-v2');saveState='ready';$('#modal').close();nav('welcome');notice('개인 보관함의 정보를 삭제했어요.');}catch(e){$('#delete-error').textContent=e.message;$('#delete-final').disabled=false;}};}}
async function load(){saveState='loading';refreshSave();try{const res=await fetch('/api/journal'),r=await res.json();if(!res.ok)throw new Error(r.error);loaded=true;revision=r.revision;data=r.data||{profile:null,records:[],conversations:[],savedAnswers:[]};data.savedAnswers||=[];if(data.profile&&await engineReady()){try{result=E.calculate(data.profile);}catch{data.profile=null;notice('이전 프로필의 계산 정보를 다시 확인해 주세요.');}}saveState=revision?'saved':'ready';render();const legacy=localStorage.getItem('dalbit-v2');if(legacy&&!r.data)offerMigration(legacy);}catch(e){saveState='error';render();notice(e.message||'저장소에 연결하지 못했어요. 설정에서 다시 시도해 주세요.');}}
function offerMigration(raw){let old;try{old=JSON.parse(raw);}catch{return;}if(!old.birth)return;openModal('<h2>이전 기록을 발견했어요</h2><p>이 브라우저에 있던 프로필과 선택 기록을 서버 보관함으로 옮길 수 있어요. 현재 버전은 생년월일·상담·기록을 서버에 저장합니다.</p><button class="primary" id="migrate">이전 기록 가져와 서버에 저장</button><button class="secondary" id="skip-migrate">지금은 건너뛰기</button>');$('#skip-migrate').onclick=()=>$('#modal').close();$('#migrate').onclick=async()=>{data.profile={name:old.name,birth:old.birth,time:old.time||'12:00',unknown:!!old.unknownTime,calendar:'solar',city:'서울',zone:'Asia/Seoul',longitude:126.978,clock:'civil',topics:old.topics?.length?old.topics:['진로'],question:old.topicNote||''};data.records=(old.records||[]).map(r=>({id:uid(),date:String(r.d).slice(0,10),title:r.title,topic:'진로',confidence:50,expectation:r.sub||'',actual:r.kind==='결과'?r.sub:'',due:String(r.d).slice(0,10),result:r.kind==='결과'?'neutral':'pending',mood:r.mood||'',legacy:true}));if(!await engineReady())return;try{result=E.calculate(p());const ok=await persist();if(ok)localStorage.removeItem('dalbit-v2');$('#modal').close();nav('result');}catch(e){notice(e.message);}};}
render();
// Warm the 만세력 chunk while the splash is on screen, so the first navigation
// into a chart does not wait on the network. Failures are retried on demand.
ensureEngine().catch(()=>{enginePromise=null;engineTry++;});
// 상담·판독 연결 여부를 한 번에 확인하고, 달라졌으면 화면을 다시 그립니다.
Promise.all([coachAvailable(),epicAvailable()]).then(()=>{if(loaded)render();});
load();
