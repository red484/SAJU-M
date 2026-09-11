// 대운 서사 판독. 상담과 달리 한 번에 한 편을 뽑고 JSON으로 받습니다.
// 원형은 빌려오지 않았습니다 — 십이운성 열두 단계가 이미 생애의 부침을
// 담고 있고, 그건 지어낸 상징이 아니라 명식에서 계산된 값입니다.
import { chatCompletion, enabled, parseJsonReply } from './cafe24-llm.mjs';

export { enabled };

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = v => (Number.isFinite(v) ? Math.trunc(v) : null);

// 십이운성이 가리키는 결. 서사의 방향만 잡고 문장은 모델이 씁니다.
const ARC = {
  장생: '처음 숨을 트는 자리', 목욕: '벗겨지고 씻기는 자리', 관대: '처음 옷을 갖춰 입는 자리',
  건록: '제 몫을 쥐는 자리', 제왕: '가장 높이 오른 자리', 쇠: '기울기 시작하는 자리',
  병: '앓으며 멈추는 자리', 사: '끝을 통과하는 자리', 묘: '거두어 묻는 자리',
  절: '끊어져 비는 자리', 태: '보이지 않게 맺히는 자리', 양: '조용히 길러지는 자리'
};

function readInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const cycles = (Array.isArray(raw.cycles) ? raw.cycles : []).slice(0, 8).map(c => ({
    age: num(c?.age), gz: str(c?.gz, 4), label: str(c?.label, 6),
    ten: str(c?.ten, 6), stage: str(c?.stage, 4)
  })).filter(c => c.age !== null && c.gz && ARC[c.stage]);
  if (cycles.length < 3) return null;
  return {
    name: str(raw.name, 20),
    pillars: (Array.isArray(raw.pillars) ? raw.pillars : []).slice(0, 4).map(v => str(v, 4)),
    dayStem: str(raw.dayStem, 4), element: str(raw.element, 4),
    strong: (Array.isArray(raw.strong) ? raw.strong : []).slice(0, 5).map(v => str(v, 4)),
    weak: (Array.isArray(raw.weak) ? raw.weak : []).slice(0, 5).map(v => str(v, 4)),
    forward: raw.forward === true, start: num(raw.start), cycles
  };
}

function prompt(d) {
  const rows = d.cycles.map(c => `- ${c.age}세부터 · ${c.gz}(${c.label}) · ${c.ten} · ${c.stage}(${ARC[c.stage]})`).join('\n');
  return `당신은 달빛 아래에서 한 사람의 대운을 읽는 판독관입니다. 사주를 점괘가 아니라 한 사람이 통과해 온 지형으로 읽고, 그 지형을 짧은 서사로 옮깁니다.

## 명식
- 사주: ${d.pillars.join(' ') || '미상'}
- 일간: ${d.dayStem}(${d.element})
- 많은 기운: ${d.strong.join('·') || '없음'} / 적은 기운: ${d.weak.join('·') || '없음'}

## 대운 (${d.forward ? '순행' : '역행'} · 대운수 ${d.start})
${rows}

각 대운 뒤의 십이운성이 그 구간의 결입니다. 오르는 자리(장생·관대·건록·제왕)는 쥐는 시간으로, 기우는 자리(쇠·병·사·묘)는 놓는 시간으로, 비어 있는 자리(절·태·양·목욕)는 보이지 않게 준비되는 시간으로 읽습니다. 이 결을 따르되 어느 구간도 길흉으로 판정하지 마세요.

## 어조
- 서늘하고 관조적으로. '~입니다', '~습니다'로 씁니다.
- 값싼 덕담과 위로를 쓰지 마세요. 당신은 격려하는 사람이 아니라 기록하는 사람입니다.
- 예언 금지. 지나온 구간은 지나온 것으로, 앞으로의 구간은 '놓이게 되는 지형'으로 씁니다. 무슨 일이 일어난다고 못박지 마세요.
- 고통을 추상적으로 뭉개지 말고 감각으로 씁니다. '힘든 시기'가 아니라 '쥐고 있던 것을 손가락 하나씩 펴서 놓아야 했던 시간'처럼.
- 명리 용어(십성·오행·신살·십이운성)는 pillar 필드에만 적습니다. 다른 필드의 본문에는 절대 쓰지 마세요.

## 금지
- 건강·수명·질병·임신·사망의 예측이나 언급
- 금전 액수, 특정 연도의 사건 예측
- 배우자·자녀·부모를 종속적으로 묘사하는 것. 주어는 오직 이 사람입니다.
- 이모지, 마크다운 강조(*, **), 느낌표

## 출력
아래 JSON만 출력합니다. 부연 설명을 붙이지 마세요.
- en: 대문자 영단어 1~2개. 묵직한 뉘앙스.
- kr: 2~4자 한국어.
- idx: 구체 명사 3개를 ' · '로 연결.
- pull: 25~45자. 반드시 \\n으로 두 줄로 끊습니다.
- chapters: 대운 중 결이 가장 뚜렷한 셋을 고릅니다. 서로 다른 구간이어야 합니다.
  - age: '27–36세' 형식
  - en / kr: 위와 같은 규격
  - pillar: 간지와 명리 용어를 여기에만 적습니다. 예: '甲申 · 편관 · 병'
  - gate: 12~20자 명사구. 그 구간으로 들어서는 문.
  - body: 60~90자. 짧고 단호한 문장.
  - essay: 200~260자. 그 구간을 통과한 사람의 안쪽.
- closing: 60~100자. 여덟 구간 전체를 한 호흡으로 닫습니다.`;
}

function readOutput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : []).slice(0, 3).map(c => ({
    age: str(c?.age, 20), en: str(c?.en, 30), kr: str(c?.kr, 20),
    pillar: str(c?.pillar, 50), gate: str(c?.gate, 80),
    body: str(c?.body, 300), essay: str(c?.essay, 900)
  })).filter(c => Object.values(c).every(Boolean));
  const out = {
    en: str(raw.en, 30), kr: str(raw.kr, 20), idx: str(raw.idx, 100),
    pull: str(raw.pull, 200), chapters, closing: str(raw.closing, 400)
  };
  return out.en && out.kr && out.idx && out.pull && out.closing && chapters.length === 3 ? out : null;
}

export async function epicReading(raw) {
  const d = readInput(raw);
  if (!d) return { error: '대운 정보가 부족합니다.', status: 400 };
  const res = await chatCompletion({
    messages: [{ role: 'user', content: prompt(d) }],
    maxTokens: 4000,
    temperature: 1,
    metadata: { feature: 'epic' }
  });
  try {
    const out = readOutput(parseJsonReply(res.text));
    if (!out) throw new Error('invalid reading');
    return { reading: out };
  } catch {
    return { error: '판독 결과를 읽지 못했어요. 잠시 뒤에 다시 시도해 주세요.', status: 502 };
  }
}
