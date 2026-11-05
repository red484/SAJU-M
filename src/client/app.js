import {clearDeletedDeviceStorage} from './deleted-device-storage.js';
import {confirmAge} from './age-gate.js';
import {ageEligibility,AGE_NOTICE} from '../shared/age-policy.mjs';
import { mountSupportRequest } from '../../legal/support-request.js';
import { configureProductMetrics, metricsEnabled, setMetricsEnabled, trackProductEvent } from './product-metrics.js';
import { Capacitor } from '@capacitor/core';
import { findPurchaseFollowUp } from './purchase-follow-up.js';
import { businessInfo } from './business-info.js';
import {DateTime} from 'luxon';
import {birthPicker,bindBirthPicker} from './birth-picker.js';
import {installGuestAccess as installAnonymousGuestAccess} from "./guest-access.js";
import {installPasswordAccess} from './password-access.js';
import {installSubscription} from './subscription.js';
import {installTossBilling} from './toss-billing.js';
import {dressPage} from './design.js';
import {topics,CITIES,ELEMENTS,SK} from './constants.js';
import {captureMessages} from './capture.js';
import {now,dateLabel} from './time.js';
import {mergeJournal} from './journal-merge.js';
import {getJournal,putJournal,deleteJournal} from './api/journal.js';
import {coachStatus,requestCoachWithRetry} from './api/readings.js';
import {unrelatedQuestion,SCOPE_NOTICE} from './consultation-scope.js';
import {authProviders,currentUser,logout,deleteAccount,deletionResult,loginUrl,loginWithToss,clearTossLogin,isAppsInToss} from './api/auth.js';
import {nativeApp,noteMode,APP_NAME,setupNativeShell,shareNativeFile,syncReviewReminders,reviewReminderEnabled,setReviewReminder,reviewReminderStatus} from './native-shell.js';
import {NOTE_PAGES} from './app-mode.js';
// The 만세력 tables are ~323KB of the bundle and are not needed until a chart
// is actually cast, so engine.js loads on demand. E is null until then.
configureProductMetrics(Capacitor.getPlatform());
let E=null,enginePromise=null,engineTry=0;
// The specifier is built at runtime on purpose. A dynamic import that fails is
// recorded against its URL in the module map and every later import of that
// same URL rethrows the cached failure, so a retry has to ask for a new one.
const ensureEngine=()=>(enginePromise??=import(/* @vite-ignore */ '/engine.js'+(engineTry?'?r='+engineTry:'')).then(m=>(E=m)));
const engineReady=async()=>{try{await ensureEngine();return true;}catch{enginePromise=null;engineTry++;notice('만세력 자료를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.');return false;}};
const ENGINE_PAGES=['result','chat','choice','records'];
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data={profile:null,records:[],conversations:[],savedAnswers:[]},revision=0,result=null,page=new URLSearchParams(location.search).get('onboarding')==='1'?'birth':location.pathname==='/settings'?'settings':'welcome',loaded=false,saveState='loading',activeConversation=null,month=now().toFormat('yyyy-MM'),selectedDate=now().toISODate(),recordFilter='all',pendingProfile=null,saveQueue=Promise.resolve(),generation=0;
const concernDraftKey = 'ongi-concern-draft';
const drafts = new Map();
function draftKey(id) { return id ? concernDraftKey + ':' + id : concernDraftKey; }
function readConcernDraft(id) {
 const key=draftKey(id);
 if(drafts.has(key))return drafts.get(key);
 try { return sessionStorage.getItem(key) || ''; } catch { return ''; }
}
function writeDraft(id,value) {
 const key=draftKey(id);
 drafts.set(key,value);
 try {
  if(value)sessionStorage.setItem(key,value);
  else sessionStorage.removeItem(key);
 }catch{ /* The in-memory draft remains available. */ }
}
function setChatDraft(value) {
 chatDraft=value;
 writeDraft(activeConversation,value);
}
function selectConversation(id, adoptDraft=false) {
 const initial=adoptDraft&&!activeConversation?readConcernDraft(null):'';
 activeConversation=id;
 chatDraft=readConcernDraft(id);
 if(id&&initial&&!chatDraft){
  setChatDraft(initial);
  writeDraft(null,'');
 }
}
function clearDrafts() {
 drafts.clear();
 try {
  for(const key of Object.keys(sessionStorage)){
   if(key===concernDraftKey||key.startsWith(concernDraftKey+':'))sessionStorage.removeItem(key);
  }
 }catch{ /* Storage may be unavailable. */ }
 activeConversation=null;
 chatDraft='';
}
let savedBaseline=null,saveError='',chatDraft=noteMode?'':readConcernDraft(),chatScroll=null,openOnLoad=null;
let coachQuota=null,coachLoginRequired=true,quotaChecking=false;
let authUser=null,authOptions={google:false,apple:false,toss:false},authStatus='loading',tossLoginBusy=false;
const authFailure = new URLSearchParams(location.search).get('auth') === 'failed';
let afterLogin = new URLSearchParams(location.search).get('auth') === 'success';
function installGuestAccess(context) {
 installAnonymousGuestAccess(context);
 installPasswordAccess({...context, available:authOptions.password!==false, beforeSignIn:async()=>{
  await saveQueue;
  if(saveState==='error'&&loaded)throw new Error('기록 저장이 완료되지 않았어요. 현재 내용을 파일로 보관해 주세요. 로그인이 만료됐다면 새로고침 후 다시 로그인해 주세요.');
 }, signedIn:async()=>{
  generation++;coachQuota=null;coachLoginRequired=false;
  await loadAuth();await load();await refreshCoachQuota();nav(p()?'chat':'birth');
 }});
}
const named=()=>p()?.name&&p().name!=='방문자'?p().name:'';
const uid=()=>crypto.randomUUID(), today=()=>now().toISODate(),ct=()=>data.conversations.find(c=>c.id===activeConversation),p=()=>data.profile;
const CONFIDENCE=[[10,'많이 망설여요'],[30,'조금 망설여요'],[50,'반반이에요'],[70,'조금 확신해요'],[90,'확신이 있어요']];
const steps=(n,of=2)=>`<p class="steps" aria-label="${of}단계 중 ${n}단계">${Array.from({length:of},(_,i)=>`<i${i<n?' class="on"':''}></i>`).join('')}<span>${n}/${of}</span></p>`;
const ico=d=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PLUSICO={
 plus:ico('<path d="M12 5.5v13M5.5 12h13"/>'),
 capture:ico('<rect x="3.2" y="6.2" width="17.6" height="13.6" rx="2.4"/><circle cx="12" cy="13" r="3.4"/><path d="M8.6 6.2l1.3-2.1h4.2l1.3 2.1"/>'),
 history:ico('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.3V12l3.1 2"/>'),
 fresh:ico('<path d="M4.2 19.8l1.1-4 9.4-9.4a2 2 0 012.8 0l.1.1a2 2 0 010 2.8l-9.4 9.4z"/><path d="M14 7.2l2.8 2.8"/>'),
 record:ico('<path d="M6.4 3.6h11.2v16.8l-5.6-3.3-5.6 3.3z"/>')};
const icon={today:ico('<circle cx="12" cy="12" r="4.2"/><path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M18.1 5.9l-1.5 1.5M7.4 16.6l-1.5 1.5"/>'),result:ico('<path d="M6.2 3.4h11.6v17.2L12 17.1l-5.8 3.5z"/>'),chat:ico('<path d="M4.2 5.2h15.6v10.8H9.6L4.2 19.8z"/>'),choice:ico('<circle cx="12" cy="12" r="8.6"/><path d="M15.7 8.3l-2.2 5.2-5.2 2.2 2.2-5.2z"/>'),records:ico('<path d="M4.4 6.4h15.2M4.4 12h15.2M4.4 17.6h9.6"/>')};
function notice(t){$('#notice').textContent=t;$('#notice').classList.add('visible');clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').classList.remove('visible'),6000);}
const fieldError=(form,key,msg)=>{const el=form.querySelector(`[name="${key}"]`);if(el){el.setAttribute('aria-invalid','true');el.focus();}const box=form.querySelector('.form-error');box.textContent=msg;box.hidden=false;};
function storageLabel(){return {loading:'저장소 연결 중',saved:'저장 완료',saving:'저장 중…',error:'저장 실패 · 내용 보관',ready:'저장 준비됨'}[saveState];}
function refreshSaveError(){const box=$('#save-error');if(!box)return;box.hidden=saveState!=='error';box.querySelector('p').textContent=saveError||'저장하지 못했습니다. 현재 화면의 내용은 남아 있습니다.';}
function markSaveError(message){saveError=message==='Failed to fetch'?'서버에 연결하지 못했습니다. 현재 내용은 화면에 남아 있습니다. 파일로 보관하거나 연결을 확인한 뒤 다시 저장해 주세요.':message;saveState='error';refreshSave();refreshSaveError();}
function persist(){if(!loaded){notice('저장소 연결 후 다시 시도해 주세요.');return Promise.resolve(false);}const g=generation,snapshot=JSON.parse(JSON.stringify(data));
 for(const conversation of snapshot.conversations){
  delete conversation.pending;
  conversation.messages=conversation.messages.filter(message=>!message.streaming);
 }
 saveState='saving';refreshSave();refreshSaveError();saveQueue=saveQueue.then(async()=>{if(g!==generation)return false;try{
  let saved=snapshot;
  let savedReply=await putJournal(snapshot,revision),res=savedReply.response;
  if(res.status===409){
    const latest=await getJournal();if(!latest.response.ok)throw new Error('최신 기록을 불러오지 못했습니다.');
    const remote=latest.body,merged=remote.revision===0&&!remote.data?snapshot:mergeJournal(savedBaseline,snapshot,remote.data);
    if(!merged)throw new Error('다른 탭에서 같은 기록을 수정했습니다. 현재 내용을 파일로 보관한 뒤 새로고침해 주세요.');
    const current=mergeJournal(snapshot,data,merged);
    if(!current)throw new Error('저장 중 기록이 다시 변경됐습니다. 현재 내용을 파일로 보관해 주세요.');
    saved=merged;
    savedReply=await putJournal(merged,remote.revision);res=savedReply.response;
    if(res.ok){Object.assign(data,current);notice('다른 탭의 변경 내용과 합쳐 저장했습니다.');}
  }
  const reply=savedReply.body;if(!res.ok)throw new Error(reply.error);
  revision=reply.revision;savedBaseline=JSON.parse(JSON.stringify(saved));
  saveError='';saveState='saved';refreshSave();refreshSaveError();syncReviewReminders(data.records);return true;
 }catch(e){markSaveError(e.message);return false;}});return saveQueue;}
let badgeTimer=null,badgeShown='',lastPage=null,plusOpen=false,aiCoach=null,capturing=null;
function refreshSave(){const changed=badgeShown!==saveState;badgeShown=saveState;clearTimeout(badgeTimer);
 const settled=saveState==='ready'||(saveState==='saved'&&!changed);
 const paint=hide=>document.querySelectorAll('[data-save-status]').forEach(el=>{el.textContent=storageLabel();el.dataset.state=saveState;el.hidden=hide;});
 paint(settled);
 if(saveState==='saved'&&changed)badgeTimer=setTimeout(()=>paint(true),1800);}
// 노트 모드(iOS 앱)에는 사주·오늘·상담 화면이 없습니다. 어디서 오든 기록으로 보냅니다.
const notePage=to=>!noteMode||NOTE_PAGES.includes(to)?to:loaded?'records':'welcome';
async function nav(to){capturing=null;plusOpen=false;to=notePage(to==='today'?'chat':to);if(!loaded&&to!=='welcome'&&to!=='settings'){notice('저장소 연결이 필요합니다. 잠시 후 다시 시도해 주세요.');return;}if(!noteMode&&!p()&&ENGINE_PAGES.includes(to))to='birth';if(ENGINE_PAGES.includes(to)&&!await engineReady())return;if(!noteMode&&ENGINE_PAGES.includes(to)&&!result){try{result=E.calculate(p());}catch{to='birth';}}page=to;render();}
const backOf=()=>noteMode?{choice:'records',records:'welcome',settings:loaded?'records':'welcome'}[page]:{birth:'welcome',topic:'birth',settings:p()?'chat':'welcome',chat:'welcome',choice:'chat',records:'chat',result:'welcome'}[page];
async function nativeBack(){const back=backOf();if(!back)return false;await nav(back);return true;}
function header(){const back=backOf()||'welcome';return `<header><button class="header-back" data-nav="${back}" aria-label="이전 화면으로 돌아가기"><span aria-hidden="true">‹</span>뒤로</button><button class="brand" data-nav="welcome"><img src="/assets/${noteMode?'mark.webp':'ongi.svg'}" alt="">${APP_NAME}</button>${authUser?'<button class="plain header-logout" data-action="logout">로그아웃</button>':''}${page==='settings'?'':'<button class="plain header-settings" data-nav="settings" aria-label="개인정보와 저장 설정">설정</button>'}</header>`;}
function saveBanner(){return `<section id="save-error" class="save-error" role="alert" ${saveState==='error'?'':'hidden'}><p>${esc(saveError||'저장하지 못했습니다. 현재 화면의 내용은 남아 있습니다.')}</p><div><button type="button" data-action="backup">현재 내용 파일로 보관</button><button type="button" data-action="retry">다시 저장</button></div></section>`;}
function navBar(){return `<nav aria-label="주요 메뉴">${(noteMode?[['choice','새 선택'],['records','기록']]:[['chat','상담'],['result','나 이해하기'],['choice','선택'],['records','기록']]).map(([id,label])=>`<button data-nav="${id}" ${page===id?'aria-current="page"':''}><span aria-hidden="true">${icon[id]}</span>${label}</button>`).join('')}</nav>`;}
function authButton(provider){const enabled=authOptions[provider]&&!tossLoginBusy;const label=provider==='google'?'<img class="google-mark" src="/assets/google-g.png" alt="" aria-hidden="true"><span>Google 계정으로 계속</span>':provider==='apple'?'<img class="apple-signin-art" src="/assets/apple-signin.png" alt="Apple로 계속하기" width="320" height="48">':tossLoginBusy?'토스 로그인 중…':'토스로 계속하기';return `<button class="auth ${provider}" ${enabled?'data-login="'+provider+'"':'disabled'}>${label}</button>`;}
const authButtons=()=>isAppsInToss()?authButton('toss'):['google','apple'].map(authButton).join('');
const consultationExamples=[
 {topic:'이직',concern:'연봉은 오르지만 통근 시간이 길어져 이직할지 고민돼요.',
  answer:'연봉과 평일 저녁 시간 중 어느 쪽을 더 지키고 싶은지 살펴봐요. 통근 시간이 얼마나 늘어나면 부담스럽게 느껴지세요?',
  criteria:'가족과 저녁을 먹을 수 있는 시간',action:'평일 출근 시간에 이동해 보기',review:'직접 가보니 얼마나 걸렸고, 이직을 보는 기준이 달라졌나요?'},
 {topic:'관계',concern:'친구 부탁을 계속 들어주다 보니 제 시간이 부족해요.',
  answer:'친구를 돕고 싶은 마음과 내 시간을 지키고 싶은 마음이 함께 있네요. 어떤 부탁이 가장 부담스러웠나요?',
  criteria:'내 일정과 여유 시간',action:'다음 부탁에 가능한 시간대를 먼저 말하기',review:'가능한 범위를 이야기해 보니 관계와 내 마음에 어떤 변화가 있었나요?'}
];
function consultationPreview(onBack){
 openModal(`<h2>상담 예시</h2><p>가상의 고민으로 온기의 질문, 선택 기록, 회고를 미리 볼 수 있어요.</p>
 ${consultationExamples.map(example=>`<details><summary>${esc(example.topic)} 고민</summary><p>${esc(example.concern)}</p>
 <p>${esc(example.answer)}</p><dl><dt>선택 기준</dt><dd>${esc(example.criteria)}</dd><dt>해볼 행동</dt><dd>${esc(example.action)}</dd>
 <dt>돌아볼 날짜</dt><dd>행동을 해본 다음 날</dd><dt>회고 질문</dt><dd>${esc(example.review)}</dd></dl></details>`).join('')}${typeof onBack==='function'?'<button class="secondary" id="preview-return">이용권 안내로 돌아가기</button>':''}`);
 if(typeof onBack==='function')$('#preview-return').onclick=onBack;
}
function welcome(){const start=noteMode?(data.records.length?['records','나의 기록 이어보기']:['choice','첫 선택 기록하기']):p()?['chat',ct()?.messages.some(m=>m.role==='user')?`${ct().topic||'지난'} 상담 이어가기`:'상담 시작하기']:['birth','상담 시작하기'];return `<section class="welcome welcome-with-auth"><img class="landscape" src="/assets/${noteMode?'splash.webp':'ongi-welcome.svg'}" fetchpriority="high" decoding="async" alt=""><div class="welcome-copy"><img class="mark" src="/assets/${noteMode?'mark.webp':'ongi.svg'}" alt="${APP_NAME}">${noteMode?'<h1>오늘의 선택을,<br>내일의 나에게</h1><p>망설이는 선택과 그때의 마음을 남기고,<br>정한 날에 결과를 돌아보세요.</p>':'<h1>삶의 온기</h1><p>명리학을 바탕으로 지금의 고민과 선택을 함께 정리해요.</p>'}${noteMode?'':`<label class="welcome-concern">지금 마음에 걸리는 일이 있나요?<textarea data-concern-draft rows="2" maxlength="1500" placeholder="한 문장부터 시작해 보세요.">${esc(chatDraft)}</textarea></label><button type="button" class="welcome-link" data-consultation-preview>상담 예시 보기</button>`}<footer class="welcome-auth" aria-label="로그인 및 이용 안내">${authUser?`<button class="primary gold" data-nav="${start[0]}">${start[1]}</button><button class="welcome-link" data-action="logout">로그아웃</button><button class="welcome-link" data-nav="settings">내 보관함 보기</button><small>${esc(authUser.name||'회원')}님 · 로그인되어 있어요</small>`:`${authStatus==='loading'?'<small role="status">로그인 연결을 확인하고 있어요.</small>':authStatus==='error'?'<small role="alert">로그인 연결을 확인하지 못했어요.</small><button class="welcome-link" data-auth-refresh>연결 다시 확인</button>':''}${authFailure?'<p class="auth-failure" role="alert">로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.</p>':''}<div class="auth-buttons">${authButtons()}</div><button class="welcome-link" data-guest-start>로그인 없이 이용하기</button>`}<p class="hint">만 14세 이상만 이용할 수 있어요.</p><div class="welcome-legal"><a href="/pricing/">상품 안내</a><span>·</span><a href="/refund/">환불정책</a><span>·</span><a href="/support/">고객지원</a><span>·</span><a href="/terms/">이용약관</a><span>·</span><a href="/privacy/">개인정보처리방침</a></div>${businessInfo}</footer></div></section>`;}
function birth(){const a=p()||{name:authUser?.name||'',birth:'1995-05-17',time:'15:30',calendar:'solar',city:'서울',zone:'Asia/Seoul',longitude:126.978,clock:'civil',gender:'',topics:['진로']};return `<div class="narrow">${steps(1)}<p class="eyebrow">첫 번째 이야기 · 나의 시작</p><h1>상담 프로필 만들기</h1><p class="muted">출생 정보는 상담에 참고할 명리학 해석을 만드는 데 사용해요.</p><p class="hint">본인의 정보만 입력해 주세요. 만 14세 미만은 이용할 수 없습니다.</p><form id="birth-form" novalidate>${authUser?`<p class="hint">로그인 계정의 이름을 사용합니다. 이름을 다시 입력하지 않아도 돼요.</p>`:`<label>별명 <span class="hint">선택 사항</span><input name="name" value="${esc(a.name)}" maxlength="20" autocomplete="nickname" placeholder="비워 두어도 시작할 수 있어요"></label>`}<div class="fields"><label>달력<select name="calendar"><option value="solar" ${a.calendar==='solar'?'selected':''}>양력</option><option value="lunar" ${a.calendar==='lunar'?'selected':''}>한국 음력</option></select></label></div>${birthPicker(a.birth,Number(today().slice(0,4)))}<p id="birth-hint" class="hint">연도·월·일을 선택해 주세요 · 1900년부터 오늘까지 지원</p><label class="check" id="leap-wrap" ${a.calendar!=='lunar'?'hidden':''}><input type="checkbox" name="leap" ${a.leap?'checked':''}>음력 윤달이에요</label><label>태어난 시간<input name="time" type="time" value="${esc(a.time||'12:00')}" ${a.unknown?'disabled':''}></label><label class="check"><input name="unknown" type="checkbox" ${a.unknown?'checked':''}>태어난 시간을 몰라요</label><p class="hint">시간 미상은 정오 기준 3주를 계산합니다. 절기·날짜 경계에서는 년·월·일주도 달라질 수 있어요.</p><fieldset class="segment"><legend>성별</legend>${[['female','여성'],['male','남성']].map(([v,t])=>`<label><input type="radio" name="gender" value="${v}" ${a.gender===v?'checked':''}>${t}</label>`).join('')}</fieldset><p class="hint">대운의 순행·역행을 가르는 값이라 여쭙습니다. 해석 문구는 성별로 달라지지 않아요.</p><label>태어난 도시<select name="city">${[...new Set(CITIES.map(v=>v[3]))].map(g=>`<optgroup label="${g}">${CITIES.filter(v=>v[3]===g).map(v=>`<option ${v[0]===a.city?'selected':''}>${v[0]}</option>`).join('')}</optgroup>`).join('')}<option ${a.city==='직접 입력'?'selected':''}>직접 입력</option></select></label><details id="precise" ${a.city==='직접 입력'||a.clock==='mean'?'open':''}><summary>정밀 계산 설정</summary><p class="hint">도시를 고르면 시간대와 경도가 자동으로 채워집니다. 대부분 그대로 두셔도 됩니다.</p><div class="fields"><label>시간대 (IANA)<input name="zone" value="${esc(a.zone)}" placeholder="Asia/Seoul" ${a.city!=='직접 입력'?'readonly':''}></label><label>출생지 경도<input name="longitude" type="number" step="0.001" min="-180" max="180" value="${a.longitude}" ${a.city!=='직접 입력'?'readonly':''}></label></div><label>시각 계산 방식<select name="clock"><option value="civil" ${a.clock==='civil'?'selected':''}>출생지의 기록된 현지 시각</option><option value="mean" ${a.clock==='mean'?'selected':''}>지역 경도 보정 · 지방평균태양시</option></select></label><p>한국 음력은 윤달을 포함해 변환합니다. 년·월주는 절기 교체 시각을 기준으로 하고, 일주는 자정에 바뀌는 방식을 사용합니다. 시간대의 과거 표준시·서머타임은 기기의 시간대 데이터에 따릅니다.</p><p>경도 보정은 지방평균태양시이며 균시차까지 반영한 진태양시는 아닙니다. 도시의 경도는 대표 지점이므로 경계 출생은 정확한 경도로 수정하세요. 여러 명리 유파의 계산 방식은 다를 수 있습니다.</p></details><div class="form-error" role="alert" hidden></div><p class="privacy-note">정보는 입력 후 서버의 개인 보관함에 저장됩니다. ${authUser?'로그인 계정으로 연결되어 다른 기기에서도 불러올 수 있습니다.':'로그인 전에는 이 브라우저의 보안 쿠키로 연결됩니다. 다른 기기에서 불러오려면 로그인해 주세요.'} 설정에서 내보내기·전체 삭제가 가능합니다.</p><button class="primary" type="submit">관심 주제 선택하기</button></form></div>`;}
function topicPage(){const a=pendingProfile;return `<div class="narrow">${steps(2)}<p class="eyebrow">두 번째 이야기 · 마음의 방향</p><h1>지금 가장 궁금한<br>이야기는 무엇인가요?</h1><p class="muted">선택한 주제에 맞춰 해석과 행동을 연결해드려요.</p><form id="topic-form"><fieldset><legend>상담 주제 · 여러 개 선택 가능</legend><div class="topic-grid">${topics.map(t=>`<label class="topic-choice"><input type="checkbox" name="topic" value="${t}" ${(a.topics||['진로']).includes(t)?'checked':''}><span>${t}</span></label>`).join('')}</div></fieldset><label>지금의 고민 <span class="hint">선택 사항</span><textarea name="question" data-concern-draft maxlength="1500" placeholder="예: 이직 제안을 받았는데 안정적인 지금 직장과 고민돼요.">${esc(chatDraft)}</textarea></label><div class="form-error" role="alert" hidden></div><button class="primary">상담으로 이동하기</button><button type="button" class="secondary" data-nav="birth">정보 다시 확인하기</button></form></div>`;}
function basis(r=result){return `<div class="basis-open"><h3>왜 이렇게 해석했나요?</h3><p>일간은 ${SK[r.day]}${r.pillars[2].gz[0]} (${ELEMENTS[r.element]})입니다. 천간과 지지의 대표 오행을 각각 1개로 세어 총 ${r.total}개를 비교했습니다. ${ELEMENTS.map((e,i)=>`${e} ${r.cnt[i]}개`).join(' · ')}.</p><p>많이 나타난 기운은 ${r.strong.map(i=>ELEMENTS[i]).join('·')}, 적게 나타난 기운은 ${r.weak.map(i=>ELEMENTS[i]).join('·')}입니다. 비율은 개수 분포이며, 용신·신강·신약 판정이나 건강 수치가 아닙니다. 동률이면 모두 표시하며 문장은 첫 기운을 중심으로 구성합니다.</p><p>천간 십성: ${r.pillars.map((v,i)=>`${v.k} ${r.ten[i]}`).join(' · ')}. 일간과 다른 천간의 생극·음양 관계를 보여줍니다. 지장간·합충·대운을 모두 반영한 종합 감정은 아닙니다.</p><p>양력 ${r.solarDate} · ${esc(p().zone)} · UTC${r.offset>=0?'+':''}${r.offset/60}. 일·시 계산 시각 ${r.clockLabel}. 년·월주는 실제 절기 시각, 일주는 자정 기준입니다.</p>${r.unknown?`<p class="warning">시간 미상: 시주를 제외한 ${r.total}자이며 정오 기준입니다. ${r.boundary?'이날에는 절기 또는 날짜 경계로 다른 주도 달라질 수 있어 해석을 확정하면 안 됩니다.':'시간에 따라 시주·분포·관계 해석이 달라집니다.'}</p>`:''}<p>전통 명리의 자기 이해용 해석이며, 성격과 미래를 과학적으로 확정하지 않습니다.</p><a href="https://github.com/6tail/lunar-javascript" target="_blank" rel="noreferrer">절기·간지 계산 자료</a> · <a href="https://github.com/usingsky/korean_lunar_calendar_js" target="_blank" rel="noreferrer">한국 음력 변환 자료</a></div>`;}
function resultPage(){
 const reading=E.reading(result,p());
 return `<div class="section-top"><h1>나를 이해하기</h1><button class="plain" data-nav="birth">프로필 수정</button></div>
 <section class="core"><h2>${esc(reading.summary)}</h2><p>명리학에서 읽은 성향을 실제 경험과 비교해 보세요.</p></section>
 <section class="two-cards"><article class="card"><h3>나의 강점</h3><p>${esc(reading.strength)}</p></article><article class="card"><h3>돌아볼 패턴</h3><p>${esc(reading.caution)} ${esc(reading.balance)}</p></article></section>
 <section class="block"><h2 class="block-title">상담에서 다룰 주제</h2>${p().topics.map(t=>`<button class="secondary" data-topic-chat="${t}">${t} 이야기하기</button>`).join('')}</section>
 <details class="card"><summary>명리학 해석 근거</summary>${basis()}</details>`;
}
function currentConversation(){let c=ct();if(!c&&p()){c={id:uid(),created:new Date().toISOString(),profileKey:profileKey(),profileName:p().name,topic:p().topics[0],context:null,messages:[{id:uid(),role:'assistant',text:`안녕하세요${named()?`, ${named()}님`:''}. 온기입니다.\n명리학을 참고해 지금의 고민을 함께 살펴볼게요. 어떤 선택을 고민하고 계신가요?`,at:new Date().toISOString()}]};data.conversations.push(c);selectConversation(c.id,true);if(loaded)persist();}return c;}
function profileKey(){return JSON.stringify([p()?.birth,p()?.time,p()?.zone,p()?.calendar,p()?.unknown,p()?.clock,p()?.longitude]);}
function chatPanel(){const c=currentConversation(),attached=data.records.find(r=>r.id===c?.attachedRecordId);return `<section class="chat-panel"><div class="mentor"><img src="/assets/ongi.svg" alt=""><div><h2>온기</h2><span>${aiCoach?'명리학 기반 AI 인생 상담':'문맥을 이어가는 체험 코칭'}</span></div><button class="plain" data-action="chat-history">이전 상담</button></div><p class="chat-note">${coachLoginRequired?'상담은 로그인 후 무료 5회 이용할 수 있어요. 로그인 전에는 메시지를 보낼 수 없습니다. 사람 상담사가 아니며, 건강·투자·법률 판단은 해당 전문가에게 확인해 주세요.':aiCoach?'명리학 해석과 대화 내용을 참고해 답합니다. 사람 상담사가 아니며, 건강·투자·법률 판단은 해당 전문가에게 확인해 주세요.':'AI·전문 상담사와의 실시간 대화가 아닙니다. 명리학 해석과 입력한 상황을 활용한 규칙 기반 코칭이며, 건강·투자·법률 판단은 해당 전문가에게 확인해 주세요.'}</p><div class="messages" role="log" aria-live="polite">${(()=>{const picked=capturedIds();return (c?.messages||[]).map(m=>capturing?`<article class="message ${m.role} pickable${picked.includes(m.id)?' picked':''}"><button class="pick" data-pick="${m.id}" aria-pressed="${picked.includes(m.id)}"><span class="tick" aria-hidden="true"></span><span class="bubble">${esc(m.text)}</span></button></article>`:`<article class="message ${m.role}${m.streaming?' composing':''}"><div class="bubble">${esc(m.text)}</div>${m.role==='assistant'&&m.references?.length?`<details class="answer-basis"><summary>참고한 지난 기록</summary><ul>${m.references.map(ref=>`<li>${esc(ref.kind)} · ${esc(ref.date)} · ${esc(ref.title)}${data.records.some(r=>r.id===ref.recordId)?` <button class="plain" data-record="${esc(ref.recordId)}">기록 열기</button>`:''}</li>`).join('')}</ul></details>`:''}${m.role==='assistant'&&m.basis?`<details class="answer-basis"><summary>명리학 해석 근거</summary><p>${esc(m.basis)}</p></details>`:''}${m.role==='assistant'?`<div class="answer-tools"><time>${DateTime.fromISO(m.at).toFormat('HH:mm')}</time>${m.streaming?'<span class="ai-working" role="status"><span aria-hidden="true"></span>답변을 다듬고 있어요</span>':`<button data-copy="${m.id}">복사</button><button data-save-answer="${m.id}">${data.savedAnswers.some(a=>a.messageId===m.id)?'저장됨':'저장'}</button>`}</div>`:`<time>${DateTime.fromISO(m.at).toFormat('HH:mm')}</time>`}</article>`).join('');})()}</div>${capturing?(()=>{const n=capturedIds().length,off=n?'':' disabled';return `<div class="capture-bar"><div class="capture-guide"><span>${captureGuide()}</span><button class="plain" data-capture="reset"${off}>선택 해제</button></div><div class="capture-acts">${canCopyImage()?`<button data-capture="copy"${off}>복사</button>`:''}${canShareFiles()?`<button data-capture="share"${off}>공유</button>`:''}<button data-capture="save"${off}>저장</button><button class="plain" data-capture="cancel">취소</button></div></div>`;})():''}${(()=>{const cold=(c?.messages||[]).length<2;
 const chips=`<div class="quick-topics">${p().topics.map(t=>`<button data-quick="${t} 고민이 있어요">${t} 이야기</button>`).join('')}</div>`;
 const sheet=capturing||!plusOpen?'':`<div class="plus-sheet" id="plus-sheet"><div class="plus-acts">${[['capture','대화 캡처',PLUSICO.capture],['history','이전 상담',PLUSICO.history],['fresh','새 상담',PLUSICO.fresh],['record','선택 기록',PLUSICO.record]].map(([k,label,d])=>`<button data-plus-do="${k}"><span>${d}</span>${label}</button>`).join('')}</div>${cold?'':chips}</div>`;
 return sheet+(capturing||!cold?'':chips)+(!capturing&&c?.offer?'<button class="secondary" data-review-offer>선택 기록 검토하기</button>':'');})()}${!capturing&&attached?`<p class="attached-record">첨부한 기록 · <button class="plain" data-record="${esc(attached.id)}">${esc(attached.title)}</button> <button class="plain" data-detach-record>첨부 해제</button></p>`:''}<form id="chat-form"${capturing?' hidden':''}><button type="button" class="plus${plusOpen?' on':''}" data-plus aria-expanded="${plusOpen}" aria-controls="plus-sheet" aria-label="상담 도구 열기">${PLUSICO.plus}</button><label class="sr-only" for="chat-input">상담 메시지</label><textarea id="chat-input" name="message" rows="1" maxlength="1500" placeholder="${coachLoginRequired?'상담하려면 로그인해 주세요':'무엇이 고민이신가요?'}">${esc(chatDraft)}</textarea><button class="send" aria-label="메시지 보내기">보내기</button></form></section>`;}
function choicePage(){return `<div class="narrow"><h1>오늘의 선택을<br>내일의 나에게.</h1><form id="record-form"><fieldset class="presets"><legend>어떤 선택 앞에 있나요?</legend>${[['이직 제안에 답하기','진로'],['마음을 고백하기','연애'],['새로운 일을 시작하기','진로'],['큰 지출을 결정하기','재물']].map(([t,tp])=>`<button type="button" data-preset="${esc(t)}" data-preset-topic="${tp}">${t}</button>`).join('')}</fieldset><label>어떤 선택을 앞두고 있나요?<input name="title" maxlength="100" placeholder="직접 적어도 좋아요" required></label><label>주제<select name="topic">${topics.map(t=>`<option>${t}</option>`).join('')}</select></label><label>선택할 날짜<input name="date" type="date" value="${selectedDate}" required></label><fieldset class="scale"><legend>지금 이 선택에 얼마나 마음이 기울었나요?</legend><div class="scale-poles"><span>아직 망설여요</span><span>마음이 분명해요</span></div><div class="scale-row">${CONFIDENCE.map(([v,label],i)=>`<label class="dot d${i}"><input type="radio" name="confidence" value="${v}" ${v===50?'checked':''}><i></i><span>${label}</span></label>`).join('')}</div></fieldset><label>예상하는 결과와 이유<textarea name="expectation" maxlength="1000" placeholder="기대하는 변화와 걱정되는 점을 남겨보세요."></textarea></label>${noteMode?'':criteriaLabelField()}<label>언제 돌아볼까요?<select name="delay"><option value="1">1일 후</option><option value="3" selected>3일 후</option><option value="7">7일 후</option></select></label>${reminderField()}<p class="privacy-note">${noteMode?'돌아볼 날 저녁 8시에 이 기기로 알림을 보내 드려요. 처음 저장할 때 알림 허용을 여쭤봅니다.':nativeApp?'알림을 선택한 기록은 이 기기에서 알려드려요. 기기의 알림 권한이 필요합니다.':'저장 후 캘린더 일정을 내려받을 수 있어요. 캘린더 앱에서 가져오기를 완료해야 알림이 등록됩니다. 사이트의 푸시·이메일 자동 발송은 아직 연결되지 않았습니다.'}</p><div class="form-error" role="alert" hidden></div><button class="primary">선택 기록 저장하기</button></form></div>`;}
function criteriaLabelField(value=''){
 const labels=[...new Set(data.records.map(r=>r.criteriaLabel).filter(Boolean))];
 return `<label>선택 기준 이름 <span class="hint">선택 사항</span>
 <input name="criteriaLabel" list="criteria-labels" maxlength="60" value="${esc(value)}" placeholder="예: 가족 저녁 시간"></label>
 <datalist id="criteria-labels">${labels.map(label=>`<option value="${esc(label)}"></option>`).join('')}</datalist>`;
}
function reminderField(record={}){
 return nativeApp&&!noteMode?`<label class="check"><input type="checkbox" name="reviewReminder" ${reviewReminderEnabled(record.id)?'checked':''}>회고일 저녁에 이 기기로 알림 받기</label><p class="hint">저녁 8시를 기준으로 예약하며, 기기 설정에 따라 늦어질 수 있어요.</p>`:'';
}
function choiceSummary(record){
 return `<section class="card choice-summary"><h3>선택 한 장 요약</h3><dl>
 <dt>선택 기준</dt><dd>${record.criteriaLabel?`<b>${esc(record.criteriaLabel)}</b> · `:''}${esc(record.expectation||'아직 기록하지 않았어요.')}</dd>
 <dt>해볼 행동</dt><dd>${esc(record.nextAction||'아직 정하지 않았어요.')}</dd>
 <dt>돌아볼 날짜</dt><dd>${record.due?dateLabel(record.due):'아직 정하지 않았어요.'}</dd>
 ${record.advice?`<dt>당시 참고한 조언</dt><dd>${esc(record.advice)}</dd>`:''}
 ${record.reviewProgress?`<dt>행동 상태</dt><dd>${esc(quickReviewStates[record.reviewProgress])}</dd>`:''}
 ${record.actual?`<dt>실제로 확인한 결과</dt><dd>${esc(record.actual)}</dd>`:''}</dl></section>`;
}
function repeatedCriteria(records){
 const groups=new Map();
 for(const record of records.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10)){
  const criteria=(record.criteriaLabel||record.expectation)?.trim().replace(/\s+/g,' ');
  if(!criteria)continue;
  const key=JSON.stringify([record.topic,criteria]);
  if(!groups.has(key))groups.set(key,{criteria,records:[]});
  groups.get(key).records.push(record);
 }
 const recurring=[...groups.values()].filter(group=>group.records.length>=2);
 if(!recurring.length)return '';
 return `<section class="card"><h2>여러 번 적은 선택 기준</h2><p class="hint">최근 선택 10건에서 같은 이름이나 같은 문구를 적은 기록이에요.</p>
 ${recurring.map(group=>`<p><b>${esc(group.criteria)}</b> · ${esc(group.records[0].topic)} ${group.records.length}건</p>
 ${group.records.map(record=>`<button class="text-link" data-record="${esc(record.id)}">${esc(record.title)}</button>`).join(' ')}`).join('')}</section>`;
}
const quickReviewStates={done:'해봤어요',waiting:'아직이에요',changed:'계획을 바꿨어요'};
function quickReview(record){
 openModal(`<h2>1분 회고</h2><p>${esc(record.title)}</p><form id="quick-review">
 <label>어떻게 됐나요?<select name="progress">${Object.entries(quickReviewStates).map(([value,label])=>`<option value="${value}" ${record.reviewProgress===value?'selected':''}>${label}</option>`).join('')}</select></label>
 <label>결과 한 줄<textarea name="actual" maxlength="1500" rows="2">${esc(record.actual||'')}</textarea></label>
 <button class="primary">회고 저장하기</button></form>`);
 const form=$('#quick-review');
 form.onsubmit=async event=>{
  event.preventDefault();
  form.querySelector('button').disabled=true;
  const fields=new FormData(form);
  record.reviewProgress=fields.get('progress');
  record.actual=String(fields.get('actual')).trim();
  record.result=record.reviewProgress==='waiting'?'pending':record.reviewProgress==='changed'?'rethink':['pending','rethink'].includes(record.result)?'neutral':record.result;
  const saved=await persist();
  if(saved)trackProductEvent('review_saved');
  if(!form.isConnected)return;
  if(saved){render();recordDetail(record.id);}
  else form.querySelector('button').disabled=false;
 };
}
function compareChoices(){
 const options=data.records.map(r=>`<option value="${esc(r.id)}">${dateLabel(r.date)} · ${esc(r.title)}</option>`).join('');
 openModal(`<h2>두 선택 비교</h2><form id="compare-choices">
 <label>첫 번째 선택<select name="left" required><option value="">기록 선택</option>${options}</select></label>
 <label>두 번째 선택<select name="right" required><option value="">기록 선택</option>${options}</select></label>
 <p class="form-error" role="alert" hidden></p><button class="primary">비교하기</button></form><div id="choice-comparison"></div>`);
 const form=$('#compare-choices');
 form.onsubmit=event=>{
  event.preventDefault();
  const [left,right]=['left','right'].map(side=>data.records.find(r=>r.id===form.elements[side].value));
  const output=$('#choice-comparison');
  output.innerHTML='';
  if(!left||!right||left===right)return fieldError(form,'right','서로 다른 기록 두 개를 골라 주세요.');
  form.querySelector('.form-error').hidden=true;
  form.elements.right.removeAttribute('aria-invalid');
  output.innerHTML=`<div class="compare">${[left,right].map(record=>`<section><h3>${esc(record.title)}</h3>${choiceSummary(record)}
   <button class="text-link" data-record="${esc(record.id)}">원본 기록 열기</button></section>`).join('')}</div>`;
  bind(output);
 };
}
function dueReviews(){
 const due=data.records.filter(r=>r.result==='pending'&&r.due&&r.due<=today()).sort((a,b)=>a.due.localeCompare(b.due));
 if(!due.length)return '';
 return `<section class="card"><h2>돌아볼 때가 된 기록</h2>${due.map(r=>`<button class="record-row" data-record="${esc(r.id)}">
 <b>${esc(r.title)}</b><span>회고일 ${dateLabel(r.due)}</span>${r.expectation?`<span>선택 기준 · ${esc(r.expectation)}</span>`:''}
 ${r.nextAction?`<span>해볼 행동 · ${esc(r.nextAction)}</span>`:''}${r.actual?`<span>실제 결과 · ${esc(r.actual)}</span>`:''}</button>`).join('')}</section>`;
}
function recordsPage(){const m=E.monthly(data.records,month),filtered=m.list.filter(r=>recordFilter==='all'||(recordFilter==='pending'?r.result==='pending':r.result!=='pending'));const days=DateTime.fromISO(month+'-01').daysInMonth,offset=DateTime.fromISO(month+'-01').weekday%7;return `<div class="section-top"><div><p class="eyebrow">선택이 쌓이면, 나의 기준이 됩니다</p><h1>나의 기록</h1></div><button class="plain" data-nav="choice">새 기록</button></div>${!noteMode&&data.records.length>=2?'<button class="secondary" data-compare-choices>두 선택 비교</button>':''}${dueReviews()}${noteMode?'':repeatedCriteria(data.records)}<div class="month-nav"><button data-month="-1" aria-label="이전 달">‹</button><h2>${month.replace('-','년 ')}월</h2><button data-month="1" aria-label="다음 달">›</button></div><section class="card"><div class="calendar">${['일','월','화','수','목','금','토'].map(v=>`<span>${v}</span>`).join('')}${Array.from({length:offset},()=>'<span></span>').join('')}${Array.from({length:days},(_,i)=>{const day=month+'-'+String(i+1).padStart(2,'0'),n=m.list.filter(r=>r.date===day).length;return `<button data-day="${day}" class="${n?'has-record':''}" aria-label="${dateLabel(day)}, 기록 ${n}개">${i+1}${n?`<small>${n}</small>`:''}</button>`;}).join('')}</div></section><section class="card"><span class="eyebrow">이번 달 돌아보기</span><div class="stats"><div><b>${m.list.length}</b><span>선택 기록</span></div><div><b>${m.done.length}</b><span>결과 기록</span></div><div><b>${m.list.filter(r=>r.mood).length}</b><span>감정 기록</span></div></div><p>${m.insight}</p>${Object.keys(m.moods).length?`<div class="mood-summary">${Object.entries(m.moods).map(([k,v])=>`<span>${esc(k)} ${v}회</span>`).join('')}</div>`:'<p class="hint">결과를 남길 때 감정도 함께 선택해보세요.</p>'}</section><div class="filters">${[['all','전체'],['pending','돌아볼 선택'],['done','결과 남김']].map(([id,label])=>`<button data-filter="${id}" aria-pressed="${recordFilter===id}">${label}</button>`).join('')}</div>${filtered.length?filtered.sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<button class="record-row card" data-record="${r.id}"><span class="eyebrow">${dateLabel(r.date)} · ${esc(r.topic)}</span><h3>${esc(r.title)}</h3><p>${r.result==='pending'?`${dateLabel(r.due)}에 돌아보기`:resultLabel(r.result)} · 당시 마음 ${confidenceLabel(r.confidence)}</p></button>`).join(''):'<div class="empty"><h3>아직 이 달의 기록이 없어요.</h3><p>큰 결정이 아니어도 좋아요. 오늘의 작은 선택부터 남겨보세요.</p><button class="secondary" data-nav="choice">첫 선택 기록하기</button></div>'}`;}
const confidenceLabel=v=>CONFIDENCE.reduce((a,b)=>Math.abs(b[0]-v)<Math.abs(a[0]-v)?b:a)[1];
const resultLabel=v=>({pending:'아직 결과를 기다려요',good:'만족스러운 결과',neutral:'아직 판단하기 어려워요',rethink:'다르게 선택하고 싶어요'}[v]||'결과 미상');
function settingsPage(){
 const account=authUser
  ?`<div class="account-state"><b>${esc(authUser.name||authUser.email||'로그인된 사용자')}</b><span>${esc(authUser.email||'계정에 연결됨')}</span></div><p>이 보관함은 계정에 연결되어 다른 기기에서도 다시 불러올 수 있습니다.</p><button class="secondary" data-action="logout">로그아웃</button>`
  :`<p>지금 로그인하면 이 브라우저의 기존 기록이 계정에 연결됩니다. 다른 기기에서도 같은 계정으로 불러올 수 있어요.</p><div class="auth-buttons">${authButtons()}</div>${isAppsInToss()?!authOptions.toss?'<p class="hint">Toss 로그인 연결을 준비하고 있어요.</p>':'':authOptions.password===false||(!authOptions.apple&&!authOptions.google)?'<p class="hint">지금은 로그인을 이용할 수 없어요. 잠시 후 다시 시도해 주세요.</p>':''}`;
 return `<div class="narrow"><p class="eyebrow">나의 이야기, 나의 권한</p><h1>개인 보관함</h1><section class="card account-card"><h2>계정과 동기화</h2>${account}</section><section class="card"><h2>어디에 저장되나요?</h2><p>${noteMode?'선택 기록과 회고는':'프로필·상담·선택 기록·저장한 답변은'} 이 서비스의 서버 보관함에 저장됩니다. ${authUser?'로그인 계정과 연결되어 있습니다.':'로그인 전에는 이 브라우저의 보안 쿠키로 연결됩니다.'}</p>${noteMode?'<p>운영 서버 관리자 접근을 막는 종단간 암호화 서비스는 아닙니다.</p>':'<p>AI 상담을 이용하면 답변 생성에 필요한 명식과 계산된 연·월 흐름, 현재 대화와 관련된 과거 대화·선택 기록·온보딩 고민이 Cafe24 LLM Router로 전송될 수 있습니다. 운영 서버 관리자 접근을 막는 종단간 암호화 서비스는 아닙니다.</p>'}<button class="secondary" data-action="retry" data-save-status>${storageLabel()}</button></section><section class="card"><h2>내 기록 가져가기</h2><p>${noteMode?'선택 기록과 회고를':'프로필·상담·선택 기록을'} JSON 또는 읽기 쉬운 문서로 내보냅니다. 파일에는 개인정보가 포함됩니다.</p><div class="button-row"><button class="secondary" data-action="export-json">JSON 내보내기</button><button class="secondary" data-action="export-text">문서 내보내기</button></div></section>${noteMode?'':`<section class="card"><h2>저장한 상담 답변</h2>${data.savedAnswers.length?data.savedAnswers.map(a=>`<details><summary>${esc(a.text.slice(0,45))}</summary><p class="preline">${esc(a.text)}</p><button class="plain" data-remove-answer="${a.id}">저장 해제</button></details>`).join(''):'<p class="muted">상담 답변 아래의 ‘저장’을 누르면 이곳에 모입니다.</p>'}</section><section class="card"><h2>연결 상태</h2><p>체험 코칭: 사용 가능<br>실제 AI 상담: ${aiCoach?'연결됨':'미연결'}<br>계정 동기화: ${authUser?'연결됨':'로그인 전'}<br>캘린더 회고 일정: 파일 가져오기 방식</p></section>`}<section class="card"><h2>서비스 개선 참여</h2><label class="check"><input type="checkbox" data-product-metrics ${metricsEnabled()?'checked':''}> [선택] 이용 동작 통계 수집에 동의</label><p class="hint">상품 안내·구매·복원, 첫 AI 답변·선택 저장·회고 저장의 동작별 건수를 기기 채널과 한국 날짜별로 합산해 서비스 개선에 사용합니다. 최근 30일 동안 보관하며 상담 내용·계정·주문 식별자는 통계에 저장하지 않습니다. 동의하지 않아도 서비스를 이용할 수 있고, 이 기기에서 언제든 해제할 수 있습니다. 이미 합산된 건수는 개인을 구분할 수 없어 개별 삭제할 수 없습니다. <a href="/privacy/">개인정보처리방침</a></p></section><section class="card legal-links"><h2>정책과 고객지원</h2><div class="legal-link-list"><a href="/privacy/">개인정보 처리방침</a><a href="/terms/">서비스 이용약관</a><a href="/support/">고객지원</a><a href="/account-deletion/">계정 및 데이터 삭제 안내</a></div></section><section class="card danger-zone"><h2>${authUser?'회원 탈퇴':'개인정보 전체 삭제'}</h2><p>${authUser?'계정과 서버에 저장된 모든 보관함 정보를 삭제합니다.':'현재 브라우저의 보관함 정보를 삭제합니다.'} 삭제 후 복구할 수 없습니다.</p><button class="danger" data-action="delete-all">${authUser?'계정과 모든 정보 삭제':'내 정보와 기록 모두 삭제'}</button></section></div>`;
}
function render(){page=notePage(page);const log=$('.messages');chatScroll=log?{top:log.scrollTop,stick:log.scrollHeight-log.scrollTop-log.clientHeight<80,count:log.querySelectorAll('article.message').length,id:activeConversation}:null;const main={welcome,birth,topic:topicPage,result:resultPage,chat:()=>'',choice:choicePage,records:recordsPage,settings:settingsPage}[page];const dual=p()&&page==='chat';$('#app').innerHTML=page==='welcome'?saveBanner()+welcome():`${header()}${saveBanner()}<div class="workspace ${dual?'dual':''}"><main id="main">${main()}</main>${dual?`<aside>${chatPanel()}</aside>`:''}</div>${['birth','topic','settings'].includes(page)?'':navBar()}<button class="save-status" data-action="retry" data-save-status>${storageLabel()}</button>`;document.body.dataset.page=page;if(lastPage!==page){lastPage=page;window.scrollTo(0,0);}dressPage({page,profile:p()});installGuestAccess({page,user:authUser,openModal,navigate:target=>nav(target||(p()?"chat":"birth")),notice});drawCoachQuota();bind();refreshSave();refreshSaveError();scrollChat();}
function scrollChat(){const a=$('.messages');if(!a)return;const c=ct();if(c){const articles=a.querySelectorAll('article.message'),sourceLabel={cafe24:'AI 답변',rules:'기본 답변',safety:'안전 안내',record:'기록 안내'};c.messages.forEach((m,i)=>{const article=articles[i];if(!article)return;const tools=article.querySelector('.answer-tools'),label=sourceLabel[m.source];if(tools&&label){const badge=document.createElement('span');badge.className='response-source';badge.textContent=label;tools.prepend(badge);}if(!m.aiFailure)return;const note=document.createElement('div');note.className='ai-recovery';const p=document.createElement('p');p.textContent=m.aiFailure;note.append(p);if(i===c.messages.length-1){const button=document.createElement('button');button.type='button';button.textContent='AI 답변 다시 시도';button.disabled=!!c.pending;button.onclick=()=>retryAi(c.id,m.id);note.append(button);}article.append(note);});if(c.pending){const send=$('#chat-form .send');if(send)send.disabled=true;}}
 // 새 말풍선이 생겼거나 이미 맨 아래였을 때만 따라 내려갑니다. 위로 올려 읽던 자리는 지킵니다.
 const count=a.querySelectorAll('article.message').length,s=chatScroll;a.scrollTop=!s||s.stick||s.id!==activeConversation||s.count!==count?a.scrollHeight:s.top;}
const focusChat=()=>{const t=$('#chat-input');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length);}};
function openModal(html){const m=$('#modal');m.innerHTML=`<button class="modal-close plain" data-close aria-label="닫기">닫기 ×</button>${html}`;if(!m.open)m.showModal();m.querySelector('[data-close]').onclick=()=>m.close();bind(m);}
// 바깥(배경)을 누르면 닫힙니다. 한 번만 걸어 두어야 안쪽을 누른 뒤에도 계속 동작해요.
$('#modal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close();});
const consultationTemplates={
 career:['진로','지금 비교 중인 선택은…\n꼭 지키고 싶은 조건은…\n확인하고 싶은 사실은…'],
 relationship:['연애','관계에서 마음에 걸리는 일은…\n지키고 싶은 내 기준은…\n상대에게 확인하고 싶은 것은…'],
 daily:['','지금 고민 중인 선택은…\n중요하게 생각하는 기준은…\n작게 해볼 행동은…']
};
function chooseHistory(onConfirm, showTemplate=false) {
 openModal(`<h2>지난 기록을 참고할까요?</h2><p>이번 상담에서 온기가 참고할 항목을 골라 주세요.</p>
 <form id="history-preferences">${showTemplate?`<label>고민 작성 틀<select name="template"><option value="">자유롭게 시작</option><option value="career">이직과 진로</option><option value="relationship">관계</option><option value="daily">일상 선택</option></select></label>`:''}<label>오늘 필요한 도움<select name="mode"><option value="">대화하며 정하기</option><option value="listen">마음 정리</option><option value="compare">선택지 비교</option><option value="action">해볼 행동 정하기</option></select></label><label class="check"><input type="checkbox" name="conversations">이전 대화</label>
 <label class="check"><input type="checkbox" name="records">선택 기록과 회고</label>
 <button class="primary">이 설정으로 상담하기</button></form>`);
 const form=$('#history-preferences');
 form.onsubmit=event=>{
  event.preventDefault();
  const preferences={conversations:form.elements.conversations.checked,records:form.elements.records.checked};
  $('#modal').close();
  onConfirm(preferences,form.elements.mode.value,form.elements.template?.value);
 };
}
function startConversation(topic, recordId, initialDraft) {
 chooseHistory((preferences,mode,template)=>{
  selectConversation(null);
  const conversation=currentConversation();
  conversation.historyPreferences=preferences;
  conversation.supportMode=mode;
  const starter=consultationTemplates[template];
  if(topic||starter?.[0])conversation.topic=topic||starter[0];
  if(initialDraft)setChatDraft(initialDraft);
  else if(starter&&!chatDraft.trim())setChatDraft(starter[1]);
  if(recordId)conversation.attachedRecordId=recordId;
  nav('chat');
  persist();
 },!recordId);
}

function chatHistoryModal(){
 const conversations=data.conversations.slice().reverse();
 openModal(`<h2>이전 상담 이어가기</h2><button class="secondary" id="new-chat">새 상담 시작하기</button><div class="conversation-list">${conversations.length?conversations.map(c=>`<div class="conversation-row"><button class="record-row" data-conversation="${c.id}"><b>${esc(c.profileName)} · ${esc(c.topic||'상담')}</b><span>${dateLabel(c.created.slice(0,10))} · ${c.messages.length}개 메시지 ${c.profileKey!==profileKey()?'· 이전 프로필 (읽기 전용)':''}</span></button><button class="conversation-delete" data-delete-conversation="${c.id}" aria-label="${esc(c.profileName)}의 ${esc(c.topic||'상담')} 상담 삭제">삭제</button></div>`).join(''):'<p class="muted">아직 저장된 상담이 없어요.</p>'}</div>`);
 $('#new-chat').onclick=()=>startConversation();
 document.querySelectorAll('[data-conversation]').forEach(b=>b.onclick=()=>{selectConversation(b.dataset.conversation);$('#modal').close();render();});
 document.querySelectorAll('[data-delete-conversation]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.deleteConversation,c=data.conversations.find(v=>v.id===id);if(!c)return;
  openModal(`<h2>이 상담을 삭제할까요?</h2><p>${dateLabel(c.created.slice(0,10))}의 ${esc(c.topic||'상담')} 대화가 모두 삭제되며 복구할 수 없어요. 따로 저장한 상담 답변은 보관함에 남습니다.</p><button class="danger" id="confirm-delete-conversation">상담 삭제</button><button class="secondary" id="cancel-delete-conversation">취소</button>`);
  $('#cancel-delete-conversation').onclick=chatHistoryModal;
  $('#confirm-delete-conversation').onclick=async()=>{data.conversations=data.conversations.filter(v=>v.id!==id);writeDraft(id,'');if(activeConversation===id)selectConversation(null);await persist();$('#modal').close();render();notice('상담을 삭제했어요.');};
 });
}
function recordDetail(id){const r=data.records.find(r=>r.id===id);if(!r)return;const linked=!noteMode&&data.conversations.find(c=>c.id===r.conversationId);openModal(`<p class="eyebrow">${dateLabel(r.date)}의 선택</p><h2>${esc(r.title)}</h2>${!noteMode?choiceSummary(r):`<section class="compare"><div><span>선택 당시</span><p>${esc(r.expectation||'예상을 남기지 않았어요.')}</p><small>확신 ${r.confidence} / 100</small></div>${r.conversationId?`<div><span>해볼 행동</span><p>${esc(r.nextAction||'아직 정하지 않았어요.')}</p></div>`:noteMode?'':`<div><span>그날의 해석</span><p>${esc(r.advice||'이전 버전의 기록입니다.')}</p></div>`}</section>`}<form id="edit-record" data-id="${id}"><label>선택 제목<input name="title" maxlength="100" value="${esc(r.title)}" required></label>${r.conversationId?`<label>선택 기준<textarea name="criteria" maxlength="1000">${esc(r.expectation)}</textarea></label><label>해볼 행동<textarea name="action" maxlength="1000">${esc(r.nextAction)}</textarea></label>`:''}${noteMode?'':criteriaLabelField(r.criteriaLabel)}<label>실제 결과<select name="result">${['pending','good','neutral','rethink'].map(v=>`<option value="${v}" ${r.result===v?'selected':''}>${resultLabel(v)}</option>`).join('')}</select></label><label>돌아본 마음<select name="mood"><option value="">아직 선택하지 않음</option>${['기뻐요','편안해요','보통이에요','아쉬워요','속상해요'].map(v=>`<option ${r.mood===v?'selected':''}>${v}</option>`).join('')}</select></label><label>예상과 실제는 어떻게 달랐나요?<textarea name="actual" maxlength="1500">${esc(r.actual||'')}</textarea></label><label>회고 날짜<input type="date" name="due" value="${r.due}"></label>${reminderField(r)}${nativeApp&&!noteMode?'<p id="review-reminder-status" class="hint" role="status"></p>':''}<div class="form-error" role="alert" hidden></div><button class="primary">수정 내용 저장</button></form>${!noteMode?`<button class="secondary" id="quick-review-open">1분 회고</button><button class="secondary" id="continue-review">${linked?'이 선택 다시 이야기하기':'이 기록으로 새 상담 시작하기'}</button><button class="plain" id="attach-record">이번 상담에 이 기록 첨부</button>`:''}<button class="secondary" data-calendar="${id}">회고 일정 캘린더에 등록하기</button><p class="hint">캘린더 파일을 가져와야 일정·알림이 등록됩니다. 알림 허용 여부는 캘린더 앱에서 확인하세요.</p><button class="danger" data-delete-record="${id}">이 기록 삭제</button>`);
 const quick=$('#quick-review-open');
 if(quick)quick.onclick=()=>quickReview(r);
 const reminder=$('#review-reminder-status');
 if(reminder)void reviewReminderStatus(r).then(status=>{reminder.textContent=status;});
 const attach=$('#attach-record');
 if(attach)attach.onclick=async()=>{
  const current=ct();
  if(!current||current.profileKey!==profileKey()){
   startConversation(r.topic,r.id);return;
  }
  current.attachedRecordId=r.id;
  $('#modal').close();
  await nav('chat');
  persist();focusChat();
 };
 const resume=$('#continue-review');
 if(resume)resume.onclick=async()=>{
  const draft=[`“${r.title}” 선택을 돌아보고 싶어요.`,r.actual&&`실제로는: ${r.actual}`,
   r.expectation&&`선택 기준: ${r.expectation}`,r.nextAction&&`해볼 행동: ${r.nextAction}`].filter(Boolean).join('\n');
  if(linked&&readConcernDraft(linked.id).trim()&&!window.confirm('이 상담의 초안을 회고 메시지로 바꿀까요?'))return;
  if(linked&&linked.profileKey!==profileKey()&&!window.confirm('현재 프로필로 이 상담을 이어갈까요? 다음 답변부터 수정한 출생 정보를 사용합니다.'))return;
  if(!linked){startConversation(r.topic,r.id,draft.slice(0,1500));return;}
  if(linked.profileKey!==profileKey()){
   linked.profileKey=profileKey();
   linked.profileName=p().name;
   linked.context=null;
   linked.offer=null;
  }
  selectConversation(linked.id);
  setChatDraft(draft.slice(0,1500));
  linked.attachedRecordId=r.id;
  $('#modal').close();
  await nav('chat');persist();focusChat();
 };
}
async function download(name,content,type='text/plain;charset=utf-8'){const blob=new Blob([content],{type});try{if(await shareNativeFile(blob,name,`${APP_NAME} 파일`)){notice('공유·저장할 앱을 선택해 주세요.');return;}}catch(e){if(e?.name==='AbortError'||/cancel/i.test(e?.message||''))return;notice('파일 공유창을 열지 못했어요.');return;}const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
document.addEventListener('click',async e=>{const button=e.target.closest('[data-login]');if(!button)return;const provider=button.dataset.login;if(provider!=='toss'){location.href=loginUrl(provider);return;}tossLoginBusy=true;render();try{const {body}=await loginWithToss();authUser=body.user||null;await load();page=result?'chat':'birth';notice('토스 계정으로 로그인했어요.');}catch(error){notice(error.message||'토스 로그인을 완료하지 못했어요.');}finally{tossLoginBusy=false;render();}});
document.addEventListener('click',e=>{
 if(e.target.closest('[data-auth-refresh]')){authStatus='loading';render();loadAuth();}
});
document.addEventListener('click',e=>{
 if(!e.target.closest('[data-guest-start]'))return;
 openModal('<h2>로그인 없이 둘러볼까요?</h2><p>'+(noteMode?'선택 기록과 회고를 로그인 없이 남길 수 있어요.':'자기 이해 요약을 로그인 없이 확인할 수 있어요. AI 상담은 정식 로그인 후 무료 5회 이용할 수 있어요.')+' 기록은 현재 브라우저에 연결된 서버 보관함에 저장되지만, 계정에는 연결되지 않아요.</p><p>브라우저 데이터를 지우거나 다른 기기로 접속하면 기존 기록을 찾기 어려울 수 있어요. 나중에 같은 브라우저에서 로그인하면 기록을 계정에 연결할 수 있어요.</p><button class="primary" id="guest-continue">알겠어요, 시작할게요</button><button class="secondary" id="guest-cancel">돌아가서 로그인하기</button>');
 $('#guest-cancel').onclick=()=>$('#modal').close();
 $('#guest-continue').onclick=()=>{$('#modal').close();nav(noteMode?(data.records.length?'records':'choice'):p()?'result':'birth');};
});
document.addEventListener('click',e=>{if(e.target.closest('[data-action="backup"]')){download('달빛-저장복구.json',JSON.stringify(data,null,2),'application/json');notice('현재 내용을 파일로 보관했습니다. 파일에는 개인정보가 포함됩니다.');}},true);
function calendarFile(id){const r=data.records.find(v=>v.id===id),date=DateTime.fromISO(r.due,{zone:'Asia/Seoul'}).set({hour:20}).toUTC(),fmt=d=>d.toFormat("yyyyMMdd'T'HHmmss'Z'");download('달빛-회고.ics',['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dalbit//Reflection//KO','BEGIN:VEVENT',`UID:${r.id}@dalbit`,`DTSTAMP:${fmt(DateTime.utc())}`,`DTSTART:${fmt(date)}`,`DTEND:${fmt(date.plus({minutes:15}))}`,`SUMMARY:${APP_NAME} - 나의 선택 돌아보기`,`DESCRIPTION:${APP_NAME} 보관함에서 선택 당시의 예상과 실제 결과를 돌아보세요.`,'BEGIN:VALARM','TRIGGER:-PT10M','ACTION:DISPLAY','DESCRIPTION:나의 선택을 돌아볼 시간이에요.','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n')+'\r\n','text/calendar;charset=utf-8');notice('파일을 캘린더 앱에서 가져와 주세요. 가져오기 전에는 알림이 예약되지 않습니다.');}
function getMessage(id){return data.conversations.flatMap(c=>c.messages).find(m=>m.id===id);}
function exportText(){return [`${APP_NAME} 개인 보관함`,JSON.stringify(p(),null,2),'\n선택 기록',...data.records.map(r=>`${r.date} ${r.title}\n예상: ${r.expectation}\n결과: ${resultLabel(r.result)}\n회고: ${r.actual||''}`),'\n상담',...data.conversations.map(c=>c.messages.map(m=>`${m.role==='user'?'나':'온기'} (${m.at})\n${m.text}`).join('\n\n')),'\n저장한 답변',...data.savedAnswers.map(a=>a.text)].join('\n\n');}
function bind(root=document){
 const metrics=root.querySelector('[data-product-metrics]');
 if(metrics)metrics.onchange=()=>{metrics.checked=setMetricsEnabled(metrics.checked);notice(metrics.checked?'이 기기의 서비스 개선 참여를 켰어요.':'이 기기의 통계 전송을 껐어요.');};
 root.querySelector('[data-compare-choices]')?.addEventListener('click',compareChoices);
 root.querySelector('[data-consultation-preview]')?.addEventListener('click',consultationPreview);
 root.querySelector('[data-detach-record]')?.addEventListener('click',()=>{delete ct().attachedRecordId;persist();render();});
 root.querySelector('[data-review-offer]')?.addEventListener('click',()=>reviewChoice(currentConversation()));
 root.querySelectorAll('[data-concern-draft]').forEach(input=>input.oninput=()=>setChatDraft(input.value));
 root.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));root.querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>recordDetail(b.dataset.record));// 주제 버튼은 문장을 입력창에 채워 둘 뿐 보내지 않습니다. 상담 횟수는 직접 보낼 때만 씁니다.
root.querySelectorAll('[data-topic-chat]').forEach(b=>b.onclick=()=>startConversation(b.dataset.topicChat));root.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{plusOpen=false;setChatDraft(chatDraft || b.dataset.quick);render();focusChat();});root.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(getMessage(b.dataset.copy).text);notice('답변을 복사했어요.');}catch{notice('복사 권한이 없어요. 답변을 직접 선택해 복사해 주세요.');}});root.querySelectorAll('[data-save-answer]').forEach(b=>b.onclick=()=>{const m=getMessage(b.dataset.saveAnswer);if(data.savedAnswers.some(a=>a.messageId===m.id)){notice('이미 보관함에 저장했어요.');return;}data.savedAnswers.push({id:uid(),messageId:m.id,text:m.text,at:new Date().toISOString()});persist();render();});root.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{plusOpen=!plusOpen;render();});
 root.querySelectorAll('[data-plus-do]').forEach(b=>b.onclick=()=>{const k=b.dataset.plusDo;plusOpen=false;
  // 카카오톡처럼 시작 말풍선부터 고르게 빈 채로 캡처에 들어갑니다.
  if(k==='capture'){const n=(currentConversation()?.messages||[]).length;
   if(n<2){render();notice('먼저 대화를 나눈 뒤에 캡처할 수 있어요.');return;}
   capturing={a:null,b:null};render();return;}
  if(k==='history'){render();action('chat-history');return;}
  if(k==='fresh'){render();startConversation();return;}
  if(k==='record'){render();reviewChoice(currentConversation());return;}
  render();});
root.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const id=b.dataset.pick;
 if(!capturing.a||capturing.b)capturing={a:id,b:null};else capturing={a:capturing.a,b:id};
 render();});root.querySelectorAll('[data-capture]').forEach(b=>b.onclick=()=>{const how=b.dataset.capture;
 if(how==='cancel'){capturing=null;render();return;}
 if(how==='reset'){capturing={a:null,b:null};render();return;}
 saveCapture(how);});root.querySelectorAll('[data-remove-answer]').forEach(b=>b.onclick=()=>{data.savedAnswers=data.savedAnswers.filter(a=>a.id!==b.dataset.removeAnswer);persist();render();});root.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{month=DateTime.fromISO(month+'-01').plus({months:Number(b.dataset.month)}).toFormat('yyyy-MM');render();});root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{recordFilter=b.dataset.filter;render();});root.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{const list=data.records.filter(r=>r.date===b.dataset.day);if(list.length)openModal(`<h2>${dateLabel(b.dataset.day)}의 기록</h2>${list.map(r=>`<button class="record-row" data-record="${r.id}">${esc(r.title)}</button>`).join('')}`);else{selectedDate=b.dataset.day;nav('choice');}});root.querySelectorAll('[data-calendar]').forEach(b=>b.onclick=()=>calendarFile(b.dataset.calendar)); root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));
 const bf=root.querySelector('#birth-form');if(bf){bindBirthPicker(bf);bf.elements.calendar.onchange=()=>{$('#leap-wrap').hidden=bf.elements.calendar.value!=='lunar';};bf.elements.unknown.onchange=()=>{bf.elements.time.disabled=bf.elements.unknown.checked;};bf.elements.city.onchange=()=>{const c=CITIES.find(c=>c[0]===bf.elements.city.value);for(const key of ['zone','longitude'])bf.elements[key].readOnly=!!c;if(c){bf.elements.zone.value=c[1];bf.elements.longitude.value=c[2];}else{const d=$('#precise');if(d)d.open=true;}};bf.onsubmit=async e=>{e.preventDefault();const f=new FormData(bf);const a={name:(String(f.get('name')||'').trim()||p()?.name||authUser?.name||'방문자').slice(0,100),birth:String(f.get('birth')).trim(),calendar:f.get('calendar'),leap:f.has('leap'),unknown:f.has('unknown'),time:f.get('time')||'12:00',city:f.get('city'),zone:String(f.get('zone')).trim(),longitude:Number(f.get('longitude')),clock:f.get('clock'),gender:f.get('gender')||'',topics:p()?.topics||['진로'],question:p()?.question||''};if(!f.has('unknown')&&!f.get('time'))return fieldError(bf,'time','시간을 입력하거나 시간 모름을 선택해 주세요.');if(!/^\d{4}-\d{2}-\d{2}$/.test(a.birth))return fieldError(bf,'birth','날짜를 1995-05-17처럼 입력해 주세요.');if(!await engineReady())return;try{const calculated=E.calculate(a);if(!ageEligibility(calculated.solarDate))return fieldError(bf,'birth',AGE_NOTICE);pendingProfile=a;page='topic';render();}catch(err){fieldError(bf,'birth',err.message);}};}
 const tf=root.querySelector('#topic-form');if(tf)tf.onsubmit=async e=>{e.preventDefault();const f=new FormData(tf),selected=f.getAll('topic');if(!selected.length)return fieldError(tf,'topic','관심 주제를 한 가지 이상 골라주세요.');if(!await engineReady())return;data.profile={...pendingProfile,topics:selected,question:''};result=E.calculate(p());selectConversation(data.conversations.findLast(c=>c.profileKey===profileKey())?.id||null);setChatDraft(String(f.get('question') || ''));persist();nav('chat');};
 const cf=root.querySelector('#chat-form');if(cf){cf.onsubmit=e=>{e.preventDefault();plusOpen=false;sendMessage(cf.elements.message.value);};// 터치 키보드의 Enter는 줄바꿈입니다. 마우스·키보드 기기에서만 Enter로 보냅니다.
 cf.elements.message.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(hover: hover) and (pointer: fine)').matches){e.preventDefault();cf.requestSubmit();}};
 // 한 줄로 시작해 쓰는 만큼만 자랍니다. CSS의 max-height가 천장을 잡아요.
 // 테두리까지 더해야 한 줄일 때 스크롤바가 생기지 않습니다. 천장에 닿으면 그때부터 스크롤합니다.
 const ta=cf.elements.message,grow=()=>{ta.style.height='auto';const h=ta.scrollHeight+ta.offsetHeight-ta.clientHeight;ta.style.height=h+'px';ta.style.overflowY=h>=parseFloat(getComputedStyle(ta).maxHeight)?'auto':'hidden';};
 ta.oninput=()=>{setChatDraft(ta.value);grow();};grow();}
 root.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const f=root.querySelector('#record-form');if(!f)return;f.elements.title.value=b.dataset.preset;f.elements.topic.value=b.dataset.presetTopic;f.elements.title.focus();});
 const rf=root.querySelector('#record-form');if(rf){rf.onsubmit=async e=>{e.preventDefault();const f=new FormData(rf),title=String(f.get('title')).trim(),date=String(f.get('date'));if(!title)return fieldError(rf,'title','선택의 제목을 입력해 주세요.');if(!DateTime.fromISO(date).isValid)return fieldError(rf,'date','선택 날짜를 확인해 주세요.');if(!await engineReady())return;const r={id:uid(),title,date,topic:f.get('topic'),confidence:Number(f.get('confidence')),expectation:f.get('expectation'),criteriaLabel:String(f.get('criteriaLabel')||'').trim(),due:DateTime.fromISO(date).plus({days:Number(f.get('delay'))}).toISODate(),result:'pending',mood:'',actual:'',advice:noteMode?'':E.topicReading(result,f.get('topic')).action,created:new Date().toISOString()};data.records.push(r);if(nativeApp&&!noteMode)setReviewReminder(r.id,f.has('reviewReminder'));void persist().then(saved=>{if(saved)trackProductEvent('choice_saved');});month=date.slice(0,7);page='records';render();notice('선택을 기록했어요. 회고는 나중에 기록을 눌러 남겨주세요.');};}
 const ef=root.querySelector('#edit-record');if(ef){ef.onsubmit=e=>{e.preventDefault();const r=data.records.find(r=>r.id===ef.dataset.id),f=new FormData(ef);if(!String(f.get('title')).trim())return fieldError(ef,'title','선택의 제목을 입력해 주세요.');if(!DateTime.fromISO(f.get('due')).isValid)return fieldError(ef,'due','회고 날짜를 확인해 주세요.');if(r.conversationId){r.expectation=String(f.get('criteria')).trim();r.nextAction=String(f.get('action')).trim();}if(!noteMode)r.criteriaLabel=String(f.get('criteriaLabel')||'').trim();if(nativeApp&&!noteMode)setReviewReminder(r.id,f.has('reviewReminder'));const reviewed=['actual','result','mood'].some(k=>String(r[k]||'')!==String(f.get(k)||''));Object.assign(r,{title:String(f.get('title')).trim(),result:f.get('result'),mood:f.get('mood'),actual:f.get('actual'),due:f.get('due')});void persist().then(saved=>{if(saved&&reviewed)trackProductEvent('review_saved');});$('#modal').close();render();};const b=root.querySelector('[data-delete-record]');b.onclick=()=>{const id=ef.dataset.id;openModal('<h2>이 기록을 삭제할까요?</h2><p>예상과 회고 내용도 함께 삭제됩니다. 캘린더 일정은 캘린더 앱에서 별도로 삭제해 주세요.</p><button class="danger" id="confirm-delete-record">삭제하기</button>');$('#confirm-delete-record').onclick=()=>{data.records=data.records.filter(r=>r.id!==id);if(nativeApp&&!noteMode)setReviewReminder(id,false);persist();$('#modal').close();render();};};}
}
// 실제 상담이 붙어 있는지 한 번만 확인합니다. 확인에 실패하면 없는 것으로
// 봅니다 — 규칙 기반 코칭이 늘 답을 내주므로 대화가 끊기지 않습니다.
function quotaText(){return coachLoginRequired?'로그인 후 무료 상담 5회를 이용해 주세요.':coachQuota?.remaining===0?(isAppsInToss()?'남은 상담이 없어요. 상담 이용권을 확인해 주세요.':'무료 상담을 모두 이용했어요.'):coachQuota?(coachQuota.paidRemaining?`무료 ${coachQuota.freeRemaining}회 · 이용권 ${coachQuota.paidRemaining}회 남음${coachQuota.paidNextExpiry?` · 가장 이른 만료 ${dateLabel(DateTime.fromISO(coachQuota.paidNextExpiry).setZone('Asia/Seoul').toISODate())}`:''}`:`무료 상담 ${coachQuota.remaining} / 5회 남음 · 정상 AI 답변만 차감`):'상담 이용 횟수를 확인하고 있어요.';}
async function refreshCoachQuota(){
 try{const {response,body}=await coachStatus();if(!response.ok)throw new Error();coachLoginRequired=!!body.loginRequired;coachQuota=body.quota;aiCoach=body.available===true;return true;}catch{coachQuota=null;return false;}
}
function purchaseFollowUp(){
 if(!authUser||!coachQuota||coachQuota.remaining>1)return null;
 const record=findPurchaseFollowUp(data.records,ct());
 return record?{label:`${record.result==='pending'&&record.due?'회고 '+dateLabel(record.due):'저장한 선택'} · ${record.title}`,open:()=>recordDetail(record.id)}:null;
}
function drawCoachQuota(){
 const subscription=()=>noteMode?null:isAppsInToss()?installTossBilling({page,user:authUser,openModal,notice,showExample:consultationPreview,followUp:purchaseFollowUp(),resume:()=>nav('chat'),quota:coachQuota,onChanged:async()=>{await refreshCoachQuota();drawCoachQuota();return coachQuota;}}):installSubscription({page,user:authUser,openModal,notice,showExample:consultationPreview,followUp:purchaseFollowUp(),navigate:nav,native:nativeApp,toss:false});
 const form=document.querySelector('#chat-form');if(!form){subscription();return;}
 document.querySelector('.coach-quota')?.remove();
 const note=document.createElement('div');note.className='coach-quota';
 const status=document.createElement('span');status.setAttribute('role','status');status.title=quotaText();status.textContent=coachLoginRequired?'로그인 후 무료 5회':coachQuota?.paidRemaining?`무료 ${coachQuota.freeRemaining}회 · 이용권 ${coachQuota.paidRemaining}회 남음${coachQuota.paidNextExpiry?` · 가장 이른 만료 ${dateLabel(DateTime.fromISO(coachQuota.paidNextExpiry).setZone('Asia/Seoul').toISODate())}`:''}`:coachQuota?`무료 상담 ${coachQuota.remaining}회 남음`:'이용 횟수 확인 중';note.append(status);form.before(note);
 subscription();
 if(coachQuota&&coachQuota.remaining<=1){
  const record=authUser&&findPurchaseFollowUp(data.records,ct());
  if(record){
   const follow=document.createElement('p');
   follow.className='quota-follow-up';
   follow.textContent=record.nextAction
    ? `기록과 회고는 무료로 계속 이용할 수 있어요. 해볼 행동 · ${record.nextAction}`
    : '저장한 선택과 회고는 무료로 계속 이용할 수 있어요.';
   const open=document.createElement('button');
   open.type='button';open.className='text-link';open.textContent=record.result==='pending'&&record.due?`회고 ${dateLabel(record.due)} · ${record.title}`:`선택 기록 · ${record.title}`;
   open.onclick=()=>recordDetail(record.id);
   follow.append(' ',open);note.append(follow);
  }else if(chatDraft.trim()){
   const hint=document.createElement('p');hint.className='quota-follow-up';
   hint.textContent='작성한 고민이 입력창에 남아 있어요.';note.append(hint);
  }
 }
 // Drafting must remain possible while authentication/quota is unavailable.
 // sendMessage and the server enforce the allowance before generating an answer.
 form.querySelector('textarea').disabled=false;
 form.querySelector('.send').disabled=!!ct()?.pending;
 if(!coachQuota&&!coachLoginRequired){status.textContent='이용 횟수를 확인하지 못했어요';const retry=document.createElement('button');retry.type='button';retry.textContent='다시 확인';retry.onclick=async()=>{retry.disabled=true;await refreshCoachQuota();if(form.isConnected)drawCoachQuota();};note.append(retry);}
 if(coachLoginRequired){const login=document.createElement('button');login.type='button';login.textContent='로그인하기';login.onclick=()=>nav('welcome');note.append(login);}
}
async function coachAvailable(){
 if(aiCoach!==null)return aiCoach;
 await refreshCoachQuota();
 return aiCoach;
}
// 명식은 계산된 값만 골라 보냅니다. 자유 문장은 대화 쪽에만 실립니다.
// 지난 방문 이후 며칠인지. 이번 대화를 뺀 나머지에서 가장 최근 기록을 봅니다.
function recordsFor(conversation) {
 const attached=data.records.find(r=>r.id===conversation.attachedRecordId);
 const recent=conversation.historyPreferences?.records
  ?data.records.filter(r=>r!==attached).slice(attached?-2:-3):[];
 return [...(attached?[attached]:[]),...recent].map(r=>({
  recordId:r.id,title:r.title,topic:r.topic,expectation:r.expectation,date:r.date,
  action:r.nextAction,actual:r.actual
 }));
}
const chartFor=c=>({pillars:result.pillars.map(v=>v.gz),dayStem:SK[result.day],
 element:ELEMENTS[result.element],strong:result.strong.map(i=>ELEMENTS[i]),weak:result.weak.map(i=>ELEMENTS[i]),
 topics:p().topics,initialConcern:c.historyPreferences?.conversations?(p().question||''):'',today:E.dayName(today()).name+' '+E.dayName(today()).label+'일',
 flowAsOf:today(),periodFlow:E.flow(result,today()).slice(0,2).map(f=>({period:f.key,pillar:f.p.gz,god:f.god,stage:f.stage})),
 pastConversations:c.historyPreferences?.conversations
  ?data.conversations.filter(v=>v.id!==c.id&&v.profileKey===c.profileKey&&v.messages.some(m=>m.role==='user')).slice(-3)
   .map(v=>({title:v.topic||'상담',date:v.created.slice(0,10),excerpt:v.messages.filter(m=>m.role==='user').at(-1).text}))
  :[],
 records:recordsFor(c),
 supportMode:c.supportMode,
 turnIndex:(c?.messages||[]).filter(m=>m.role==='user').length||1});

// 짧은 수긍 한 마디로 기록이 남습니다. 판정은 클라이언트에서 합니다 —
// 모델을 한 번 더 부르지 않아 즉시 반응하고, 같은 말에 늘 같게 동작합니다.
const YES=/^(응+|웅+|엉+|어+|네+|넹+|예+|ㅇ+|ㅇㅋ|오케이|오키|그래+|그러자|좋아요?|해줘|해주세요|부탁(해|해요|드려요)?|기록(해|해줘|해주세요)?|남겨(줘|주세요)?|등록(해|해줘)?|ok|okay|yes)[.!~\s]*$/i;
const NO=/(아니|아뇨|아니요|괜찮|나중|싫|됐어|하지\s*마|no)/i;
const affirmative=t=>{const v=t.trim();return v.length<=14&&YES.test(v);};

function reviewChoice(conversation) {
 const offer=conversation.offer || {};
 const date=today();
 const due=DateTime.fromISO(date).plus({days:7}).toISODate();
 openModal(`<h2>상담에서 정리한 선택</h2><form id="review-choice">
 <label>선택 제목<input name="title" maxlength="100" required value="${esc(offer.title)}"></label>
 <label>선택 기준<textarea name="criteria" maxlength="1000">${esc(offer.expectation)}</textarea></label>
 <label>해볼 행동<textarea name="action" maxlength="1000">${esc(offer.action)}</textarea></label>
 ${criteriaLabelField()}
 <label>돌아볼 날짜<input name="due" type="date" min="${date}" value="${due}" required></label>
 ${reminderField()}
 <div class="form-error" role="alert" hidden></div><button class="primary">선택 기록 저장하기</button></form>`);
 const form=$('#review-choice');
 form.onsubmit=async event=>{
  event.preventDefault();
  const fields=new FormData(form);
  const title=String(fields.get('title')).trim();
  if(!title)return fieldError(form,'title','선택의 제목을 입력해 주세요.');
  const reviewDate=String(fields.get('due'));
  if(!DateTime.fromISO(reviewDate).isValid||reviewDate<date)return fieldError(form,'due','오늘 이후의 날짜를 선택해 주세요.');
  const submit=form.querySelector('button');
  submit.disabled=true;
  const record={id:uid(),title,date,topic:offer.topic||conversation.topic||'진로',
   confidence:50,expectation:String(fields.get('criteria')).trim(),criteriaLabel:String(fields.get('criteriaLabel')||'').trim(),nextAction:String(fields.get('action')).trim(),
   due:reviewDate,result:'pending',mood:'',actual:'',conversationId:conversation.id,created:new Date().toISOString()};
  data.records.push(record);
  if(nativeApp&&!noteMode)setReviewReminder(record.id,fields.has('reviewReminder'));
  if(conversation.offer===offer)conversation.offer=null;
  $('#modal').close();
  render();
  if(await persist()){trackProductEvent('choice_saved');notice('상담과 연결된 선택을 기록했어요.');if(page==='chat'&&!$('#modal').open)recordDetail(record.id);}
 };
}

function capturedIds(){
 if(!capturing?.a)return [];
 const ids=(currentConversation()?.messages||[]).map(m=>m.id);
 const i=ids.indexOf(capturing.a),j=capturing.b?ids.indexOf(capturing.b):i;
 if(i<0||j<0)return [];
 return ids.slice(Math.min(i,j),Math.max(i,j)+1);
}
function captureGuide(){
 if(!capturing?.a)return '캡처를 시작할 말풍선을 선택해 주세요.';
 if(!capturing.b)return '캡처를 종료할 말풍선을 선택해 주세요.';
 return capturedIds().length+'개 선택됨';
}
// 이미지를 클립보드에 넣는 것과 공유 시트는 기기마다 없을 수 있습니다.
// 눌러도 딴 일을 하는 버튼을 두느니, 못 하는 기기에서는 아예 감춥니다.
const canCopyImage=()=>typeof ClipboardItem!=='undefined'&&!!navigator.clipboard?.write;
function canShareFiles(){
 if(nativeApp)return true;
 try{return !!navigator.canShare?.({files:[new File([new Uint8Array(1)],'a.png',{type:'image/png'})]});}
 catch{return false;}
}

// 고른 말풍선을 대화 순서대로 모아 이미지로 만듭니다.
async function saveCapture(how){
 const ids=capturedIds(),c=currentConversation();
 const picked=(c?.messages||[]).filter(m=>ids.includes(m.id));
 if(!picked.length)return;
 try{
  const blob=await captureMessages(picked,{title:'온기',subtitle:dateLabel(picked[0].at.slice(0,10))+' 상담'});
  if(!blob)throw new Error('빈 이미지');
  if(how==='copy'){
   await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
   notice('이미지를 복사했어요.');
  }else if((how==='share'||how==='save')&&nativeApp){
   await shareNativeFile(blob,'삶의온기-상담.png','삶의 온기 상담');
  }else if(how==='share'){
   await navigator.share({files:[new File([blob],'삶의온기-상담.png',{type:'image/png'})],title:'삶의 온기 상담'});
  }else{
   const u=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=u;a.download='삶의온기-상담.png';a.click();
   setTimeout(()=>URL.revokeObjectURL(u),1000);notice('이미지로 저장했어요.');
  }
  capturing=null;render();
 }catch(e){
  if(e.name==='AbortError')return;
  notice(how==='copy'?'이미지를 복사하지 못했어요. 저장으로 받아 주세요.':'이미지를 만들지 못했어요. 다시 시도해 주세요.');
 }
}

function thinkingText(text){if(/피곤|졸리|졸려|지치|무기력/.test(text))return '지금 느끼는 피로를 어떻게 짚어볼지 살펴보고 있어요.';if(/진로|직장|이직|퇴사|취업/.test(text))return '진로에서 지금 가장 중요한 조건을 함께 살펴보고 있어요.';if(/연애|관계|연락|마음/.test(text))return '관계 속에서 마음에 걸리는 지점을 차분히 살펴보고 있어요.';if(/돈|재물|투자|지출/.test(text))return '돈에 관한 선택에서 먼저 확인할 조건을 살펴보고 있어요.';return '말씀해주신 상황에서 무엇을 먼저 짚을지 살펴보고 있어요.';}
async function requestAi(c,messages){let response,body;try{({response,body}=await requestCoachWithRetry({chart:chartFor(c),messages,requestId:c.messages.filter(m=>m.role==='user').at(-1)?.id}));}catch(e){return {ok:false,reason:e.name==='AbortError'?'AI가 제한 시간 안에 답하지 못했습니다.':'연결 문제로 AI 답변을 받지 못했습니다.'};}if(body?.quota)coachQuota=body.quota;if(body?.code==='LOGIN_REQUIRED')coachLoginRequired=true;if(body?.code==='COACH_BUSY')return {ok:false,busy:true,reason:body.error};if(['COACH_LIMIT_REACHED','LOGIN_REQUIRED','QUOTA_UNAVAILABLE'].includes(body?.code))return {ok:false,blocked:true,reason:body.error};if(response?.ok&&body?.text){if(body.source==='cafe24'&&!c.messages.some(m=>m.source==='cafe24'))trackProductEvent('consultation_first_answer');return {ok:true,text:body.text,source:body.source,offer:body.offer,basis:body.basis,references:body.references};}if(response?.status===429)return {ok:false,reason:'AI 사용량이 많습니다.'};if(body?.error?.includes('끊겼'))return {ok:false,reason:'AI 답변이 생성 중에 끊겼습니다.'};if(body?.error?.includes('형식')||body?.error?.includes('품질'))return {ok:false,reason:'AI 답변이 품질 검사를 통과하지 못했습니다.'};return {ok:false,reason:'AI 응답을 받지 못했습니다.'};}
async function retryAi(conversationId,messageId){const c=data.conversations.find(v=>v.id===conversationId),index=c?.messages.findIndex(v=>v.id===messageId);if(!c||index!==c.messages.length-1||c.pending||c.profileKey!==profileKey())return;if(data.conversations.some(v=>v.pending)){notice('다른 상담의 답변이 끝나면 다시 시도해 주세요.');return;}const m=c.messages[index];c.pending=true;render();const turns=c.messages.slice(0,index).filter(v=>v.source!=='rules'&&v.source!=='safety').slice(-12).map(v=>({role:v.role,text:v.text}));const out=await requestAi(c,turns);c.pending=false;if(out.ok){m.text=out.text;m.source=out.source;m.basis=out.basis;m.references=out.references;m.aiFailure=null;if(out.offer)c.offer=out.offer;persist();}else m.aiFailure=out.reason;render();}
async function sendMessage(text){if(quotaChecking)return;const c=currentConversation();if(data.conversations.some(v=>v.pending)){notice('답변을 기다리는 중이에요. 작성한 메시지는 입력창에 남아 있어요.');return;}quotaChecking=true;const verified=await refreshCoachQuota();quotaChecking=false;if(!verified){drawCoachQuota();notice('상담 이용 횟수를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}if(coachLoginRequired||!coachQuota||coachQuota.remaining===0){drawCoachQuota();notice(quotaText());return;}text=text.trim();if(!text)return;if(text.length>1500){notice('메시지는 1,500자 이내로 입력해 주세요.');return;}if(c!==ct())return;if(c.profileKey!==profileKey()){notice('이전 프로필에서 시작한 상담입니다. 새 상담을 시작해 주세요.');return;}if(!c.historyPreferences){
  chooseHistory((preferences,mode)=>{
   c.historyPreferences=preferences;
   c.supportMode=mode;
   persist();
   sendMessage(text);
  });
  return;
 }if(!await engineReady())return;c.messages.push({id:uid(),role:'user',text,at:new Date().toISOString()});setChatDraft('');
 // 수긍은 기록을 검토하는 양식을 엽니다.
 if(c.offer){
  if(affirmative(text)){
   persist();render();reviewChoice(c);return;
  }
  c.offer=null;
  if(NO.test(text)){
   c.messages.push({id:uid(),role:'assistant',source:'record',at:new Date().toISOString(),
    text:'알겠어요, 남기지 않을게요. 계속 이야기해요.'});
   persist();render();return;
  }
 }
 // 규칙 기반 답을 먼저 만들어 둡니다. 실제 상담이 없거나 실패해도 이 답이
 // 나가므로 사용자는 빈 화면을 보지 않습니다.
 persist(); // AI를 기다리는 중 창을 닫아도 사용자의 질문은 먼저 남깁니다.
 const fallback=E.coach(result,p(),c,text);
 if(fallback.phase!=='safety'&&unrelatedQuestion(text)){
  c.messages.push({id:uid(),role:'assistant',text:SCOPE_NOTICE,source:'scope',at:new Date().toISOString()});
  persist();render();return;
 }
 if(fallback.topic)c.topic=fallback.topic;
 if(Object.hasOwn(fallback,'context'))c.context=fallback.context;
 let reply=fallback.text,source='rules',aiFailure=null;
 c.pending=true;
 if(!['safety','clarify'].includes(fallback.phase)&&await coachAvailable()){
  const turns=c.messages.filter(m=>m.role!=='system'&&m.source!=='rules').slice(-8).map(m=>({role:m.role,text:m.text}));
  const draft={id:uid(),role:'assistant',text:thinkingText(text),source:'pending',streaming:true,at:new Date().toISOString()};
  c.messages.push(draft);c.pending=true;render();
  const out=await requestAi(c,turns);
  if(out.ok){draft.text=out.text;draft.source=out.source;draft.basis=out.basis;draft.references=out.references;if(out.offer)c.offer=out.offer;}
  else if(out.busy){draft.text=out.reason;draft.source='quota';draft.aiFailure=out.reason;}
  else{draft.text=out.blocked?out.reason:fallback.text;draft.source=out.blocked?'quota':'rules';draft.aiFailure=out.blocked?null:out.reason;draft.basis=out.blocked?null:fallback.basis;}
  delete draft.streaming;c.pending=false;persist();render();return;
 }
 c.pending=false;
 c.messages.push({id:uid(),role:'assistant',text:reply,source,aiFailure,basis:fallback.basis,at:new Date().toISOString()});persist();render();}
async function action(a){if(a==='retry'){if(!loaded)await load();else await persist();return;}if(a==='logout'){try{const {response}=await logout();if(!response.ok)throw new Error();clearTossLogin();clearDrafts();setMetricsEnabled(false);authUser=null;coachQuota=null;coachLoginRequired=true;aiCoach=null;page='welcome';await load();notice('로그아웃했어요.');}catch{notice('로그아웃하지 못했어요. 다시 시도해 주세요.');}return;}if(a==='export-json'){download('달빛-보관함.json',JSON.stringify(data,null,2),'application/json');return;}if(a==='export-text'){download('달빛-보관함.txt',exportText());return;}if(a==='chat-history'){chatHistoryModal();return;}
 if(a==='delete-all'){deleteAllModal();}}
async function clearDeletedDeviceData(){
 clearDrafts();chatDraft='';await clearDeletedDeviceStorage();
}
async function completeDeletion(manualApple=false){
 await saveQueue;
 const {response,body}=authUser?await deleteAccount(manualApple,authUser.id):await deleteJournal(true);
 if(body?.code==='APPLE_REAUTH_REQUIRED'){
  openModal(`<h2>Apple 연결도 해제할까요?</h2><p>다시 확인한 Apple 계정이 현재 계정과 같을 때 연결을 해제한 뒤 서비스 계정과 기록을 삭제합니다. 취소하거나 확인에 실패하면 기록은 유지됩니다.</p>${body.reauthorize?'<button class="danger" id="apple-delete-reauth">Apple 확인 후 탈퇴</button>':''}<p>Apple 확인을 이용할 수 없으면 서비스 데이터부터 삭제하고 Apple 설정에서 연결을 직접 해제할 수 있습니다. <a href="https://support.apple.com/102571" target="_blank" rel="noopener">Apple 연결 해제 방법</a></p><button class="secondary" id="apple-delete-manual">Apple 연결은 직접 해제하고 탈퇴</button><button class="secondary" id="apple-delete-cancel">취소</button>`);
  const reauth=$('#apple-delete-reauth');if(reauth)reauth.onclick=()=>{reauth.disabled=true;const form=document.createElement('form');form.method='POST';const expected=document.createElement('input');expected.type='hidden';expected.name='expectedUserId';expected.value=authUser?.id||'';form.append(expected);form.action='/api/auth/start?provider=apple&intent=delete';document.body.append(form);form.submit();};
  $('#apple-delete-manual').onclick=async()=>{const button=$('#apple-delete-manual');button.disabled=true;try{await completeDeletion(true);}catch{button.disabled=false;notice('삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');}};
  $('#apple-delete-cancel').onclick=()=>$('#modal').close();return;
 }
 if(!response.ok)throw new Error(body?.error||'삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
 generation++;await clearDeletedDeviceData();authUser=null;data={profile:null,records:[],conversations:[],savedAnswers:[]};revision=0;result=null;activeConversation=null;saveState='ready';$('#modal').close();nav('welcome');notice(manualApple?'서비스 계정과 기록을 삭제했어요. Apple 설정에서 연결도 직접 해제해 주세요.':'계정과 개인 보관함의 정보를 삭제했어요.');
}
function deleteAllModal(){
 openModal(`<h2>${authUser?'계정과 개인정보를':'개인정보를'} 모두 삭제할까요?</h2><p>현재 보관함의 ${noteMode?'선택 기록과 회고가':'프로필·상담·선택 기록·저장한 답변이'} 삭제됩니다. 내려받은 파일과 캘린더 일정은 별도로 삭제해 주세요.</p><label class="check"><input id="delete-confirm" type="checkbox">복구할 수 없음을 이해했습니다.</label><p id="delete-error" role="alert"></p><button class="danger" id="delete-final">전체 삭제</button>`);
 $('#delete-final').onclick=async()=>{
  if(!$('#delete-confirm').checked){$('#delete-error').textContent='위 확인란을 선택해 주세요.';return;}
  const button=$('#delete-final');button.disabled=true;
  try{await completeDeletion();}catch(error){$('#delete-error').textContent=error.message;button.disabled=false;}
 };
}

async function load(){saveState='loading';refreshSave();try{const {response:res,body:r}=await getJournal();if(!res.ok)throw new Error(r.error);loaded=true;revision=r.revision;data=r.data||{profile:null,records:[],conversations:[],savedAnswers:[]};data.savedAnswers||=[];
 for(const conversation of data.conversations){
  delete conversation.pending;
  conversation.messages=conversation.messages.filter(message=>!message.streaming);
 }
 savedBaseline=JSON.parse(JSON.stringify(data));result=null;if(!noteMode&&data.profile&&await engineReady()){try{result=E.calculate(data.profile);}catch{notice('이전 프로필의 계산 정보를 다시 확인해 주세요. 정보 수정에서 다시 저장하면 이어서 볼 수 있어요.');}}if(!ct()||ct().profileKey!==profileKey()){
  const previous=data.conversations.filter(c=>c.profileKey===profileKey()&&(c.messages.some(m=>m.role==='user')||readConcernDraft(c.id).trim()))
   .sort((a,b)=>(b.messages.at(-1)?.at||b.created).localeCompare(a.messages.at(-1)?.at||a.created))[0];
  selectConversation(previous?.id||null,true);
 }
 if(afterLogin){page=noteMode?'records':result?'chat':'birth';afterLogin=false;const url=new URL(location.href);url.searchParams.delete('auth');history.replaceState(null,'',url.pathname+url.search+url.hash);}saveError='';saveState=revision?'saved':'ready';render();syncReviewReminders(data.records);if(openOnLoad){const id=openOnLoad;openOnLoad=null;page='records';render();recordDetail(id);}const legacy=localStorage.getItem('dalbit-v2');if(legacy&&!r.data)offerMigration(legacy);}catch(e){markSaveError(e.message||'저장소에 연결하지 못했어요. 설정에서 다시 시도해 주세요.');render();}}
function offerMigration(raw){let old;try{old=JSON.parse(raw);}catch{return;}if(!old.birth)return;openModal('<h2>이전 기록을 발견했어요</h2><p>이 브라우저에 있던 프로필과 선택 기록을 서버 보관함으로 옮길 수 있어요. 현재 버전은 생년월일·상담·기록을 서버에 저장합니다.</p><button class="primary" id="migrate">이전 기록 가져와 서버에 저장</button><button class="secondary" id="skip-migrate">지금은 건너뛰기</button>');$('#skip-migrate').onclick=()=>$('#modal').close();$('#migrate').onclick=async()=>{if(!ageEligibility(old.birth))return notice(AGE_NOTICE);data.profile={name:old.name,birth:old.birth,time:old.time||'12:00',unknown:!!old.unknownTime,calendar:'solar',city:'서울',zone:'Asia/Seoul',longitude:126.978,clock:'civil',topics:old.topics?.length?old.topics:['진로'],question:old.topicNote||''};data.records=(old.records||[]).map(r=>({id:uid(),date:String(r.d).slice(0,10),title:r.title,topic:'진로',confidence:50,expectation:r.sub||'',actual:r.kind==='결과'?r.sub:'',due:String(r.d).slice(0,10),result:r.kind==='결과'?'neutral':'pending',mood:r.mood||'',legacy:true}));if(!await engineReady())return;try{result=E.calculate(p());const ok=await persist();if(ok)localStorage.removeItem('dalbit-v2');$('#modal').close();nav('result');}catch(e){notice(e.message);}};}
async function loadAuth(){
 await Promise.allSettled([
  authProviders().then(({response,body})=>{if(!response.ok)throw new Error('providers');authOptions=body;authStatus='ready';}).catch(()=>{authStatus='error';}),
  currentUser().then(({response,body})=>{if(response.ok)authUser=body.user||null;}).catch(()=>{})
 ]);
 render();
}
if(noteMode){document.title=APP_NAME;document.documentElement.dataset.app='note';}else delete document.documentElement.dataset.app;
// Render and load personal data only after the age confirmation screen.
// Warm the 만세력 chunk while the splash is on screen, so the first navigation
// into a chart does not wait on the network. Failures are retried on demand.
ensureEngine().catch(()=>{enginePromise=null;engineTry++;});
// 상담·판독 연결 여부를 한 번에 확인하고, 달라졌으면 화면을 다시 그립니다.
// Availability is fetched after eligibility confirmation.
async function startApp(){
 const url=new URL(location.href);
 if(url.searchParams.get('account')==='deleted'){
  try{const {response,body}=await deletionResult();if(response.ok&&body.deleted){await clearDeletedDeviceData();notice('Apple 연결과 서비스 계정·기록을 삭제했어요.');}}catch{notice('삭제 결과 확인이 지연됐어요. 설정에서 다시 확인해 주세요.');}
  url.searchParams.delete('account');history.replaceState(null,'',url.pathname+url.search+url.hash);
 }
 if(url.searchParams.get('deletion')==='failed'){notice('Apple 확인 또는 탈퇴 결과를 확인하지 못했어요. 설정에서 계정 상태를 확인하고 다시 시도해 주세요. 서비스 데이터만 삭제할 수도 있어요.');url.searchParams.delete('deletion');history.replaceState(null,'',url.pathname+url.search+url.hash);}
 await confirmAge();render();coachAvailable().then(()=>{if(loaded)render();});
 loadAuth();load();
}
startApp();
// 회고 알림을 누르면 그 기록을 엽니다. 보관함을 불러오기 전이면 불러온 뒤에 엽니다.
setupNativeShell({back:nativeBack,notify:notice,remindersChanged:()=>{const status=$('#review-reminder-status'),form=$('#edit-record'),record=data.records.find(r=>r.id===form?.dataset.id);if(status&&record)void reviewReminderStatus(record).then(text=>{if(status.isConnected)status.textContent=text;});},openRecord:id=>{if(!loaded){openOnLoad=id;return;}page='records';render();recordDetail(id);}});

// 정책 문서는 현재 화면 위에서 열고 닫습니다. 입력 중인 내용은 유지합니다.
document.addEventListener('click',async event=>{
 const link=event.target.closest('a[href]');
 if(!link||!['/privacy/','/terms/','/support/','/account-deletion/'].includes(link.getAttribute('href')))return;
 event.preventDefault();
 const path=link.getAttribute('href');
 openModal('<p role="status">문서를 불러오고 있어요.</p>');
 $('#modal').dataset.document=path;
 try{
  const response=await fetch(path);
  if(!response.ok)throw new Error('document');
  const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
  const main=parsed.querySelector('main');
  if(!main)throw new Error('document');
  if($('#modal').open&&$('#modal').dataset.document===path){openModal('<article class="legal-document">'+main.innerHTML+'</article>');if(path==='/support/')mountSupportRequest($('#modal'));}
 }catch{
  if($('#modal').open&&$('#modal').dataset.document===path)openModal('<p>문서를 불러오지 못했어요. 잠시 후 다시 열어주세요.</p>');
 }
});
