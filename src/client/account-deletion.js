import {currentUser,deleteAccount,deletionResult} from './api/auth.js';
import {deleteJournal} from './api/journal.js';
import {clearDeletedDeviceStorage} from './deleted-device-storage.js';

const root=document.querySelector('[data-direct-deletion]');
if(root)void startDeletion(root);
export async function startDeletion(root) {
 const url=new URL(location.href);
 if(url.searchParams.get('account')==='deleted'){
  try{const result=await deletionResult();if(!result.response.ok)throw Error();if(result.body.deleted){await clearDeletedDeviceStorage();root.hidden=false;root.textContent='Apple 연결과 서비스 계정·기록 삭제가 완료됐어요. 이 기기의 초안과 알림 선택도 정리했습니다.';return;}}
  catch{root.hidden=false;root.textContent='삭제 결과를 확인하지 못했어요. 아래 고객지원으로 문의해 주세요.';return;}
 }
 await mountDeletion(root);
 if(url.searchParams.get('deletion')==='failed'){const message=document.createElement('p');message.textContent='Apple 확인 또는 탈퇴 결과를 확인하지 못했어요. 현재 연결을 확인한 뒤 다시 시도하거나 고객지원으로 문의해 주세요.';root.append(message);}
}
export async function mountDeletion(root) {
 root.hidden=false;
 root.innerHTML='<h2>현재 연결된 데이터 직접 삭제</h2><p role="status">로그인 연결을 확인하고 있어요.</p>';
 const status=root.querySelector('[role=status]');
 let user;
 try{
  const result=await currentUser();if(!result.response.ok||!Object.hasOwn(result.body,'user'))throw Error();
  user=result.body.user;
 }catch{status.textContent='로그인 연결을 확인하지 못했어요. 새로고침해 다시 확인하거나 아래 고객지원으로 문의해 주세요.';return;}
 status.textContent=user?`${user.email||user.loginId||user.name||'현재 로그인된 계정'} 계정과 연결된 보관함을 삭제합니다.`:'현재 브라우저 쿠키에 연결된 익명 보관함만 삭제합니다. 다른 기기나 로그인했던 계정은 삭제하지 않습니다.';
 const form=document.createElement('form');
 form.innerHTML='<p>새 생년월일 입력이나 연령 확인 없이 삭제할 수 있어요. 삭제는 결제 취소·환불을 대신하지 않습니다. 내려받은 파일과 외부 일정은 직접 삭제해 주세요.</p><label><input type="checkbox" name="confirm" required> 계정·기록 삭제는 복구할 수 없음을 이해했습니다.</label><div class="actions"><button class="button" type="submit">'+(user?'현재 계정 탈퇴':'현재 익명 보관함 삭제')+'</button></div><p role="alert"></p><div data-apple-deletion hidden><p>Apple 연결은 별도로 해제해야 합니다. 자동 해제 후 탈퇴하거나 서비스 데이터부터 삭제하고 Apple 설정에서 연결을 직접 해제할 수 있어요.</p><div class="actions"><button class="button" type="button" data-apple-reauth>Apple 확인 후 탈퇴</button><button class="button secondary" type="button" data-apple-manual>Apple 연결은 직접 해제하고 탈퇴</button></div><p><a href="https://support.apple.com/102571" target="_blank" rel="noopener">Apple 연결 관리 안내</a></p></div>';
 root.append(form);
 const error=form.querySelector('[role=alert]'),apple=form.querySelector('[data-apple-deletion]');
 let deleting=false;
 const erase=async manual=>{
  if(deleting||!form.reportValidity())return;
  deleting=true;error.textContent='';for(const button of form.querySelectorAll('button'))button.disabled=true;
  try{
   const check=await currentUser();
   if(!check.response.ok||!Object.hasOwn(check.body,'user')||(check.body.user?.id||null)!==(user?.id||null))throw Error('로그인 상태가 바뀌었어요. 새로고침 후 삭제 대상을 다시 확인해 주세요.');
   const result=user?await deleteAccount(manual,user.id):await deleteJournal(true);
   if(result.body?.code==='APPLE_REAUTH_REQUIRED'){
    apple.hidden=false;form.querySelector('[data-apple-reauth]').hidden=!result.body.reauthorize;
    return;
   }
   if(!result.response.ok||result.body?.ok!==true)throw Error(result.body?.error||'삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
   await clearDeletedDeviceStorage();
   form.remove();status.textContent=manual?'서비스 계정과 기록을 삭제했어요. Apple 설정에서 연결도 직접 해제해 주세요.':'삭제가 완료됐어요. 이 기기의 초안·선택형 통계·회고 알림 선택도 정리했습니다.';
  }catch(e){error.textContent=e.message||'삭제하지 못했어요. 잠시 후 다시 시도해 주세요.';}
  finally{deleting=false;for(const button of form.querySelectorAll('button'))button.disabled=false;}
 };
 form.onsubmit=event=>{event.preventDefault();void erase(false);};
 form.querySelector('[data-apple-manual]').onclick=()=>void erase(true);
 form.querySelector('[data-apple-reauth]').onclick=()=>{
  if(deleting||!form.reportValidity())return;
  deleting=true;for(const button of form.querySelectorAll('button'))button.disabled=true;
  const request=document.createElement('form');const expected=document.createElement('input');expected.type='hidden';expected.name='expectedUserId';expected.value=user.id;request.append(expected);request.method='POST';request.action='/api/auth/start?provider=apple&intent=delete&returnTo='+encodeURIComponent('/account-deletion/?account=deleted');document.body.append(request);request.submit();
 };
}
