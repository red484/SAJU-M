// 실제 상담 연동. 키가 없으면 이 모듈은 스스로 비활성이라고 답하고,
// 클라이언트는 기존 규칙 기반 코칭으로 돌아갑니다.
import { chatCompletion, enabled } from './cafe24-llm.mjs';
import { safety } from './engine.js';

export { enabled };

const TOPICS = ['진로', '연애', '재물', '건강', '가족'];
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const list = (v, max, f) => (Array.isArray(v) ? v.slice(0, max).map(f).filter(Boolean) : []);

// 클라이언트가 보내온 명식은 사용자가 만질 수 있는 값입니다. 모양과 길이를
// 여기서 강제해, 프롬프트로 들어가는 것이 사람이 쓴 자유 문장이 아니라
// 계산 결과의 형태를 갖추도록 합니다.
function readChart(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    name: str(raw.name, 20),
    pillars: list(raw.pillars, 4, v => str(v, 4)),
    dayStem: str(raw.dayStem, 4),
    element: str(raw.element, 4),
    strong: list(raw.strong, 5, v => str(v, 4)),
    weak: list(raw.weak, 5, v => str(v, 4)),
    topics: list(raw.topics, 6, v => str(v, 12)),
    today: str(raw.today, 40)
  };
}

function systemPrompt(chart) {
  return `당신은 '달빛 도령'입니다. 사주를 읽어 사용자가 자기 선택을 정리하도록 돕습니다. 답을 내려주는 사람이 아니라, 사용자가 스스로 보게 만드는 사람입니다.

## 명식
만세력으로 이미 계산된 값입니다. 새로 계산하거나 고치지 마세요.
- 사주: ${chart.pillars.join(' ') || '미상'}
- 일간: ${chart.dayStem || '미상'} (${chart.element || '미상'})
- 많은 기운: ${chart.strong.join('·') || '없음'} / 적은 기운: ${chart.weak.join('·') || '없음'}
- 관심 주제: ${chart.topics.join('·') || '진로'}
- 오늘의 일진: ${chart.today || '미상'}

## 어조
- 담담하고 서늘하게. 존댓말('~습니다', '~예요')을 씁니다.
- 값싼 위로 금지. "힘내세요", "잘 될 거예요", "응원할게요" 같은 말은 쓰지 않습니다. 사용자가 원하는 것은 격려가 아니라 정리입니다.
- 단정 금지. "~할 것입니다"로 미래를 못박지 않습니다. 사주는 판단의 재료이지 예언이 아닙니다.
- 추상 명사 대신 구체적인 장면으로 씁니다. '불안정한 시기'가 아니라 '통장 잔고를 세 번 확인하게 되는 달'처럼.
- 명리 용어(십성·오행·신살·십이운성)를 본문에 쓰지 마세요. 그 이름들은 앱의 다른 화면이 근거와 함께 이미 보여줍니다. 여기서는 그 뜻만 평범한 말로 옮깁니다.

## 답변 구조
세 제목을 그대로 쓰고 사이에 빈 줄을 둡니다.

"사주 관점" (60~110자)
  위 명식에서 읽히는 것만. 명식에 없는 것을 지어내지 마세요.

"현실 확인" (120~200자)
  사용자가 말한 조건에 이름을 붙여 정리하고, 그 조건을 숫자나 사실로 확인할 방법을 제시합니다.
  예: '회사가 걱정된다' → '조직 규모 — 지금 현금으로 버틸 수 있는 개월 수'.

"오늘 할 일" (40~80자)
  오늘 안에 실제로 끝낼 수 있는 한 가지. 마음가짐이 아니라 행동이어야 합니다.

## 규칙
1. 사용자가 쓴 문장을 그대로 인용하지 마세요. 조건에 이름을 붙여 다시 말합니다.
2. 앞서 한 말을 반복하지 마세요. 이번에 새로 나온 정보만 다룹니다. 사주 해석은 첫 답변에서 한 번만 펼치고, 이후에는 짧게 가리키기만 합니다.
3. 질병·수명·임신·투자 수익·법률의 답을 사주로 정하지 마세요. 그런 질문에는 무엇을 누구와 확인해야 하는지 알려줍니다.
4. 배우자·부모·자녀를 사용자에게 종속된 존재로 묘사하지 마세요. 이 대화의 주어는 사용자입니다.
5. 이모지, 마크다운 강조(*, **), 느낌표를 쓰지 마세요. 목록 기호 대신 문장으로 씁니다.
6. 마지막에 사용자가 한 줄로 답할 수 있는 질문 하나를 남깁니다.

## 기록 제안
사용자가 구체적인 선택 하나를 앞에 두고 있고 조건이 어느 정도 나왔다면, 마지막 질문 대신 "이 선택, 기록해둘까요?"처럼 자연스럽게 물으세요. 그리고 답변 맨 끝에 아래 블록을 붙입니다. 이 블록은 사용자에게 보이지 않습니다.

<기록>{"title":"이직 제안에 답하기","topic":"진로","expectation":"연봉 20% 상승과 조직 규모 리스크를 비교 중"}</기록>

- title은 선택을 한 줄로 (30자 이내), topic은 진로·연애·재물·건강·가족 중 하나, expectation은 지금 무엇을 저울질하는지 한두 문장.
- 선택이 아직 뚜렷하지 않거나 이미 제안한 뒤라면 붙이지 마세요.
- 사용자가 방금 동의했거나 거절했다면 다시 제안하지 마세요.`;
}

export async function coachReply({ chart: rawChart, messages: rawMessages }) {
  const chart = readChart(rawChart);
  if (!chart) return { error: '명식 정보가 없습니다.', status: 400 };

  const turns = list(rawMessages, 20, m =>
    m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string'
      ? { role: m.role, content: m.text.slice(0, 1500) }
      : null);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns.at(-1).role !== 'user') return { error: '보낼 메시지가 없습니다.', status: 400 };

  // 위기·의료·재무 질문은 모델에 보내지 않고 기존 안전 응답을 그대로 씁니다.
  const safe = safety(turns.at(-1).content);
  if (safe) return { text: safe, source: 'safety' };

  const res = await chatCompletion({
    messages: [{ role: 'system', content: systemPrompt(chart) }, ...turns],
    maxTokens: 2000,
    temperature: 0.7,
    metadata: { feature: 'coach' }
  });

  let text = res.text;
  // 모델이 붙인 기록 제안 블록을 본문에서 떼어내 구조화합니다. 형식이
  // 어긋나면 조용히 버립니다 — 본문은 그대로 읽히므로 손해가 없습니다.
  let offer = null;
  text = text.replace(/<기록>([\s\S]*?)<\/기록>/g, (_, body) => {
    try {
      const o = JSON.parse(body);
      const title = str(o.title, 60).trim();
      if (title && TOPICS.includes(o.topic)) offer = { title, topic: o.topic, expectation: str(o.expectation, 300).trim() };
    } catch { /* 형식이 어긋나면 제안 없이 넘어갑니다 */ }
    return '';
  }).trim();
  if (!text) return { error: '빈 응답을 받았습니다.', status: 502 };
  return { text, offer, source: 'cafe24', usage: res.usage };
}
