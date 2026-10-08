// Preview only. No payment request, entitlement write, or renewal is performed.
export const PLUS_PLAN = Object.freeze({ price: 4900, answers: 50 });
export const subscriptionEnabled = ({ native = false, toss = false } = {}) => !native && !toss;

export function installSubscription({ page, user, openModal, notice, navigate, native, toss }) {
  if (!subscriptionEnabled({ native, toss })) return;
  const close = () => document.querySelector('#modal').close();
  const bind = (id, handler) => { document.getElementById(id).onclick = handler; };
  function confirmation() {
    openModal(`<section class="subscription-sheet"><p class="eyebrow">결제 정보 미리보기 · 출시 준비 중</p><h2>달빛 플러스를 구독할까요?</h2><p class="subscription-price">월 ${PLUS_PLAN.price.toLocaleString('ko-KR')}원 <small>부가세 포함</small></p><dl class="subscription-details"><dt>제공 예정</dt><dd>결제 주기마다 AI 상담 ${PLUS_PLAN.answers}회</dd><dt>오늘 청구 금액</dt><dd>0원 · 현재 결제 불가</dd><dt>다음 결제일</dt><dd>없음 · 구독이 시작되지 않습니다</dd></dl><p>출시 후 매월 자동 결제되는 상품으로 제공할 예정입니다. 설정에서 해지하면 다음 결제를 중단하고, 결제한 이용기간까지 사용할 수 있도록 준비하고 있어요.</p><p>환불 기준과 정기결제 동의 절차는 실제 결제 서비스 오픈 전에 안내합니다.</p><button class="primary" disabled>결제 준비 중 · 결제할 수 없어요</button><button class="secondary" id="subscription-back">요금 안내로 돌아가기</button></section>`);
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
    openModal(`<section class="subscription-sheet"><p class="eyebrow">달빛 플러스 · 출시 준비 중</p><h2>궁금한 이야기를 조금 더 깊게</h2><p class="subscription-price">월 ${PLUS_PLAN.price.toLocaleString('ko-KR')}원 <small>부가세 포함 · 예정 요금</small></p><p>AI 상담 ${PLUS_PLAN.answers}회 / 결제 주기</p><ul><li>정상 AI 답변을 받았을 때만 1회 차감</li><li>오류·답변 실패·주제 밖 질문 거절은 차감하지 않음</li><li>횟수는 다음 결제일에 새로 지급되며 이월되지 않음</li><li>모두 사용해도 자동 추가 결제 없음</li></ul><p>기본 사주 결과와 선택 기록·회고는 무료로 이용해요. 계정당 최초 무료 상담 5회가 제공되며, 구독을 해지해도 저장한 기록은 계속 볼 수 있도록 제공할 예정입니다.</p><p class="subscription-notice" role="status">아직 구매할 수 없습니다. 지금은 무료 상담 5회만 이용 가능하며, 아래 안내를 확인해도 구독이 시작되거나 상담 횟수가 늘어나지 않습니다.</p><button class="primary" id="subscription-preview">${user ? '결제 정보 미리보기' : '로그인 방법 보기'}</button><button class="secondary" id="subscription-close">닫기</button></section>`);
    bind('subscription-preview', () => {
      if (!user) { close(); navigate('welcome'); return; }
      if (user.loginId) guestWarning(); else confirmation();
    });
    bind('subscription-close', close);
  }
  if (page === 'settings') {
    const card = document.createElement('section');
    card.className = 'card subscription-card';
    card.innerHTML = `<h2>달빛 플러스</h2><p>월 ${PLUS_PLAN.price.toLocaleString('ko-KR')}원 · AI 상담 ${PLUS_PLAN.answers}회</p><p>출시 준비 중 · 현재 활성 구독이나 청구는 없습니다.</p><button type="button" class="secondary">요금 및 결제 안내</button>`;
    card.querySelector('button').onclick = overview;
    document.querySelector('main')?.append(card);
  }
  const quota = document.querySelector('.coach-quota');
  if (quota) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary';
    button.textContent = '달빛 플러스 안내 · 준비 중'; button.onclick = overview;
    quota.after(button);
  }
}
