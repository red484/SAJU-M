import { businessInfo } from './business-info.js';
// Preview only. No payment request, entitlement write, or renewal is performed.
export const PLUS_PLAN = Object.freeze({ price: 4900, answers: 50 });
export const subscriptionEnabled = ({ native = false, toss = false } = {}) => !native && !toss;

export function installSubscription({ page, user, openModal, notice, navigate, native, toss, showExample, followUp }) {
  if (!subscriptionEnabled({ native, toss })) return;
  const close = () => document.querySelector('#modal').close();
  const bind = (id, handler) => { document.getElementById(id).onclick = handler; };
  function confirmation() {
    openModal(`<section class="subscription-sheet"><p class="eyebrow">결제 정보 미리보기 · 출시 준비 중</p><h2>온기 플러스를 구독할까요?</h2><p class="subscription-price">월 ${PLUS_PLAN.price.toLocaleString('ko-KR')}원 <small>부가세 포함</small></p><dl class="subscription-details"><dt>제공 예정</dt><dd>결제 주기마다 AI 상담 ${PLUS_PLAN.answers}회</dd><dt>오늘 청구 금액</dt><dd>0원 · 현재 결제 불가</dd><dt>다음 결제일</dt><dd>없음 · 구독이 시작되지 않습니다</dd></dl><p>출시 후 매월 자동 결제되는 상품으로 제공할 예정입니다. 설정에서 해지하면 다음 결제를 중단하고, 결제한 이용기간까지 사용할 수 있도록 준비하고 있어요.</p><p>정기결제의 확정 조건과 동의 절차는 실제 판매 전에 안내합니다. <a href="/refund/" target="_blank" rel="noopener">환불정책</a>과 <a href="/terms/" target="_blank" rel="noopener">이용약관</a>을 확인해 주세요.</p><button class="primary" disabled>결제 준비 중 · 결제할 수 없어요</button><button class="secondary" id="subscription-back">요금 안내로 돌아가기</button></section>`);
    bind('subscription-back', overview);
  }
  function guestWarning() {
    openModal('<section class="subscription-sheet"><h2>게스트 아이디를 보관해 주세요</h2><label>내 로그인 아이디<input id="subscription-guest-id" readonly></label><button class="secondary" id="subscription-copy">아이디 복사</button><p>이 계정에는 복구용 이메일이 없습니다. 아이디나 비밀번호를 잊으면 구매 내역과 기록 복구가 어려울 수 있어요. 비밀번호를 다시 입력할 필요는 없습니다.</p><label class="check"><input type="checkbox" id="subscription-saved">아이디와 비밀번호를 보관했습니다.</label><p class="hint">현재는 안내 화면만 제공하며 실제 결제는 진행되지 않습니다.</p><button class="primary" id="subscription-next" disabled>결제 정보 확인</button><button class="secondary" id="subscription-back">돌아가기</button></section>');
    document.getElementById('subscription-guest-id').value = user.loginId;
    bind('subscription-copy', async () => {
      try { await navigator.clipboard.writeText(user.loginId); notice('아이디를 복사했어요.'); }
      catch { notice('아이디를 선택해 직접 복사해 주세요.'); }
    });
    document.getElementById('subscription-saved').onchange = event => {
      document.getElementById('subscription-next').disabled = !event.target.checked;
    };
    bind('subscription-next', () => {
      if (document.getElementById('subscription-saved').checked) confirmation();
    });
    bind('subscription-back', overview);
  }
  function overview() {
    openModal(`<section class="subscription-sheet purchase-sheet">
      <p class="eyebrow">조금 더 깊은 나의 이야기</p><h2>온기 플러스 요금 안내</h2>
      <article class="purchase-plan" aria-label="온기 플러스 월 구독 상품">
        <div class="purchase-plan-heading"><h3>온기 플러스</h3><span>월 구독</span></div>
        <p class="purchase-caption">한 번의 답변으로 끝나지 않는 고민을 이어가세요. 선택 기준을 정리하고, 직접 해본 뒤 같은 상담에서 결과를 돌아볼 수 있어요.</p>
        <div class="purchase-allowance"><b>AI 상담 ${PLUS_PLAN.answers}회</b><span>매월 결제 주기마다 새롭게</span></div>
        <p class="purchase-amount">${PLUS_PLAN.price.toLocaleString('ko-KR')}<span>원 / 월</span></p>
        <p class="purchase-tax">부가세 포함 · 출시 예정 요금</p>
        <ul><li>정상 답변에만 상담 횟수 차감</li><li>한도를 다 써도 자동 추가 결제 없음</li><li>자기 이해 요약·기록·회고는 계속 무료</li></ul>
        <p class="purchase-tax">활용 예시 · 이직 조건 비교 → 출근길 확인 → 결과를 가지고 이어서 상담</p>
        <p class="purchase-unavailable" role="status">출시 준비 중 · 이 화면에서 결제하거나 구독을 시작할 수 없어요. 구독이 시작되거나 상담 횟수가 늘어나지 않습니다.</p>
      </article>
      <details><summary>이용·해지 조건 확인</summary><p>출시 후 매월 자동 결제 예정입니다. 상담 횟수는 이월되지 않으며 오류·답변 실패·주제 밖 질문 거절은 차감하지 않습니다. 해지 시 다음 결제를 중단하고 이용기간 종료일까지 이용할 수 있도록 준비 중입니다. 정기결제의 확정 환불 조건은 판매 전에 안내합니다. <a href="/refund/" target="_blank" rel="noopener">환불정책</a>과 <a href="/pricing/" target="_blank" rel="noopener">상품 안내</a>를 확인해 주세요.</p></details>
      <button class="secondary" id="purchase-example" hidden>상담 예시 보기</button>
      <p class="hint" id="purchase-record-hint" hidden>기록 열기와 회고는 무료예요.</p><button class="secondary" id="purchase-follow-up" hidden></button>
      <button class="text-link purchase-account" id="subscription-preview">${user?.loginId ? '게스트 결제 전 확인사항' : user ? '결제 상세 정보 확인' : '로그인 방법 보기'}</button>
      <button class="secondary" id="subscription-close">나중에 할게요</button>
      ${businessInfo}
    </section>`);
    if(showExample){const example=document.getElementById('purchase-example');example.hidden=false;example.onclick=()=>showExample(overview);}
    if(followUp){const record=document.getElementById('purchase-follow-up');record.hidden=false;record.textContent=followUp.label;record.onclick=followUp.open;document.getElementById('purchase-record-hint').hidden=false;}
    bind('subscription-preview', () => {
      if (!user) { close(); navigate('welcome'); return; }
      if (user.loginId) guestWarning(); else confirmation();
    });
    bind('subscription-close', close);
  }
  const quota = document.querySelector('.coach-quota');
  if (quota && user) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'subscription-inline';
    button.textContent = '온기 플러스 요금 미리보기';
    button.onclick = overview;
    quota.append(button);
  }
  if (page === 'settings' && !document.querySelector('.subscription-card')) {
    const card = document.createElement('section');
    card.className = 'card subscription-card';
    card.innerHTML = `<h2>온기 플러스</h2><p>월 ${PLUS_PLAN.price.toLocaleString('ko-KR')}원 · AI 상담 ${PLUS_PLAN.answers}회</p><p>출시 준비 중 · 현재 활성 구독이나 청구는 없습니다.</p><button type="button" class="secondary">요금 및 결제 안내</button>`;
    card.querySelector('button').onclick = overview;
    document.querySelector('main')?.append(card);
  }
}
