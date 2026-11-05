import {apiRequest} from './api/client.js';
import {ageEligibility,AGE_NOTICE} from '../shared/age-policy.mjs';
let confirming;
export function confirmAge() {
 if(confirming)return confirming;
 confirming=(async()=>{
  try{const {response,body}=await apiRequest('/api/eligibility');if(response.ok&&body.verified)return;}catch{}
  await new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.className='age-gate';
   dialog.innerHTML=`<div class="narrow"><p class="eyebrow">삶의 온기 · 달빛 노트 이용 전 확인</p><h1>만 14세 이상만<br>이용할 수 있어요</h1><p>${AGE_NOTICE}</p><form><label>본인의 양력 생년월일<input name="birth" type="date" min="1900-01-01" required autocomplete="off"></label><p class="hint">연령 확인용 날짜는 저장하지 않습니다. 명리 계산용 음력 생일과는 별개로 본인의 양력 생일을 입력해 주세요. 확인 결과만 이 브라우저에서 사용하며 배포·기기 변경 후 다시 확인할 수 있어요.</p><p class="form-error" role="alert" hidden></p><button class="primary">확인하고 계속하기</button></form><p><a href="/terms/" target="_blank" rel="noopener">이용약관</a> · <a href="/privacy/" target="_blank" rel="noopener">개인정보처리방침</a> · <a href="/account-deletion/" target="_blank" rel="noopener">기존 기록 삭제 문의</a></p><p class="hint">본인확인 기관을 통한 인증이 아닌 입력한 생년월일에 따른 확인입니다.</p></div>`;
   dialog.addEventListener('cancel',event=>event.preventDefault());
   document.body.append(dialog);dialog.showModal();
   const form=dialog.querySelector('form'),error=form.querySelector('[role=alert]'),button=form.querySelector('button');
   form.onsubmit=async event=>{
    event.preventDefault();error.hidden=true;
    const birth=form.elements.birth.value;
    if(!ageEligibility(birth)){form.reset();error.textContent=AGE_NOTICE;error.hidden=false;return;}
    button.disabled=true;
    try{
     const {response,body}=await apiRequest('/api/eligibility',{method:'POST',body:JSON.stringify({birth})});
     form.reset();if(!response.ok||!body.verified)throw new Error(body.error||'연령을 확인하지 못했어요.');
     try{sessionStorage.setItem('ongi-age-token',body.token);}catch{}
     dialog.close();dialog.remove();resolve();
    }catch(e){error.textContent=e.message;error.hidden=false;button.disabled=false;}
   };
  });
 })().finally(()=>{confirming=null;});
 return confirming;
}
window.addEventListener('ongi-age-required',()=>void confirmAge());
