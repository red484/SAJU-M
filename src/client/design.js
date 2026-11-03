import { APP_NAME } from './native-shell.js';
import { appsInToss } from './api/client.js';
import { improveBirthForm } from './form-usability.js';

let motionPaused = false;

export function dressPage({page, profile}) {
  if (page === 'birth') improveBirthForm(profile);
  document.body.classList.add('moonbook');
  document.body.classList.toggle('apps-in-toss', appsInToss);
  if (appsInToss && ['result', 'today', 'chat'].includes(page)) {
    const host = page === 'chat' ? document.querySelector('.chat-panel') : document.querySelector('main');
    if (host && !host.querySelector('.ai-disclosure')) {
      // This note is inside the chat sidebar, not a second layout sidebar.
      const notice = document.createElement('div');
      notice.className = 'ai-disclosure';
      notice.setAttribute('role', 'note');
      notice.innerHTML = '<b>AI 생성 콘텐츠</b><span>이 앱의 AI 해석과 상담 답변은 참고용 콘텐츠입니다. 중요한 결정은 현실적인 정보와 본인의 판단을 함께 고려해 주세요.</span>';
      if (page === 'chat') host.querySelector('.mentor')?.insertAdjacentElement('afterend', notice);
      else host.prepend(notice);
    }
  }
  const log = document.querySelector('.chat-panel .messages');
  if (log && !log.closest('.chat-stage')) {
    const stage = document.createElement('div');
    stage.className = 'chat-stage';
    log.before(stage);
    stage.append(log);
  }
  document.querySelectorAll('.ink-branches,.motion-toggle').forEach(el => el.remove());
  if (page !== 'welcome') {
    const branches = document.createElement('div');
    branches.className = 'ink-branches';
    branches.setAttribute('aria-hidden', 'true');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'motion-toggle';
    const syncMotion = () => {
      document.body.classList.toggle('motion-paused', motionPaused);
      toggle.textContent = motionPaused ? '배경 재생' : '배경 멈춤';
      toggle.setAttribute('aria-label', motionPaused ? '배경 애니메이션 재생' : '배경 애니메이션 일시 정지');
    };
    toggle.addEventListener('click', () => { motionPaused = !motionPaused; syncMotion(); });
    syncMotion();
    if (document.documentElement.dataset.app === 'note') document.body.append(branches);
    const header = document.querySelector('header');
    if (header) {
      const settings = header.querySelector('[data-nav="settings"]');
      const save = document.querySelector('.save-status');
      const controls = document.createElement('div');
      controls.className = 'header-controls';
      const logout = header.querySelector('.header-logout');
      const menu = document.createElement('details');
      menu.className = 'display-menu';
      const summary = document.createElement('summary');
      summary.textContent = '☰';
      summary.setAttribute('aria-label', '메뉴');
      const items = document.createElement('div');
      items.className = 'display-menu-items';
      if (document.documentElement.dataset.app === 'note') items.append(toggle);
      if (logout) items.append(logout);
      if (settings) { settings.textContent = '설정 · 내 보관함'; items.append(settings); }
      menu.append(summary, items);
      if (save) items.append(save);
      controls.append(menu);
      header.append(controls);
      if (appsInToss) {
        // Toss supplies the navigation bar. Keep account/settings actions in
        // the page content, without a second brand or back button.
        summary.textContent = '설정 · 내 보관함';
        summary.setAttribute('aria-label', '설정 메뉴');
        controls.className = 'toss-page-settings';
        document.querySelector(page === 'chat' ? '.chat-panel .mentor' : 'main')?.append(controls);
        header.remove();
      }
      menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { menu.open = false; summary.focus(); }
      });
      menu.addEventListener('focusout', event => {
        // Safari touch can blur the summary with no relatedTarget before
        // dispatching the button's click. Do not hide that pending target.
        if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
      });
    }
  }
  // 복사·저장·공유는 접어두지 않습니다. 공유가 대화 캡처의 입구라
  // 한 번 더 펼치게 만들면 기능이 사실상 숨습니다. 모양은 아래 CSS가 잡아요.
  const note = document.querySelector('.chat-note');
  if (note) {
    const disclosure = document.createElement('details');
    disclosure.className = 'chat-guidance';
    const label = document.createElement('summary');
    label.textContent = '상담 안내 · 전문적 판단을 대신하지 않습니다';
    note.before(disclosure);
    disclosure.append(label, note);
  }
  // The server already returns three named parts. Present those names as real
  // reading landmarks instead of leaving the response as one dense paragraph.
  document.querySelectorAll('.message.assistant:not(.pickable) .bubble').forEach(bubble => {
    const text = bubble.textContent.trim();
    const heading = /^(명리학 관점|사주 관점|현실 확인|오늘 할 일)$/;
    const lines = text.split(/\n/);
    if (!lines.some(line => heading.test(line.trim()))) return;
    const fragment = document.createDocumentFragment();
    let section = null;
    lines.forEach(line => {
      const title = line.trim().match(heading)?.[1];
      if (title) {
        section = document.createElement('section');
        section.className = `chat-answer-part part-${title.replaceAll(' ','-')}`;
        const h = document.createElement('strong'); h.textContent = title;
        const p = document.createElement('p');
        section.append(h,p); fragment.append(section);
      } else if (section) {
        const p = section.querySelector('p');
        if (line.trim()) p.append(p.childNodes.length ? document.createElement('br') : '', document.createTextNode(line.trim()));
      }
    });
    if (fragment.childNodes.length) bubble.replaceChildren(fragment);
  });
  if (page === 'records') {
    const stats = document.querySelector('.stats');
    stats?.closest('.card')?.classList.add('journal-summary');
  }
  if (page === 'settings') {
    // Find the storage card by its heading; its position shifts when account cards are added.
    const connection = [...document.querySelectorAll('.narrow .card')]
      .find(card => card.querySelector('h2')?.textContent === '연결 상태')?.querySelector('p');
    if (connection) connection.innerHTML = connection.innerHTML.replace('실제 AI 상담: 연결됨', 'AI 키: 연결됨 (실제 답변은 상담 화면에서 확인)');
  }
  // Focus follows navigation, without forcing users back to the top of a chat.
  const main = document.querySelector('main');
  if (main) main.setAttribute('aria-label',`${profile?.name || '나'}의 ${APP_NAME}`);
}
