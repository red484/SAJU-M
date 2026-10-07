import { apiRequest, appsInToss } from './api/client.js';

export function installPasswordAccess({ page, user, openModal, notice, signedIn, beforeSignIn }) {
  // Toss retains its own login flow; these cookie-based accounts are for the web.
  if (appsInToss) return;
  const close = () => document.querySelector('#modal').close();
  function copyButton(id) {
    const button = document.createElement('button');
    button.className = 'secondary';
    button.type = 'button';
    button.textContent = '아이디 복사';
    button.onclick = async () => {
      try { await navigator.clipboard.writeText(id); notice('아이디를 복사했어요.'); }
      catch { notice('복사하지 못했어요. 아이디를 선택해서 직접 복사해 주세요.'); }
    };
    return button;
  }
  function showIdentity(id, newlyCreated = false) {
    openModal(`<h2>${newlyCreated ? '게스트 계정을 만들었어요' : '내 로그인 아이디'}</h2><p>이 아이디와 설정한 비밀번호로 다른 기기에서도 로그인할 수 있어요. 이메일 주소가 아니며 메일은 수신되지 않습니다.</p><label>로그인 아이디<input id="issued-login-id" readonly></label><div id="copy-login-id"></div><p>아이디와 비밀번호를 꼭 보관해 주세요. 현재 비밀번호 찾기·재설정 기능은 제공하지 않습니다.</p><button class="primary" id="account-continue">확인</button>`);
    document.querySelector('#issued-login-id').value = id;
    document.querySelector('#copy-login-id').append(copyButton(id));
    document.querySelector('#account-continue').onclick = close;
  }
  function form(registering) {
    openModal(`<h2>${registering ? '게스트 계정 만들기' : '아이디로 로그인'}</h2><p>${registering ? '로그인 아이디는 자동으로 발급됩니다. 사용할 비밀번호를 정해 주세요. 현재 브라우저의 기록도 계정에 연결됩니다.' : '발급받은 guest- 아이디를 입력해 주세요. Google·Apple 이메일 계정은 해당 로그인 버튼을 이용해 주세요.'}</p><form id="password-account-form">${registering ? '' : '<label>로그인 아이디<input name="loginId" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="64" placeholder="guest-…"></label>'}<label>비밀번호<input name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" minlength="12" maxlength="128" required></label>${registering ? '<p>12~128자로 입력해 주세요. 다른 사이트와 다른 비밀번호를 권장합니다.</p><label>비밀번호 확인<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label class="check"><input name="recovery" type="checkbox" required>아이디·비밀번호를 보관하겠습니다. 분실 시 현재 재설정·복구가 불가능함을 확인했습니다.</label><p><a href="/terms/" target="_blank" rel="noopener">이용약관</a> · <a href="/privacy/" target="_blank" rel="noopener">개인정보처리방침</a></p>' : ''}<p id="password-error" role="alert"></p><button class="primary" type="submit">${registering ? '계정 만들기' : '로그인'}</button></form>`);
    const element = document.querySelector('#password-account-form');
    if (registering) {
      const id = `guest-${Array.from(crypto.getRandomValues(new Uint8Array(10)), value => value.toString(16).padStart(2, '0')).join('')}`;
      const label = document.createElement('label');
      label.textContent = '내 로그인 아이디';
      const input = document.createElement('input');
      input.name = 'loginId'; input.autocomplete = 'username'; input.readOnly = true; input.value = id;
      label.append(input);
      const note = document.createElement('p');
      note.textContent = '계정 만들기를 완료하면 이 아이디로 로그인할 수 있어요. 이메일 주소가 아닙니다.';
      element.prepend(label, copyButton(id), note);
    }
    element.onsubmit = async event => {
      event.preventDefault();
      const error = element.querySelector('#password-error');
      const submit = element.querySelector('[type="submit"]');
      const password = element.elements.password.value;
      if (registering && password !== element.elements.confirm.value) { error.textContent = '비밀번호가 서로 달라요.'; return; }
      submit.disabled = true;
      error.textContent = '';
      try {
        await beforeSignIn();
        const { response, body } = await apiRequest(`/api/auth/password/${registering ? 'register' : 'login'}`, {
          method: 'POST', body: JSON.stringify({ password, loginId: element.elements.loginId?.value, acknowledgeRecovery: registering && element.elements.recovery.checked })
        });
        if (!response.ok) throw new Error(body.error || '로그인하지 못했어요.');
        element.reset();
        close();
        localStorage.removeItem('dalbit-guest-mode');
        await signedIn();
        if (registering) showIdentity(body.loginId, true);
        else notice('아이디로 로그인했어요.');
      } catch (reason) { error.textContent = reason.message || '연결을 확인해 주세요.'; }
      finally { submit.disabled = false; }
    };
  }
  if (!user) {
    const guest = document.querySelector('[data-password-register]');
    if (guest) guest.onclick = () => form(true);
    const target = document.querySelector('[data-guest-start]') || (page === 'settings' && document.querySelector('.account-card'));
    if (target) {
      const login = document.createElement('button');
      login.className = 'secondary';
      login.textContent = '아이디로 로그인';
      login.onclick = () => form(false);
      if (target.matches('[data-guest-start]')) target.before(login);
      else target.append(login);
      if (!guest) {
        const register = document.createElement('button');
        register.className = 'secondary'; register.textContent = '게스트 계정 만들기'; register.onclick = () => form(true);
        target.append(register);
      }
    }
  } else if (page === 'settings' && user.loginId) {
    const section = document.createElement('section'); section.className = 'card';
    const title = document.createElement('h2'); title.textContent = '내 게스트 계정';
    const label = document.createElement('label'); label.textContent = '로그인 아이디';
    const input = document.createElement('input'); input.readOnly = true; input.value = user.loginId; label.append(input);
    const warning = document.createElement('p'); warning.textContent = '이메일 주소가 아닌 로그인 전용 아이디입니다. 비밀번호 찾기·재설정은 아직 지원하지 않으니 아이디와 비밀번호를 보관해 주세요.';
    const payment = document.createElement('button'); payment.className = 'secondary'; payment.textContent = '게스트 결제 안내';
    payment.onclick = () => {
      openModal('<h2>게스트 결제 전 확인해 주세요</h2><p>아이디나 비밀번호를 잊으면 구매 내역·이용권을 복구하기 어렵습니다. 로그인 정보를 꼭 보관해 주세요.</p><p>현재 결제 서비스는 준비 중이며 실제 결제는 진행되지 않습니다.</p><button class="primary" id="password-payment-close">확인</button>');
      document.querySelector('#password-payment-close').onclick = close;
    };
    section.append(title, label, copyButton(user.loginId), warning, payment);
    document.querySelector('main').prepend(section);
  }
}
