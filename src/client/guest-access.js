import { apiRequest } from './api/client.js';

const modeKey = 'dalbit-guest-mode';
let guestId = '';
const isGuest = () => localStorage.getItem(modeKey) === 'guest';

export function guestPaymentMessage() {
  return '게스트 기록은 현재 브라우저에 연결돼 있어요. 쿠키 삭제·기기 변경 시 구매 내역과 이용권을 다시 찾기 어려울 수 있어요. 결제 전 정식 로그인을 권장합니다.';
}

export function installGuestAccess({ page, user, openModal, navigate, notice }) {
  if (user) {
    localStorage.removeItem(modeKey);
    guestId = '';
    return;
  }
  const start = document.querySelector('[data-guest-start]');
  if (start) {
    const button = document.createElement('button');
    button.className = 'secondary';
    button.textContent = isGuest() ? '게스트로 이어하기' : '게스트로 시작하기';
    start.before(button);
    button.onclick = async () => {
      button.disabled = true;
      try {
        const { response, body } = await apiRequest('/api/auth/guest', { method: 'POST' });
        if (!response.ok || !/^[a-f0-9]{64}$/.test(body.guest?.id || '')) throw new Error();
        guestId = body.guest.id;
        localStorage.setItem(modeKey, 'guest');
        openModal('<h2>게스트로 시작해요</h2><p>임시 사용자 ID로 사주와 기록을 서버에 보관합니다. 본인 인증된 계정은 아니며, 쿠키 삭제나 기기 변경 시 복구가 어려울 수 있어요.</p><p>같은 브라우저에서 정식 로그인하면 기록을 계정에 연결할 수 있어요. AI 상담은 정식 로그인 후 무료 5회 이용할 수 있습니다.</p><button class="primary" id="guest-session-continue">시작하기</button>');
        document.querySelector('#guest-session-continue').onclick = () => {
          document.querySelector('#modal').close();
          navigate();
        };
      } catch { notice('게스트 연결을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'); }
      finally { button.disabled = false; }
    };
    start.addEventListener('click', () => localStorage.removeItem(modeKey));
  }
  if (page === 'settings' && isGuest()) {
    const section = document.createElement('section');
    section.className = 'guest-account card';
    const title = document.createElement('h2');
    title.textContent = '게스트 보관함';
    const description = document.createElement('p');
    description.textContent = '현재 브라우저의 임시 사용자로 기록을 보관하고 있어요. 이 ID는 본인 인증이나 계정 복구 수단이 아닙니다.';
    const identity = document.createElement('small');
    identity.textContent = guestId ? `게스트 식별번호: ${guestId.slice(0, 12)}` : '게스트 식별번호 확인 중…';
    const payment = document.createElement('button');
    payment.className = 'secondary';
    payment.textContent = '게스트 결제 안내';
    payment.onclick = () => {
      openModal(`<h2>게스트 결제 전 확인해 주세요</h2><p>${guestPaymentMessage()}</p><p>현재 결제 서비스는 준비 중이며, 실제 결제나 이용권 구매는 진행되지 않습니다.</p><button class="primary" id="guest-payment-login">로그인 방법 보기</button><button class="secondary" id="guest-payment-close">닫기</button>`);
      document.querySelector('#guest-payment-login').onclick = () => { document.querySelector('#modal').close(); navigate('welcome'); };
      document.querySelector('#guest-payment-close').onclick = () => document.querySelector('#modal').close();
    };
    section.append(title, description, identity, payment);
    document.querySelector('main').prepend(section);
    if (!guestId) apiRequest('/api/auth/guest', { method: 'POST' }).then(({ response, body }) => {
      if (!response.ok || !/^[a-f0-9]{64}$/.test(body.guest?.id || '')) throw new Error();
      guestId = body.guest.id;
      identity.textContent = `게스트 식별번호: ${guestId.slice(0, 12)}`;
    }).catch(() => { identity.textContent = '게스트 연결을 확인하지 못했어요. 새로고침해 주세요.'; });
  }
}
