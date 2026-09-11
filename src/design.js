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

export function dressPage({page, result, profile}) {
  document.body.classList.add('moonbook');
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
      const art = document.createElement('img');
      art.src = '/assets/chat-crane.png';
      art.alt = '';
      art.draggable = false;
      bird.append(art);
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
      const menu = document.createElement('details');
      menu.className = 'display-menu';
      const summary = document.createElement('summary');
      summary.textContent = '설정';
      const items = document.createElement('div');
      items.className = 'display-menu-items';
      items.append(toggle);
      if (settings) items.append(settings);
      menu.append(summary, items);
      if (save) controls.append(save);
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
    document.querySelectorAll('.topic-reading').forEach(card => {
      const topic = card.querySelector('.pill')?.textContent;
      const [art] = topicArt[topic] || topicArt.진로;
      card.style.setProperty('--topic-art',`url('/assets/${art}.webp')`);
    });
  }
  if (page === 'records') {
    const stats = document.querySelector('.stats');
    stats?.closest('.card')?.classList.add('journal-summary');
  }
  // Focus follows navigation, without forcing users back to the top of a chat.
  const main = document.querySelector('main');
  if (main) main.setAttribute('aria-label',`${profile?.name || '나'}의 달빛 사주`);
}
