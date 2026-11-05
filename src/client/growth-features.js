// Screens built from already-computed values and saved records. No AI call and no network here.
export const TODAY_QUESTIONS = {
  비견: '오늘 같은 고민을 나눌 사람은 누구인가요?', 겁재: '오늘 내 몫으로 분명히 해 둘 일은 무엇인가요?',
  식신: '미뤄 둔 일 중 오늘 10분만 손댈 것은 무엇인가요?', 상관: '오늘 꺼내기 전에 한 번 다듬고 싶은 말은 무엇인가요?',
  편재: '눈에 들어온 것 중 오늘 하나만 고른다면 무엇인가요?', 정재: '오늘 숫자로 확인하고 싶은 것은 무엇인가요?',
  편관: '오늘 여기까지만 하겠다고 정할 분량은 얼마인가요?', 정관: '오늘 확인받거나 약속해 둘 일은 무엇인가요?',
  편인: '결론을 서두르지 않고 더 알아보고 싶은 것은 무엇인가요?', 정인: '혼자 끌어안고 있던 것 중 누구에게 물어볼 수 있나요?'
};
export const LIFE_CHAPTERS = {
  비견: ['나란히 걷는 시기', '비슷한 사람들과 함께 움직이며 내 자리를 찾는 일이 자주 화두가 될 수 있어요.'],
  겁재: ['내 몫을 지키는 시기', '함께하는 일이 늘수록 무엇이 내 몫인지 분명히 하는 일이 중요해질 수 있어요.'],
  식신: ['만들고 표현하는 시기', '꾸준히 만들고 보여 주는 일에서 보람을 찾기 쉬운 때로 볼 수 있어요.'],
  상관: ['틀을 다시 보는 시기', '익숙한 방식에 질문을 던지고 내 목소리를 내고 싶어지는 때로 볼 수 있어요.'],
  편재: ['넓게 시도하는 시기', '여러 기회와 사람을 만나며 무엇을 고를지가 자주 화두가 될 수 있어요.'],
  정재: ['차곡차곡 쌓는 시기', '생활의 기반과 약속을 하나씩 다지는 일이 중심에 오기 쉬워요.'],
  편관: ['압박을 다루는 시기', '책임과 도전이 커질 때 나를 어떻게 지킬지 배우는 때로 볼 수 있어요.'],
  정관: ['기준을 세우는 시기', '역할과 규칙 안에서 인정받고 신뢰를 쌓는 일이 중요해질 수 있어요.'],
  편인: ['깊이 파고드는 시기', '혼자 배우고 생각하며 나만의 관점을 만드는 시간이 늘 수 있어요.'],
  정인: ['배우고 기대는 시기', '도움을 주고받으며 천천히 실력과 마음의 힘을 채우기 쉬운 때로 볼 수 있어요.']
};
// 치료는 의료 판단과 섞이지 않도록 제외합니다.
export const TIMING_PURPOSES = ['계약', '개업', '이사', '여행', '혼인'];

export function lifeFlow(fortune, records, year) {
  if (!fortune) return null;
  return fortune.list.map(chapter => {
    const until = chapter.year + 9;
    return { ...chapter, until, current: year >= chapter.year && year <= until, past: until < year,
      title: LIFE_CHAPTERS[chapter.ten]?.[0] || '', text: LIFE_CHAPTERS[chapter.ten]?.[1] || '',
      records: records.filter(r => { const y = Number(String(r.date).slice(0, 4)); return y >= chapter.year && y <= until; }) };
  });
}

export function bestDays(days, fromIso, count = 3) {
  return days.filter(day => day.iso >= fromIso && day.score > 0).sort((a, b) => b.score - a.score || a.iso.localeCompare(b.iso)).slice(0, count);
}

const monthKey = (month, back) => {
  const [y, m] = month.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 - back, 1));
  return d.toISOString().slice(0, 7);
};
export function trend(records, month, size = 6) {
  return Array.from({ length: size }, (_, i) => monthKey(month, size - 1 - i)).map(key => {
    const list = records.filter(r => String(r.date).startsWith(key));
    return { month: key, total: list.length, reviewed: list.filter(r => r.result !== 'pending').length, good: list.filter(r => r.result === 'good').length };
  });
}

const firstCount = values => { const counts = new Map(); for (const v of values.filter(Boolean)) counts.set(v, (counts.get(v) || 0) + 1); return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };

// 서버가 메시지를 800자에서 자르므로 그 안에 들어가게 씁니다.
export function monthlyPrompt(records, month) {
  const list = records.filter(r => String(r.date).startsWith(month));
  const head = `${month.replace('-', '년 ')}월 기록을 돌아보고 싶어요. 반복되는 기준과 달라진 점을 짚어 주세요.`;
  const lines = list.slice(-8).map(r => `- ${r.title}: ${r.actual ? `결과 ${r.actual}` : r.result === 'pending' ? '결과 미기록' : '결과 기록'}`.slice(0, 80));
  return [head, ...lines].join('\n').slice(0, 780);
}

export function yearSummary(records, year) {
  const list = records.filter(r => String(r.date).startsWith(String(year)));
  return { year, total: list.length, reviewed: list.filter(r => r.result !== 'pending').length, good: list.filter(r => r.result === 'good').length,
    topic: firstCount(list.map(r => r.topic)), criteria: firstCount(list.map(r => r.criteriaLabel)), mood: firstCount(list.map(r => r.mood)) };
}
export function yearLines(summary) {
  return [
    `${summary.total}번의 선택을 남겼어요`,
    `${summary.reviewed}번 돌아봤고, ${summary.good}번 만족했어요`,
    summary.topic && `가장 많이 고민한 주제: ${summary.topic}`,
    summary.criteria && `자주 꺼낸 기준: ${summary.criteria}`,
    summary.mood && `가장 많이 남긴 마음: ${summary.mood}`
  ].filter(Boolean);
}

export async function yearCardBlob(summary, appName) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const c = canvas.getContext('2d');
  await document.fonts.ready;
  c.fillStyle = '#10222c'; c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = '#e7c98a'; c.font = '600 44px "MaruBuri", serif'; c.fillText(appName, 90, 130);
  c.fillStyle = '#f5efe3'; c.font = '700 96px "MaruBuri", serif'; c.fillText(`${summary.year}년의 선택`, 90, 300);
  c.font = '400 46px "MaruBuri", serif';
  yearLines(summary).forEach((text, i) => c.fillText(text, 90, 470 + i * 110, 900));
  c.fillStyle = '#9fb2b8'; c.font = '400 32px "MaruBuri", serif'; c.fillText('나의 기준은 내가 남긴 선택에서 자라요', 90, 1250);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
