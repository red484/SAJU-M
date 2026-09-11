// Presentation only: the reading, calendar and storage remain owned by app.js.
const elements = [
  ['木', '목', '자라나는 힘', '#42755c'],
  ['火', '화', '표현하는 힘', '#c2634e'],
  ['土', '토', '중심을 잡는 힘', '#b38a35'],
  ['金', '금', '분별하는 힘', '#70879b'],
  ['水', '수', '깊이 흐르는 힘', '#436e9d']
];
const topicArt = {진로:['todayStart','나아갈 방향'],연애:['todayTalk','마음의 거리'],재물:['todayDeal','나의 기준'],건강:['todayRest','쉬어갈 시간'],가족:['todayDuty','함께하는 마음']};

export function dressPage({page, result, profile}) {
  document.body.classList.add('moonbook');
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
  document.querySelectorAll('.presets button').forEach((button,i) => {
    const number = document.createElement('span');number.className='preset-number';
    number.textContent=String(i+1).padStart(2,'0');button.prepend(number);
  });
  if (page === 'records') {
    const stats = document.querySelector('.stats');
    stats?.closest('.card')?.classList.add('journal-summary');
  }
  // Focus follows navigation, without forcing users back to the top of a chat.
  const main = document.querySelector('main');
  if (main) main.setAttribute('aria-label',`${profile?.name || '나'}의 달빛 사주`);
}
