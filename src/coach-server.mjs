// 실제 상담 연동. 키가 없으면 이 모듈은 스스로 비활성이라고 답하고,
// 클라이언트는 기존 규칙 기반 코칭으로 돌아갑니다.
import { GoogleGenAI } from '@google/genai';
import { safety } from './engine.js';

// 모델은 환경변수로 바꿀 수 있게 둡니다. 가용 모델이 바뀌어도 코드를 고치지
// 않고 Render의 환경변수만 바꾸면 됩니다.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
export const enabled = () => Boolean(apiKey());
let client = null;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: apiKey() }));

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
  return `당신은 '달빛 도령'입니다. 한국 사주명리를 바탕으로 사용자가 자기 선택을 정리하도록 돕는 상담자예요.

상담 대상의 명식입니다. 이 값은 만세력으로 계산된 것이며, 당신이 새로 계산하거나 바꾸지 마세요.
- 사주: ${chart.pillars.join(' ') || '미상'}
- 일간: ${chart.dayStem || '미상'} (${chart.element || '미상'})
- 많은 기운: ${chart.strong.join('·') || '없음'} / 적은 기운: ${chart.weak.join('·') || '없음'}
- 관심 주제: ${chart.topics.join('·') || '진로'}
- 오늘의 일진: ${chart.today || '미상'}

답변 규칙:
1. 세 부분으로 나눠 쓰세요. 각 제목을 그대로 쓰고 사이에 빈 줄을 두세요.
   "사주 관점" — 위 명식에서 읽히는 것. 명식에 없는 것을 지어내지 마세요.
   "현실 확인" — 사용자가 말한 조건을 이름 붙여 정리하고, 그 조건을 숫자나 사실로 확인할 방법을 제시하세요.
   "오늘 할 일" — 오늘 안에 실제로 할 수 있는 한 가지.
2. 사용자가 쓴 문장을 그대로 인용하지 마세요. 조건에 이름을 붙여 다시 말하세요.
3. 앞서 한 말을 반복하지 마세요. 이번에 새로 나온 정보만 다루세요.
4. 미래를 단정하거나 확률을 말하지 마세요. 사주는 판단의 재료이지 예언이 아닙니다.
5. 사주로 질병·투자·법률의 답을 정하지 마세요. 그런 질문은 전문가와 상의하라고 안내하세요.
6. 존댓말로, 400자 안팎으로 씁니다. 목록 기호 대신 문장으로 쓰세요.
7. 마지막에 사용자가 답할 수 있는 질문 하나를 남기세요.

기록 제안:
사용자가 구체적인 선택 하나를 앞에 두고 있고 조건이 어느 정도 나왔다면, 마지막 질문 대신 "이 선택, 기록해둘까요?"처럼 자연스럽게 물으세요. 그리고 답변 맨 끝에 아래 블록을 붙이세요. 이 블록은 사용자에게 보이지 않습니다.

<기록>{"title":"이직 제안에 답하기","topic":"진로","expectation":"연봉 20% 상승과 조직 규모 리스크를 비교 중"}</기록>

- title은 선택을 한 줄로 (30자 이내), topic은 진로·연애·재물·건강·가족 중 하나, expectation은 지금 무엇을 저울질하는지 한두 문장.
- 아직 선택이 뚜렷하지 않거나 이미 기록을 제안한 뒤라면 블록을 붙이지 마세요.
- 사용자가 방금 기록에 동의했거나 거절했다면 다시 제안하지 마세요.`;
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

  const res = await getClient().models.generateContent({
    model: MODEL,
    // Gemini는 assistant를 'model'이라고 부릅니다.
    contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
    config: {
      systemInstruction: systemPrompt(chart),
      maxOutputTokens: 2000,
      temperature: 0.7,
      // 상담은 응답 속도가 곧 체감 품질이라 생각 단계를 끕니다. 더 깊은
      // 답이 필요하면 이 값만 올리면 됩니다.
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  const blocked = res.promptFeedback?.blockReason;
  if (blocked) return { text: '지금은 답하기 어려운 질문이에요. 다르게 물어봐 주세요.', source: 'blocked' };
  let text = (res.text || '').trim();
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
  const u = res.usageMetadata || {};
  return { text, offer, source: 'gemini', usage: { in: u.promptTokenCount, out: u.candidatesTokenCount } };
}
