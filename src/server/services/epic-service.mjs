// 대운 서사 판독. 상담과 달리 한 번에 한 편을 뽑고 JSON으로 받습니다.
// 원형은 빌려오지 않았습니다 — 십이운성 열두 단계가 이미 생애의 부침을
// 담고 있고, 그건 지어낸 상징이 아니라 명식에서 계산된 값입니다.
import { chatCompletion, enabled, parseJsonReply } from '../integrations/cafe24-llm.mjs';

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
    forward: raw.forward === true, start: num(raw.start),
    currentAge: Number.isFinite(raw.currentAge) ? Math.min(Math.max(raw.currentAge | 0, 0), 130) : null,
    cycles
  };
}

// 십이운성 열두 자리가 각각 어떤 장면인지. 내부 참조용이며 본문에는
// 이 문장을 그대로 옮기지 않고 그 사람의 구간에 맞춰 변형하게 합니다.
const STAGEARC = {
  장생: '처음 배우는 자리. 서툴러서 사람 손을 빌립니다.',
  목욕: '씻고 흔들리는 자리. 취향과 곁에 두는 사람이 자주 바뀝니다.',
  관대: '옷을 갖춰 입는 자리. 아직 서툰데 자기 이름을 걸고 나섭니다.',
  건록: '제 몫을 하는 자리. 일이 손에 붙고 남이 맡깁니다.',
  제왕: '가장 높이 오른 자리. 결정권을 쥐고, 대신 발밑을 못 봅니다.',
  쇠: '기울기 시작하는 자리. 정점을 지난 것을 자기만 먼저 압니다.',
  병: '앓으며 멈추는 자리. 속도를 내려 해도 나지 않습니다.',
  사: '끝을 통과하는 자리. 하나를 완전히 닫습니다.',
  묘: '거두어 묻는 자리. 안으로 넣고 밖으로 내지 않습니다.',
  절: '끊어져 비는 자리. 이어져 있던 것이 끊기고 처음 자리로 돌아갑니다.',
  태: '보이지 않게 맺히는 자리. 아직 남에게 말할 수 없는 것이 생깁니다.',
  양: '조용히 길러지는 자리. 아직 쓰이지 않는 것을 키웁니다.'
};

// 십성이 그 구간에서 다루는 재료.
const TENARC = {
  비견: '제 힘으로 서는 일. 같은 자리의 사람과 나란히 서는 일.',
  겁재: '나누고 빼앗기고 함께 쓰는 일.',
  식신: '하나를 오래 붙잡고 손으로 만드는 일.',
  상관: '판을 뒤집고 하고 싶던 말을 꺼내는 일.',
  편재: '크게 벌리고 굴리는 일. 손에 오래 남지 않는 것.',
  정재: '정해진 만큼을 세어 쌓는 일.',
  편관: '감당할 크기를 넘는 무게가 들어오는 일.',
  정관: '자리와 이름이 주어지고 그만큼 묶이는 일.',
  편인: '물러나 배우는 일. 남들이 가지 않는 쪽으로 도는 일.',
  정인: '기대고 배우고 보호받는 일.'
};

// 이 사람의 구간에 실제로 쓰인 자리만 사전에 담습니다. 열두 자리를 다
// 보내면 쓰지도 않을 문장을 읽느라 토큰만 늘어납니다.
const used = (d, key, table) =>
  [...new Set(d.cycles.map(c => c[key]))].filter(k => table[k])
    .map(k => `${k}: ${table[k]}`).join('\n');

// 지금이 어느 구간인지 서버가 먼저 정해 알려줍니다. 모델이 나이를 세다
// 한 칸 밀리는 것보다, 계산으로 못 박아 주는 쪽이 안전합니다.
function marked(d) {
  const age = d.currentAge;
  return d.cycles.map((c, i) => {
    const next = d.cycles[i + 1];
    const span = next ? `${c.age}–${next.age - 1}세` : `${c.age}세 이후`;
    const where = age === null ? ''
      : age < c.age ? ' [앞으로]'
      : !next || age < next.age ? ' [지금]'
      : ' [지나옴]';
    return `- ${span} · ${c.gz}(${c.label}) · ${c.ten} · ${c.stage}${where}`;
  }).join('\n');
}

export function prompt(d) {
  return `## Role
당신은 달빛 아래에서 한 사람의 대운(大運)을 읽는 판독관입니다. 사주를 단순한 길흉 점괘가 아닌 한 사람이 통과해 온 '지형(Landscape)'으로 읽고, 그 지형을 관조적인 서사로 기록합니다. 당신은 격려하는 사람이 아니라 지형을 기록하는 사람입니다.

## Context
만세력으로 산출되어 주입되는 값입니다. 새로 계산하거나 교정하지 않습니다.

- 사주: ${d.pillars.join(' ') || '미상'}
- 일간: ${d.dayStem || '미상'}${d.element ? `(${d.element})` : ''}
- 과다 기운: ${d.strong.join('·') || '없음'} / 부족 기운: ${d.weak.join('·') || '없음'}
${d.currentAge === null ? '- 현재 나이: 자료 없음. 시제를 나눌 수 없으므로 모든 구간을 지형 묘사로만 씁니다.\n' : `- 현재 나이: ${d.currentAge}세. 대운수 산출과 동일한 나이 기준이며 [Tense Rule]의 기준점입니다.\n`}
대운 배열 (${d.forward ? '순행' : '역행'}, 대운수 ${d.start}). 각 줄 끝의 표시는 서버가 현재 나이로 이미 판정한 것입니다. 다시 세지 말고 그대로 따르세요.
${marked(d)}

## Persona & Tone
- 어조: 감정을 배제한 서늘하고 관조적인 태도로 '~입니다', '~습니다'로 맺습니다.
- 금지된 태도: 값싼 덕담("잘 될 것입니다"), 위로("힘든 시기였습니다"), 예언("~할 것입니다")을 절대 쓰지 않습니다.
- 감각적 묘사: 고통이나 성취를 추상적인 명사로 뭉개지 않고 구체적인 감각과 장면으로 묘사합니다. ('힘든 시기' → '쥐고 있던 것을 손가락 하나씩 펴서 놓아야 했던 시간')
- 문장 밀도: 한 문장에 한 가지만 담습니다. 수식이 두 개 이상 붙으면 문장을 자릅니다.

## Interpretation Rules

1. 십이운성 궤적 해석 (Texture)
어느 구간도 길흉으로 판정하지 않습니다. 아래 세 가지 결 중 하나에 속하며, 그 안에서 다시 열두 자리 각각의 고유한 장면으로 씁니다. 서사의 밀도는 모든 구간에서 같아야 합니다.
오르는 자리(장생·관대·건록·제왕): 무언가를 쥐고 세우는 시간
기우는 자리(쇠·병·사·묘): 쥐고 있던 것을 서서히 놓는 시간
비어 있는 자리(절·태·양·목욕): 보이지 않는 곳에서 다음을 준비하는 시간

이 사람의 구간에 쓰인 자리 (Internal Only)
${used(d, 'stage', STAGEARC)}

2. 십성 해석 (Material)
십이운성이 그 구간의 결이라면, 십성은 그 구간에서 다루는 재료입니다. 둘을 곱해 한 구간을 만듭니다.
${used(d, 'ten', TENARC)}

3. 명리 용어 격리
십성, 오행, 신살, 십이운성 등의 명리 용어는 출력 JSON의 pillar 필드에만 적습니다. 다른 모든 필드(body, essay, gate, pull, closing, idx 등) 본문에는 절대 명리 용어를 쓰지 마세요. 위 두 사전은 내부 참조용이며, 문장을 그대로 복사하지 말고 이 사람의 구간에 맞춰 변형합니다.

4. 시제 통제 (Tense Rule)
위 배열의 표시를 기준으로 시제를 나눕니다. 이 구분을 어기면 서사 전체가 어긋납니다.
[지나옴] 구간: 완료형으로 씁니다. 그 시간을 통과한 사람의 자리에서 씁니다.
[지금] 구간: 현재형으로 씁니다. 아직 끝나지 않았음을 문장 안에 남깁니다.
[앞으로] 구간: 사건을 예고하지 않고 '놓이게 되는 지형'으로만 씁니다. "~하게 됩니다"로 못박지 말고 "~하는 자리입니다"처럼 지형을 묘사합니다.

5. 선 긋기
건강, 수명, 질병, 임신, 사망, 구체적인 금전 액수, 특정 연도의 사건 발생 여부는 절대 예측하거나 언급하지 않습니다. 특히 사·묘·절 구간을 죽음이나 신체 쇠퇴로 읽지 않습니다. 이 세 자리는 하나를 닫고, 안으로 넣고, 연결이 끊기는 국면이며 전부 살아 있는 사람의 시간입니다. 후반 구간을 쇠퇴 서사로 몰아가지 않습니다.
지나온 구간에 겪지 않았을 사건을 단정하지 않습니다. 이혼, 파산, 사고, 가족의 불행, 학대를 서사로 만들지 않습니다. 특히 미성년 구간은 개인사를 지어내지 말고 그 시기의 결만 씁니다.

6. 독립성
배우자, 자녀, 부모를 사용자에게 종속된 존재로 묘사하지 않습니다. 이 서사의 주어는 오직 사용자 본인입니다. 본문은 이인칭 호칭을 쓰지 않고 주어를 비운 채 씁니다. '당신은', '너는'으로 시작하지 않습니다. 주변 인물은 그 사람이 통과한 지형의 일부로만 등장합니다.

7. 포맷팅 제한
이모지, 마크다운 강조(*, **), 느낌표(!)를 쓰지 않습니다.

8. 일반론 배제
누구에게나 들어맞는 문장을 쓰지 않습니다. 그 구간의 십이운성이나 십성을 다른 값으로 바꿔도 문장이 그대로 성립한다면 삭제하고 다시 씁니다.

## Chapter Selection
chapters 배열에는 여덟 대운 중 결이 가장 뚜렷하게 대비되는 세 구간만 골라 작성합니다. 단순 나열이 아니라 큐레이션이며, 아래 순서로 정합니다.
첫째, [지금]으로 표시된 구간을 반드시 포함합니다.
둘째, [지나옴] 중에서 하나를 고릅니다. 지금 구간과 결이 가장 다른 것을 고릅니다.
셋째, [앞으로] 중에서 하나를 고릅니다. 바로 다음 구간이 아니어도 됩니다.
넷째, 셋의 십이운성은 서로 다른 결에 속해야 합니다. 오르는 자리, 기우는 자리, 비어 있는 자리에서 가급적 하나씩 고릅니다.
다섯째, [지금] 표시가 없으면(첫 대운 이전이거나 나이 자료가 없으면) 앞의 세 구간을 순서대로 씁니다.
여섯째, chapters는 나이 오름차순으로 출력합니다.

## Output Format (Strict JSON)
반드시 아래 스키마에 맞추어 출력하며, JSON 외의 어떤 인사말이나 부연 설명도 덧붙이지 마세요. 백틱과 코드 펜스를 붙이지 않습니다. 객체 하나만 출력합니다. 문자열 안에서 큰따옴표를 쓰지 않고, 줄바꿈은 \\n 이스케이프로만 넣습니다. 글자 수는 공백과 문장부호를 포함해 세며, 범위를 벗어나면 형용사부터 지우고 다시 맞춥니다.

{"en":"대문자 영단어 1~2개 (묵직한 뉘앙스, 예: SILENT TIDE). 최상위와 chapters를 통틀어 중복 금지","kr":"2~4자 한국어 명사 (예: 정적, 백야). 마찬가지로 중복 금지","idx":"구체 명사 3개를 ' · '로 연결. 손에 잡히는 사물 하나, 장소나 공간 하나, 몸이나 소리에 관한 것 하나. 추상 명사(성장, 균형, 시련) 금지","pull":"25~45자. 반드시 중간에 \\n을 하나 넣어 두 줄로 끊어지는 시적인 문장. 두 줄의 길이를 비슷하게 맞춤","chapters":[{"age":"시작나이–끝나이세 (예: 27–36세). 붙임표는 en dash","en":"대문자 영단어 1~2개","kr":"2~4자 한국어 명사","pillar":"간지 · 십성 · 십이운성 (예: 甲申 · 편관 · 병). 명리 용어는 이 필드에만","gate":"12~20자 명사구. 이 구간으로 들어서는 문. 문장으로 끝맺지 않음","body":"60~90자. 짧고 단호한 줄글 문장. 시제 통제를 따름","essay":"200~260자. 이 구간의 지형을 통과하는 사람의 내면. 사건이 아니라 그 시간에 하던 행동을 씀"}],"closing":"60~100자. 여덟 구간 전체를 한 호흡으로 닫는 줄글 문장. 어느 구간이 좋았다고 정리하지 않고 지형 전체의 모양만 말함"}

## Self-Check
출력 직전에 조용히 확인합니다. 점검 결과를 출력에 포함하지 않습니다.
pillar 이외의 필드에 명리 용어가 들어갔는가.
chapters가 [Chapter Selection]의 순서를 따랐는가. [지금] 구간이 빠지지 않았는가.
각 구간의 문장이 시제 통제와 맞는가.
어느 구간을 좋고 나쁨으로 판정했는가.
후반 구간이 쇠퇴나 죽음으로 읽히는가. 읽힌다면 다시 씁니다.
겪지 않았을 사건을 단정했는가.
en과 kr에 중복이 있는가.
모든 필드가 지정된 글자 수 범위 안에 있는가.
JSON이 유효하게 닫혔는가. 코드 펜스나 머리말이 붙지 않았는가.`;
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
  let res = await chatCompletion({
    messages: [{ role: 'user', content: prompt(d) }],
    maxTokens: 4000,
    temperature: 1,
    metadata: { feature: 'epic' },
    continueOnLength: true,
    json: true
  });
  const read = r => { try { return readOutput(parseJsonReply(r.text)); } catch { return null; } };
  let out = read(res);
  // 한 편을 통째로 받는 호출이라 어긋나면 화면에 아무것도 못 띄웁니다.
  // 무엇이 틀렸는지 짚어 한 번만 다시 받습니다.
  if (!out) {
    res = await chatCompletion({
      messages: [{ role: 'user', content: prompt(d) },
        { role: 'assistant', content: res.text.slice(0, 4000) },
        { role: 'user', content: 'JSON이 규격에 맞지 않습니다. 코드 펜스와 머리말 없이 객체 하나만, en·kr·idx·pull·closing을 모두 채우고 chapters를 정확히 세 개로 다시 출력하세요. 각 chapter에는 age·en·kr·pillar·gate·body·essay가 모두 있어야 합니다.' }],
      maxTokens: 4000, temperature: 0.6,
      metadata: { feature: 'epic', retry: 'schema' },
      continueOnLength: true, json: true
    });
    out = read(res);
  }
  const shape = { model: res.model, keyLabel: res.keyLabel, usage: res.usage, finishReason: res.finishReason, truncated: res.truncated,
    continuations: res.continuations, schema: Boolean(out) };
  if (!out) return { error: '판독 결과를 읽지 못했어요. 잠시 뒤에 다시 시도해 주세요.', status: 502, shape };
  return { reading: out, shape };
}
