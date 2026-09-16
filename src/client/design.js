// Animate clipped wing layers from the original bitmap, without replacement artwork.

// Presentation only: the reading, calendar and storage remain owned by app.js.
const elements = [
  ['木', '목', '자라나는 힘', '#42755c'],
  ['火', '화', '표현하는 힘', '#c2634e'],
  ['土', '토', '중심을 잡는 힘', '#b38a35'],
  ['金', '금', '분별하는 힘', '#70879b'],
  ['水', '수', '깊이 흐르는 힘', '#436e9d']
];
const topicArt = {진로:['todayStart','나아갈 방향'],연애:['todayTalk','마음의 거리'],재물:['todayDeal','나의 기준'],건강:['todayRest','쉬어갈 시간'],가족:['todayDuty','함께하는 마음']};
let motionPaused = false;
let jumpObserver = null;

export function dressPage({page, result, profile}) {
  document.querySelectorAll('[data-nav="choice"],[data-nav="records"]').forEach(button => {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    button.title = '준비 중';
    button.setAttribute('aria-label', `${button.textContent.trim()} · 준비 중`);
  });
  document.body.classList.add('moonbook');
  jumpObserver?.disconnect();
  jumpObserver = null;
  // Keep scenery outside the live log and behind opaque, selectable messages.
  const log = document.querySelector('.chat-panel .messages');
  if (log && !log.closest('.chat-stage')) {
    const stage = document.createElement('div');
    stage.className = 'chat-stage';
    const sky = document.createElement('div');
    sky.className = 'chat-sky';
    sky.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 2; i++) {
      const bird = document.createElement('span');
      bird.className = `chat-bird chat-bird-${i + 1}`;
      const rig = document.createElement('span');
      rig.className = 'crane-rig';
      for (const part of ['far-wing', 'body', 'near-wing']) {
        const art = document.createElement('img');
        art.className = `crane-part crane-${part}`;
        art.src = '/assets/chat-crane.png';
        art.alt = '';
        art.width = 1536;
        art.height = 1024;
        art.draggable = false;
        art.decoding = 'async';
        rig.append(art);
      }
      bird.append(rig);
      sky.append(bird);
    }
    log.before(stage);
    stage.append(sky, log);
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
    document.body.append(branches);
    const header = document.querySelector('header');
    if (header) {
      const settings = header.querySelector('[data-nav="settings"]');
      const save = document.querySelector('.save-status');
      const controls = document.createElement('div');
      controls.className = 'header-controls';
      const logout = header.querySelector('.header-logout');
      if (logout) controls.append(logout);
      const menu = document.createElement('details');
      menu.className = 'display-menu';
      const summary = document.createElement('summary');
      summary.textContent = '설정';
      const items = document.createElement('div');
      items.className = 'display-menu-items';
      items.append(toggle);
      if (settings) { settings.textContent = '내 보관함'; items.append(settings); }
      menu.append(summary, items);
      if (save) items.append(save);
      controls.append(menu);
      header.append(controls);
      menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { menu.open = false; summary.focus(); }
      });
      menu.addEventListener('focusout', event => {
        if (!menu.contains(event.relatedTarget)) menu.open = false;
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
  document.querySelectorAll('.topic-choice').forEach(label => {
    const input = label.querySelector('input');
    const [art, caption] = topicArt[input.value] || topicArt.진로;
    const visual = document.createElement('span');
    visual.className = 'topic-art';
    const image = document.createElement('img');
    image.src = `/assets/${art}.webp`; image.alt = ''; image.loading = 'lazy';
    const small = document.createElement('small'); small.textContent = caption;
    visual.append(image, small); label.append(visual);
  });
  if (result && ['result','chat'].includes(page)) {
    const balance = document.querySelector('.balance');
    if (balance) {
      balance.closest('.card')?.classList.add('element-card');
      const heading = balance.previousElementSibling;
      if (heading) {
        const intro = document.createElement('p');
        intro.className = 'element-intro';
        intro.textContent = '나를 이루는 다섯 가지 기운';
        heading.after(intro);
      }
      balance.querySelectorAll('.element-legend li').forEach((row,i) => {
        row.style.setProperty('--element', elements[i][3]);
        row.style.setProperty('--share', `${result.cnt[i] / result.total * 100}%`);
        row.classList.toggle('is-dominant', result.strong.includes(i));
        const track = document.createElement('span');
        track.className = 'element-meter';
        track.setAttribute('aria-hidden','true');
        track.append(document.createElement('i'));
        row.append(track);
      });
      const caption = document.createElement('p');
      caption.className = 'element-caption';
      caption.textContent = `${result.total}글자 기준 · ${result.strong.map(i=>elements[i][1]).join('·')} 기운이 가장 많이 나타나요. 비율은 실제 명식의 오행 개수로 계산합니다.`;
      balance.after(caption);
    }
    const core = document.querySelector('.core');
    const [glyph, name, caption, color] = elements[result.element];
    core.style.setProperty('--element',color);
    const seal = document.createElement('div'); seal.className = 'reading-seal';
    const sign = document.createElement('b'); sign.textContent = glyph;
    const text = document.createElement('span'); text.textContent = `나의 일간 · ${name}`;
    const note = document.createElement('small'); note.textContent = caption;
    seal.append(sign,text,note); core.prepend(seal);
    const strip = document.createElement('div'); strip.className = 'element-ribbon';
    strip.setAttribute('aria-label','오행 개수 요약');
    elements.forEach(([g,n,c,h],i) => {
      const item = document.createElement('a'); item.href = '#chart';
      item.style.setProperty('--element',h);
      item.setAttribute('aria-label',`${n} ${result.cnt[i]}개, 상세 명식으로 이동`);
      const symbol = document.createElement('b'); symbol.textContent = g;
      const value = document.createElement('span'); value.textContent = `${n} · ${result.cnt[i]}`;
      item.append(symbol,value);strip.append(item);
    });
    core.after(strip);

    // Put the decision-making essentials in one compact opening chapter. The
    // original content is moved, not duplicated or hidden behind a control.
    document.querySelector('.section-top')?.classList.add('result-heading');
    const cards = document.querySelector('.two-cards');
    const strength = cards?.querySelector(':scope > .card:first-child');
    const reflection = cards?.querySelector(':scope > .card:last-child');
    const action = document.querySelector('.action-card');
    if (strength && reflection && action) {
      const highlights = document.createElement('div');
      highlights.className = 'core-highlights';
      const strengthItem = document.createElement('div');
      const actionItem = document.createElement('div');
      strengthItem.append(strength.querySelector('.eyebrow'), strength.querySelector('h3'));
      actionItem.append(action.querySelector('.eyebrow'), action.querySelector('h3'), action.querySelector('button'));
      highlights.append(strengthItem, actionItem);
      const meta = document.createElement('div');
      meta.className = 'core-meta';
      core.querySelectorAll(':scope > .pill').forEach(pill => meta.append(pill));
      core.append(highlights, meta);
      const context = strength.querySelector('p');
      if (context) { context.className = 'strength-context'; reflection.append(context); }
      reflection.classList.add('reflection-card');
      cards.before(reflection);
      cards.remove();
      action.remove();
    }
    document.querySelectorAll('.topic-reading').forEach(card => {
      const topic = card.querySelector('.pill')?.textContent;
      const [art] = topicArt[topic] || topicArt.진로;
      card.style.setProperty('--topic-art',`url('/assets/${art}.webp')`);
    });

    // Keep every result visible while separating interpretation from calculations.
    const technical = ['chart', 'manse', 'daeun', 'epic', 'flow']
      .map(id => document.getElementById(id)).filter(Boolean);
    if (technical.length) {
      const divider = document.createElement('div');
      divider.className = 'result-layer-title';
      divider.innerHTML = '<span>두 번째 장</span><h2>나를 이루는 계산과 흐름</h2><p>앞의 해석이 어디에서 왔는지 차례로 이어집니다.</p>';
      technical[0].before(divider);
      technical.forEach(section => section.classList.add('result-technical'));
    }

    const jumpLinks = [...document.querySelectorAll('.jump [data-jump]')];
    const jumpSections = jumpLinks.map(link => document.getElementById(link.dataset.jump)).filter(Boolean);
    if (jumpSections.length && 'IntersectionObserver' in window) {
      const setActive = id => jumpLinks.forEach(link => {
        const active = link.dataset.jump === id;
        link.classList.toggle('active', active);
        if (active) {
          link.setAttribute('aria-current', 'location');
          link.parentElement.scrollTo({left:link.offsetLeft-(link.parentElement.clientWidth-link.offsetWidth)/2, behavior:'smooth'});
        } else link.removeAttribute('aria-current');
      });
      jumpObserver = new IntersectionObserver(() => {
        const marker = Math.min(360, window.innerHeight * .45);
        const passed = jumpSections.filter(section => section.getBoundingClientRect().top <= marker);
        const active = passed.at(-1) || jumpSections.find(section => section.getBoundingClientRect().bottom > marker);
        if (active) setActive(active.id);
      }, {rootMargin:'-150px 0px -55% 0px', threshold:0});
      jumpSections.forEach(section => jumpObserver.observe(section));
      jumpLinks.forEach(link => link.addEventListener('click', () => {
        setActive(link.dataset.jump);
        setTimeout(() => setActive(link.dataset.jump), 800);
      }));
    }
  }

  // The server already returns three named parts. Present those names as real
  // reading landmarks instead of leaving the response as one dense paragraph.
  document.querySelectorAll('.message.assistant:not(.pickable) .bubble').forEach(bubble => {
    const text = bubble.textContent.trim();
    const heading = /^(사주 관점|현실 확인|오늘 할 일)$/;
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
    const storage = document.querySelector('.narrow .card:first-of-type p');
    if (storage) storage.textContent = '프로필·상담·선택 기록·저장한 답변은 서버 저장 공간에 보관되고, 이 브라우저의 보안 쿠키로 연결됩니다. 운영 서버에 영구 저장소가 연결되지 않았다면 재시작·재배포 때 기록이 사라질 수 있으니 중요한 내용은 내보내기로 보관하세요.';
    const privacy = [...document.querySelectorAll('.narrow .card:first-of-type p')]
      .find(p => p.textContent.startsWith('외부 AI'));
    if (privacy) privacy.textContent = 'AI 상담이 연결된 경우 계산된 사주 정보와 연·월 흐름, 현재 대화와 관련된 과거 대화·선택 기록·온보딩 고민이 답변 생성을 위해 카페24 LLM Router와 선택된 AI 제공사로 전송될 수 있습니다. 운영 서버 관리자 접근을 막는 종단간 암호화 서비스는 아닙니다.';
    const connection = [...document.querySelectorAll('.narrow .card')]
      .find(card => card.querySelector('h2')?.textContent === '연결 상태')?.querySelector('p');
    if (connection) connection.innerHTML = connection.innerHTML.replace('실제 AI 상담: 연결됨', 'AI 키: 연결됨 (실제 답변은 상담 화면에서 확인)');
  }
  // Focus follows navigation, without forcing users back to the top of a chat.
  const main = document.querySelector('main');
  if (main) main.setAttribute('aria-label',`${profile?.name || '나'}의 달빛 사주`);
}
